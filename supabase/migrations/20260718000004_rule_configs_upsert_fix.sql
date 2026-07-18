-- Upserts from PostgREST update every supplied column on conflict,
-- including the key columns — so the update grant must cover them.
-- RLS with-check still pins rows to the user's own shops.

grant update (shop_id, rule_id, enabled, thresholds)
  on public.rule_configs to authenticated;
