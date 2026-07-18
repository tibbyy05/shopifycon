import type { ExceptionStatus, Severity } from "../types";

const SEVERITY_STYLE: Record<Severity, string> = {
  high: "bg-red-100 text-red-700",
  medium: "bg-amber-100 text-amber-700",
  low: "bg-slate-100 text-slate-600",
};

const STATUS_STYLE: Record<ExceptionStatus, string> = {
  open: "bg-sky-100 text-sky-700",
  ack: "bg-violet-100 text-violet-700",
  resolved: "bg-emerald-100 text-emerald-700",
};

const STATUS_LABEL: Record<ExceptionStatus, string> = {
  open: "open",
  ack: "acknowledged",
  resolved: "resolved",
};

export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${SEVERITY_STYLE[severity]}`}
    >
      {severity}
    </span>
  );
}

export function StatusBadge({ status }: { status: ExceptionStatus }) {
  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[status]}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}
