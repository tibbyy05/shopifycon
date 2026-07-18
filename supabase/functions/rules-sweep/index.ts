// Hourly sweep for scheduled rules. Invoked by pg_cron (see the cron
// migration); callers must present the SWEEP_SECRET.

import { env } from "../_shared/env.ts";
import { getShopAccessToken, serviceClient, ShopRow } from "../_shared/db.ts";
import { makeGraphqlClient } from "../_shared/shopify.ts";
import { scheduledRules } from "../_shared/rules/registry.ts";
import { persistDetections } from "../_shared/rules/engine.ts";
import type { RuleContext } from "../_shared/rules/types.ts";
import { supabaseStore } from "../_shared/store.ts";
import { sha256Hex } from "../_shared/crypto.ts";
import { dispatchAlert } from "../_shared/alerts.ts";

Deno.serve(async (req) => {
  if (req.headers.get("x-sweep-token") !== env.sweepSecret) {
    return new Response("unauthorized", { status: 401 });
  }

  const startedAt = new Date();
  const supabase = serviceClient();
  const store = supabaseStore(supabase);

  const { data: shops, error } = await supabase
    .from("shops")
    .select(
      "id, org_id, shop_domain, access_token_encrypted, refresh_token_encrypted, token_expires_at, scopes, api_version, uninstalled_at",
    )
    .is("uninstalled_at", null)
    .not("access_token_encrypted", "is", null);
  if (error) {
    await supabase.from("sweep_runs").insert({
      started_at: startedAt.toISOString(),
      status: "failed",
      summary: [{ error: `shops query failed: ${error.message}` }],
    });
    return new Response(`shops query failed: ${error.message}`, { status: 500 });
  }

  const summary: Record<string, unknown>[] = [];
  const totals = { rules: 0, detected: 0, opened: 0, resolved: 0, failed: 0 };

  for (const shop of (shops ?? []) as ShopRow[]) {
    try {
      const token = await getShopAccessToken(supabase, shop);
      const graphql = makeGraphqlClient(shop.shop_domain, token);

      for (const rule of scheduledRules()) {
        const { data: cfg } = await supabase
          .from("rule_configs")
          .select("enabled, thresholds")
          .eq("shop_id", shop.id)
          .eq("rule_id", rule.id)
          .maybeSingle();
        if (cfg && !cfg.enabled) continue;

        const ctx: RuleContext = {
          shopId: shop.id,
          shopDomain: shop.shop_domain,
          graphql,
          thresholds: {
            ...rule.defaultThresholds,
            ...(cfg?.thresholds ?? {}),
          },
          now: new Date(),
        };

        const detections = await rule.detect(ctx);
        const result = await persistDetections(
          store,
          shop.id,
          rule,
          detections,
          sha256Hex,
        );

        if (rule.defaultAction.type === "alert") {
          for (const opened of result.opened) {
            await dispatchAlert(
              supabase,
              shop.shop_domain,
              opened.id,
              opened.exception,
            );
          }
        }

        summary.push({
          shop: shop.shop_domain,
          rule: rule.id,
          detected: result.detected,
          opened: result.opened.length,
          resolved: result.resolved,
        });
        totals.rules++;
        totals.detected += result.detected;
        totals.opened += result.opened.length;
        totals.resolved += result.resolved;
      }
    } catch (e) {
      console.error(`Sweep failed for ${shop.shop_domain}:`, e);
      summary.push({ shop: shop.shop_domain, error: String(e) });
      totals.failed++;
    }
  }

  const { error: runError } = await supabase.from("sweep_runs").insert({
    started_at: startedAt.toISOString(),
    status: totals.failed ? "partial" : "ok",
    shops_processed: (shops ?? []).length,
    shops_failed: totals.failed,
    rules_run: totals.rules,
    detected: totals.detected,
    opened: totals.opened,
    resolved: totals.resolved,
    summary,
  });
  if (runError) console.error("sweep_runs insert failed:", runError.message);

  return new Response(JSON.stringify({ ran_at: new Date().toISOString(), summary }), {
    headers: { "Content-Type": "application/json" },
  });
});
