export type Severity = "low" | "medium" | "high";
export type ExceptionStatus = "open" | "ack" | "resolved";

export interface Shop {
  id: string;
  shop_domain: string;
  installed_at: string;
  uninstalled_at: string | null;
}

export interface SweepRun {
  finished_at: string;
  status: "ok" | "partial" | "failed";
  shops_processed: number;
  shops_failed: number;
  opened: number;
  resolved: number;
}

export interface AlertChannel {
  id: string;
  shop_id: string;
  type: "email" | "slack";
  config: { to?: string; webhook_url?: string };
  enabled: boolean;
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
  triage: { summary: string; recommendation: string } | null;
  revenue_at_risk: number | null;
  first_seen_at: string;
  resolved_at: string | null;
}
