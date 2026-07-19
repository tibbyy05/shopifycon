import type { ExceptionStatus, RecentException, Shop } from "../types";
import { formatUsd, timeAgo } from "../lib/format";
import { ruleLabel } from "../lib/rules";
import { ConnectStore } from "./ConnectStore";
import { TrendChart } from "./TrendChart";

function Tile({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: number | string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className={`mt-1 text-3xl font-semibold ${accent ?? "text-slate-900"}`}>
        {value}
      </p>
      {sub && <p className="mt-0.5 text-xs text-slate-400">{sub}</p>}
    </div>
  );
}

export function Overview({
  shops,
  counts,
  highOpen,
  resolved7d,
  atRisk,
  recent,
  nowMs,
}: {
  shops: Shop[];
  counts: Record<ExceptionStatus, number>;
  highOpen: number;
  resolved7d: number;
  atRisk: number;
  recent: RecentException[];
  nowMs: number;
}) {
  const activeShops = shops.filter((s) => !s.uninstalled_at);

  // 14-day breakdown per rule.
  const byRule = new Map<string, { total: number; open: number }>();
  for (const e of recent) {
    const r = byRule.get(e.rule_id) ?? { total: 0, open: 0 };
    r.total++;
    if (e.status === "open") r.open++;
    byRule.set(e.rule_id, r);
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Tile
          label="Revenue at risk"
          value={formatUsd(atRisk)}
          sub={atRisk ? "across open exceptions" : "nothing at risk right now"}
          accent={atRisk ? "text-red-600" : "text-emerald-600"}
        />
        <Tile
          label="Open exceptions"
          value={counts.open}
          sub={highOpen ? `${highOpen} high severity` : "none high severity"}
          accent={counts.open ? "text-slate-900" : "text-emerald-600"}
        />
        <Tile label="Resolved" value={resolved7d} sub="last 7 days" />
        <Tile
          label="Connected stores"
          value={activeShops.length}
          sub={activeShops.length ? "monitoring hourly" : "connect one below"}
        />
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-slate-900">
          New exceptions
          <span className="ml-2 font-normal text-slate-400">last 14 days</span>
        </h3>
        <div className="mt-4">
          <TrendChart exceptions={recent} nowMs={nowMs} />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-slate-900">
            By rule
            <span className="ml-2 font-normal text-slate-400">last 14 days</span>
          </h3>
          {byRule.size === 0 ? (
            <p className="mt-4 text-sm text-slate-400">
              No exceptions detected yet.
            </p>
          ) : (
            <table className="mt-3 w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="py-1.5">Rule</th>
                  <th className="py-1.5 text-right">Open</th>
                  <th className="py-1.5 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {[...byRule.entries()]
                  .sort((a, b) => b[1].total - a[1].total)
                  .map(([id, r]) => (
                    <tr key={id}>
                      <td className="py-1.5 text-slate-900">{ruleLabel(id)}</td>
                      <td
                        className={`py-1.5 text-right ${
                          r.open ? "font-medium text-red-600" : "text-slate-400"
                        }`}
                      >
                        {r.open}
                      </td>
                      <td className="py-1.5 text-right text-slate-600">
                        {r.total}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-slate-900">Stores</h3>
          {shops.length > 0 && (
            <ul className="mt-3 divide-y divide-slate-100">
              {shops.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between gap-4 py-2 text-sm"
                >
                  <div>
                    <p className="text-slate-900">{s.shop_domain}</p>
                    <p className="text-xs text-slate-400">
                      installed {timeAgo(s.installed_at, nowMs)}
                    </p>
                  </div>
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-medium ${
                      s.uninstalled_at
                        ? "bg-slate-100 text-slate-500"
                        : "bg-emerald-100 text-emerald-700"
                    }`}
                  >
                    {s.uninstalled_at ? "uninstalled" : "active"}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4">
            <ConnectStore />
          </div>
        </section>
      </div>
    </div>
  );
}
