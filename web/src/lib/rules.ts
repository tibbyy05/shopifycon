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
  {
    id: "payment-pending",
    name: "Payment pending or expired",
    description:
      "An open order's payment is stuck pending or authorized past the time limit — or the authorization already expired, which loses the money unless the customer is re-charged.",
    severity: "high",
    thresholds: [
      {
        key: "max_payment_pending_hours",
        label: "Max pending (hours)",
        defaultValue: 24,
      },
    ],
  },
  {
    id: "shipping-delay",
    name: "Shipment stuck in transit",
    description:
      "A shipment left more than the threshold days ago with no delivery confirmation — lost packages and carrier stalls, caught before the customer complains.",
    severity: "medium",
    thresholds: [
      { key: "max_transit_days", label: "Max transit (days)", defaultValue: 7 },
    ],
  },
  {
    id: "refund-spike",
    name: "Refund spike",
    description:
      "Refund volume in the last 24 hours is abnormally high versus this store's own weekly baseline — defects, fulfillment errors, or fraud, hours old instead of weeks.",
    severity: "high",
    thresholds: [
      { key: "min_refunds_24h", label: "Min refunds (24h)", defaultValue: 3 },
      {
        key: "spike_multiplier",
        label: "Spike multiplier",
        defaultValue: 3,
      },
    ],
  },
  {
    id: "inventory-mismatch",
    name: "Committed exceeds available stock",
    description:
      "A location has more units committed to open orders than it actually holds — promised sales that physically can't ship.",
    severity: "high",
    thresholds: [],
  },
  {
    id: "discount-spike",
    name: "Unusual discounting",
    description:
      "Multiple orders in 24 hours sold at or above the discount threshold — leaked codes and misconfigured automatic discounts eating margin.",
    severity: "medium",
    thresholds: [
      {
        key: "max_discount_pct",
        label: "Discount threshold (%)",
        defaultValue: 50,
      },
      {
        key: "min_discounted_orders",
        label: "Min orders (24h)",
        defaultValue: 3,
      },
    ],
  },
];

const LABELS = new Map(RULE_META.map((r) => [r.id, r.name]));

export const ruleLabel = (id: string): string => LABELS.get(id) ?? id;
