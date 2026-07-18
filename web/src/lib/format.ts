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
): string | null {
  const path = ADMIN_PATHS[resourceType];
  if (!path || !/^\d+$/.test(resourceId)) return null;
  const handle = shopDomain.replace(/\.myshopify\.com$/, "");
  return `https://admin.shopify.com/store/${handle}/${path}/${resourceId}`;
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
