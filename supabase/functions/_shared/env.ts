// Single place all secrets are read. Everything comes from env vars —
// never hardcoded, never committed.

function required(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export const env = {
  get supabaseUrl() {
    return required("SUPABASE_URL");
  },
  get serviceRoleKey() {
    return required("SUPABASE_SERVICE_ROLE_KEY");
  },
  get shopifyApiKey() {
    return required("SHOPIFY_API_KEY");
  },
  get shopifyApiSecret() {
    return required("SHOPIFY_API_SECRET");
  },
  get shopifyScopes() {
    return Deno.env.get("SHOPIFY_SCOPES") ??
      "read_orders,read_fulfillments,read_products,read_inventory";
  },
  get tokenEncryptionKey() {
    return required("TOKEN_ENCRYPTION_KEY");
  },
  get sweepSecret() {
    return required("SWEEP_SECRET");
  },
  get sendgridApiKey() {
    return required("SENDGRID_API_KEY");
  },
  get alertFromEmail() {
    return required("ALERT_FROM_EMAIL");
  },
  get alertDefaultTo() {
    return Deno.env.get("ALERT_DEFAULT_TO") ?? "";
  },
  get dashboardUrl() {
    return Deno.env.get("DASHBOARD_URL") ?? "http://localhost:5173";
  },
};
