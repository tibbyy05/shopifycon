import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type { AlertChannel, Shop } from "../types";

// Where alerts go, per store. Email goes through SendGrid; Slack uses
// an incoming-webhook URL (https://api.slack.com/messaging/webhooks).

function maskWebhook(url: string): string {
  try {
    const u = new URL(url);
    const tail = u.pathname.split("/").pop() ?? "";
    return `${u.host}/…/${tail.slice(0, 4)}…`;
  } catch {
    return "invalid url";
  }
}

function ChannelRow({
  channel,
  onChanged,
}: {
  channel: AlertChannel;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  async function toggle() {
    setBusy(true);
    await supabase
      .from("alert_channels")
      .update({ enabled: !channel.enabled })
      .eq("id", channel.id);
    setBusy(false);
    onChanged();
  }

  async function remove() {
    setBusy(true);
    await supabase.from("alert_channels").delete().eq("id", channel.id);
    setBusy(false);
    onChanged();
  }

  async function sendTest() {
    setBusy(true);
    setTestResult(null);
    const { data, error } = await supabase.functions.invoke("alert-test", {
      body: { channel_id: channel.id },
    });
    setBusy(false);
    if (error || !data?.ok) {
      setTestResult(`failed: ${error?.message ?? data?.detail ?? "unknown"}`);
    } else {
      setTestResult("test sent ✓");
    }
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-2">
      <div className="flex items-center gap-3">
        <span
          className={`rounded px-2 py-0.5 text-xs font-medium ${
            channel.type === "email"
              ? "bg-sky-100 text-sky-700"
              : "bg-violet-100 text-violet-700"
          }`}
        >
          {channel.type}
        </span>
        <span
          className={`text-sm ${
            channel.enabled ? "text-slate-900" : "text-slate-400 line-through"
          }`}
        >
          {channel.type === "email"
            ? channel.config.to
            : maskWebhook(channel.config.webhook_url ?? "")}
        </span>
        {testResult && (
          <span
            className={`text-xs ${
              testResult.startsWith("failed")
                ? "text-red-600"
                : "text-emerald-600"
            }`}
          >
            {testResult}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => void sendTest()}
          disabled={busy || !channel.enabled}
          className="rounded border border-slate-300 px-2 py-0.5 text-xs hover:bg-slate-50 disabled:opacity-50"
        >
          Send test
        </button>
        <button
          onClick={() => void toggle()}
          disabled={busy}
          className="rounded border border-slate-300 px-2 py-0.5 text-xs hover:bg-slate-50 disabled:opacity-50"
        >
          {channel.enabled ? "Disable" : "Enable"}
        </button>
        <button
          onClick={() => void remove()}
          disabled={busy}
          className="rounded border border-red-200 px-2 py-0.5 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
        >
          Remove
        </button>
      </div>
    </li>
  );
}

function AddChannel({
  shopId,
  onAdded,
}: {
  shopId: string;
  onAdded: () => void;
}) {
  const [type, setType] = useState<"email" | "slack">("email");
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const v = value.trim();
    if (type === "slack" && !v.startsWith("https://hooks.slack.com/")) {
      setError("Slack webhook URLs start with https://hooks.slack.com/");
      return;
    }
    setBusy(true);
    const { error: err } = await supabase.from("alert_channels").insert({
      shop_id: shopId,
      type,
      config: type === "email" ? { to: v } : { webhook_url: v },
    });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setValue("");
    onAdded();
  }

  return (
    <form onSubmit={add} className="mt-3 flex flex-wrap items-center gap-2">
      <select
        value={type}
        onChange={(e) => setType(e.target.value as "email" | "slack")}
        className="rounded border border-slate-300 px-2 py-1.5 text-sm"
      >
        <option value="email">Email</option>
        <option value="slack">Slack</option>
      </select>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        type={type === "email" ? "email" : "url"}
        required
        placeholder={
          type === "email"
            ? "alerts@yourcompany.com"
            : "https://hooks.slack.com/services/…"
        }
        className="w-72 rounded border border-slate-300 px-3 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
      />
      <button
        type="submit"
        disabled={busy}
        className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
      >
        {busy ? "Adding…" : "Add channel"}
      </button>
      {error && <span className="text-sm text-red-600">{error}</span>}
    </form>
  );
}

export function AlertSettings({ shops }: { shops: Shop[] }) {
  const [channels, setChannels] = useState<AlertChannel[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("alert_channels")
      .select("id, shop_id, type, config, enabled");
    setChannels((data as AlertChannel[]) ?? []);
    setLoaded(true);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const activeShops = shops.filter((s) => !s.uninstalled_at);

  if (!activeShops.length) {
    return (
      <p className="rounded border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
        Connect a store first — alert channels are configured per store.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-500">
        Where should alerts go when a new exception opens? Each store has
        its own channels. With no email channel configured, alerts fall
        back to the operator default address.
      </p>
      {activeShops.map((shop) => {
        const shopChannels = channels.filter((c) => c.shop_id === shop.id);
        return (
          <section
            key={shop.id}
            className="rounded-lg border border-slate-200 bg-white p-4"
          >
            <h3 className="text-sm font-semibold text-slate-900">
              {shop.shop_domain}
            </h3>
            {loaded && shopChannels.length === 0 && (
              <p className="mt-2 text-sm text-slate-400">
                No channels yet — alerts use the fallback email.
              </p>
            )}
            <ul className="mt-1 divide-y divide-slate-100">
              {shopChannels.map((c) => (
                <ChannelRow key={c.id} channel={c} onChanged={() => void load()} />
              ))}
            </ul>
            <AddChannel shopId={shop.id} onAdded={() => void load()} />
          </section>
        );
      })}
    </div>
  );
}
