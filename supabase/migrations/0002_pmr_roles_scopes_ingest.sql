-- Review-only migration. Apply after supabase/rls.sql. The connector deploys it.
--
-- Additive for existing data: no rows are rewritten. pmr_membership keeps its
-- return shape (state, member.owner_email/org_id/role/regions).
--
-- Roles:
--   admin             provisions members (admin only), manages orders and reviews in scope
--   supervisor        compatibility role: schedules orders and reviews/approves in region
--   regional_manager  reviews and grants approvals for every order in its regions;
--                     cannot provision members or schedule orders
--   team_leader       reviews and grants approvals only for orders whose team is in teams
--   technician        works assigned orders only

alter table public.pmr_members add column if not exists teams jsonb not null default '[]'::jsonb;

alter table public.pmr_members drop constraint if exists pmr_members_role_check;
alter table public.pmr_members add constraint pmr_members_role_check
  check (role in ('admin', 'supervisor', 'technician', 'team_leader', 'regional_manager'));

alter table public.pmr_members drop constraint if exists pmr_members_teams_check;
alter table public.pmr_members add constraint pmr_members_teams_check
  check (
    jsonb_typeof(teams) = 'array'
    and (role = 'team_leader' or jsonb_array_length(teams) = 0)
    and (role <> 'team_leader' or jsonb_array_length(teams) > 0)
  );

-- ---------------------------------------------------------------------------
-- Scope helpers
-- ---------------------------------------------------------------------------

create or replace function public.pmr_is_scheduler()
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select coalesce((select m.role in ('admin', 'supervisor') from public.pmr_me() m), false)
$$;

create or replace function public.pmr_is_manager()
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select coalesce((select m.role in ('admin', 'supervisor', 'team_leader', 'regional_manager') from public.pmr_me() m), false)
$$;

create or replace function public.pmr_can_manage_order(o public.pmr_orders)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select public.pmr_region_in_scope(o.org_id, o.region)
     and exists (
       select 1 from public.pmr_me() m
       where m.role in ('admin', 'supervisor', 'regional_manager')
          or (m.role = 'team_leader' and exists (
                select 1 from jsonb_array_elements_text(m.teams) t where t = o.team))
     )
$$;

create or replace function public.pmr_can_view_order(o public.pmr_orders)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select public.pmr_region_in_scope(o.org_id, o.region)
     and (lower(o.assignee) = public.pmr_email() or public.pmr_can_manage_order(o))
$$;

-- ---------------------------------------------------------------------------
-- Order writes are limited to schedulers (admin and supervisor)
-- ---------------------------------------------------------------------------

drop policy if exists pmr_orders_manager_insert on public.pmr_orders;
create policy pmr_orders_manager_insert on public.pmr_orders
  for insert to authenticated
  with check (
    public.pmr_is_scheduler()
    and public.pmr_region_in_scope(org_id, region)
    and status = 'Assigned'
    and checked_in_at is null
    and check_in is null
  );

drop policy if exists pmr_orders_manager_update on public.pmr_orders;
create policy pmr_orders_manager_update on public.pmr_orders
  for update to authenticated
  using (public.pmr_is_scheduler() and public.pmr_region_in_scope(org_id, region))
  with check (public.pmr_is_scheduler() and public.pmr_region_in_scope(org_id, region));

-- Stamped derivatives are referenced by evidence and must not be deleted while registered.
drop policy if exists pmr_evidence_objects_cleanup on storage.objects;
create policy pmr_evidence_objects_cleanup on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'pmr-evidence'
    and exists (
      select 1 from public.pmr_orders o
      where o.id = split_part(name, '/', 1)
        and public.pmr_can_operate_order(o)
    )
    and not exists (
      select 1 from public.pmr_evidence ev
      where ev.handle ->> 'path' = name
         or ev.handle -> 'derivative' ->> 'path' = name
    )
  );

-- ---------------------------------------------------------------------------
-- Member provisioning (admin only) with team assignments
-- ---------------------------------------------------------------------------

drop function if exists public.pmr_upsert_member(text, text, text, jsonb);

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
  if email = '' or position('@' in email) = 0 then raise exception 'Enter a valid email'; end if;
  if p_role not in ('admin', 'supervisor', 'technician', 'team_leader', 'regional_manager') then raise exception 'Invalid role'; end if;
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

-- ---------------------------------------------------------------------------
-- Evidence registration: idempotent replay, optional stamped derivative
-- ---------------------------------------------------------------------------

create or replace function public.pmr_register_evidence(p_payload text, p_signature text)
returns text
language plpgsql security definer set search_path = public, extensions, pg_temp
as $$
declare
  p jsonb := p_payload::jsonb;
  secret text;
  o public.pmr_orders;
  approval public.pmr_approvals;
  prior public.pmr_evidence;
  captured timestamptz := (p ->> 'captured_at')::timestamptz;
  cap text := p ->> 'capture_id';
  v_source text := p ->> 'source';
  v_state text := p ->> 'state';
  existing_hash_distance int;
  object_path text;
  derivative_path text;
begin
  select s.secret into secret from public.pmr_ingest_keys s where s.id = 1;
  if secret is null then raise exception 'Evidence ingest is not configured'; end if;
  if encode(extensions.hmac(p_payload, secret, 'sha256'), 'hex') <> lower(p_signature) then
    raise exception 'Evidence payload signature is invalid';
  end if;

  select * into prior from public.pmr_evidence ev where ev.id = cap;
  if found then
    select * into o from public.pmr_orders where id=prior.order_id;
    if not public.pmr_can_operate_order(o) then raise exception 'Evidence not found'; end if;
    if prior.order_id = p ->> 'order_id' and prior.sha = p ->> 'sha' and prior.handle->'derivative'->>'sha256' is not distinct from p->'handle'->'derivative'->>'sha256' then
      return cap;
    end if;
    raise exception 'Capture id is already registered with different content';
  end if;

  o := public.pmr_locked_order(p ->> 'order_id');
  if o.status not in ('Checked in', 'In progress') or o.check_in is null then
    raise exception 'Check in and start work before capturing evidence';
  end if;
  object_path := p -> 'handle' ->> 'path';
  if split_part(object_path, '/', 1) <> o.id
     or array_length(string_to_array(object_path, '/'), 1) <> 2
     or split_part(object_path, '/', 2) not in (cap || '.jpg', cap || '.png', cap || '.webp')
     or not exists (
       select 1 from storage.objects so
       where so.bucket_id = 'pmr-evidence' and so.name = object_path
     ) then
    raise exception 'Uploaded object does not match this work order';
  end if;
  derivative_path := p -> 'handle' -> 'derivative' ->> 'path';
  if derivative_path is not null then
    if split_part(derivative_path, '/', 1) <> o.id
       or array_length(string_to_array(derivative_path, '/'), 1) <> 2
       or split_part(derivative_path, '/', 2) not in (
         cap || '.stamped.jpg', cap || '.stamped.png', cap || '.stamped.webp')
       or not exists (
         select 1 from storage.objects so
         where so.bucket_id = 'pmr-evidence' and so.name = derivative_path
       ) then
      raise exception 'Uploaded derivative does not match this work order';
    end if;
  end if;
  if p->>'instance' is distinct from p->>'group_id' then raise exception 'Invalid evidence instance'; end if;
  if jsonb_typeof(p -> 'linked_etls') <> 'array' or jsonb_array_length(p -> 'linked_etls') = 0
     or exists (
       select 1 from jsonb_array_elements_text(p -> 'linked_etls') n
       where not exists (
         select 1 from jsonb_array_elements(o.checklist) g, jsonb_array_elements(g -> 'etls') e
         where g->>'id'=p->>'group_id' and (e ->> 'number')::int = n::int
       )
     ) then
    raise exception 'Evidence is linked to an unknown ETL';
  end if;

  if captured is null or captured > now() + interval '120 seconds' then
    raise exception 'Capture time is invalid or in the future';
  end if;
  if captured < (o.tcn_start)::timestamptz or captured > (o.tcn_end)::timestamptz then
    raise exception 'Capture time is outside the authorized TCN window';
  end if;
  if (p ->> 'captured_at_source') not in ('exif', 'device-camera') then
    raise exception 'Unknown capture time source';
  end if;
  perform public.pmr_validate_fix(o, p -> 'gps',captured);
  if not exists(select 1 from public.pmr_capture_sessions c where c.id=cap and c.order_id=o.id and c.technician=public.pmr_email() and c.group_id=p->>'group_id' and c.source=v_source and c.approval_id is not distinct from p->>'approval_id' and (v_source='gallery' or (captured>=c.issued_at-interval '2 seconds' and captured<=c.expires_at))) then raise exception 'Valid capture authorization required'; end if;

  if v_source = 'gallery' then
    if p ->> 'captured_at_source' <> 'exif' then
      raise exception 'Gallery photos need an embedded capture time';
    end if;
    update public.pmr_approvals a
       set used = a.used + 1
     where a.id = p ->> 'approval_id'
       and a.order_id = o.id
       and lower(a.technician) = public.pmr_email()
       and a.revoked_at is null
       and a.expires_at::timestamptz > now()
       and a.used < a.max_images
       and a.groups @> jsonb_build_array(p ->> 'group_id')
    returning a.* into approval;
    if not found then
      raise exception 'No valid gallery approval (expired, revoked, exhausted, or wrong group)';
    end if;
  elsif v_source = 'capture' then
    if p ->> 'approval_id' is not null then raise exception 'Camera capture cannot use an approval'; end if;
  else
    raise exception 'Unknown evidence source';
  end if;

  if v_state not in ('Pending analysis', 'Retake required', 'Supervisor review') then
    raise exception 'Invalid initial evidence state';
  end if;
  if exists (
    select 1 from public.pmr_evidence ev
    where ev.org_id is not distinct from o.org_id and ev.sha = p ->> 'sha'
  ) then
    raise exception 'This photo was already submitted';
  end if;
  select min(bit_count(('x' || lpad(substr(ev.perceptual_hash, 1, 16), 16, '0'))::bit(64)
                       # ('x' || lpad(substr(p ->> 'perceptual_hash', 1, 16), 16, '0'))::bit(64)))
    into existing_hash_distance
  from public.pmr_evidence ev
  where ev.org_id is not distinct from o.org_id and ev.perceptual_hash <> '' and p ->> 'perceptual_hash' <> '';
  if existing_hash_distance is not null and existing_hash_distance <= coalesce((o.policy ->> 'nearDuplicateDistance')::int, 4) then
    raise exception 'This photo is a near-duplicate of an existing photo on this work order';
  end if;

  insert into public.pmr_evidence (
    id, owner_email, org_id, order_id, group_id, instance, source, approval_id,
    capture_id, captured_at, uploaded_at, gps, sha, perceptual_hash, handle, mime,
    width, height, findings, quality, analysis, state, linked_etls, review_note, revision
  ) values (
    cap, o.owner_email, o.org_id, o.id, p ->> 'group_id', p ->> 'instance', v_source,
    p ->> 'approval_id', cap, public.pmr_iso(captured), public.pmr_iso(now()),
    p -> 'gps', p ->> 'sha', coalesce(p ->> 'perceptual_hash', ''), p -> 'handle', p ->> 'mime',
    (p ->> 'width')::int, (p ->> 'height')::int, p -> 'findings', p -> 'quality',
    p -> 'analysis', v_state, p -> 'linked_etls', '', 1
  );
  update public.pmr_evidence set state='Superseded',revision=revision+1 where order_id=o.id and group_id=p->>'group_id' and instance=p->>'instance' and state='Retake required' and id<>cap and (p->'linked_etls') @> linked_etls;
  perform public.pmr_log(o.owner_email, o.org_id, o.id, 'evidence-captured', cap || ' ' || v_state);
  return cap;
end
$$;

-- ---------------------------------------------------------------------------
-- Review and gallery approvals use order-level management scope
-- ---------------------------------------------------------------------------

create or replace function public.pmr_review_evidence(p_evidence text, p_revision int, p_state text, p_note text)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  ev public.pmr_evidence;
  o public.pmr_orders;
begin
  if not public.pmr_is_manager() then raise exception 'Only managers can review evidence'; end if;
  select * into ev from public.pmr_evidence where id = p_evidence for update;
  if not found then raise exception 'Evidence not found'; end if;
  select * into o from public.pmr_orders where id = ev.order_id;
  if not found or not public.pmr_can_manage_order(o) then raise exception 'Evidence not found'; end if;
  if ev.revision <> p_revision then raise exception 'Evidence changed. Reload and retry.'; end if;
  if p_state = 'Accepted' then
    if ev.state <> 'Supervisor review' or ev.analysis->>'status'<>'complete' or coalesce((ev.quality->>'provisional')::boolean,true) or exists(select 1 from jsonb_array_elements(ev.findings) f where f->>'severity'='block') then
      raise exception 'Only evidence that passed automated analysis can be accepted';
    end if;
  elsif p_state = 'Retake required' then
    if ev.state not in ('Pending analysis', 'Supervisor review') then
      raise exception 'Evidence cannot be sent back from its current state';
    end if;
    if coalesce(btrim(p_note), '') = '' then raise exception 'A retake reason is required'; end if;
  else
    raise exception 'Invalid review state';
  end if;
  update public.pmr_evidence
     set state = p_state, review_note = left(coalesce(p_note, ''), 2000), revision = revision + 1
   where id = ev.id;
  perform public.pmr_log(o.owner_email, o.org_id, o.id, 'evidence-review', ev.id || ' ' || p_state);
end
$$;

create or replace function public.pmr_grant_gallery_approval(
  p_order text,
  p_technician text,
  p_groups jsonb,
  p_reason text,
  p_hours int,
  p_max_images int
)
returns text
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  o public.pmr_orders;
  approval_id text := gen_random_uuid()::text;
begin
  if not public.pmr_is_admin() then raise exception 'Only admins can grant gallery approvals'; end if;
  select * into o from public.pmr_orders where id = p_order;
  if not found or not public.pmr_can_manage_order(o) then raise exception 'Work order not found'; end if;
  if lower(o.assignee) <> lower(p_technician) then raise exception 'Approvals apply only to the assigned technician'; end if;
  if jsonb_typeof(p_groups) <> 'array' or jsonb_array_length(p_groups) = 0 then raise exception 'Select at least one ETL group'; end if;
  if exists(select 1 from jsonb_array_elements_text(p_groups) g where not exists(select 1 from jsonb_array_elements(o.checklist) c where c->>'id'=g)) then raise exception 'Unknown ETL group'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'A reason is required'; end if;
  if p_hours is null or p_hours < 1 or p_hours > 24 then raise exception 'Approval lasts 1 to 24 hours'; end if;
  if p_max_images is null or p_max_images < 1 or p_max_images > 20 then raise exception 'Approval allows 1 to 20 images'; end if;
  insert into public.pmr_approvals (id, owner_email, org_id, order_id, technician, groups, reason, expires_at, max_images, used, revoked_at)
  values (approval_id, o.owner_email, o.org_id, o.id, lower(p_technician), p_groups, left(p_reason, 500),
          public.pmr_iso(now() + make_interval(hours => p_hours)), p_max_images, 0, null);
  perform public.pmr_log(o.owner_email, o.org_id, o.id, 'approval-granted', approval_id);
  return approval_id;
end
$$;

create or replace function public.pmr_revoke_gallery_approval(p_approval text)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  a public.pmr_approvals;
  o public.pmr_orders;
begin
  if not public.pmr_is_admin() then raise exception 'Only admins can revoke gallery approvals'; end if;
  select * into a from public.pmr_approvals where id = p_approval;
  select * into o from public.pmr_orders where id = a.order_id;
  if not found or not public.pmr_can_manage_order(o) then raise exception 'Approval not found'; end if;
  update public.pmr_approvals set revoked_at = public.pmr_iso(now()) where id = p_approval and revoked_at is null;
  perform public.pmr_log(o.owner_email, o.org_id, o.id, 'approval-revoked', p_approval);
end
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

revoke all on function
  public.pmr_is_scheduler(),
  public.pmr_can_manage_order(public.pmr_orders),
  public.pmr_upsert_member(text, text, text, jsonb, jsonb)
  from public, anon;

grant execute on function
  public.pmr_is_scheduler(),
  public.pmr_can_manage_order(public.pmr_orders),
  public.pmr_upsert_member(text, text, text, jsonb, jsonb)
  to authenticated;
