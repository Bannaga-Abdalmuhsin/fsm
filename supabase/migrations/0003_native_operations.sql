-- Native PMR workflow. Apply after rls.sql and 0002, with existing CMDB/schedule tables.
alter table public.pmr_orders add column if not exists site_reference jsonb;
create table if not exists public.pmr_checklist_catalogue (
 site_type text primary key check(site_type in ('ODU','SHELTER')), checklist jsonb not null, version int not null
);
alter table public.pmr_checklist_catalogue enable row level security;
revoke all on public.pmr_checklist_catalogue from public,anon,authenticated;
grant select on public.pmr_checklist_catalogue to authenticated;
create policy pmr_catalogue_read on public.pmr_checklist_catalogue for select to authenticated using(exists(select 1 from public.pmr_me()));
create table if not exists public.pmr_team_members (
 org_id text not null, team text not null, region text not null, email text not null,
 primary key(org_id,team,region,email)
);
alter table public.pmr_team_members enable row level security;
revoke all on public.pmr_team_members from public,anon,authenticated;
grant select on public.pmr_team_members to authenticated;
create policy pmr_team_map_read on public.pmr_team_members for select to authenticated using(
 exists(select 1 from public.pmr_me() m where m.org_id=pmr_team_members.org_id and (m.role='admin' or lower(m.owner_email)=pmr_team_members.email))
);
create or replace function public.pmr_set_team_member(p_team text,p_region text,p_email text,p_enabled boolean)
returns void language plpgsql security definer set search_path='' as $$
declare m public.pmr_members; begin
 select * into m from public.pmr_me();
 if not public.pmr_is_admin() then raise exception 'Admin access required'; end if;
 if p_region not in ('CR','ER','WR','SR') or length(btrim(p_team)) not between 1 and 120 then raise exception 'Invalid team or region'; end if;
 if not exists(select 1 from public.pmr_members t where t.org_id=m.org_id and lower(t.owner_email)=lower(btrim(p_email)) and t.role='technician' and t.regions @> jsonb_build_array(p_region)) then raise exception 'Provision technician in this region first'; end if;
 if p_enabled then insert into public.pmr_team_members values(m.org_id,btrim(p_team),p_region,lower(btrim(p_email))) on conflict do nothing;
 else delete from public.pmr_team_members where org_id=m.org_id and team=btrim(p_team) and region=p_region and email=lower(btrim(p_email)); end if;
end $$;
create or replace function public.pmr_region_code(p_region text) returns text language sql immutable set search_path='' as $$
 select case upper(btrim(p_region)) when 'CENTRAL' then 'CR' when 'EAST' then 'ER' when 'WEST' then 'WR' when 'SOUTH' then 'SR' when 'CR' then 'CR' when 'ER' then 'ER' when 'WR' then 'WR' when 'SR' then 'SR' end
$$;

-- Validate all numeric values before any distance calculation. Offline upload validates
-- fix age against captured_at, never against the later upload time.
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
 d:=public.pmr_distance_m(lat,lng,o.latitude,o.longitude);
 if d is null or not(d+acc<=250) then raise exception 'You must be reliably inside the 250 m site boundary.'; end if;
end $$;
create or replace function public.pmr_assert_fix(o public.pmr_orders,p_fix jsonb) returns void language sql stable set search_path='' as $$ select public.pmr_validate_fix(o,p_fix,now()) $$;
create or replace function public.pmr_assert_tcn(o public.pmr_orders,p_at timestamptz) returns void language plpgsql stable set search_path='' as $$
begin
 if coalesce(btrim(o.tcn),'')='' or o.tcn_start is null or o.tcn_end is null or o.tcn_end::timestamptz<=o.tcn_start::timestamptz
 or p_at<o.tcn_start::timestamptz or p_at>o.tcn_end::timestamptz then raise exception 'Outside authorized TCN window or TCN setup is incomplete'; end if;
end $$;
create or replace function public.pmr_open_order(p_order text,p_fix jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.pmr_orders; begin
 o:=public.pmr_locked_order(p_order); perform public.pmr_assert_fix(o,p_fix); perform public.pmr_assert_tcn(o,now()); return to_jsonb(o);
end $$;
create or replace function public.pmr_check_in(p_order text,p_expected_version int,p_fix jsonb) returns void language plpgsql security definer set search_path='' as $$
declare o public.pmr_orders; begin
 o:=public.pmr_locked_order(p_order); if o.version<>p_expected_version then raise exception 'Work order changed. Reload and retry.'; end if;
 if o.status<>'Assigned' then raise exception 'Work order is not awaiting check-in'; end if;
 perform public.pmr_assert_fix(o,p_fix); perform public.pmr_assert_tcn(o,now()); perform set_config('pmr.workflow','on',true);
 update public.pmr_orders set check_in=p_fix,checked_in_at=public.pmr_iso(now()),status='Checked in',version=version+1,updated_at=public.pmr_iso(now()) where id=o.id;
 perform public.pmr_log(o.owner_email,o.org_id,o.id,'check-in','checked in');
end $$;
create or replace function public.pmr_start_work(p_order text,p_expected_version int) returns void language plpgsql security definer set search_path='' as $$
declare o public.pmr_orders; begin
 o:=public.pmr_locked_order(p_order); if o.version<>p_expected_version or o.status<>'Checked in' then raise exception 'Check in before starting work or reload changed order'; end if;
 perform public.pmr_assert_tcn(o,now()); perform set_config('pmr.workflow','on',true);
 update public.pmr_orders set status='In progress',version=version+1,updated_at=public.pmr_iso(now()) where id=o.id;
 perform public.pmr_log(o.owner_email,o.org_id,o.id,'start','started work');
end $$;
create table if not exists public.pmr_capture_sessions (
 id text primary key, order_id text not null references public.pmr_orders(id), technician text not null,
 group_id text not null, source text not null, approval_id text, issued_at timestamptz not null default now(), expires_at timestamptz not null
);
alter table public.pmr_capture_sessions enable row level security;
revoke all on public.pmr_capture_sessions from public,anon,authenticated;
alter table public.pmr_capture_sessions add column if not exists gps jsonb;
create or replace function public.pmr_begin_capture(p_order text,p_group text,p_fix jsonb,p_source text default 'capture',p_approval text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.pmr_orders; cap text:=gen_random_uuid()::text; begin
 o:=public.pmr_locked_order(p_order); perform public.pmr_assert_fix(o,p_fix); perform public.pmr_assert_tcn(o,now());
 if o.status not in ('Checked in','In progress') then raise exception 'Check in before taking photos'; end if;
 if not exists(select 1 from jsonb_array_elements(o.checklist) g where g->>'id'=p_group) then raise exception 'Unknown ETL group'; end if;
 if p_source='gallery' then
 if not exists(select 1 from public.pmr_approvals a where a.id=p_approval and a.order_id=o.id and lower(a.technician)=public.pmr_email() and a.revoked_at is null and a.expires_at::timestamptz>now() and a.used<a.max_images and a.groups @> jsonb_build_array(p_group)) then raise exception 'No valid gallery approval'; end if;
 elsif p_source<>'capture' or p_approval is not null then raise exception 'Invalid capture source'; end if;
 insert into public.pmr_capture_sessions(id,order_id,technician,group_id,source,approval_id,issued_at,expires_at,gps) values(cap,o.id,public.pmr_email(),p_group,p_source,p_approval,now(),now()+interval '150 seconds',p_fix);
 return jsonb_build_object('id',cap,'issued_at',public.pmr_iso(now()),'expires_at',public.pmr_iso(now()+interval '150 seconds'));
end $$;

create table if not exists public.pmr_review_events (
 order_id text not null references public.pmr_orders(id), kind text not null, target_id text not null,
 stage text not null check(stage in ('team_leader','regional_manager')), decision text not null check(decision in ('approved','returned')),
 fingerprint text not null, note text not null, reviewer text not null, reviewed_at timestamptz not null default now(), primary key(kind,target_id,stage)
);
alter table public.pmr_review_events enable row level security;
revoke all on public.pmr_review_events from public,anon,authenticated;
grant select on public.pmr_review_events to authenticated;
create policy pmr_review_read on public.pmr_review_events for select to authenticated using(exists(select 1 from public.pmr_orders o where o.id=order_id and public.pmr_can_view_order(o)));
create or replace function public.pmr_review_stage(o public.pmr_orders) returns text language plpgsql stable security definer set search_path='' as $$
declare m public.pmr_members; begin
 select * into m from public.pmr_me();
 if not public.pmr_can_manage_order(o) or lower(o.assignee)=public.pmr_email() then raise exception 'Independent scoped reviewer required'; end if;
 if m.role in ('admin','regional_manager') then return 'regional_manager'; end if;
 if m.role in ('team_leader','supervisor') then return 'team_leader'; end if;
 raise exception 'Reviewer role required';
end $$;
create or replace function public.pmr_review_photo(p_evidence text,p_revision int,p_decision text,p_note text) returns void language plpgsql security definer set search_path='' as $$
declare e public.pmr_evidence; o public.pmr_orders; review_level text; fp text; begin
 select * into e from public.pmr_evidence where id=p_evidence for update;
 select * into o from public.pmr_orders where id=e.order_id for update;
 if o.id is null then raise exception 'Photo not found'; end if;
 review_level:=public.pmr_review_stage(o); fp:=e.sha;
 if o.status='Approved' then raise exception 'Return the approved PMR before changing photo reviews'; end if;
 if p_revision<>e.revision then raise exception 'Photo changed. Refresh and retry.'; end if;
 if p_decision not in ('approved','returned') then raise exception 'Invalid decision'; end if;
 if p_decision='returned' and coalesce(btrim(p_note),'')='' then raise exception 'Return reason required'; end if;
 if p_decision='approved' then
 if exists(select 1 from jsonb_array_elements(e.findings) f where f->>'severity'='review') and coalesce(btrim(p_note),'')='' then raise exception 'Explain how review findings were resolved'; end if;
 if e.state not in ('Supervisor review','Accepted') or e.analysis->>'status'<>'complete' or exists(select 1 from jsonb_array_elements(e.findings) f where f->>'severity'='block') or coalesce((e.quality->>'provisional')::boolean,true) then raise exception 'Photo analysis is incomplete or requires retake'; end if;
 if review_level='regional_manager' and not exists(select 1 from public.pmr_review_events r where r.kind='photo' and r.target_id=e.id and r.stage='team_leader' and r.decision='approved' and r.fingerprint=fp) then raise exception 'Team leader must approve this photo first'; end if;
 end if;
 update public.pmr_evidence set state=case when p_decision='approved' then 'Accepted' else 'Retake required' end,review_note=left(coalesce(p_note,''),2000),revision=revision+1 where id=e.id;
 insert into public.pmr_review_events values(o.id,'photo',e.id,review_level,p_decision,fp,left(coalesce(p_note,''),2000),public.pmr_email(),now()) on conflict(kind,target_id,stage) do update set decision=excluded.decision,fingerprint=excluded.fingerprint,note=excluded.note,reviewer=excluded.reviewer,reviewed_at=now();
 if p_decision='returned' and o.status in ('Submitted','Leader approved') then
 perform set_config('pmr.workflow','on',true);
 update public.pmr_orders set status='In progress',review_note=left(p_note,2000),version=version+1,updated_at=public.pmr_iso(now()) where id=o.id;
 end if;
 perform public.pmr_log(o.owner_email,o.org_id,o.id,'photo-review',review_level||' '||p_decision||' '||e.id);
end $$;
create or replace function public.pmr_review_result(p_result text,p_expected_updated_at text,p_decision text,p_note text) returns void language plpgsql security definer set search_path='' as $$
declare r public.pmr_results; o public.pmr_orders; review_level text; begin
 select * into r from public.pmr_results where id=p_result for update;
 select * into o from public.pmr_orders where id=r.order_id for update;
 if o.id is null then raise exception 'ETL result not found'; end if;
 review_level:=public.pmr_review_stage(o);
 if o.status='Approved' then raise exception 'Return the approved PMR before changing ETL reviews'; end if;
 if r.updated_at<>p_expected_updated_at then raise exception 'ETL changed. Refresh and retry.'; end if;
 if p_decision not in ('approved','returned') then raise exception 'Invalid decision'; end if;
 if p_decision='returned' and coalesce(btrim(p_note),'')='' then raise exception 'Return reason required'; end if;
 if p_decision='approved' then
 if r.status='Fail' and btrim(r.tt)='' then raise exception 'FAIL needs a TT'; end if;
 if r.status in ('Not applicable','Not tested') and btrim(r.remarks)='' then raise exception 'Exception reason required'; end if;
 if review_level='regional_manager' and not exists(select 1 from public.pmr_review_events v where v.kind='etl' and v.target_id=r.id and v.stage='team_leader' and v.decision='approved' and v.fingerprint=r.updated_at) then raise exception 'Team leader must approve this ETL first'; end if;
 end if;
 insert into public.pmr_review_events values(o.id,'etl',r.id,review_level,p_decision,r.updated_at,left(coalesce(p_note,''),2000),public.pmr_email(),now()) on conflict(kind,target_id,stage) do update set decision=excluded.decision,fingerprint=excluded.fingerprint,note=excluded.note,reviewer=excluded.reviewer,reviewed_at=now();
 if p_decision='returned' and o.status in ('Submitted','Leader approved') then
 perform set_config('pmr.workflow','on',true);
 update public.pmr_orders set status='In progress',review_note=left(p_note,2000),version=version+1,updated_at=public.pmr_iso(now()) where id=o.id;
 end if;
 perform public.pmr_log(o.owner_email,o.org_id,o.id,'etl-review',review_level||' '||p_decision||' '||r.etl_code);
end $$;
create or replace function public.pmr_submit_order(p_order text,p_expected_version int) returns void language plpgsql security definer set search_path='' as $$
declare o public.pmr_orders; begin
 o:=public.pmr_locked_order(p_order);
 if o.version<>p_expected_version or o.status<>'In progress' then raise exception 'Start work and reload before submitting'; end if;
 if exists(select 1 from jsonb_array_elements(o.checklist) g,jsonb_array_elements(g->'etls') e where not exists(select 1 from public.pmr_results r where r.order_id=o.id and r.etl_code=e->>'code' and r.instance=g->>'id' and (r.status='Pass' or (r.status='Fail' and btrim(r.tt)<>'') or (r.status in ('Not applicable','Not tested') and btrim(r.remarks)<>'')))) then raise exception 'Complete every ETL with results and required references'; end if;
 if exists(select 1 from jsonb_array_elements(o.checklist) g where not exists(select 1 from public.pmr_evidence e where e.order_id=o.id and e.group_id=g->>'id' and e.state in ('Accepted','Supervisor review')) and exists(select 1 from public.pmr_results r where r.order_id=o.id and r.instance=g->>'id' and r.status<>'Not applicable')) then raise exception 'Required group evidence is missing'; end if;
 if exists(select 1 from public.pmr_evidence e where e.order_id=o.id and e.state in ('Pending analysis','Retake required')) then raise exception 'Resolve pending analysis and retake requests'; end if;
 perform set_config('pmr.workflow','on',true); update public.pmr_orders set status='Submitted',version=version+1,updated_at=public.pmr_iso(now()) where id=o.id;
 perform public.pmr_log(o.owner_email,o.org_id,o.id,'submit','submitted for review');
end $$;
create or replace function public.pmr_review_order(p_order text,p_expected_version int,p_decision text,p_note text) returns void language plpgsql security definer set search_path='' as $$
declare o public.pmr_orders; review_level text; begin
 select * into o from public.pmr_orders where id=p_order for update; if not found then raise exception 'Order not found'; end if;
 review_level:=public.pmr_review_stage(o);
 if o.version<>p_expected_version then raise exception 'Order changed. Refresh and retry.'; end if;
 if o.status not in ('Submitted','Leader approved','Approved') then raise exception 'PMR is not awaiting review'; end if;
 if o.status='Approved' and review_level<>'regional_manager' then raise exception 'Only regional manager can reopen an approved PMR'; end if;
 if p_decision not in ('approved','returned') then raise exception 'Invalid decision'; end if;
 if p_decision='approved' then
 if o.status not in ('Submitted','Leader approved') then raise exception 'Technician must submit the PMR first'; end if;
 if review_level='regional_manager' and o.status<>'Leader approved' then raise exception 'Team leader approval required'; end if;
 if exists(select 1 from public.pmr_results r where r.order_id=o.id and not exists(select 1 from public.pmr_review_events v where v.kind='etl' and v.target_id=r.id and v.stage=review_level and v.decision='approved' and v.fingerprint=r.updated_at)) then raise exception 'Review every ETL at this level'; end if;
 if exists(select 1 from public.pmr_evidence e where e.order_id=o.id and e.state<>'Superseded' and (e.state<>'Accepted' or not exists(select 1 from public.pmr_review_events v where v.kind='photo' and v.target_id=e.id and v.stage=review_level and v.decision='approved' and v.fingerprint=e.sha))) then raise exception 'Review every photo at this level'; end if;
 elsif coalesce(btrim(p_note),'')='' then raise exception 'Return reason required'; end if;
 perform set_config('pmr.workflow','on',true);
 update public.pmr_orders set status=case when p_decision='returned' then 'In progress' when review_level='team_leader' then 'Leader approved' else 'Approved' end,review_note=left(coalesce(p_note,''),2000),version=version+1,updated_at=public.pmr_iso(now()) where id=o.id;
 perform public.pmr_log(o.owner_email,o.org_id,o.id,'order-review',review_level||' '||p_decision);
end $$;

-- Signing credentials never leave the backend. Edge functions use the service-role
-- credential supplied by Supabase to retrieve this key; clients cannot call this RPC.
insert into public.pmr_ingest_keys(id,secret) values(1,encode(extensions.gen_random_bytes(48),'hex')) on conflict(id) do nothing;
create or replace function public.pmr_get_ingest_key() returns text language sql stable security definer set search_path='' as $$ select secret from public.pmr_ingest_keys where id=1 $$;
revoke all on function public.pmr_get_ingest_key() from public,anon,authenticated;
grant execute on function public.pmr_get_ingest_key() to service_role;
revoke all on function public.pmr_validate_fix(public.pmr_orders,jsonb,timestamptz),public.pmr_assert_tcn(public.pmr_orders,timestamptz),public.pmr_region_code(text) from public,anon;
grant execute on function public.pmr_validate_fix(public.pmr_orders,jsonb,timestamptz),public.pmr_assert_tcn(public.pmr_orders,timestamptz),public.pmr_region_code(text) to authenticated;
revoke all on function public.pmr_open_order(text,jsonb),public.pmr_set_team_member(text,text,text,boolean),public.pmr_begin_capture(text,text,jsonb,text,text),public.pmr_review_stage(public.pmr_orders),public.pmr_review_photo(text,int,text,text),public.pmr_review_result(text,text,text,text),public.pmr_review_order(text,int,text,text) from public,anon;
grant execute on function public.pmr_open_order(text,jsonb),public.pmr_set_team_member(text,text,text,boolean),public.pmr_begin_capture(text,text,jsonb,text,text),public.pmr_review_stage(public.pmr_orders),public.pmr_review_photo(text,int,text,text),public.pmr_review_result(text,text,text,text),public.pmr_review_order(text,int,text,text) to authenticated;
alter table public.pmr_capture_sessions add column if not exists gps jsonb;
create or replace function public.pmr_capture_context(p_capture text) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.pmr_capture_sessions; o public.pmr_orders; begin
 select * into c from public.pmr_capture_sessions where id=p_capture;
 if not found then raise exception 'Capture authorization not found'; end if;
 select * into o from public.pmr_orders where id=c.order_id;
 if not(public.pmr_can_operate_order(o) or public.pmr_can_manage_order(o)) then raise exception 'Capture authorization not found'; end if;
 return jsonb_build_object('capture',to_jsonb(c),'order',to_jsonb(o));
end $$;
revoke all on function public.pmr_capture_context(text) from public,anon;
grant execute on function public.pmr_capture_context(text) to authenticated;
create or replace function public.pmr_update_analysis(p_payload text,p_signature text) returns void language plpgsql security definer set search_path='' as $$
declare p jsonb:=p_payload::jsonb; secret text; e public.pmr_evidence; o public.pmr_orders; begin
 select k.secret into secret from public.pmr_ingest_keys k where id=1;
 if secret is null or encode(extensions.hmac(p_payload,secret,'sha256'),'hex')<>lower(p_signature) then raise exception 'Analysis signature invalid'; end if;
 select * into e from public.pmr_evidence where id=p->>'capture_id' for update;
 select * into o from public.pmr_orders where id=e.order_id for update;
 if e.id is null or not(public.pmr_can_operate_order(o) or public.pmr_can_manage_order(o)) then raise exception 'Evidence not found'; end if;
 if e.state<>'Pending analysis' or e.sha is distinct from p->>'sha' or p->'analysis'->>'status'<>'complete' then raise exception 'Only pending original evidence can be analyzed'; end if;
 if p->>'state' not in ('Supervisor review','Retake required') then raise exception 'Invalid analysis state'; end if;
 update public.pmr_evidence set findings=p->'findings',quality=p->'quality',analysis=p->'analysis',state=p->>'state',revision=revision+1 where id=e.id;
 perform public.pmr_log(o.owner_email,o.org_id,o.id,'analysis-retried',e.id);
end $$;
revoke all on function public.pmr_update_analysis(text,text) from public,anon;
grant execute on function public.pmr_update_analysis(text,text) to authenticated;

revoke all on function public.pmr_log(text,text,text,text,text) from authenticated;
