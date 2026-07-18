-- Shopify Operations Monitor — core schema (v1)
-- Every tenant row carries shop_id; RLS is enforced on every table.

create extension if not exists pgcrypto;

-- ── organizations ───────────────────────────────────────────────────
create table public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  plan        text not null default 'free',
  created_at  timestamptz not null default now()
);

-- Maps auth users to organizations. Not in the original core-table list,
-- but RLS needs a user→org edge to scope browser reads.
create table public.org_members (
  org_id      uuid not null references public.organizations(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null default 'owner',
  created_at  timestamptz not null default now(),
  primary key (org_id, user_id)
);

-- ── shops ───────────────────────────────────────────────────────────
create table public.shops (
  id                       uuid primary key default gen_random_uuid(),
  org_id                   uuid not null references public.organizations(id) on delete cascade,
  shop_domain              text not null unique,
  access_token_encrypted   text,
  refresh_token_encrypted  text,
  token_expires_at         timestamptz,
  scopes                   text,
  api_version              text not null,
  installed_at             timestamptz not null default now(),
  uninstalled_at           timestamptz
);

-- ── webhook_events ──────────────────────────────────────────────────
create table public.webhook_events (
  id             uuid primary key default gen_random_uuid(),
  shop_id        uuid not null references public.shops(id) on delete cascade,
  topic          text not null,
  webhook_id     text,                -- X-Shopify-Webhook-Id, for dedupe
  payload        jsonb not null,
  hmac_verified  boolean not null default false,
  status         text not null default 'received'
                 check (status in ('received','processed','failed','dead_letter')),
  attempts       integer not null default 0,
  last_error     text,
  received_at    timestamptz not null default now(),
  processed_at   timestamptz
);
create unique index webhook_events_webhook_id_key
  on public.webhook_events (webhook_id) where webhook_id is not null;
create index webhook_events_shop_topic_idx
  on public.webhook_events (shop_id, topic, received_at desc);

-- ── exceptions ──────────────────────────────────────────────────────
create table public.exceptions (
  id               uuid primary key default gen_random_uuid(),
  shop_id          uuid not null references public.shops(id) on delete cascade,
  rule_id          text not null,
  resource_type    text not null,
  resource_id      text not null,
  severity         text not null check (severity in ('low','medium','high')),
  status           text not null default 'open'
                   check (status in ('open','ack','resolved')),
  details          jsonb not null default '{}'::jsonb,
  idempotency_key  text not null unique,
  first_seen_at    timestamptz not null default now(),
  resolved_at      timestamptz
);
create index exceptions_shop_status_idx
  on public.exceptions (shop_id, status, first_seen_at desc);

-- ── rule_configs ────────────────────────────────────────────────────
create table public.rule_configs (
  id          uuid primary key default gen_random_uuid(),
  shop_id     uuid not null references public.shops(id) on delete cascade,
  rule_id     text not null,
  enabled     boolean not null default true,
  thresholds  jsonb not null default '{}'::jsonb,
  unique (shop_id, rule_id)
);

-- ── action_logs (audit trail) ───────────────────────────────────────
create table public.action_logs (
  id            uuid primary key default gen_random_uuid(),
  shop_id       uuid not null references public.shops(id) on delete cascade,
  exception_id  uuid references public.exceptions(id) on delete set null,
  action_type   text not null,
  payload       jsonb not null default '{}'::jsonb,
  result        text,
  created_at    timestamptz not null default now()
);
create index action_logs_shop_idx on public.action_logs (shop_id, created_at desc);

-- ── alert_channels ──────────────────────────────────────────────────
create table public.alert_channels (
  id       uuid primary key default gen_random_uuid(),
  shop_id  uuid not null references public.shops(id) on delete cascade,
  type     text not null check (type in ('email','slack')),
  config   jsonb not null default '{}'::jsonb,
  enabled  boolean not null default true
);

-- ── RLS ─────────────────────────────────────────────────────────────
-- Edge Functions use the service role (bypasses RLS). The browser gets
-- read access strictly through org membership; anon gets nothing.

alter table public.organizations  enable row level security;
alter table public.org_members    enable row level security;
alter table public.shops          enable row level security;
alter table public.webhook_events enable row level security;
alter table public.exceptions     enable row level security;
alter table public.rule_configs   enable row level security;
alter table public.action_logs    enable row level security;
alter table public.alert_channels enable row level security;

-- Shops the current user may see (used by every shop-scoped policy).
create function public.member_shop_ids()
returns setof uuid
language sql
security definer
set search_path = public
stable
as $$
  select s.id
  from shops s
  join org_members m on m.org_id = s.org_id
  where m.user_id = auth.uid();
$$;

create policy org_members_select on public.org_members
  for select to authenticated
  using (user_id = auth.uid());

create policy organizations_select on public.organizations
  for select to authenticated
  using (id in (select org_id from public.org_members where user_id = auth.uid()));

create policy shops_select on public.shops
  for select to authenticated
  using (id in (select public.member_shop_ids()));

create policy webhook_events_select on public.webhook_events
  for select to authenticated
  using (shop_id in (select public.member_shop_ids()));

create policy exceptions_select on public.exceptions
  for select to authenticated
  using (shop_id in (select public.member_shop_ids()));

-- Users may ack/resolve their own shops' exceptions from the dashboard.
create policy exceptions_update on public.exceptions
  for update to authenticated
  using (shop_id in (select public.member_shop_ids()))
  with check (shop_id in (select public.member_shop_ids()));

create policy rule_configs_select on public.rule_configs
  for select to authenticated
  using (shop_id in (select public.member_shop_ids()));

create policy action_logs_select on public.action_logs
  for select to authenticated
  using (shop_id in (select public.member_shop_ids()));

create policy alert_channels_select on public.alert_channels
  for select to authenticated
  using (shop_id in (select public.member_shop_ids()));

-- ── column privileges ───────────────────────────────────────────────
-- The browser must never see tokens, even encrypted. Strip default
-- grants, then grant back only what the dashboard needs.
revoke all on all tables in schema public from anon;
revoke all on public.shops from authenticated;
grant select (id, org_id, shop_domain, scopes, api_version, installed_at, uninstalled_at)
  on public.shops to authenticated;

revoke insert, delete on public.exceptions from authenticated;
revoke update on public.exceptions from authenticated;
grant update (status, resolved_at) on public.exceptions to authenticated;

revoke insert, update, delete on public.organizations,
  public.org_members, public.webhook_events, public.rule_configs,
  public.action_logs, public.alert_channels from authenticated;

-- ── first-login bootstrap ───────────────────────────────────────────
-- Creates an org + membership for a brand-new user. SECURITY DEFINER so
-- it works despite the read-only grants above.
create function public.ensure_org(org_name text default 'My organization')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
begin
  select org_id into v_org from org_members where user_id = auth.uid() limit 1;
  if v_org is not null then
    return v_org;
  end if;
  insert into organizations (name) values (org_name) returning id into v_org;
  insert into org_members (org_id, user_id, role) values (v_org, auth.uid(), 'owner');
  return v_org;
end;
$$;

revoke execute on function public.ensure_org(text) from anon, public;
grant execute on function public.ensure_org(text) to authenticated;
revoke execute on function public.member_shop_ids() from anon, public;
grant execute on function public.member_shop_ids() to authenticated;
