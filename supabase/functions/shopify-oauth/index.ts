// Shopify OAuth (public app, offline tokens).
//
//   POST /shopify-oauth            — start install. Requires the user's
//        Supabase JWT; body {shop}. Returns {authorizeUrl}. The signed
//        `state` carries org_id + nonce so the callback is stateless.
//   GET  /shopify-oauth/callback   — Shopify redirects here. Verifies the
//        OAuth HMAC + state, exchanges the code, encrypts + stores tokens,
//        registers webhooks, then redirects to the dashboard.

import { createClient } from "npm:@supabase/supabase-js@2";
import { env } from "../_shared/env.ts";
import { serviceClient } from "../_shared/db.ts";
import { encryptSecret } from "../_shared/crypto.ts";
import { signState, verifyOAuthHmac, verifyState } from "../_shared/hmac.ts";
import {
  buildAuthorizeUrl,
  exchangeCodeForToken,
  isValidShopDomain,
  makeGraphqlClient,
  SHOPIFY_API_VERSION,
} from "../_shared/shopify.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });

function redirectUri(): string {
  return `${env.supabaseUrl}/functions/v1/shopify-oauth/callback`;
}

// ── start ────────────────────────────────────────────────────────────
async function handleStart(req: Request): Promise<Response> {
  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(
    env.supabaseUrl,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) return json(401, { error: "Not signed in" });

  const { shop } = await req.json().catch(() => ({}));
  if (typeof shop !== "string" || !isValidShopDomain(shop)) {
    return json(400, { error: "Provide shop as your-store.myshopify.com" });
  }

  const { data: orgId, error: orgErr } = await userClient.rpc("ensure_org");
  if (orgErr || !orgId) {
    return json(500, { error: `Could not resolve organization` });
  }

  const state = await signState(
    {
      org_id: orgId,
      shop,
      nonce: crypto.randomUUID(),
      ts: Date.now(),
    },
    env.shopifyApiSecret,
  );

  return json(200, {
    authorizeUrl: buildAuthorizeUrl(
      shop,
      env.shopifyApiKey,
      env.shopifyScopes,
      redirectUri(),
      state,
    ),
  });
}

// ── callback ─────────────────────────────────────────────────────────
const WEBHOOK_TOPICS = ["ORDERS_CREATE", "FULFILLMENTS_CREATE", "APP_UNINSTALLED"];

const WEBHOOK_CREATE = /* GraphQL */ `
  mutation Subscribe($topic: WebhookSubscriptionTopic!, $sub: WebhookSubscriptionInput!) {
    webhookSubscriptionCreate(topic: $topic, webhookSubscription: $sub) {
      webhookSubscription { id }
      userErrors { field message }
    }
  }
`;

async function handleCallback(url: URL): Promise<Response> {
  const params = url.searchParams;
  const shop = params.get("shop") ?? "";
  const code = params.get("code") ?? "";

  if (!isValidShopDomain(shop) || !code) {
    return json(400, { error: "Invalid callback parameters" });
  }
  if (!(await verifyOAuthHmac(params, env.shopifyApiSecret))) {
    return json(401, { error: "HMAC verification failed" });
  }
  const state = await verifyState(params.get("state"), env.shopifyApiSecret);
  if (
    !state || state.shop !== shop ||
    Date.now() - Number(state.ts) > 10 * 60 * 1000
  ) {
    return json(401, { error: "Invalid or expired state" });
  }

  const token = await exchangeCodeForToken(
    shop,
    code,
    env.shopifyApiKey,
    env.shopifyApiSecret,
  );

  const key = env.tokenEncryptionKey;
  const supabase = serviceClient();
  const { data: shopRow, error } = await supabase
    .from("shops")
    .upsert(
      {
        org_id: state.org_id as string,
        shop_domain: shop,
        access_token_encrypted: await encryptSecret(token.access_token, key),
        refresh_token_encrypted: token.refresh_token
          ? await encryptSecret(token.refresh_token, key)
          : null,
        token_expires_at: token.expires_in
          ? new Date(Date.now() + token.expires_in * 1000).toISOString()
          : null,
        scopes: token.scope,
        api_version: SHOPIFY_API_VERSION,
        installed_at: new Date().toISOString(),
        uninstalled_at: null,
      },
      { onConflict: "shop_domain" },
    )
    .select("id")
    .single();
  if (error) return json(500, { error: `Failed to store shop: ${error.message}` });

  // Register webhooks (idempotent enough: Shopify rejects duplicates with a
  // userError we can ignore on reinstall).
  const graphql = makeGraphqlClient(shop, token.access_token);
  const callbackUrl = `${env.supabaseUrl}/functions/v1/shopify-webhook`;
  for (const topic of WEBHOOK_TOPICS) {
    try {
      const data = await graphql(WEBHOOK_CREATE, {
        topic,
        sub: { callbackUrl, format: "JSON" },
      });
      const errs = (data.webhookSubscriptionCreate as {
        userErrors: { message: string }[];
      }).userErrors;
      if (errs?.length) {
        console.warn(`webhook ${topic}: ${errs.map((e) => e.message).join("; ")}`);
      }
    } catch (e) {
      console.error(`webhook ${topic} registration failed:`, e);
    }
  }

  await supabase.from("action_logs").insert({
    shop_id: shopRow.id,
    action_type: "app:installed",
    payload: { shop, scopes: token.scope, api_version: SHOPIFY_API_VERSION },
    result: "ok",
  });

  return new Response(null, {
    status: 302,
    headers: { Location: `${env.dashboardUrl}/?installed=${shop}` },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  const url = new URL(req.url);
  try {
    if (url.pathname.endsWith("/callback")) return await handleCallback(url);
    if (req.method === "POST") return await handleStart(req);
    if (req.method === "GET") {
      // App URL target: merchants opening the app from Shopify admin land
      // here — send them to the dashboard.
      return new Response(null, {
        status: 302,
        headers: { Location: env.dashboardUrl },
      });
    }
    return json(405, { error: "Method not allowed" });
  } catch (e) {
    console.error("shopify-oauth error:", e);
    return json(500, { error: "Internal error" });
  }
});
