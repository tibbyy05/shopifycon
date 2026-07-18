// Shopify Admin API access — GraphQL only, version pinned HERE and nowhere
// else. All calls go through shopifyGraphql(), which retries with backoff
// on throttling (GraphQL cost-based limits / HTTP 429) and 5xx.

export const SHOPIFY_API_VERSION = "2025-10";

export interface GraphqlClient {
  (query: string, variables?: Record<string, unknown>): Promise<
    Record<string, unknown>
  >;
}

export class ShopifyGraphqlError extends Error {
  constructor(message: string, public errors: unknown) {
    super(message);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Build a GraphQL client bound to one shop + access token.
 * Retries: up to `maxRetries` on 429, 5xx, and THROTTLED GraphQL errors,
 * with exponential backoff (honoring Retry-After when present).
 */
export function makeGraphqlClient(
  shopDomain: string,
  accessToken: string,
  maxRetries = 5,
): GraphqlClient {
  const endpoint =
    `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;

  return async (query, variables = {}) => {
    let attempt = 0;
    for (;;) {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": accessToken,
        },
        body: JSON.stringify({ query, variables }),
      });

      if (res.status === 429 || res.status >= 500) {
        if (attempt >= maxRetries) {
          throw new ShopifyGraphqlError(
            `Shopify HTTP ${res.status} after ${attempt} retries`,
            await res.text().catch(() => null),
          );
        }
        const retryAfter = Number(res.headers.get("Retry-After"));
        const delayMs = retryAfter > 0
          ? retryAfter * 1000
          : Math.min(2 ** attempt * 500, 8000);
        await sleep(delayMs);
        attempt++;
        continue;
      }

      if (!res.ok) {
        throw new ShopifyGraphqlError(
          `Shopify HTTP ${res.status}`,
          await res.text().catch(() => null),
        );
      }

      const body = await res.json();
      if (body.errors?.length) {
        const throttled = body.errors.some(
          (e: { extensions?: { code?: string } }) =>
            e.extensions?.code === "THROTTLED",
        );
        if (throttled && attempt < maxRetries) {
          await sleep(Math.min(2 ** attempt * 1000, 10000));
          attempt++;
          continue;
        }
        throw new ShopifyGraphqlError("Shopify GraphQL errors", body.errors);
      }
      return body.data as Record<string, unknown>;
    }
  };
}

// ── OAuth / token endpoints (REST is unavoidable for these) ─────────

export interface TokenResponse {
  access_token: string;
  scope: string;
  /** Present for expiring offline tokens */
  expires_in?: number;
  refresh_token?: string;
}

export async function exchangeCodeForToken(
  shopDomain: string,
  code: string,
  apiKey: string,
  apiSecret: string,
): Promise<TokenResponse> {
  const res = await fetch(`https://${shopDomain}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: apiKey,
      client_secret: apiSecret,
      code,
    }),
  });
  if (!res.ok) {
    throw new Error(`Token exchange failed: HTTP ${res.status}`);
  }
  return await res.json();
}

/** Offline tokens now expire — exchange the refresh token for a new pair. */
export async function refreshAccessToken(
  shopDomain: string,
  refreshToken: string,
  apiKey: string,
  apiSecret: string,
): Promise<TokenResponse> {
  const res = await fetch(`https://${shopDomain}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: apiKey,
      client_secret: apiSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  if (!res.ok) {
    throw new Error(`Token refresh failed: HTTP ${res.status}`);
  }
  return await res.json();
}

export function buildAuthorizeUrl(
  shopDomain: string,
  apiKey: string,
  scopes: string,
  redirectUri: string,
  state: string,
): string {
  const u = new URL(`https://${shopDomain}/admin/oauth/authorize`);
  u.searchParams.set("client_id", apiKey);
  u.searchParams.set("scope", scopes);
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("state", state);
  return u.toString();
}

/** Basic sanity check on a merchant-supplied shop domain. */
export function isValidShopDomain(domain: string): boolean {
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(domain);
}

/** Extract the trailing numeric id from a gid://shopify/Order/123 string. */
export function gidToId(gid: string): string {
  const m = gid.match(/\/(\d+)(\?.*)?$/);
  return m ? m[1] : gid;
}
