// Webhook ingestion: verify X-Shopify-Hmac-SHA256 against the RAW body
// BEFORE doing anything else, dedupe on X-Shopify-Webhook-Id, persist to
// webhook_events, then process by topic. Failed processing is retryable
// (Shopify retries on non-2xx) up to MAX_ATTEMPTS, then dead-letters.

import { env } from "../_shared/env.ts";
import { serviceClient } from "../_shared/db.ts";
import { verifyWebhookHmac } from "../_shared/hmac.ts";

const MAX_ATTEMPTS = 5;

// Shopify's mandatory compliance topics — must always be accepted, even
// for shops we don't know about.
const COMPLIANCE_TOPICS = [
  "customers/data_request",
  "customers/redact",
  "shop/redact",
];

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const rawBody = new Uint8Array(await req.arrayBuffer());
  const hmacOk = await verifyWebhookHmac(
    rawBody,
    req.headers.get("X-Shopify-Hmac-SHA256"),
    env.shopifyApiSecret,
  );
  if (!hmacOk) {
    return new Response("HMAC verification failed", { status: 401 });
  }

  const topic = req.headers.get("X-Shopify-Topic") ?? "unknown";
  const shopDomain = req.headers.get("X-Shopify-Shop-Domain") ?? "";
  const webhookId = req.headers.get("X-Shopify-Webhook-Id");

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(new TextDecoder().decode(rawBody));
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const supabase = serviceClient();

  const { data: shop } = await supabase
    .from("shops")
    .select("id")
    .eq("shop_domain", shopDomain)
    .maybeSingle();

  if (!shop) {
    // Compliance webhooks can arrive for shops we never stored (or already
    // purged). Acknowledge so Shopify doesn't retry forever.
    console.warn(`Webhook ${topic} for unknown shop ${shopDomain} — acknowledged`);
    return new Response("ok", { status: 200 });
  }

  // ── dedupe / retry bookkeeping ────────────────────────────────────
  let eventId: string;
  let attempts = 0;

  const { data: existing } = webhookId
    ? await supabase
      .from("webhook_events")
      .select("id, status, attempts")
      .eq("webhook_id", webhookId)
      .maybeSingle()
    : { data: null };

  if (existing) {
    if (existing.status === "processed" || existing.status === "dead_letter") {
      return new Response("ok", { status: 200 }); // already handled
    }
    eventId = existing.id;
    attempts = existing.attempts;
  } else {
    const { data: inserted, error } = await supabase
      .from("webhook_events")
      .insert({
        shop_id: shop.id,
        topic,
        webhook_id: webhookId,
        payload,
        hmac_verified: true,
        status: "received",
      })
      .select("id")
      .single();
    if (error) {
      // Unique-violation race with a concurrent delivery → treat as handled.
      if (error.code === "23505") return new Response("ok", { status: 200 });
      console.error("webhook_events insert failed:", error.message);
      return new Response("storage error", { status: 500 });
    }
    eventId = inserted.id;
  }

  // ── process ───────────────────────────────────────────────────────
  try {
    await processEvent(supabase, shop.id, topic, payload);
    await supabase.from("webhook_events").update({
      status: "processed",
      attempts: attempts + 1,
      processed_at: new Date().toISOString(),
    }).eq("id", eventId);
    return new Response("ok", { status: 200 });
  } catch (e) {
    const failedAttempts = attempts + 1;
    const dead = failedAttempts >= MAX_ATTEMPTS;
    await supabase.from("webhook_events").update({
      status: dead ? "dead_letter" : "failed",
      attempts: failedAttempts,
      last_error: String(e).slice(0, 1000),
    }).eq("id", eventId);
    console.error(`Processing ${topic} failed (attempt ${failedAttempts}):`, e);
    // 500 → Shopify retries; once dead-lettered, acknowledge to stop retries.
    return new Response(dead ? "dead-lettered" : "processing failed", {
      status: dead ? 200 : 500,
    });
  }
});

async function processEvent(
  supabase: ReturnType<typeof serviceClient>,
  shopId: string,
  topic: string,
  payload: Record<string, unknown>,
): Promise<void> {
  if (topic === "app/uninstalled") {
    await supabase.from("shops").update({
      uninstalled_at: new Date().toISOString(),
      access_token_encrypted: null,
      refresh_token_encrypted: null,
      token_expires_at: null,
    }).eq("id", shopId);
    await supabase.from("action_logs").insert({
      shop_id: shopId,
      action_type: "app:uninstalled",
      payload: {},
      result: "tokens purged",
    });
    return;
  }

  if (COMPLIANCE_TOPICS.includes(topic)) {
    // v1 stores no customer PII beyond raw webhook payloads; log receipt
    // for the audit trail. (Data purge automation comes with GDPR work.)
    await supabase.from("action_logs").insert({
      shop_id: shopId,
      action_type: `compliance:${topic}`,
      payload: {},
      result: "acknowledged",
    });
    return;
  }

  // orders/create, fulfillments/create: persisting the raw event IS the
  // milestone-1 job. Webhook-triggered rules plug in here later via
  // rulesForTopic(topic) — none are registered yet.
}
