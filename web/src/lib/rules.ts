// Rule metadata for display and configuration. Mirror
// supabase/functions/_shared/rules/registry.ts when adding a rule.

export interface ThresholdSpec {
  key: string;
  label: string;
  defaultValue: number;
}

export interface RuleMeta {
  id: string;
  name: string;
  description: string;
  severity: "low" | "medium" | "high";
  thresholds: ThresholdSpec[];
}

export const RULE_META: RuleMeta[] = [
  {
    id: "aging-unfulfilled",
    name: "Aging unfulfilled order",
    description:
      "A paid, open order has not started fulfillment within the time limit.",
    severity: "high",
    thresholds: [
      { key: "max_age_hours", label: "Max age (hours)", defaultValue: 48 },
    ],
  },
  {
    id: "order-flow-silence",
    name: "Order flow silence",
    description:
      "A store that normally receives orders has had none for too long — catches broken checkouts and payment outages. Skips stores below the weekly order floor.",
    severity: "high",
    thresholds: [
      { key: "max_quiet_hours", label: "Quiet window (hours)", defaultValue: 24 },
      {
        key: "min_weekly_orders",
        label: "Min orders per week",
        defaultValue: 10,
      },
    ],
  },
  {
    id: "inventory-low",
    name: "Inventory low or oversold",
    description:
      "A tracked variant on an active product is at or below the stock threshold. Negative inventory (oversold) is flagged high severity.",
    severity: "high",
    thresholds: [
      { key: "low_stock_threshold", label: "Stock threshold", defaultValue: 0 },
    ],
  },
  {
    id: "stuck-fulfillment",
    name: "Stuck partial fulfillment",
    description:
      "A paid order was partially fulfilled and has been stalled longer than the time limit.",
    severity: "medium",
    thresholds: [
      {
        key: "max_partial_age_hours",
        label: "Max partial age (hours)",
        defaultValue: 24,
      },
    ],
  },
];

const LABELS = new Map(RULE_META.map((r) => [r.id, r.name]));

export const ruleLabel = (id: string): string => LABELS.get(id) ?? id;
