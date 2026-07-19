// The exception-rule plug-in interface. Every detector — now and later
// (including eventual ERP reconciliation checks) — implements this.

export type Severity = "low" | "medium" | "high";

export interface ActionSpec {
  type: "alert" | "tag" | "flag";
  value?: string;
}

export interface RuleContext {
  shopId: string;
  shopDomain: string;
  /** Injected Shopify GraphQL caller — mock this in unit tests. */
  graphql: (
    query: string,
    variables?: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
  /** Per-shop thresholds from rule_configs, merged over rule defaults. */
  thresholds: Record<string, unknown>;
  /** "Now", injectable for deterministic tests. */
  now: Date;
  /** Webhook payload — only set for webhook-triggered runs. */
  webhookPayload?: Record<string, unknown>;
}

export interface DetectedException {
  ruleId: string;
  resourceType: string;
  resourceId: string;
  severity: Severity;
  details: Record<string, unknown>;
  /** Estimated dollars exposed by this exception (shop currency). */
  revenueAtRisk?: number | null;
  /**
   * The state that makes this occurrence distinct. Feeds the idempotency
   * key so webhook retries and re-sweeps never duplicate a row.
   */
  salientState: string;
}

export interface ExceptionRule {
  id: string;
  name: string;
  severity: Severity;
  trigger: "webhook" | "scheduled";
  webhookTopics?: string[];
  /** Cron expression, for scheduled rules. */
  schedule?: string;
  defaultThresholds: Record<string, unknown>;
  defaultAction: ActionSpec;
  detect(ctx: RuleContext): Promise<DetectedException[]>;
}

export function idempotencyInput(shopId: string, d: DetectedException): string {
  return `${shopId}:${d.ruleId}:${d.resourceId}:${d.salientState}`;
}
