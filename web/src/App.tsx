import { useCallback, useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import { SignIn } from "./components/SignIn";
import { ConnectStore } from "./components/ConnectStore";
import { ExceptionList } from "./components/ExceptionList";
import { ExceptionDrawer } from "./components/ExceptionDrawer";
import type { ExceptionRow, ExceptionStatus, Shop } from "./types";

type StatusFilter = ExceptionStatus | "all";

const FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "ack", label: "Acknowledged" },
  { key: "resolved", label: "Resolved" },
  { key: "all", label: "All" },
];

const EXCEPTION_COLUMNS =
  "id, shop_id, rule_id, resource_type, resource_id, severity, status, details, first_seen_at, resolved_at";

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [shops, setShops] = useState<Shop[]>([]);
  const [exceptions, setExceptions] = useState<ExceptionRow[]>([]);
  const [counts, setCounts] = useState<Record<ExceptionStatus, number>>({
    open: 0,
    ack: 0,
    resolved: 0,
  });
  const [filter, setFilter] = useState<StatusFilter>("open");
  const [loading, setLoading] = useState(false);
  const [live, setLive] = useState(false);
  const [selected, setSelected] = useState<ExceptionRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const orgReady = useRef(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Relative timestamps stay honest without a reload.
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    // First sign-in bootstraps an organization (no-op afterwards).
    if (!orgReady.current) {
      await supabase.rpc("ensure_org");
      orgReady.current = true;
    }

    let q = supabase
      .from("exceptions")
      .select(EXCEPTION_COLUMNS)
      .order("first_seen_at", { ascending: false })
      .limit(200);
    if (filter !== "all") q = q.eq("status", filter);

    const [shopsRes, excRes, ...countRes] = await Promise.all([
      supabase
        .from("shops")
        .select("id, shop_domain, installed_at, uninstalled_at")
        .order("installed_at", { ascending: false }),
      q,
      ...(["open", "ack", "resolved"] as const).map((s) =>
        supabase
          .from("exceptions")
          .select("id", { count: "exact", head: true })
          .eq("status", s),
      ),
    ]);

    setShops((shopsRes.data as Shop[]) ?? []);
    setExceptions((excRes.data as unknown as ExceptionRow[]) ?? []);
    setCounts({
      open: countRes[0]?.count ?? 0,
      ack: countRes[1]?.count ?? 0,
      resolved: countRes[2]?.count ?? 0,
    });
    setNowMs(Date.now());
    setLoading(false);
  }, [filter]);

  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    if (session) void refresh();
  }, [session, refresh]);

  // Live updates: any change to a visible exception re-syncs the view.
  useEffect(() => {
    if (!session) return;
    const channel = supabase
      .channel("exceptions-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "exceptions" },
        () => void refreshRef.current(),
      )
      .subscribe((status) => setLive(status === "SUBSCRIBED"));
    return () => {
      setLive(false);
      void supabase.removeChannel(channel);
    };
  }, [session]);

  // Keep the drawer in sync when its row changes underneath it.
  useEffect(() => {
    setSelected((s) =>
      s ? exceptions.find((e) => e.id === s.id) ?? s : s,
    );
  }, [exceptions]);

  const setStatus = useCallback(
    async (exc: ExceptionRow, status: ExceptionStatus) => {
      setBusyId(exc.id);
      const resolved_at =
        status === "resolved" ? new Date().toISOString() : null;
      await supabase
        .from("exceptions")
        .update({ status, resolved_at })
        .eq("id", exc.id);
      setBusyId(null);
      setSelected((s) =>
        s && s.id === exc.id ? { ...s, status, resolved_at } : s,
      );
      void refreshRef.current();
    },
    [],
  );

  if (!authReady) return null;
  if (!session) return <SignIn />;

  const activeShops = shops.filter((s) => !s.uninstalled_at);
  const totalCount = counts.open + counts.ack + counts.resolved;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-base font-semibold text-slate-900">
              Shopify Operations Monitor
            </h1>
            <p className="text-xs text-slate-500">
              {activeShops.length
                ? activeShops.map((s) => s.shop_domain).join(", ")
                : "No store connected yet"}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5 text-xs text-slate-500">
              <span
                className={`h-2 w-2 rounded-full ${
                  live ? "bg-emerald-500" : "bg-slate-300"
                }`}
              />
              {live ? "Live" : "Connecting…"}
            </span>
            <button
              onClick={() => supabase.auth.signOut()}
              className="text-sm text-slate-500 hover:text-slate-900"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">
        <ConnectStore />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {FILTERS.map((f) => {
              const n = f.key === "all" ? totalCount : counts[f.key];
              const active = filter === f.key;
              return (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={`rounded-full px-3 py-1 text-sm ${
                    active
                      ? "bg-slate-900 text-white"
                      : "border border-slate-300 text-slate-600 hover:bg-white"
                  }`}
                >
                  {f.label}
                  <span
                    className={`ml-1.5 text-xs ${
                      active ? "text-slate-300" : "text-slate-400"
                    }`}
                  >
                    {n}
                  </span>
                </button>
              );
            })}
          </div>
          <button
            onClick={() => void refresh()}
            disabled={loading}
            className="rounded border border-slate-300 px-3 py-1 text-sm hover:bg-white disabled:opacity-50"
          >
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>

        <ExceptionList
          exceptions={exceptions}
          shops={shops}
          nowMs={nowMs}
          busyId={busyId}
          onSelect={setSelected}
          onSetStatus={setStatus}
        />
      </main>

      {selected && (
        <ExceptionDrawer
          exception={selected}
          shopDomain={
            shops.find((s) => s.id === selected.shop_id)?.shop_domain ??
            selected.shop_id
          }
          busy={busyId === selected.id}
          nowMs={nowMs}
          onClose={() => setSelected(null)}
          onSetStatus={setStatus}
        />
      )}
    </div>
  );
}

export default App;
