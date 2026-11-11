-- Office roles share the mobile PMR source of truth; no parallel workflow database.
alter table public.pmr_members drop constraint pmr_members_role_check;
alter table public.pmr_members add constraint pmr_members_role_check check(role in ('admin','supervisor','technician','team_leader','regional_manager','fsm_team'));
create or replace function public.pmr_membership()
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare
  m public.pmr_members;
begin
  select * into m from public.pmr_me();
  if found then
    return jsonb_build_object(
      'state', 'ready',
      'member', jsonb_build_object(
        'owner_email', m.owner_email,
        'org_id', m.org_id,
        'role', m.role,
        'regions', m.regions, 'teams', m.teams));
  end if;
  if (select count(*) from public.pmr_members x
      where lower(x.owner_email) = public.pmr_email()) = 0
     or public.pmr_app_meta() ? 'pmr_org_id' then
    return jsonb_build_object('state', 'unprovisioned');
  end if;
  return jsonb_build_object('state', 'ambiguous');
end
$$;

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
  if p_role = 'team_leader' and jsonb_array_length(p_teams) = 0 then raise exception 'Team leaders need at least one team'; end if;
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


create or replace function public.pmr_can_manage_order(o public.pmr_orders) returns boolean language sql stable security definer set search_path='' as $$
 select public.pmr_region_in_scope(o.org_id,o.region) and exists(select 1 from public.pmr_me() m where m.role in ('admin','supervisor','regional_manager','fsm_team') or (m.role='team_leader' and m.teams @> jsonb_build_array(o.team)))
$$;
-- Preserve the legacy API name but enforce current independent, sequential review rules.
create or replace function public.pmr_review_evidence(p_evidence text,p_revision int,p_state text,p_note text) returns void language plpgsql security definer set search_path='' as $$
begin
 if p_state not in ('Accepted','Retake required') or p_state is null then raise exception 'Invalid review decision'; end if;
 perform public.pmr_review_photo(p_evidence,p_revision,case when p_state='Accepted' then 'approved' else 'returned' end,p_note);
end $$;
create table public.pmr_fsm_handoffs(
 order_id text primary key references public.pmr_orders(id),
 state text not null check(state in ('In progress','Uploaded','Returned')),
 assigned_to text not null, claimed_at timestamptz not null default now(),
 stc_reference text not null default '', note text not null default '',
 uploaded_at timestamptz, updated_at timestamptz not null default now()
);
alter table public.pmr_fsm_handoffs enable row level security;
revoke all on public.pmr_fsm_handoffs from public,anon,authenticated;
grant select on public.pmr_fsm_handoffs to authenticated;
create policy pmr_handoff_read on public.pmr_fsm_handoffs for select to authenticated using(exists(select 1 from public.pmr_orders o where o.id=order_id and public.pmr_can_view_order(o)));
create function public.pmr_fsm_action(p_order text,p_expected_version int,p_action text,p_reference text default '',p_note text default '') returns void language plpgsql security definer set search_path='' as $$
declare o public.pmr_orders; m public.pmr_members; h public.pmr_fsm_handoffs; begin
 select * into m from public.pmr_me();
 select * into o from public.pmr_orders where id=p_order for update;
 if o.id is null or m.role not in ('fsm_team','admin') or not public.pmr_can_manage_order(o) or lower(o.assignee)=public.pmr_email() then raise exception 'Independent FSM access in this region required'; end if;
 if o.inventory->>'admin_test'='true' then raise exception 'Admin tests cannot enter the FSM handoff'; end if;
 if o.version is distinct from p_expected_version or o.status<>'Approved' then raise exception 'Regional approval required; refresh the work order'; end if;
 if p_action is null or p_action not in ('claim','uploaded','return') or length(coalesce(p_note,''))>2000 or length(coalesce(p_reference,''))>200 then raise exception 'Invalid FSM action'; end if;
 select * into h from public.pmr_fsm_handoffs where order_id=o.id for update;
 if h.state='Uploaded' then raise exception 'stc upload is already recorded'; end if;
 if p_action='claim' then
 if h.state='In progress' and h.assigned_to<>public.pmr_email() then raise exception 'Another FSM user is working on this submission'; end if;
 insert into public.pmr_fsm_handoffs(order_id,state,assigned_to) values(o.id,'In progress',public.pmr_email()) on conflict(order_id) do update set state='In progress',assigned_to=excluded.assigned_to,claimed_at=now(),stc_reference='',uploaded_at=null,updated_at=now();
 else
 if h.state is distinct from 'In progress' or h.assigned_to<>public.pmr_email() then raise exception 'Claim this submission before recording its outcome'; end if;
 if p_action='uploaded' and coalesce(btrim(p_reference),'')='' then raise exception 'Enter the stc upload or closure reference'; end if;
 if p_action='return' and coalesce(btrim(p_note),'')='' then raise exception 'A return reason is required'; end if;
 update public.pmr_fsm_handoffs set state=case when p_action='uploaded' then 'Uploaded' else 'Returned' end,stc_reference=btrim(coalesce(p_reference,'')),note=btrim(coalesce(p_note,'')),uploaded_at=case when p_action='uploaded' then now() else null end,updated_at=now() where order_id=o.id;
 end if;
 perform set_config('pmr.workflow','on',true);
 update public.pmr_orders set status=case when p_action='return' then 'Leader approved' else status end,version=version+1,updated_at=public.pmr_iso(now()),review_note=case when p_action='return' then p_note else review_note end where id=o.id;
 perform public.pmr_log(o.owner_email,o.org_id,o.id,'fsm-'||p_action,coalesce(p_reference,'')||' '||coalesce(p_note,''));
end $$;
create function public.pmr_review_group(p_order text,p_group text,p_expected_version int,p_decision text,p_note text,p_photos jsonb,p_results jsonb) returns void language plpgsql security definer set search_path='' as $$
declare o public.pmr_orders; x jsonb; begin
 select * into o from public.pmr_orders where id=p_order for update;
 if o.id is null then raise exception 'Order not found'; end if;
 perform public.pmr_review_stage(o);
 if o.version is distinct from p_expected_version or o.status not in ('Submitted','Leader approved') then raise exception 'Work order is not awaiting review; refresh'; end if;
 if not exists(select 1 from jsonb_array_elements(o.checklist) g where g->>'id'=p_group) or p_photos is null or p_results is null or jsonb_typeof(p_photos)<>'array' or jsonb_typeof(p_results)<>'array' then raise exception 'Invalid review group'; end if;
 if jsonb_array_length(p_photos)<>(select count(*) from public.pmr_evidence where order_id=o.id and group_id=p_group and state<>'Superseded') or jsonb_array_length(p_results)<>(select count(*) from public.pmr_results where order_id=o.id and instance=p_group) then raise exception 'Group changed; refresh before reviewing'; end if;
 if (select count(distinct v->>'id') from jsonb_array_elements(p_results) v)<>jsonb_array_length(p_results) or (select count(distinct v->>'id') from jsonb_array_elements(p_photos) v)<>jsonb_array_length(p_photos) then raise exception 'Duplicate review targets'; end if;
 if jsonb_array_length(p_results)<>(select jsonb_array_length(g->'etls') from jsonb_array_elements(o.checklist) g where g->>'id'=p_group) then raise exception 'Group results are incomplete'; end if;
 for x in select value from jsonb_array_elements(p_photos) loop
 if not exists(select 1 from public.pmr_evidence where id=x->>'id' and order_id=o.id and group_id=p_group and state<>'Superseded') then raise exception 'Invalid photo target'; end if;
 perform public.pmr_review_photo(x->>'id',(x->>'revision')::int,p_decision,p_note);
 end loop;
 for x in select value from jsonb_array_elements(p_results) loop
 if not exists(select 1 from public.pmr_results where id=x->>'id' and order_id=o.id and instance=p_group) then raise exception 'Invalid ETL target'; end if;
 perform public.pmr_review_result(x->>'id',x->>'updated_at',p_decision,p_note);
 end loop;
end $$;
alter function public.pmr_export_snapshot(text) rename to pmr_export_snapshot_before_fsm;
revoke all on function public.pmr_export_snapshot_before_fsm(text) from public,anon,authenticated;
create function public.pmr_export_snapshot(p_order text) returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.pmr_orders; m public.pmr_members; snapshot jsonb; begin
 select * into o from public.pmr_orders where id=p_order;
 select * into m from public.pmr_me();
 if m.role='fsm_team' and (o.status is distinct from 'Approved' or o.inventory->>'admin_test'='true') then raise exception 'Only region-approved operational submissions can be exported by FSM'; end if;
 snapshot:=public.pmr_export_snapshot_before_fsm(p_order);
 return snapshot||jsonb_build_object('fsm_handoff',(select to_jsonb(h) from public.pmr_fsm_handoffs h where h.order_id=p_order));
end $$;
alter function public.pmr_review_order(text,int,text,text) rename to pmr_review_order_before_fsm;
revoke all on function public.pmr_review_order_before_fsm(text,int,text,text) from public,anon,authenticated;
create function public.pmr_review_order(p_order text,p_expected_version int,p_decision text,p_note text) returns void language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.pmr_orders where id=p_order for update;
 if exists(select 1 from public.pmr_fsm_handoffs where order_id=p_order and state='Uploaded') then raise exception 'stc upload already recorded; correction requires administrator investigation'; end if;
 perform public.pmr_review_order_before_fsm(p_order,p_expected_version,p_decision,p_note);
end $$;
revoke all on function public.pmr_fsm_action(text,int,text,text,text),public.pmr_review_group(text,text,int,text,text,jsonb,jsonb),public.pmr_export_snapshot(text),public.pmr_review_order(text,int,text,text) from public,anon;
grant execute on function public.pmr_fsm_action(text,int,text,text,text),public.pmr_review_group(text,text,int,text,text,jsonb,jsonb),public.pmr_export_snapshot(text),public.pmr_review_order(text,int,text,text) to authenticated;
