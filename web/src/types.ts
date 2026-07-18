export type Severity = "low" | "medium" | "high";
export type ExceptionStatus = "open" | "ack" | "resolved";

export interface Shop {
  id: string;
  shop_domain: string;
  installed_at: string;
  uninstalled_at: string | null;
}

/** Slim projection used by the Overview aggregates. */
export interface RecentException {
  rule_id: string;
  severity: Severity;
  status: ExceptionStatus;
  first_seen_at: string;
}

export interface ExceptionRow {
  id: string;
  shop_id: string;
  rule_id: string;
  resource_type: string;
  resource_id: string;
  severity: Severity;
  status: ExceptionStatus;
  details: Record<string, unknown>;
  first_seen_at: string;
  resolved_at: string | null;
}
