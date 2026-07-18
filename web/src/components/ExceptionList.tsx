import type { ExceptionRow, ExceptionStatus, Shop } from "../types";
import {
  exceptionSummary,
  resourceName,
  shopifyAdminUrl,
  timeAgo,
} from "../lib/format";
import { ruleLabel } from "../lib/rules";
import { SeverityBadge, StatusBadge } from "./Badges";

export function ExceptionList({
  exceptions,
  shops,
  nowMs,
  busyId,
  onSelect,
  onSetStatus,
}: {
  exceptions: ExceptionRow[];
  shops: Shop[];
  nowMs: number;
  busyId: string | null;
  onSelect: (exc: ExceptionRow) => void;
  onSetStatus: (exc: ExceptionRow, status: ExceptionStatus) => void;
}) {
  const shopDomain = (id: string) =>
    shops.find((s) => s.id === id)?.shop_domain ?? id;

  if (!exceptions.length) {
    return (
      <p className="rounded border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
        Nothing here. Either everything is running smoothly, or the first
        sweep hasn't run yet.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-2">Severity</th>
            <th className="px-4 py-2">Rule</th>
            <th className="px-4 py-2">Resource</th>
            <th className="px-4 py-2">Store</th>
            <th className="px-4 py-2">Detail</th>
            <th className="px-4 py-2">First seen</th>
            <th className="px-4 py-2">Status</th>
            <th className="px-4 py-2" />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {exceptions.map((exc) => {
            const domain = shopDomain(exc.shop_id);
            const adminUrl = shopifyAdminUrl(
              domain,
              exc.resource_type,
              exc.resource_id,
              exc.details,
            );
            return (
              <tr
                key={exc.id}
                onClick={() => onSelect(exc)}
                className="cursor-pointer align-top hover:bg-slate-50"
              >
                <td className="px-4 py-2">
                  <SeverityBadge severity={exc.severity} />
                </td>
                <td className="px-4 py-2 text-slate-900">
                  {ruleLabel(exc.rule_id)}
                </td>
                <td className="px-4 py-2 text-slate-600">
                  {resourceName(exc.resource_type, exc.resource_id, exc.details)}
                  {adminUrl && (
                    <a
                      href={adminUrl}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      title="Open in Shopify admin"
                      className="ml-1.5 align-baseline text-emerald-700 hover:text-emerald-500"
                    >
                      ↗
                    </a>
                  )}
                </td>
                <td className="px-4 py-2 text-slate-600">{domain}</td>
                <td className="px-4 py-2 text-slate-600">
                  {exceptionSummary(exc.rule_id, exc.details)}
                </td>
                <td
                  className="px-4 py-2 text-slate-500"
                  title={new Date(exc.first_seen_at).toLocaleString()}
                >
                  {timeAgo(exc.first_seen_at, nowMs)}
                </td>
                <td className="px-4 py-2">
                  <StatusBadge status={exc.status} />
                </td>
                <td className="px-4 py-2">
                  <div className="flex gap-2">
                    {exc.status === "open" && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onSetStatus(exc, "ack");
                        }}
                        disabled={busyId === exc.id}
                        className="rounded border border-slate-300 px-2 py-0.5 text-xs hover:bg-slate-50 disabled:opacity-50"
                      >
                        Ack
                      </button>
                    )}
                    {exc.status !== "resolved" && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onSetStatus(exc, "resolved");
                        }}
                        disabled={busyId === exc.id}
                        className="rounded border border-slate-300 px-2 py-0.5 text-xs hover:bg-slate-50 disabled:opacity-50"
                      >
                        Resolve
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
