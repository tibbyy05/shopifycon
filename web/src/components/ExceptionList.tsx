import { useState } from "react";
import { supabase } from "../lib/supabase";
import type { ExceptionRow, Shop } from "../types";

const SEVERITY_STYLE: Record<ExceptionRow["severity"], string> = {
  high: "bg-red-100 text-red-700",
  medium: "bg-amber-100 text-amber-700",
  low: "bg-slate-100 text-slate-600",
};

const RULE_LABELS: Record<string, string> = {
  "aging-unfulfilled": "Aging unfulfilled order",
};

export function ExceptionList({
  exceptions,
  shops,
  onChanged,
}: {
  exceptions: ExceptionRow[];
  shops: Shop[];
  onChanged: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const shopDomain = (id: string) =>
    shops.find((s) => s.id === id)?.shop_domain ?? id;

  async function setStatus(exc: ExceptionRow, status: "ack" | "resolved") {
    setBusyId(exc.id);
    await supabase
      .from("exceptions")
      .update({
        status,
        resolved_at: status === "resolved" ? new Date().toISOString() : null,
      })
      .eq("id", exc.id);
    setBusyId(null);
    onChanged();
  }

  if (!exceptions.length) {
    return (
      <p className="rounded border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
        No open exceptions. Either everything is running smoothly, or the
        first sweep hasn't run yet.
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
          {exceptions.map((exc) => (
            <tr key={exc.id} className="align-top">
              <td className="px-4 py-2">
                <span
                  className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${
                    SEVERITY_STYLE[exc.severity]
                  }`}
                >
                  {exc.severity}
                </span>
              </td>
              <td className="px-4 py-2 text-slate-900">
                {RULE_LABELS[exc.rule_id] ?? exc.rule_id}
              </td>
              <td className="px-4 py-2 text-slate-600">
                {String(exc.details.order_name ?? "")} {" "}
                <span className="text-slate-400">
                  ({exc.resource_type} {exc.resource_id})
                </span>
              </td>
              <td className="px-4 py-2 text-slate-600">
                {shopDomain(exc.shop_id)}
              </td>
              <td className="px-4 py-2 text-slate-600">
                {exc.details.age_hours != null
                  ? `${exc.details.age_hours}h old (threshold ${exc.details.threshold_hours}h)`
                  : ""}
              </td>
              <td className="px-4 py-2 text-slate-500">
                {new Date(exc.first_seen_at).toLocaleString()}
              </td>
              <td className="px-4 py-2 text-slate-600">{exc.status}</td>
              <td className="px-4 py-2">
                <div className="flex gap-2">
                  {exc.status === "open" && (
                    <button
                      onClick={() => setStatus(exc, "ack")}
                      disabled={busyId === exc.id}
                      className="rounded border border-slate-300 px-2 py-0.5 text-xs hover:bg-slate-50 disabled:opacity-50"
                    >
                      Ack
                    </button>
                  )}
                  <button
                    onClick={() => setStatus(exc, "resolved")}
                    disabled={busyId === exc.id}
                    className="rounded border border-slate-300 px-2 py-0.5 text-xs hover:bg-slate-50 disabled:opacity-50"
                  >
                    Resolve
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
