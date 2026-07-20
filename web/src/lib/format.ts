// Display helpers shared by the exception views.

export function timeAgo(iso: string, nowMs: number): string {
  const mins = Math.floor((nowMs - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

const ADMIN_PATHS: Record<string, string> = {
  order: "orders",
  product: "products",
  customer: "customers",
};

/** Deep link into the Shopify admin for a monitored resource. */
export function shopifyAdminUrl(
  shopDomain: string,
  resourceType: string,
  resourceId: string,
  details: Record<string, unknown> = {},
): string | null {
  const handle = shopDomain.replace(/\.myshopify\.com$/, "");
  const base = `https://admin.shopify.com/store/${handle}`;
  // Shop-level exceptions (e.g. order-flow silence) link to the orders list.
  if (resourceType === "shop") return `${base}/orders`;
  if (
    resourceType === "variant" &&
    typeof details.product_id === "string" &&
    /^\d+$/.test(resourceId)
  ) {
    return `${base}/products/${details.product_id}/variants/${resourceId}`;
  }
  const path = ADMIN_PATHS[resourceType];
  if (!path || !/^\d+$/.test(resourceId)) return null;
  return `${base}/${path}/${resourceId}`;
}

/** One-line human summary of an exception, per rule. */
export function exceptionSummary(
  ruleId: string,
  details: Record<string, unknown>,
): string {
  switch (ruleId) {
    case "aging-unfulfilled":
    case "stuck-fulfillment":
      return details.age_hours != null
        ? `${details.age_hours}h old (threshold ${details.threshold_hours}h)`
        : "";
    case "order-flow-silence":
      return details.quiet_hours != null
        ? `no orders for ${details.quiet_hours}h (threshold ${details.threshold_hours}h)`
        : "";
    case "inventory-low":
      return details.available != null
        ? `${details.available} available${details.sku ? ` · ${details.sku}` : ""}`
        : "";
    case "payment-pending":
      return typeof details.financial_status === "string"
        ? `${details.financial_status.toLowerCase()} for ${details.age_hours}h`
        : "";
    case "shipping-delay":
      return details.in_transit_days != null
        ? `in transit ${details.in_transit_days}d (threshold ${details.threshold_days}d)`
        : "";
    case "refund-spike":
      return details.refunds_24h != null
        ? `${details.refunds_24h} refunds in 24h (baseline ${details.daily_baseline}/day)`
        : "";
    case "inventory-mismatch":
      return details.committed != null
        ? `${details.committed} committed vs ${details.available} available`
        : "";
    case "discount-spike":
      return details.discounted_orders != null
        ? `${details.discounted_orders} orders ≥${details.threshold_pct}% off in 24h`
        : "";
    default:
      return "";
  }
}

/** Display name of the thing an exception is about. */
export function resourceName(
  resourceType: string,
  resourceId: string,
  details: Record<string, unknown>,
): string {
  if (typeof details.order_name === "string") return details.order_name;
  if (typeof details.product_title === "string") {
    const variant = typeof details.variant_title === "string" &&
        details.variant_title !== "Default Title"
      ? ` / ${details.variant_title}`
      : "";
    return `${details.product_title}${variant}`;
  }
  if (resourceType === "shop") return "storefront";
  return `${resourceType} ${resourceId}`;
}

/** "$1,847" / "$84.85" — whole dollars once amounts get large. */
export function formatUsd(n: number): string {
  return "$" + n.toLocaleString("en-US", {
    minimumFractionDigits: n >= 100 ? 0 : 2,
    maximumFractionDigits: n >= 100 ? 0 : 2,
  });
}

/** Render a Shopify money object ({ amount, currencyCode }) if present. */
export function formatMoney(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const { amount, currencyCode } = value as {
    amount?: string;
    currencyCode?: string;
  };
  if (!amount) return null;
  return currencyCode ? `${amount} ${currencyCode}` : amount;
}
