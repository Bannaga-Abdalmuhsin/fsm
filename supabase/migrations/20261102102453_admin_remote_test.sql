-- Admin remote testing is isolated from operational PMRs. Real GPS is retained.
create or replace function public.pmr_is_admin_test(o public.pmr_orders) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce(o.inventory->>'admin_test','false')='true' and lower(o.assignee)=public.pmr_email() and public.pmr_is_admin()
$$;
create or replace function public.pmr_create_admin_test(p_order text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare o public.pmr_orders; copied public.pmr_orders; test_id text:=gen_random_uuid()::text;
begin
 select * into o from public.pmr_orders where id=p_order;
 if not public.pmr_is_admin() or o.id is null or not public.pmr_can_manage_order(o) then raise exception 'Scoped admin access required'; end if;
 if o.inventory->>'admin_test'='true' then raise exception 'Open the existing test WO'; end if;
 insert into public.pmr_orders
 select (jsonb_populate_record(null::public.pmr_orders,to_jsonb(o)||jsonb_build_object(
 'id',test_id,'owner_email',public.pmr_email(),'assignee',public.pmr_email(),
 'wo','ADMIN-TEST-'||o.wo||'-'||left(test_id,8),'tcn','ADMIN-TEST-NOT-A-FIELD-PERMIT',
 'scheduled_start',public.pmr_iso(now()),'scheduled_end',public.pmr_iso(now()+interval '24 hours'),
 'tcn_start',public.pmr_iso(now()-interval '1 minute'),'tcn_end',public.pmr_iso(now()+interval '24 hours'),
 'status','Assigned','checked_in_at',null,'check_in',null,'version',1,
 'created_at',public.pmr_iso(now()),'updated_at',public.pmr_iso(now()),'review_note','ADMIN TEST ONLY — cannot submit or approve',
 'inventory',coalesce(o.inventory,'{}'::jsonb)||jsonb_build_object('admin_test',true,'source_order_id',o.id)
 ))).* returning * into copied;
 perform public.pmr_log(copied.owner_email,copied.org_id,copied.id,'admin-test-created','Source WO '||o.id||'; remote test, not operational evidence');
 return to_jsonb(copied);
end $$;
create or replace function public.pmr_guard_admin_test() returns trigger language plpgsql set search_path='' as $$
begin
 if old.inventory->>'admin_test'='true' then
 if new.inventory->>'admin_test' is distinct from 'true' or new.assignee is distinct from old.assignee or new.org_id is distinct from old.org_id then raise exception 'Admin test identity is immutable'; end if;
 if new.status in ('Submitted','Leader approved','Approved') then raise exception 'Admin tests cannot be submitted or approved as operational PMRs'; end if;
 end if; return new;
end $$;
create trigger pmr_admin_test_guard before update on public.pmr_orders for each row execute function public.pmr_guard_admin_test();
create or replace function public.pmr_validate_fix(o public.pmr_orders,p_fix jsonb,p_at timestamptz)
returns void language plpgsql stable set search_path='' as $$
declare lat float8; lng float8; acc float8; ts timestamptz; d float8;
begin
 begin lat:=(p_fix->>'latitude')::float8; lng:=(p_fix->>'longitude')::float8; acc:=(p_fix->>'accuracy')::float8; ts:=(p_fix->>'timestamp')::timestamptz;
 exception when others then raise exception 'Location fix is malformed'; end;
 if lat is null or lng is null or acc is null or ts is null or o.latitude is null or o.longitude is null
 or not(lat between -90 and 90) or not(lng between -180 and 180) or not(acc>0 and acc<=50)
 or not(o.latitude between -90 and 90) or not(o.longitude between -180 and 180) then raise exception 'Location fix is malformed or GPS accuracy is too low'; end if;
 if abs(extract(epoch from p_at-ts))>120 then raise exception 'GPS fix is stale. Refresh location.'; end if;
 if o.inventory->>'admin_test'='true' then
 if public.pmr_is_admin_test(o) then return; else raise exception 'Admin test access required'; end if; end if;
 d:=public.pmr_distance_m(lat,lng,o.latitude,o.longitude);
 if d is null or not(d+acc<=250) then raise exception 'You must be reliably inside the 250 m site boundary.'; end if;
end $$;

revoke all on function public.pmr_is_admin_test(public.pmr_orders),public.pmr_create_admin_test(text),public.pmr_guard_admin_test() from public,anon,authenticated;
grant execute on function public.pmr_is_admin_test(public.pmr_orders),public.pmr_create_admin_test(text) to authenticated;
