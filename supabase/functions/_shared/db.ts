import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";
import { env } from "./env.ts";
import { decryptSecret, encryptSecret } from "./crypto.ts";
import { refreshAccessToken } from "./shopify.ts";

/** Service-role client — used ONLY inside Edge Functions, never the browser. */
export function serviceClient(): SupabaseClient {
  return createClient(env.supabaseUrl, env.serviceRoleKey, {
    auth: { persistSession: false },
  });
}

export interface ShopRow {
  id: string;
  org_id: string;
  shop_domain: string;
  access_token_encrypted: string | null;
  refresh_token_encrypted: string | null;
  token_expires_at: string | null;
  scopes: string | null;
  api_version: string;
  uninstalled_at: string | null;
}

/**
 * Decrypt the shop's access token, refreshing it first when it expires
 * within 10 minutes (offline tokens now expire). Persists rotated tokens.
 */
export async function getShopAccessToken(
  supabase: SupabaseClient,
  shop: ShopRow,
): Promise<string> {
  if (!shop.access_token_encrypted) {
    throw new Error(`Shop ${shop.shop_domain} has no stored token`);
  }
  const key = env.tokenEncryptionKey;

  const expiresSoon = shop.token_expires_at !== null &&
    new Date(shop.token_expires_at).getTime() - Date.now() < 10 * 60 * 1000;

  if (expiresSoon && shop.refresh_token_encrypted) {
    const refreshToken = await decryptSecret(shop.refresh_token_encrypted, key);
    const fresh = await refreshAccessToken(
      shop.shop_domain,
      refreshToken,
      env.shopifyApiKey,
      env.shopifyApiSecret,
    );
    const update: Record<string, unknown> = {
      access_token_encrypted: await encryptSecret(fresh.access_token, key),
      token_expires_at: fresh.expires_in
        ? new Date(Date.now() + fresh.expires_in * 1000).toISOString()
        : null,
    };
    if (fresh.refresh_token) {
      update.refresh_token_encrypted = await encryptSecret(
        fresh.refresh_token,
        key,
      );
    }
    const { error } = await supabase.from("shops").update(update)
      .eq("id", shop.id);
    if (error) throw new Error(`Failed to persist refreshed token: ${error.message}`);
    return fresh.access_token;
  }

  return await decryptSecret(shop.access_token_encrypted, key);
}
