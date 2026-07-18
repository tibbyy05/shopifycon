-- Rule configuration from the dashboard. Users may enable/disable rules
-- and set thresholds for shops in their organization. Deleting a row
-- resets the rule to its defaults.

create policy rule_configs_insert on public.rule_configs
  for insert to authenticated
  with check (shop_id in (select public.member_shop_ids()));

create policy rule_configs_update on public.rule_configs
  for update to authenticated
  using (shop_id in (select public.member_shop_ids()))
  with check (shop_id in (select public.member_shop_ids()));

create policy rule_configs_delete on public.rule_configs
  for delete to authenticated
  using (shop_id in (select public.member_shop_ids()));

grant insert (shop_id, rule_id, enabled, thresholds) on public.rule_configs to authenticated;
grant update (enabled, thresholds) on public.rule_configs to authenticated;
grant delete on public.rule_configs to authenticated;
