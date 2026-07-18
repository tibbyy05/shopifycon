// Supabase-backed ExceptionStore implementation (service role).

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { ExceptionInsert, ExceptionStore } from "./rules/engine.ts";

export function supabaseStore(supabase: SupabaseClient): ExceptionStore {
  return {
    async insertNew(rows: ExceptionInsert[]) {
      const { data, error } = await supabase
        .from("exceptions")
        .upsert(rows, {
          onConflict: "idempotency_key",
          ignoreDuplicates: true,
        })
        .select("id, idempotency_key");
      if (error) throw new Error(`exceptions upsert failed: ${error.message}`);
      return data ?? [];
    },

    async resolveMissing(shopId, ruleId, activeKeys) {
      let q = supabase
        .from("exceptions")
        .update({
          status: "resolved",
          resolved_at: new Date().toISOString(),
        })
        .eq("shop_id", shopId)
        .eq("rule_id", ruleId)
        .in("status", ["open", "ack"]);
      if (activeKeys.length) {
        q = q.not(
          "idempotency_key",
          "in",
          `(${activeKeys.map((k) => `"${k}"`).join(",")})`,
        );
      }
      const { data, error } = await q.select("id");
      if (error) throw new Error(`exceptions resolve failed: ${error.message}`);
      return data?.length ?? 0;
    },
  };
}
