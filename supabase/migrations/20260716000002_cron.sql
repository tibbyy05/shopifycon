-- Hourly scheduled sweep: pg_cron fires an HTTP POST (via pg_net) at the
-- rules-sweep Edge Function. The function URL and sweep secret live in
-- Vault, set once at deploy time:
--
--   select vault.create_secret('https://<ref>.supabase.co', 'project_url');
--   select vault.create_secret('<SWEEP_SECRET>', 'sweep_secret');

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'rules-sweep-hourly',
  '0 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
           || '/functions/v1/rules-sweep',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-sweep-token',
      (select decrypted_secret from vault.decrypted_secrets where name = 'sweep_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);
