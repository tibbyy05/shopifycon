-- Alert-channel management from the dashboard. Users may create, edit,
-- enable/disable, and delete channels for shops in their organization.

create policy alert_channels_insert on public.alert_channels
  for insert to authenticated
  with check (shop_id in (select public.member_shop_ids()));

create policy alert_channels_update on public.alert_channels
  for update to authenticated
  using (shop_id in (select public.member_shop_ids()))
  with check (shop_id in (select public.member_shop_ids()));

create policy alert_channels_delete on public.alert_channels
  for delete to authenticated
  using (shop_id in (select public.member_shop_ids()));

grant insert (shop_id, type, config, enabled) on public.alert_channels to authenticated;
grant update (config, enabled) on public.alert_channels to authenticated;
grant delete on public.alert_channels to authenticated;
