-- Sweep run history: the monitor's own health record. Written by the
-- rules-sweep function (service role) after every run.

create table public.sweep_runs (
  id               uuid primary key default gen_random_uuid(),
  started_at       timestamptz not null,
  finished_at      timestamptz not null default now(),
  status           text not null check (status in ('ok','partial','failed')),
  shops_processed  integer not null default 0,
  shops_failed     integer not null default 0,
  rules_run        integer not null default 0,
  detected         integer not null default 0,
  opened           integer not null default 0,
  resolved         integer not null default 0,
  -- Full per-shop breakdown. Contains shop domains across ALL tenants,
  -- so it is never granted to the browser (see column grants below).
  summary          jsonb not null default '[]'::jsonb
);
create index sweep_runs_finished_idx on public.sweep_runs (finished_at desc);

alter table public.sweep_runs enable row level security;

-- Any signed-in user may see that sweeps are running and healthy —
-- it is a trust signal — but only the aggregate columns.
create policy sweep_runs_select on public.sweep_runs
  for select to authenticated
  using (true);

revoke all on public.sweep_runs from anon;
revoke all on public.sweep_runs from authenticated;
grant select (id, started_at, finished_at, status, shops_processed,
  shops_failed, rules_run, detected, opened, resolved)
  on public.sweep_runs to authenticated;
