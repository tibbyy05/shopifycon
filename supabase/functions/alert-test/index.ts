// Sends a test alert through one of the caller's alert channels so a
// merchant can verify email/Slack wiring from the settings page.
// Deployed with verify_jwt = true (the gateway rejects anonymous calls);
// membership in the channel's org is checked here on top of that.

import { createClient } from "npm:@supabase/supabase-js@2";
import { env } from "../_shared/env.ts";
import { serviceClient } from "../_shared/db.ts";
import {
  type AlertChannel,
  type AlertContent,
  sendToChannel,
} from "../_shared/alerts.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "method not allowed" });

  const jwt = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!jwt) return json(401, { error: "unauthorized" });

  // Resolve the calling user from their JWT.
  const authClient = createClient(env.supabaseUrl, env.serviceRoleKey, {
    auth: { persistSession: false },
  });
  const { data: userData, error: userErr } = await authClient.auth.getUser(jwt);
  if (userErr || !userData?.user) return json(401, { error: "unauthorized" });
  const userId = userData.user.id;

  let channelId: string | undefined;
  try {
    ({ channel_id: channelId } = await req.json());
  } catch {
    // fall through
  }
  if (!channelId) return json(400, { error: "channel_id required" });

  const supabase = serviceClient();

  const { data: channel } = await supabase
    .from("alert_channels")
    .select("id, shop_id, type, config, shops!inner(shop_domain, org_id)")
    .eq("id", channelId)
    .maybeSingle();
  if (!channel) return json(404, { error: "channel not found" });

  const shop = channel.shops as unknown as {
    shop_domain: string;
    org_id: string;
  };

  const { data: membership } = await supabase
    .from("org_members")
    .select("user_id")
    .eq("org_id", shop.org_id)
    .eq("user_id", userId)
    .maybeSingle();
  if (!membership) return json(403, { error: "forbidden" });

  const content: AlertContent = {
    shopDomain: shop.shop_domain,
    ruleId: "aging-unfulfilled",
    severity: "high",
    resourceType: "order",
    resourceId: "0",
    details: {
      order_name: "#TEST",
      age_hours: 72,
      threshold_hours: 48,
      total: { amount: "129.00", currencyCode: "USD" },
      financial_status: "PAID",
      fulfillment_status: "UNFULFILLED",
    },
    revenueAtRisk: 129,
    triage: {
      summary:
        "Sample AI triage: order #TEST was paid 72 hours ago and fulfillment never started — 24 hours past your threshold. This usually means an item is out of stock or the fulfillment queue is stalled.",
      recommendation:
        "Open the order in your Shopify admin and check line-item availability, then fulfill manually or restock.",
    },
    test: true,
  };

  const result = await sendToChannel(
    { type: channel.type, config: channel.config } as AlertChannel,
    content,
  );

  await supabase.from("action_logs").insert({
    shop_id: channel.shop_id,
    action_type: `alert:test:${channel.type}`,
    payload: { channel_id: channel.id },
    result: result.ok ? "sent" : `error: ${result.detail}`,
  });

  return json(result.ok ? 200 : 502, { ok: result.ok, detail: result.detail });
});
