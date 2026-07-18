import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { RULE_META, type RuleMeta } from "../lib/rules";
import { SeverityBadge } from "./Badges";
import type { Shop } from "../types";

interface RuleConfigRow {
  shop_id: string;
  rule_id: string;
  enabled: boolean;
  thresholds: Record<string, unknown>;
}

function RuleCard({
  shopId,
  rule,
  config,
  onSaved,
}: {
  shopId: string;
  rule: RuleMeta;
  config: RuleConfigRow | undefined;
  onSaved: () => void;
}) {
  const enabled = config?.enabled ?? true;
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const v: Record<string, string> = {};
    for (const t of rule.thresholds) {
      const configured = config?.thresholds?.[t.key];
      v[t.key] = configured != null ? String(configured) : "";
    }
    setValues(v);
  }, [config, rule]);

  async function save(overrides: { enabled?: boolean } = {}) {
    setBusy(true);
    setSaved(false);
    setError(null);
    const thresholds: Record<string, number> = {};
    for (const t of rule.thresholds) {
      const raw = values[t.key]?.trim();
      if (raw !== "" && raw != null && !Number.isNaN(Number(raw))) {
        thresholds[t.key] = Number(raw);
      }
    }
    const { error: err } = await supabase.from("rule_configs").upsert(
      {
        shop_id: shopId,
        rule_id: rule.id,
        enabled: overrides.enabled ?? enabled,
        thresholds,
      },
      { onConflict: "shop_id,rule_id" },
    );
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
    onSaved();
  }

  return (
    <div
      className={`rounded-lg border bg-white p-4 ${
        enabled ? "border-slate-200" : "border-slate-200 opacity-60"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-semibold text-slate-900">
              {rule.name}
            </h4>
            <SeverityBadge severity={rule.severity} />
          </div>
          <p className="mt-1 text-sm text-slate-500">{rule.description}</p>
        </div>
        <button
          onClick={() => void save({ enabled: !enabled })}
          disabled={busy}
          role="switch"
          aria-checked={enabled}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
            enabled ? "bg-emerald-500" : "bg-slate-300"
          }`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
              enabled ? "translate-x-5" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        {rule.thresholds.map((t) => (
          <label key={t.key} className="text-xs text-slate-500">
            {t.label}
            <input
              type="number"
              value={values[t.key] ?? ""}
              onChange={(e) =>
                setValues((v) => ({ ...v, [t.key]: e.target.value }))}
              placeholder={String(t.defaultValue)}
              disabled={!enabled}
              className="mt-1 block w-32 rounded border border-slate-300 px-2 py-1.5 text-sm text-slate-900 focus:border-slate-500 focus:outline-none disabled:bg-slate-50"
            />
          </label>
        ))}
        <button
          onClick={() => void save()}
          disabled={busy || !enabled}
          className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save"}
        </button>
        {saved && <span className="text-sm text-emerald-600">saved ✓</span>}
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>
    </div>
  );
}

export function RulesSettings({ shops }: { shops: Shop[] }) {
  const [configs, setConfigs] = useState<RuleConfigRow[]>([]);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("rule_configs")
      .select("shop_id, rule_id, enabled, thresholds");
    setConfigs((data as RuleConfigRow[]) ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const activeShops = shops.filter((s) => !s.uninstalled_at);

  if (!activeShops.length) {
    return (
      <p className="rounded border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
        Connect a store first — rules are configured per store.
      </p>
    );
  }

  return (
    <div className="space-y-8">
      <p className="text-sm text-slate-500">
        Every rule runs on the hourly sweep for each store. Leave a
        threshold blank to use its default.
      </p>
      {activeShops.map((shop) => (
        <section key={shop.id} className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            {shop.shop_domain}
          </h3>
          {RULE_META.map((rule) => (
            <RuleCard
              key={rule.id}
              shopId={shop.id}
              rule={rule}
              config={configs.find(
                (c) => c.shop_id === shop.id && c.rule_id === rule.id,
              )}
              onSaved={() => void load()}
            />
          ))}
        </section>
      ))}
    </div>
  );
}
