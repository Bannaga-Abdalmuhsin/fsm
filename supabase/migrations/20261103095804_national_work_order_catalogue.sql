-- National office access stays within the same organization. Technicians remain assigned-only.
create or replace function public.pmr_region_in_scope(p_org text,p_region text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.pmr_me() m where coalesce(m.org_id,'')=coalesce(p_org,'') and public.pmr_region_code(p_region) is not null and (m.role in ('admin','fsm_team') or m.regions @> jsonb_build_array(public.pmr_region_code(p_region))))
$$;
create or replace function public.pmr_can_manage_order(o public.pmr_orders) returns boolean language sql stable security definer set search_path='' as $$
 select public.pmr_region_in_scope(o.org_id,o.region) and exists(select 1 from public.pmr_me() m where m.role in ('admin','supervisor','regional_manager','team_leader','fsm_team'))
$$;
alter table public.pmr_members drop constraint pmr_members_teams_check;
alter table public.pmr_members add constraint pmr_members_teams_check check(jsonb_typeof(teams)='array' and (role='team_leader' or jsonb_array_length(teams)=0));
create table pmr_private.project_wo_sources(source_id text primary key,org_id text not null,enabled boolean not null default true);
revoke all on pmr_private.project_wo_sources from public,anon,authenticated;
create table public.pmr_project_work_orders(
 org_id text not null,period text not null check(period ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'),request_id text not null,task_id text not null,site_id text not null,region text not null check(region in ('CR','ER','WR','SR')),district text not null default '',
 details jsonb not null default '{}',source_id text not null,source_tab text not null,source_row int not null,
 order_id text references public.pmr_orders(id),site_reference jsonb not null default '{}',present_in_source boolean not null default true,refreshed_at timestamptz not null default now(),
 primary key(org_id,period,request_id)
);
alter table public.pmr_project_work_orders enable row level security;
revoke all on public.pmr_project_work_orders from public,anon,authenticated;
grant select on public.pmr_project_work_orders to authenticated;
create policy pmr_project_wos_read on public.pmr_project_work_orders for select to authenticated using(public.pmr_region_in_scope(org_id,region) and exists(select 1 from public.pmr_me() m where m.role in ('admin','fsm_team','team_leader','regional_manager','supervisor') or (m.role='technician' and exists(select 1 from public.pmr_orders o where o.id=order_id and public.pmr_can_operate_order(o)))));
create function pmr_private.ingest_project_wos(p_source text,p_tab text,p_period text,p_rows jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare organization text; item jsonb; site public.pmr_sites; req text; region_code text; linked text; n int:=0; d jsonb;
begin
 select org_id into organization from pmr_private.project_wo_sources where source_id=p_source and enabled;
 if organization is null then raise exception 'Unregistered WO source'; end if;
 if p_period !~ '^20[0-9]{2}-(0[1-9]|1[0-2])$' or p_period is null or length(p_tab)>150 or coalesce(btrim(p_tab),'')='' or jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows)>10000 then raise exception 'Invalid monthly WO snapshot'; end if;
 if exists(select 1 from jsonb_array_elements(p_rows) r group by r->>'request_id' having count(*)>1) then raise exception 'Duplicate WO request IDs in this month'; end if;
 -- Mark only this tab/month; keep past-month history and rows removed upstream.
 update public.pmr_project_work_orders set present_in_source=false where source_id=p_source and source_tab=p_tab and period=p_period;
 for item in select value from jsonb_array_elements(p_rows) loop
 req:=btrim(item->>'request_id');region_code:=public.pmr_region_code(item->>'region');
 if coalesce(req,'')='' or coalesce(btrim(item->>'task_id'),'')='' or coalesce(btrim(item->>'site_id'),'')='' or region_code is null then raise exception 'WO identity, task, site and region are required'; end if;
 select * into site from public.pmr_sites where site_id=upper(btrim(item->>'site_id'));
 select case when count(*)=1 then min(id) else null end into linked from public.pmr_orders o where o.org_id=organization and o.month=p_period and o.wo in(req,btrim(item->>'task_id')) and coalesce(o.inventory->>'admin_test','false')<>'true';
 -- Explicit non-date whitelist; raw export rows and scheduled dates are never retained.
 d:=jsonb_build_object('service_provider',item->>'service_provider','network',item->>'network','clli_code',item->>'clli_code','manufacturer',item->>'manufacturer','equipment',item->>'equipment','technology',item->>'technology','technology_group',item->>'technology_group','node',item->>'node','combined_node',item->>'combined_node','service_type',item->>'service_type','source_technician',item->>'source_technician','frequency',item->>'frequency','work_group',item->>'work_group','request_status',item->>'request_status');
 insert into public.pmr_project_work_orders(org_id,period,request_id,task_id,site_id,region,district,details,source_id,source_tab,source_row,order_id,site_reference)
 values(organization,p_period,req,btrim(item->>'task_id'),upper(btrim(item->>'site_id')),region_code,coalesce(item->>'district',''),d,p_source,p_tab,(item->>'source_row')::int,linked,case when site.site_id is null then '{}'::jsonb else to_jsonb(site)-'source_id'-'source_row' end)
 on conflict(org_id,period,request_id) do update set task_id=excluded.task_id,site_id=excluded.site_id,region=excluded.region,district=excluded.district,details=excluded.details,source_tab=excluded.source_tab,source_row=excluded.source_row,order_id=excluded.order_id,site_reference=excluded.site_reference,present_in_source=true,refreshed_at=now();
 n:=n+1;end loop;
 return jsonb_build_object('ok',true,'received',n,'period',p_period);
end $$;
revoke all on function pmr_private.ingest_project_wos(text,text,text,jsonb) from public,anon,authenticated;
create function public.pmr_sync_project_wos(p_sheet_id text,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform pmr_private.assert_sync_token();
 return pmr_private.ingest_project_wos(p_sheet_id,p_payload->>'tab',p_payload->>'period',p_payload->'rows');
end $$;
revoke all on function public.pmr_sync_project_wos(text,jsonb) from public;
grant execute on function public.pmr_sync_project_wos(text,jsonb) to anon,authenticated;
-- Match exact WO/task identity only. Site alone is not a safe monthly work-order key.
create function pmr_private.link_project_wo() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if coalesce(new.inventory->>'admin_test','false')<>'true' then
 update public.pmr_project_work_orders c set order_id=new.id where c.org_id=new.org_id and c.period=new.month and new.wo in(c.request_id,c.task_id) and not exists(select 1 from public.pmr_orders x where x.org_id=new.org_id and x.month=new.month and x.wo in(c.request_id,c.task_id) and x.id<>new.id);
 end if;return new;
end $$;
revoke all on function pmr_private.link_project_wo() from public,anon,authenticated;
create trigger pmr_link_project_wo after insert or update of wo,month on public.pmr_orders for each row execute function pmr_private.link_project_wo();

create or replace function public.pmr_upsert_member(p_owner_email text, p_org_id text, p_role text, p_regions jsonb, p_teams jsonb)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  email text := lower(btrim(p_owner_email));
  actor public.pmr_members;
begin
  if not public.pmr_is_admin() then raise exception 'Only admins can manage members'; end if;
  select * into actor from public.pmr_me();
  if coalesce(p_org_id, '') <> coalesce(actor.org_id, '') then raise exception 'Members can only be managed in your organization'; end if;
  if not exists(select 1 from auth.users u where lower(u.email)=lower(btrim(p_owner_email))) then raise exception 'Create this user in Supabase Auth first'; end if;
  if email=public.pmr_email() and (p_role<>actor.role or p_regions<>actor.regions) then raise exception 'Use another administrator to change your own access'; end if;
  if email = '' or position('@' in email) = 0 then raise exception 'Enter a valid email'; end if;
  if p_role not in ('admin', 'supervisor', 'technician', 'team_leader', 'regional_manager', 'fsm_team') then raise exception 'Invalid role'; end if;
  if jsonb_typeof(p_regions) <> 'array' or jsonb_array_length(p_regions) = 0 then raise exception 'Select at least one region'; end if;
  if exists (select 1 from jsonb_array_elements_text(p_regions) r where r not in ('CR', 'ER', 'WR', 'SR')) then
    raise exception 'Invalid region';
  end if;
  if jsonb_typeof(p_teams) <> 'array' or jsonb_array_length(p_teams) > 50 then raise exception 'Teams must be a list of up to 50 names'; end if;
  if exists (select 1 from jsonb_array_elements(p_teams) t where jsonb_typeof(t) <> 'string' or btrim(t #>> '{}') = '' or length(t #>> '{}') > 120) then
    raise exception 'Invalid team name';
  end if;

  if p_role <> 'team_leader' and jsonb_array_length(p_teams) > 0 then raise exception 'Only team leaders are assigned teams'; end if;

  update public.pmr_members
     set role = p_role, regions = p_regions, teams = p_teams
   where coalesce(org_id, '') = coalesce(p_org_id, '') and lower(owner_email) = email;
  if not found then
    insert into public.pmr_members (id, owner_email, org_id, role, regions, teams)
    values (gen_random_uuid()::text, email, p_org_id, p_role, p_regions, p_teams);
  end if;
end
$$;
