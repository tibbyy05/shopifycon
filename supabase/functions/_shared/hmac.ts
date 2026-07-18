// Shopify HMAC verification — webhooks and OAuth callbacks.

const encoder = new TextEncoder();

async function hmacSha256(
  secret: string,
  data: string | Uint8Array<ArrayBuffer>,
) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bytes = typeof data === "string" ? encoder.encode(data) : data;
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, bytes));
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** Verify X-Shopify-Hmac-SHA256 against the RAW request body. */
export async function verifyWebhookHmac(
  rawBody: Uint8Array<ArrayBuffer>,
  hmacHeader: string | null,
  secret: string,
): Promise<boolean> {
  if (!hmacHeader) return false;
  const digest = await hmacSha256(secret, rawBody);
  let expected: Uint8Array;
  try {
    expected = Uint8Array.from(atob(hmacHeader), (c) => c.charCodeAt(0));
  } catch {
    return false;
  }
  return timingSafeEqual(digest, expected);
}

/**
 * Verify the `hmac` query param on OAuth callbacks: hex HMAC-SHA256 of the
 * query string with `hmac` removed, keys sorted, joined with `&`.
 */
export async function verifyOAuthHmac(
  params: URLSearchParams,
  secret: string,
): Promise<boolean> {
  const provided = params.get("hmac");
  if (!provided) return false;
  const message = [...params.entries()]
    .filter(([k]) => k !== "hmac")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  const digest = await hmacSha256(secret, message);
  const digestHex = Array.from(digest)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return timingSafeEqual(encoder.encode(digestHex), encoder.encode(provided));
}

async function hmacHex(secret: string, data: string): Promise<string> {
  const sig = await hmacSha256(secret, data);
  return Array.from(sig)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Sign an arbitrary payload (used for the stateless OAuth `state` param). */
export async function signState(
  payload: Record<string, unknown>,
  secret: string,
): Promise<string> {
  const body = btoa(JSON.stringify(payload)).replaceAll("+", "-")
    .replaceAll("/", "_").replaceAll("=", "");
  return `${body}.${await hmacHex(secret, body)}`;
}

export async function verifyState(
  state: string | null,
  secret: string,
): Promise<Record<string, unknown> | null> {
  if (!state) return null;
  const dot = state.lastIndexOf(".");
  if (dot < 0) return null;
  const body = state.slice(0, dot);
  const sig = state.slice(dot + 1);
  const expected = await hmacHex(secret, body);
  if (!timingSafeEqual(encoder.encode(expected), encoder.encode(sig))) {
    return null;
  }
  try {
    return JSON.parse(atob(body.replaceAll("-", "+").replaceAll("_", "/")));
  } catch {
    return null;
  }
}
