import { useEffect } from "react";
import type { ExceptionRow, ExceptionStatus } from "../types";
import {
  formatMoney,
  resourceName,
  shopifyAdminUrl,
  timeAgo,
} from "../lib/format";
import { ruleLabel } from "../lib/rules";
import { SeverityBadge, StatusBadge } from "./Badges";

// Detail keys rendered as dedicated facts; anything else falls through
// to the generic key/value list.
const KNOWN_DETAIL_KEYS = new Set([
  "order_name",
  "order_created_at",
  "age_hours",
  "threshold_hours",
  "financial_status",
  "fulfillment_status",
  "total",
]);

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <dt className="shrink-0 text-sm text-slate-500">{label}</dt>
      <dd className="text-right text-sm text-slate-900">{children}</dd>
    </div>
  );
}

export function ExceptionDrawer({
  exception: exc,
  shopDomain,
  busy,
  nowMs,
  onClose,
  onSetStatus,
}: {
  exception: ExceptionRow;
  shopDomain: string;
  busy: boolean;
  nowMs: number;
  onClose: () => void;
  onSetStatus: (exc: ExceptionRow, status: ExceptionStatus) => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const d = exc.details;
  const adminUrl = shopifyAdminUrl(
    shopDomain,
    exc.resource_type,
    exc.resource_id,
    d,
  );
  const total = formatMoney(d.total);
  const extraDetails = Object.entries(d).filter(
    ([k, v]) => !KNOWN_DETAIL_KEYS.has(k) && v != null,
  );

  const action = (label: string, status: ExceptionStatus, primary = false) => (
    <button
      key={status}
      onClick={() => onSetStatus(exc, status)}
      disabled={busy}
      className={
        primary
          ? "rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
          : "rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
      }
    >
      {label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0 bg-slate-900/30"
        onClick={onClose}
        aria-hidden
      />
      <aside className="relative flex h-full w-full max-w-md flex-col bg-white shadow-xl">
        <header className="border-b border-slate-200 px-6 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                {ruleLabel(exc.rule_id)}
              </h2>
              <p className="mt-0.5 text-sm text-slate-500">
                {resourceName(exc.resource_type, exc.resource_id, d)}
                {" · "}
                {shopDomain}
              </p>
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path
                  d="M4 4l8 8M12 4l-8 8"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <SeverityBadge severity={exc.severity} />
            <StatusBadge status={exc.status} />
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {adminUrl && (
            <a
              href={adminUrl}
              target="_blank"
              rel="noreferrer"
              className="mb-4 inline-flex items-center gap-1.5 rounded bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-600"
            >
              Open in Shopify admin
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path
                  d="M4.5 2H10v5.5M10 2L2 10"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </a>
          )}

          {exc.triage && (
            <div className="mb-4 rounded-lg border border-sky-200 bg-sky-50/60 p-4">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-sky-700">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M12 2l1.9 5.7a2 2 0 0 0 1.3 1.3L21 11l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 20l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 11l5.8-2a2 2 0 0 0 1.3-1.3L12 2z" />
                </svg>
                AI triage
              </p>
              <p className="mt-2 text-sm leading-relaxed text-slate-700">
                {exc.triage.summary}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-slate-700">
                <span className="font-semibold">Recommended:</span>{" "}
                {exc.triage.recommendation}
              </p>
            </div>
          )}

          <dl className="divide-y divide-slate-100">
            <Fact label="Store">{shopDomain}</Fact>
            <Fact label="Resource">
              {exc.resource_type} {exc.resource_id}
            </Fact>
            {d.age_hours != null && (
              <Fact label="Age">
                {String(d.age_hours)}h old
                <span className="text-slate-400">
                  {" "}
                  · threshold {String(d.threshold_hours)}h
                </span>
              </Fact>
            )}
            {typeof d.order_created_at === "string" && (
              <Fact label="Order placed">
                {new Date(d.order_created_at).toLocaleString()}
              </Fact>
            )}
            {total && <Fact label="Order total">{total}</Fact>}
            {typeof d.financial_status === "string" && (
              <Fact label="Payment">{d.financial_status.toLowerCase()}</Fact>
            )}
            {typeof d.fulfillment_status === "string" && (
              <Fact label="Fulfillment">{d.fulfillment_status.toLowerCase()}</Fact>
            )}
            <Fact label="First seen">
              {new Date(exc.first_seen_at).toLocaleString()}
              <span className="text-slate-400">
                {" "}
                · {timeAgo(exc.first_seen_at, nowMs)}
              </span>
            </Fact>
            {exc.resolved_at && (
              <Fact label="Resolved">
                {new Date(exc.resolved_at).toLocaleString()}
              </Fact>
            )}
            {extraDetails.map(([k, v]) => (
              <Fact key={k} label={k.replaceAll("_", " ")}>
                {typeof v === "object" ? JSON.stringify(v) : String(v)}
              </Fact>
            ))}
          </dl>

          <details className="mt-4">
            <summary className="cursor-pointer text-xs text-slate-400 hover:text-slate-600">
              Raw details
            </summary>
            <pre className="mt-2 overflow-x-auto rounded bg-slate-50 p-3 text-xs text-slate-600">
              {JSON.stringify(d, null, 2)}
            </pre>
          </details>
        </div>

        <footer className="flex gap-2 border-t border-slate-200 px-6 py-4">
          {exc.status === "open" && (
            <>
              {action("Acknowledge", "ack")}
              {action("Resolve", "resolved", true)}
            </>
          )}
          {exc.status === "ack" && (
            <>
              {action("Reopen", "open")}
              {action("Resolve", "resolved", true)}
            </>
          )}
          {exc.status === "resolved" && action("Reopen", "open")}
        </footer>
      </aside>
    </div>
  );
}
