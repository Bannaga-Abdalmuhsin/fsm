-- REVIEW ONLY. Not applied to any database.
-- Prerequisites: the FSM reference tables from drizzle/schema.ts exist with the
-- columns listed there, and the pmr-evidence bucket exists (created below).
--
-- Design:
--   * Clients get SELECT only on PMR tables. Every state change (check-in, status,
--     ETL PASS, evidence register/review, approvals, membership, audit) runs in a
--     SECURITY DEFINER function that re-checks identity, scope, and workflow rules.
--   * Evidence rows are accepted only when the server-side ingest signed the exact
--     payload text with the key in pmr_ingest_keys. Clients cannot forge analysis.
--   * Membership resolves to one row. Users in several orgs must carry the
--     app_metadata claim pmr_org_id (set by an admin, never by the user).
--
-- Manual setup steps (not performed here):
--   1. insert into public.pmr_ingest_keys (id, secret) values (1, '<same value as PMR_INGEST_SECRET on the server>');
--   2. For multi-org users: set auth.users.raw_app_meta_data = {"pmr_org_id": "<org_id>"}.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.pmr_ingest_keys (
  id int primary key check (id = 1),
  secret text not null,
  created_at timestamptz not null default now()
);
alter table public.pmr_ingest_keys enable row level security;
revoke all on public.pmr_ingest_keys from anon, authenticated;

insert into storage.buckets (id, name, public)
values ('pmr-evidence', 'pmr-evidence', false)
on conflict (id) do update set public = false;

-- ---------------------------------------------------------------------------
-- Identity and scope helpers
-- ---------------------------------------------------------------------------

create or replace function public.pmr_email()
returns text
language sql stable security definer set search_path = ''
as $$ select lower(u.email) from auth.users u where u.id=auth.uid() and u.email_confirmed_at is not null $$;

create or replace function public.pmr_app_meta()
returns jsonb
language sql stable set search_path = public, pg_temp
as $$ select coalesce(auth.jwt() -> 'app_metadata', '{}'::jsonb) $$;

create or replace function public.pmr_iso(t timestamptz)
returns text
language sql immutable set search_path = public, pg_temp
as $$ select to_char(t at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') $$;

-- Returns at most one membership. With a pmr_org_id claim the org must match.
-- Without a claim the user must have exactly one membership, otherwise none.
create or replace function public.pmr_me()
returns setof public.pmr_members
language sql stable security definer set search_path = public, pg_temp
as $$
  select m.* from public.pmr_members m
  where lower(m.owner_email) = public.pmr_email()
    and (
      (public.pmr_app_meta() ? 'pmr_org_id'
        and coalesce(m.org_id, '') = coalesce(public.pmr_app_meta() ->> 'pmr_org_id', ''))
      or (not (public.pmr_app_meta() ? 'pmr_org_id')
        and (select count(*) from public.pmr_members x
             where lower(x.owner_email) = public.pmr_email()) = 1)
    )
$$;

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
        'regions', m.regions));
  end if;
  if (select count(*) from public.pmr_members x
      where lower(x.owner_email) = public.pmr_email()) = 0
     or public.pmr_app_meta() ? 'pmr_org_id' then
    return jsonb_build_object('state', 'unprovisioned');
  end if;
  return jsonb_build_object('state', 'ambiguous');
end
$$;

create or replace function public.pmr_is_manager()
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select coalesce((select m.role in ('admin', 'supervisor') from public.pmr_me() m), false)
$$;

create or replace function public.pmr_is_admin()
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select coalesce((select m.role = 'admin' from public.pmr_me() m), false)
$$;

create or replace function public.pmr_region_in_scope(p_org text, p_region text)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.pmr_me() m, jsonb_array_elements_text(m.regions) r
    where coalesce(m.org_id, '') = coalesce(p_org, '')
      and r = p_region
  )
$$;

create or replace function public.pmr_can_view_order(o public.pmr_orders)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select public.pmr_region_in_scope(o.org_id, o.region)
     and (public.pmr_is_manager() or lower(o.assignee) = public.pmr_email())
$$;

create or replace function public.pmr_can_operate_order(o public.pmr_orders)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select public.pmr_region_in_scope(o.org_id, o.region)
     and lower(o.assignee) = public.pmr_email()
$$;

create or replace function public.pmr_distance_m(lat1 double precision, lon1 double precision, lat2 double precision, lon2 double precision)
returns double precision
language sql immutable set search_path = public, pg_temp
as $$
  select 2 * 6371000 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2)
    + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lon2 - lon1) / 2), 2)
  ))
$$;

create or replace function public.pmr_etl_exists(p_checklist jsonb, p_number int, p_code text)
returns boolean
language sql immutable set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from jsonb_array_elements(p_checklist) g, jsonb_array_elements(g -> 'etls') e
    where (e ->> 'number')::int = p_number and e ->> 'code' = p_code
  )
$$;

-- Verifies a location fix against the order's policy and site boundary.
create or replace function public.pmr_assert_fix(o public.pmr_orders, p_fix jsonb)
returns void
language plpgsql stable set search_path = public, pg_temp
as $$
declare
  radius numeric := coalesce((o.policy ->> 'radius')::numeric, 250);
  max_accuracy numeric := coalesce((o.policy ->> 'maxAccuracy')::numeric, 50);
  max_age numeric := coalesce((o.policy ->> 'maxFixAgeSeconds')::numeric, 120);
  fix_acc numeric;
  fix_ts timestamptz;
  dist double precision;
begin
  begin
    fix_acc := (p_fix ->> 'accuracy')::numeric;
    fix_ts := (p_fix ->> 'timestamp')::timestamptz;
    dist := public.pmr_distance_m(
      (p_fix ->> 'latitude')::double precision,
      (p_fix ->> 'longitude')::double precision,
      o.latitude, o.longitude);
  exception when others then
    raise exception 'Location fix is malformed';
  end;
  if fix_ts is null or dist is null or fix_acc is null or fix_acc <= 0 then raise exception 'Location fix is malformed'; end if;
  if abs(extract(epoch from now() - fix_ts)) > max_age then raise exception 'GPS fix is stale. Refresh location.'; end if;
  if fix_acc > max_accuracy then raise exception 'GPS accuracy is too low. Move to open sky and retry.'; end if;
  if dist + fix_acc > radius then raise exception 'You must be reliably inside the 250 m site boundary.'; end if;
end
$$;

create or replace function public.pmr_log(p_owner text, p_org text, p_order text, p_event text, p_detail text)
returns void
language sql security definer set search_path = public, pg_temp
as $$
  insert into public.pmr_audit (id, owner_email, org_id, order_id, event, detail, created_at)
  values (gen_random_uuid()::text, p_owner, p_org, p_order, p_event,
          coalesce(public.pmr_email(), 'unknown') || ': ' || p_detail,
          public.pmr_iso(now()))
$$;

-- ---------------------------------------------------------------------------
-- Row-level security: read policies only for client-facing tables
-- ---------------------------------------------------------------------------

alter table public.pmr_members enable row level security;
alter table public.pmr_orders enable row level security;
alter table public.pmr_results enable row level security;
alter table public.pmr_evidence enable row level security;
alter table public.pmr_approvals enable row level security;
alter table public.pmr_audit enable row level security;
alter table public.pmr_policies enable row level security;

revoke all on public.pmr_members, public.pmr_orders, public.pmr_results,
  public.pmr_evidence, public.pmr_approvals, public.pmr_audit, public.pmr_policies
  from anon, authenticated;

grant select on public.pmr_members, public.pmr_orders, public.pmr_results,
  public.pmr_evidence, public.pmr_approvals, public.pmr_audit, public.pmr_policies
  to authenticated;
grant insert, update on public.pmr_orders to authenticated;

create policy pmr_members_self_read on public.pmr_members
  for select to authenticated
  using (lower(owner_email) = public.pmr_email());

create policy pmr_members_admin_read on public.pmr_members
  for select to authenticated
  using (public.pmr_is_admin() and coalesce(org_id, '') = coalesce((select m.org_id from public.pmr_me() m), ''));

create policy pmr_orders_read on public.pmr_orders
  for select to authenticated
  using (public.pmr_can_view_order(pmr_orders));

create policy pmr_orders_manager_insert on public.pmr_orders
  for insert to authenticated
  with check (
    public.pmr_is_manager()
    and public.pmr_region_in_scope(org_id, region)
    and status = 'Assigned'
    and checked_in_at is null
    and check_in is null
  );

create policy pmr_orders_manager_update on public.pmr_orders
  for update to authenticated
  using (public.pmr_is_manager() and public.pmr_region_in_scope(org_id, region))
  with check (public.pmr_is_manager() and public.pmr_region_in_scope(org_id, region));

create policy pmr_results_read on public.pmr_results
  for select to authenticated
  using (exists (select 1 from public.pmr_orders o where o.id = pmr_results.order_id and public.pmr_can_view_order(o)));

create policy pmr_evidence_read on public.pmr_evidence
  for select to authenticated
  using (exists (select 1 from public.pmr_orders o where o.id = pmr_evidence.order_id and public.pmr_can_view_order(o)));

create policy pmr_approvals_read on public.pmr_approvals
  for select to authenticated
  using (exists (select 1 from public.pmr_orders o where o.id = pmr_approvals.order_id and public.pmr_can_view_order(o)));

create policy pmr_audit_read on public.pmr_audit
  for select to authenticated
  using (public.pmr_is_manager() and exists (select 1 from public.pmr_orders o where o.id = pmr_audit.order_id and public.pmr_can_view_order(o)));

create policy pmr_policies_read on public.pmr_policies
  for select to authenticated
  using (coalesce(org_id, '') = coalesce((select m.org_id from public.pmr_me() m), ''));

-- Direct writes to workflow fields are blocked; workflow functions set the flag.
create or replace function public.pmr_guard_order_update()
returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if coalesce(current_setting('pmr.workflow', true), '') = 'on' then
    return new;
  end if;
  if old.status<>'Assigned' and (new.checklist is distinct from old.checklist or new.policy is distinct from old.policy or new.inventory is distinct from old.inventory or new.tcn is distinct from old.tcn or new.tcn_start is distinct from old.tcn_start or new.tcn_end is distinct from old.tcn_end or new.assignee is distinct from old.assignee or new.latitude is distinct from old.latitude or new.longitude is distinct from old.longitude or new.team is distinct from old.team or new.region is distinct from old.region or new.org_id is distinct from old.org_id) then raise exception 'Active work order snapshot is frozen'; end if;
  if new.status is distinct from old.status
     or new.check_in is distinct from old.check_in
     or new.checked_in_at is distinct from old.checked_in_at then
    raise exception 'Status and check-in change only through the PMR workflow';
  end if;
  return new;
end
$$;

create trigger pmr_orders_guard
  before update on public.pmr_orders
  for each row execute function public.pmr_guard_order_update();

-- ---------------------------------------------------------------------------
-- Workflow functions (the only write path for technicians and reviewers)
-- ---------------------------------------------------------------------------

create or replace function public.pmr_locked_order(p_order text)
returns public.pmr_orders
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  o public.pmr_orders;
begin
  select * into o from public.pmr_orders where id = p_order for update;
  if not found or not public.pmr_can_operate_order(o) then
    raise exception 'Work order not found or not assigned to you';
  end if;
  return o;
end
$$;

create or replace function public.pmr_check_in(p_order text, p_expected_version int, p_fix jsonb)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  o public.pmr_orders;
begin
  o := public.pmr_locked_order(p_order);
  if o.version <> p_expected_version then raise exception 'Work order changed. Reload and retry.'; end if;
  if o.status <> 'Assigned' then raise exception 'Work order is not awaiting check-in'; end if;
  perform public.pmr_assert_fix(o, p_fix);
  perform set_config('pmr.workflow', 'on', true);
  update public.pmr_orders
     set check_in = p_fix,
         checked_in_at = p_fix ->> 'timestamp',
         status = 'Checked in',
         version = version + 1,
         updated_at = public.pmr_iso(now())
   where id = o.id;
  perform public.pmr_log(o.owner_email, o.org_id, o.id, 'check-in', 'checked in');
end
$$;

create or replace function public.pmr_start_work(p_order text, p_expected_version int)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  o public.pmr_orders;
begin
  o := public.pmr_locked_order(p_order);
  if o.version <> p_expected_version then raise exception 'Work order changed. Reload and retry.'; end if;
  if o.status <> 'Checked in' or o.check_in is null then raise exception 'Check in before starting work'; end if;
  perform set_config('pmr.workflow', 'on', true);
  update public.pmr_orders
     set status = 'In progress', version = version + 1, updated_at = public.pmr_iso(now())
   where id = o.id;
  perform public.pmr_log(o.owner_email, o.org_id, o.id, 'start', 'started work');
end
$$;

create or replace function public.pmr_record_etl_result(
  p_order text,
  p_etl_number int,
  p_etl_code text,
  p_instance text,
  p_status text,
  p_remarks text,
  p_readings text,
  p_tt text,
  p_noc text
)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  o public.pmr_orders;
begin
  o := public.pmr_locked_order(p_order);
  if o.status not in ('Checked in', 'In progress') then raise exception 'Work order is not open for results'; end if;
  if not public.pmr_etl_exists(o.checklist, p_etl_number, p_etl_code) then raise exception 'Unknown ETL for this work order'; end if;
  if p_status not in ('Pass', 'Fail', 'Not applicable','Not tested') then raise exception 'Invalid ETL status'; end if;
  if p_status='Fail' and coalesce(btrim(p_tt),'')='' then raise exception 'FAIL needs a TT reference'; end if;
  if p_status in ('Not applicable','Not tested') and coalesce(btrim(p_remarks),'')='' then raise exception 'Exception reason required'; end if;
  if not exists(select 1 from jsonb_array_elements(o.checklist) g,jsonb_array_elements(g->'etls') e where g->>'id'=p_instance and e->>'code'=p_etl_code and (e->>'number')::int=p_etl_number) then raise exception 'Unknown ETL group instance'; end if;
  if p_status='Pass' and exists(select 1 from public.pmr_evidence ev,jsonb_array_elements(ev.findings) f where ev.order_id=o.id and ev.state<>'Superseded' and ev.instance=p_instance and ev.linked_etls @> jsonb_build_array(p_etl_number) and f->>'code'='housekeeping_incomplete') then raise exception 'Housekeeping remains incomplete; correct it or record FAIL with TT'; end if;
  if p_status = 'Pass' and not exists (
    select 1 from public.pmr_evidence ev
    where ev.order_id = o.id
      and ev.state = 'Accepted'
      and ev.instance = p_instance
      and ev.linked_etls @> jsonb_build_array(p_etl_number)
  ) then
    raise exception 'PASS needs accepted evidence for this ETL instance';
  end if;
  insert into public.pmr_results (id, owner_email, org_id, order_id, etl_code, instance, status, remarks, readings, tt, noc, updated_at)
  values (gen_random_uuid()::text, o.owner_email, o.org_id, o.id, p_etl_code, p_instance, p_status,
          left(coalesce(p_remarks, ''), 2000), left(coalesce(p_readings, ''), 500),
          left(coalesce(p_tt, ''), 200), left(coalesce(p_noc, ''), 200), public.pmr_iso(now()))
  on conflict (order_id, etl_code, instance) do update
    set status = excluded.status,
        remarks = excluded.remarks,
        readings = excluded.readings,
        tt = excluded.tt,
        noc = excluded.noc,
        updated_at = excluded.updated_at;
  perform public.pmr_log(o.owner_email, o.org_id, o.id, 'etl-result', p_etl_code || ' ' || p_instance || ' ' || p_status);
end
$$;

create or replace function public.pmr_submit_order(p_order text, p_expected_version int)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  o public.pmr_orders;
  missing int;
begin
  o := public.pmr_locked_order(p_order);
  if o.version <> p_expected_version then raise exception 'Work order changed. Reload and retry.'; end if;
  if o.status <> 'In progress' then raise exception 'Start work before submitting'; end if;
  select count(*) into missing
  from jsonb_array_elements(o.checklist) g, jsonb_array_elements(g -> 'etls') e
  where coalesce((e ->> 'requiresClarification')::boolean, false) = false
    and not exists (
      select 1 from public.pmr_results r
      where r.order_id = o.id and r.etl_code = e ->> 'code' and r.status = 'Pass'
    );
  if missing > 0 then
    raise exception '% ETL(s) have no accepted PASS result', missing;
  end if;
  perform set_config('pmr.workflow', 'on', true);
  update public.pmr_orders
     set status = 'Submitted', version = version + 1, updated_at = public.pmr_iso(now())
   where id = o.id;
  perform public.pmr_log(o.owner_email, o.org_id, o.id, 'submit', 'submitted for review');
end
$$;

create or replace function public.pmr_register_evidence(p_payload text, p_signature text)
returns text
language plpgsql security definer set search_path = public, extensions, pg_temp
as $$
declare
  p jsonb := p_payload::jsonb;
  secret text;
  o public.pmr_orders;
  approval public.pmr_approvals;
  captured timestamptz := (p ->> 'captured_at')::timestamptz;
  capture_id text := p ->> 'capture_id';
  source text := p ->> 'source';
  state text := p ->> 'state';
  existing_hash_distance int;
  object_path text;
begin
  select s.secret into secret from public.pmr_ingest_keys s where s.id = 1;
  if secret is null then raise exception 'Evidence ingest is not configured'; end if;
  if encode(extensions.hmac(p_payload, secret, 'sha256'), 'hex') <> lower(p_signature) then
    raise exception 'Evidence payload signature is invalid';
  end if;

  o := public.pmr_locked_order(p ->> 'order_id');
  if o.status not in ('Checked in', 'In progress') or o.check_in is null then
    raise exception 'Check in and start work before capturing evidence';
  end if;
  object_path := p -> 'handle' ->> 'path';
  if split_part(object_path, '/', 1) <> o.id
     or array_length(string_to_array(object_path, '/'), 1) <> 2
     or split_part(object_path, '/', 2) not in (capture_id || '.jpg', capture_id || '.png', capture_id || '.webp')
     or not exists (
       select 1 from storage.objects so
       where so.bucket_id = 'pmr-evidence' and so.name = object_path
     ) then
    raise exception 'Uploaded object does not match this work order';
  end if;
  if jsonb_typeof(p -> 'linked_etls') <> 'array' or jsonb_array_length(p -> 'linked_etls') = 0
     or exists (
       select 1 from jsonb_array_elements_text(p -> 'linked_etls') n
       where not exists (
         select 1 from jsonb_array_elements(o.checklist) g, jsonb_array_elements(g -> 'etls') e
         where (e ->> 'number')::int = n::int
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
  if (p ->> 'captured_at_source') not in ('exif', 'server-received') then
    raise exception 'Unknown capture time source';
  end if;
  perform public.pmr_assert_fix(o, p -> 'gps');

  if source = 'gallery' then
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
  elsif source = 'capture' then
    if p ->> 'approval_id' is not null then raise exception 'Camera capture cannot use an approval'; end if;
  else
    raise exception 'Unknown evidence source';
  end if;

  if state not in ('Pending analysis', 'Retake required', 'Supervisor review') then
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
  where ev.order_id = o.id and ev.perceptual_hash <> '' and p ->> 'perceptual_hash' <> '';
  if existing_hash_distance is not null and existing_hash_distance <= coalesce((o.policy ->> 'nearDuplicateDistance')::int, 4) then
    raise exception 'This photo is a near-duplicate of an existing photo on this work order';
  end if;

  insert into public.pmr_evidence (
    id, owner_email, org_id, order_id, group_id, instance, source, approval_id,
    capture_id, captured_at, uploaded_at, gps, sha, perceptual_hash, handle, mime,
    width, height, findings, quality, analysis, state, linked_etls, review_note, revision
  ) values (
    capture_id, o.owner_email, o.org_id, o.id, p ->> 'group_id', p ->> 'instance', source,
    p ->> 'approval_id', capture_id, public.pmr_iso(captured), public.pmr_iso(now()),
    p -> 'gps', p ->> 'sha', coalesce(p ->> 'perceptual_hash', ''), p -> 'handle', p ->> 'mime',
    (p ->> 'width')::int, (p ->> 'height')::int, p -> 'findings', p -> 'quality',
    p -> 'analysis', state, p -> 'linked_etls', '', 1
  );
  perform public.pmr_log(o.owner_email, o.org_id, o.id, 'evidence-captured', capture_id || ' ' || state);
  return capture_id;
end
$$;

create or replace function public.pmr_review_evidence(p_evidence text, p_revision int, p_state text, p_note text)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  ev public.pmr_evidence;
  o public.pmr_orders;
begin
  if not public.pmr_is_manager() then raise exception 'Only supervisors and admins can review evidence'; end if;
  select * into ev from public.pmr_evidence where id = p_evidence for update;
  if not found then raise exception 'Evidence not found'; end if;
  select * into o from public.pmr_orders where id = ev.order_id;
  if not found or not public.pmr_can_view_order(o) then raise exception 'Evidence not found'; end if;
  if ev.revision <> p_revision then raise exception 'Evidence changed. Reload and retry.'; end if;
  if p_state = 'Accepted' then
    if ev.state <> 'Supervisor review' then
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
  if not public.pmr_is_manager() then raise exception 'Only supervisors and admins can grant approvals'; end if;
  select * into o from public.pmr_orders where id = p_order;
  if not found or not public.pmr_can_view_order(o) then raise exception 'Work order not found'; end if;
  if lower(o.assignee) <> lower(p_technician) then raise exception 'Approvals apply only to the assigned technician'; end if;
  if jsonb_typeof(p_groups) <> 'array' or jsonb_array_length(p_groups) = 0 then raise exception 'Select at least one ETL group'; end if;
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
  if not public.pmr_is_manager() then raise exception 'Only supervisors and admins can revoke approvals'; end if;
  select * into a from public.pmr_approvals where id = p_approval;
  select * into o from public.pmr_orders where id = a.order_id;
  if not found or not public.pmr_can_view_order(o) then raise exception 'Approval not found'; end if;
  update public.pmr_approvals set revoked_at = public.pmr_iso(now()) where id = p_approval and revoked_at is null;
  perform public.pmr_log(o.owner_email, o.org_id, o.id, 'approval-revoked', p_approval);
end
$$;

create or replace function public.pmr_upsert_member(p_owner_email text, p_org_id text, p_role text, p_regions jsonb)
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
  if p_role not in ('admin', 'supervisor', 'technician') then raise exception 'Invalid role'; end if;
  if jsonb_typeof(p_regions) <> 'array' or jsonb_array_length(p_regions) = 0 then raise exception 'Select at least one region'; end if;
  if exists (select 1 from jsonb_array_elements_text(p_regions) r where r not in ('CR', 'ER', 'WR', 'SR')) then
    raise exception 'Invalid region';
  end if;
  update public.pmr_members
     set role = p_role, regions = p_regions
   where coalesce(org_id, '') = coalesce(p_org_id, '') and lower(owner_email) = email;
  if not found then
    insert into public.pmr_members (id, owner_email, org_id, role, regions)
    values (gen_random_uuid()::text, email, p_org_id, p_role, p_regions);
  end if;
end
$$;

create or replace function public.pmr_remove_member(p_owner_email text, p_org_id text)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if not public.pmr_is_admin() then raise exception 'Only admins can manage members'; end if;
  if lower(p_owner_email) = public.pmr_email() then raise exception 'You cannot remove your own membership'; end if;
  if coalesce(p_org_id, '') <> coalesce((select m.org_id from public.pmr_me() m), '') then
    raise exception 'Members can only be managed in your organization';
  end if;
  delete from public.pmr_members
   where coalesce(org_id, '') = coalesce(p_org_id, '') and lower(owner_email) = lower(p_owner_email);
end
$$;

-- Internal helpers and trigger functions are not part of the API surface.
revoke all on function
  public.pmr_log(text, text, text, text, text),
  public.pmr_locked_order(text),
  public.pmr_assert_fix(public.pmr_orders, jsonb),
  public.pmr_etl_exists(jsonb, int, text),
  public.pmr_distance_m(double precision, double precision, double precision, double precision),
  public.pmr_guard_order_update()
  from public, anon, authenticated;

-- Execute grants: functions are callable only by signed-in users.
revoke all on function
  public.pmr_check_in(text, int, jsonb),
  public.pmr_start_work(text, int),
  public.pmr_record_etl_result(text, int, text, text, text, text, text, text, text),
  public.pmr_submit_order(text, int),
  public.pmr_register_evidence(text, text),
  public.pmr_review_evidence(text, int, text, text),
  public.pmr_grant_gallery_approval(text, text, jsonb, text, int, int),
  public.pmr_revoke_gallery_approval(text),
  public.pmr_upsert_member(text, text, text, jsonb),
  public.pmr_remove_member(text, text),
  public.pmr_membership(),
  public.pmr_me(),
  public.pmr_is_manager(),
  public.pmr_is_admin(),
  public.pmr_region_in_scope(text, text),
  public.pmr_can_view_order(public.pmr_orders),
  public.pmr_can_operate_order(public.pmr_orders),
  public.pmr_email(),
  public.pmr_app_meta()
  from public, anon;

grant execute on function
  public.pmr_check_in(text, int, jsonb),
  public.pmr_start_work(text, int),
  public.pmr_record_etl_result(text, int, text, text, text, text, text, text, text),
  public.pmr_submit_order(text, int),
  public.pmr_register_evidence(text, text),
  public.pmr_review_evidence(text, int, text, text),
  public.pmr_grant_gallery_approval(text, text, jsonb, text, int, int),
  public.pmr_revoke_gallery_approval(text),
  public.pmr_upsert_member(text, text, text, jsonb),
  public.pmr_remove_member(text, text),
  public.pmr_membership(),
  public.pmr_me(),
  public.pmr_is_manager(),
  public.pmr_is_admin(),
  public.pmr_region_in_scope(text, text),
  public.pmr_can_view_order(public.pmr_orders),
  public.pmr_can_operate_order(public.pmr_orders),
  public.pmr_email(),
  public.pmr_app_meta()
  to authenticated;

-- ---------------------------------------------------------------------------
-- Evidence storage (private bucket). Uploads are made by the signed-in technician
-- through the ingest route; the register function then checks the object exists.
-- ---------------------------------------------------------------------------

create policy pmr_evidence_objects_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'pmr-evidence'
    and exists (
      select 1 from public.pmr_orders o
      where o.id = split_part(name, '/', 1)
        and public.pmr_can_view_order(o)
    )
  );

create policy pmr_evidence_objects_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'pmr-evidence'
    and exists (
      select 1 from public.pmr_orders o
      where o.id = split_part(name, '/', 1)
        and public.pmr_can_operate_order(o)
    )
  );

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
      select 1 from public.pmr_evidence ev where ev.handle ->> 'path' = name
    )
  );
