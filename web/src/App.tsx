import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import { SignIn } from "./components/SignIn";
import { ConnectStore } from "./components/ConnectStore";
import { ExceptionList } from "./components/ExceptionList";
import type { ExceptionRow, Shop } from "./types";

type StatusFilter = "open" | "ack" | "resolved" | "all";

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [shops, setShops] = useState<Shop[]>([]);
  const [exceptions, setExceptions] = useState<ExceptionRow[]>([]);
  const [filter, setFilter] = useState<StatusFilter>("open");
  const [loading, setLoading] = useState(false);

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

  const refresh = useCallback(async () => {
    setLoading(true);
    // First sign-in bootstraps an organization (no-op afterwards).
    await supabase.rpc("ensure_org");

    const { data: shopRows } = await supabase
      .from("shops")
      .select("id, shop_domain, installed_at, uninstalled_at")
      .order("installed_at", { ascending: false });
    setShops((shopRows as Shop[]) ?? []);

    let q = supabase
      .from("exceptions")
      .select(
        "id, shop_id, rule_id, resource_type, resource_id, severity, status, details, first_seen_at",
      )
      .order("first_seen_at", { ascending: false })
      .limit(200);
    if (filter !== "all") q = q.eq("status", filter);
    const { data: excRows } = await q;
    setExceptions((excRows as ExceptionRow[]) ?? []);
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    if (session) void refresh();
  }, [session, refresh]);

  if (!authReady) return null;
  if (!session) return <SignIn />;

  const activeShops = shops.filter((s) => !s.uninstalled_at);

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
          <button
            onClick={() => supabase.auth.signOut()}
            className="text-sm text-slate-500 hover:text-slate-900"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">
        <ConnectStore />

        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Exceptions
          </h2>
          <div className="flex items-center gap-3">
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as StatusFilter)}
              className="rounded border border-slate-300 px-2 py-1 text-sm"
            >
              <option value="open">Open</option>
              <option value="ack">Acknowledged</option>
              <option value="resolved">Resolved</option>
              <option value="all">All</option>
            </select>
            <button
              onClick={() => void refresh()}
              disabled={loading}
              className="rounded border border-slate-300 px-3 py-1 text-sm hover:bg-white disabled:opacity-50"
            >
              {loading ? "Loading…" : "Refresh"}
            </button>
          </div>
        </div>

        <ExceptionList
          exceptions={exceptions}
          shops={shops}
          onChanged={() => void refresh()}
        />
      </main>
    </div>
  );
}

export default App;
