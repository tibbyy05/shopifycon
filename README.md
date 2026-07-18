# Shopify Operations Monitor

Read-only Shopify app that surfaces operational problems before customers
notice. This repo contains **milestone 1**: OAuth install → webhook
ingestion → rule #1 (aging unfulfilled orders) → dashboard → email alert.

## Layout

```
web/                        React + TS + Vite + Tailwind dashboard (Netlify)
supabase/migrations/        Schema + RLS, cron schedule
supabase/functions/
  shopify-oauth/            Install flow (start + callback)
  shopify-webhook/          HMAC-verified webhook ingestion
  rules-sweep/              Hourly scheduled rule runner
  _shared/                  Crypto, HMAC, Shopify GraphQL client (version
                            pinned in shopify.ts), rule engine, alerts
tests/                      Vitest unit tests for rules + engine
```

⚠️ **This project uses its own Supabase project via the CLI.** The Supabase
MCP connection in Claude belongs to MooreVitamins — never use it here.

## Local checks

```sh
npm test                       # rule + engine unit tests (root)
cd web && npm run build        # strict TS + production build
cd supabase/functions && deno check */index.ts
```

## Deploy runbook (once prep is ready)

Prereqs from the Partner dashboard / Supabase / SendGrid:
Shopify API key + secret, new Supabase project ref + access token,
SendGrid API key + verified sender.

```sh
# 1. Link this folder to the NEW project (one time)
supabase login                 # or set SUPABASE_ACCESS_TOKEN
supabase link --project-ref <NEW_PROJECT_REF>

# 2. Apply migrations
supabase db push

# 3. Secrets (copy .env.example → .env, fill in, then)
supabase secrets set --env-file .env

# 4. Deploy functions
supabase functions deploy shopify-oauth shopify-webhook rules-sweep

# 5. Vault secrets for the cron job (SQL editor, once):
#    select vault.create_secret('https://<ref>.supabase.co', 'project_url');
#    select vault.create_secret('<SWEEP_SECRET value>', 'sweep_secret');

# 6. Shopify app settings (Partner dashboard):
#    - Redirect URL:  https://<ref>.supabase.co/functions/v1/shopify-oauth/callback
#    - Compliance webhooks endpoint: https://<ref>.supabase.co/functions/v1/shopify-webhook

# 7. Dashboard: web/.env from web/.env.example, then
cd web && npm run dev          # or deploy to Netlify (netlify.toml at root)
```

Smoke test: sign into the dashboard (magic link) → Connect store with the
dev store domain → approve install → confirm a `shops` row exists with an
encrypted token → place a test order on the dev store → confirm a row in
`webhook_events` → invoke the sweep manually
(`curl -X POST .../functions/v1/rules-sweep -H "x-sweep-token: ..."`)
→ aging orders appear in `exceptions`, the dashboard, and your inbox.
