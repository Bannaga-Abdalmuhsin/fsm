-- Review, then apply through the approved Supabase connector for project gzjikifzdmfkrvxcixlw.
-- Additive only: no CREATE/ALTER/DROP of existing public tables, triggers, policies, or rows.
-- The live pmr_schedule_rows site_reference trigger is not touched; it keeps enriching rows on insert/update.
-- After applying, insert the sync token hash (see the note at the end). Never paste the raw token into SQL or chat.

begin;

do $$
declare
  col text;
  required_sites text[] := array['site_id','location','latitude','longitude','site_status','site_type','vendor','region','district','source_id','source_row','refreshed_at','validation_errors'];
  required_rows text[] := array['source_id','sync_id','source_tab','source_row','site_id','region','district','scheduled_date','tcn_number','tcn_time','team_name','supervisor_name','raw','state','validation_errors','synced_at'];
begin
  if to_regclass('public.pmr_sites') is null then raise exception 'public.pmr_sites is missing'; end if;
  if to_regclass('public.pmr_schedule_rows') is null then raise exception 'public.pmr_schedule_rows is missing'; end if;
  if to_regclass('public.pmr_members') is null then raise exception 'public.pmr_members is missing'; end if;

  foreach col in array required_sites loop
    if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'pmr_sites' and column_name = col) then
      raise exception 'public.pmr_sites.% is missing', col;
    end if;
  end loop;

  foreach col in array required_rows loop
    if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'pmr_schedule_rows' and column_name = col) then
      raise exception 'public.pmr_schedule_rows.% is missing', col;
    end if;
  end loop;

  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'pmr_members' and column_name = 'owner_email') then
    raise exception 'public.pmr_members.owner_email is missing';
  end if;

  if not exists (select 1 from pg_constraint where conrelid = 'public.pmr_sites'::regclass and contype = 'p' and pg_get_constraintdef(oid) = 'PRIMARY KEY (site_id)') then
    raise exception 'public.pmr_sites primary key must be (site_id)';
  end if;

  if not exists (select 1 from pg_constraint where conrelid = 'public.pmr_schedule_rows'::regclass and contype = 'p' and pg_get_constraintdef(oid) = 'PRIMARY KEY (source_id, sync_id)') then
    raise exception 'public.pmr_schedule_rows primary key must be (source_id, sync_id)';
  end if;
end;
$$;

create schema if not exists pmr_private;
revoke all on schema pmr_private from public, anon, authenticated;

create table if not exists pmr_private.schedule_sync_tokens (
  name text primary key,
  token_sha256 text not null check (token_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create table if not exists pmr_private.schedule_sync_runs (
  run_id uuid primary key default gen_random_uuid(),
  source_id text not null,
  source_tab text not null,
  received_at timestamptz not null default now(),
  status text not null check (status in ('ok', 'rejected')),
  counts jsonb not null default '{}'::jsonb,
  error text
);

alter table pmr_private.schedule_sync_tokens enable row level security;
alter table pmr_private.schedule_sync_runs enable row level security;
revoke all on table pmr_private.schedule_sync_tokens, pmr_private.schedule_sync_runs from public, anon, authenticated;

create or replace function pmr_private.assert_sync_token()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_headers json := coalesce(nullif(current_setting('request.headers', true), '')::json, '{}'::json);
  v_token text := coalesce(v_headers->>'x-pmr-sync-token', '');
begin
  if v_token = '' or not exists (
    select 1
    from pmr_private.schedule_sync_tokens t
    where t.name = 'apps-script-sync'
      and t.revoked_at is null
      and t.token_sha256 = encode(sha256(convert_to(v_token, 'UTF8')), 'hex')
  ) then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.pmr_sync_schedule(p_sheet_id text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_sheet_id constant text := '<SCHEDULE_SHEET_ID>';
  c_tab constant text := 'Sheet1';
  c_max_rows constant int := 1000;
  v_rows jsonb := coalesce(p_payload->'rows', '[]'::jsonb);
  v_row jsonb;
  v_site public.pmr_sites%rowtype;
  v_error text;
  v_run_id uuid;
  v_conflict_sites text[];
  v_existing_state text;
  v_email text;
  v_provisioned boolean;
  v_missing text[];
  v_errors jsonb;
  v_conflict boolean;
  v_state text;
  v_absent int;
  v_counts jsonb;
  v_ready int := 0;
  v_draft int := 0;
  v_conflicted int := 0;
  v_frozen int := 0;
begin
  if p_sheet_id is distinct from c_sheet_id then
    raise exception 'sheet not allowed' using errcode = '42501';
  end if;

  perform pmr_private.assert_sync_token();
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('fsm-pmr-source-sync'));

  v_error := case
    when p_payload->>'tab' is distinct from c_tab then 'unexpected tab'
    when jsonb_typeof(v_rows) is distinct from 'array' then 'rows must be an array'
    when jsonb_array_length(v_rows) = 0 then 'no rows received'
    when jsonb_array_length(v_rows) > c_max_rows then 'too many rows'
    when exists (
      select 1 from jsonb_array_elements(v_rows) r
      where coalesce(r->>'sync_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    ) then 'invalid sync_id'
    when exists (
      select 1 from jsonb_array_elements(v_rows) r
      where coalesce(r->>'sheet_row', '') !~ '^[0-9]+$'
    ) then 'invalid sheet_row'
    when exists (
      select 1 from jsonb_array_elements(v_rows) r
      group by r->>'sync_id'
      having count(*) > 1
    ) then 'duplicate sync_id'
    else null
  end;

  if v_error is not null then
    insert into pmr_private.schedule_sync_runs (source_id, source_tab, status, error)
    values (p_sheet_id, coalesce(p_payload->>'tab', ''), 'rejected', v_error)
    returning run_id into v_run_id;
    return jsonb_build_object('ok', false, 'run_id', v_run_id, 'error', v_error);
  end if;

  select coalesce(array_agg(c.site), '{}') into v_conflict_sites
  from (
    select r->>'site_id' as site
    from jsonb_array_elements(v_rows) r
    where nullif(r->>'site_id', '') is not null
    group by r->>'site_id'
    having count(distinct r->>'region') > 1
  ) c;

  for v_row in select value from jsonb_array_elements(v_rows) loop
    select s.state into v_existing_state
    from public.pmr_schedule_rows s
    where s.source_id = p_sheet_id
      and s.sync_id = (v_row->>'sync_id')::uuid;

    if v_existing_state = 'linked' then
      v_frozen := v_frozen + 1;
      continue;
    end if;

    select * into v_site from public.pmr_sites where site_id=upper(trim(v_row->>'site_id'));
    v_row := v_row || jsonb_build_object('site_id',upper(trim(v_row->>'site_id')), 'site_type',v_site.site_type,'latitude',v_site.latitude,'longitude',v_site.longitude);
    v_email := lower(nullif(v_row->>'technician_email', ''));
    v_provisioned := v_email is not null and exists (
      select 1 from public.pmr_members m where lower(m.owner_email) = v_email
    );
    v_missing := array_remove(array[
      case when nullif(v_row->>'site_id', '') is null then 'Site ID is missing' end,
      case when nullif(v_row->>'region', '') is null then 'Region is missing' end,
      case when nullif(v_row->>'district', '') is null then 'District is missing' end,
      case when nullif(v_row->>'pmr_date', '') is null then 'Date is missing' end,
      case when nullif(v_row->>'tcn_number', '') is null then 'TCN Number is missing' end,
      case when nullif(v_row->>'tcn_start', '') is null then 'TCN Time is missing' end,
      case when nullif(v_row->>'tcn_end', '') is null then 'TCN End Time is missing' end,
      case when nullif(v_row->>'team_name', '') is null then 'Field team name is missing' end,
      case when nullif(v_row->>'supervisor_name', '') is null then 'Supervisor name is missing' end,
      case when nullif(v_row->>'wo_number', '') is null then 'WO Number is missing' end,
      case when nullif(v_row->>'site_type', '') is null then 'Site Type is missing' end,
      case when v_row->>'latitude' is null then 'Latitude is missing' end,
      case when v_row->>'longitude' is null then 'Longitude is missing' end,
      case when v_email is null then 'Technician Email is missing' end
    ], null);

    v_conflict := coalesce((v_row->>'site_id') = any(v_conflict_sites), false);
    v_errors := to_jsonb(v_missing) || coalesce(v_row->'issues', '[]'::jsonb);
    if v_email is not null and not v_provisioned then
      v_errors := v_errors || jsonb_build_array('Technician email is not provisioned');
    end if;
    if v_conflict then
      v_errors := v_errors || jsonb_build_array('Region conflicts with another row for this site');
    end if;

    v_state := case
      when v_conflict then 'conflict'
      when jsonb_array_length(v_errors) > 0 then 'draft'
      else 'ready'
    end;

    if v_state = 'ready' then
      v_ready := v_ready + 1;
    elsif v_state = 'conflict' then
      v_conflicted := v_conflicted + 1;
    else
      v_draft := v_draft + 1;
    end if;

    insert into public.pmr_schedule_rows (
      source_id, sync_id, source_tab, source_row, site_id, region, district, scheduled_date,
      tcn_number, tcn_time, team_name, supervisor_name, raw, state, validation_errors, synced_at
    ) values (
      p_sheet_id,
      (v_row->>'sync_id')::uuid,
      c_tab,
      (v_row->>'sheet_row')::int,
      v_row->>'site_id',
      v_row->>'region',
      v_row->>'district',
      (v_row->>'pmr_date')::date,
      v_row->>'tcn_number',
      v_row->'raw'->>'TCN Time',
      v_row->>'team_name',
      v_row->>'supervisor_name',
      jsonb_build_object('source', v_row->'raw', 'normalized', v_row - 'raw' - 'issues'),
      v_state,
      v_errors,
      now()
    )
    on conflict (source_id, sync_id) do update set
      source_tab = excluded.source_tab,
      source_row = excluded.source_row,
      site_id = excluded.site_id,
      region = excluded.region,
      district = excluded.district,
      scheduled_date = excluded.scheduled_date,
      tcn_number = excluded.tcn_number,
      tcn_time = excluded.tcn_time,
      team_name = excluded.team_name,
      supervisor_name = excluded.supervisor_name,
      raw = excluded.raw,
      state = excluded.state,
      validation_errors = excluded.validation_errors,
      synced_at = excluded.synced_at;
  end loop;

  select count(*) into v_absent
  from public.pmr_schedule_rows s
  where s.source_id = p_sheet_id
    and not exists (
      select 1 from jsonb_array_elements(v_rows) r
      where (r->>'sync_id')::uuid = s.sync_id
    );

  v_counts := jsonb_build_object(
    'received', jsonb_array_length(v_rows),
    'ready', v_ready,
    'draft', v_draft,
    'conflict', v_conflicted,
    'linked_frozen', v_frozen,
    'absent_from_sheet', v_absent
  );

  insert into pmr_private.schedule_sync_runs (source_id, source_tab, status, counts)
  values (p_sheet_id, c_tab, 'ok', v_counts)
  returning run_id into v_run_id;

  return jsonb_build_object('ok', true, 'run_id', v_run_id, 'counts', v_counts);
end;
$$;

create or replace function public.pmr_sync_sites(p_sheet_id text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_sheet_id constant text := '<CMDB_SHEET_ID>';
  c_tab constant text := 'Mastersheet Data Base';
  c_max_rows constant int := 2000;
  v_rows jsonb := coalesce(p_payload->'rows', '[]'::jsonb);
  v_row jsonb;
  v_error text;
  v_run_id uuid;
  v_lat double precision;
  v_lon double precision;
  v_type text;
  v_errors jsonb;
  v_counts jsonb;
  v_upserted int := 0;
  v_missing_gps int := 0;
  v_absent int;
begin
  if p_sheet_id is distinct from c_sheet_id then
    raise exception 'sheet not allowed' using errcode = '42501';
  end if;

  perform pmr_private.assert_sync_token();
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('fsm-pmr-source-sync'));

  v_error := case
    when p_payload->>'tab' is distinct from c_tab then 'unexpected tab'
    when jsonb_typeof(v_rows) is distinct from 'array' then 'rows must be an array'
    when jsonb_array_length(v_rows) = 0 then 'no rows received'
    when jsonb_array_length(v_rows) > c_max_rows then 'too many rows'
    when exists (
      select 1 from jsonb_array_elements(v_rows) r
      where nullif(r->>'site_id', '') is null
    ) then 'site_id is missing in a row'
    when exists (
      select 1 from jsonb_array_elements(v_rows) r
      where coalesce(r->>'source_row', '') !~ '^[0-9]+$'
    ) then 'invalid source_row'
    when exists (
      select 1 from jsonb_array_elements(v_rows) r
      group by r->>'site_id'
      having count(*) > 1
    ) then 'duplicate site_id'
    else null
  end;

  if v_error is not null then
    insert into pmr_private.schedule_sync_runs (source_id, source_tab, status, error)
    values (p_sheet_id, coalesce(p_payload->>'tab', ''), 'rejected', v_error)
    returning run_id into v_run_id;
    return jsonb_build_object('ok', false, 'run_id', v_run_id, 'error', v_error);
  end if;

  for v_row in select value from jsonb_array_elements(v_rows) loop
    v_lat := case when v_row->>'latitude' ~ '^-?[0-9]+(\.[0-9]+)?$' then (v_row->>'latitude')::double precision end;
    v_lon := case when v_row->>'longitude' ~ '^-?[0-9]+(\.[0-9]+)?$' then (v_row->>'longitude')::double precision end;
    if v_lat is not null and (v_lat < -90 or v_lat > 90) then v_lat := null; end if;
    if v_lon is not null and (v_lon < -180 or v_lon > 180) then v_lon := null; end if;
    v_type := case when upper(coalesce(v_row->>'site_type', '')) in ('ODU', 'SHELTER') then upper(v_row->>'site_type') end;

    v_errors := to_jsonb(array_remove(array[
      case when nullif(v_row->>'location', '') is null then 'Location is missing' end,
      case when nullif(v_row->>'region', '') is null then 'Region is missing' end,
      case when nullif(v_row->>'district', '') is null then 'District is missing' end,
      case when nullif(v_row->>'site_status', '') is null then 'Site status is missing' end,
      case when nullif(v_row->>'vendor', '') is null then 'Vendor is missing' end,
      case when v_type is null then 'Site type is missing or invalid' end,
      case when v_lat is null then 'Latitude is missing or invalid' end,
      case when v_lon is null then 'Longitude is missing or invalid' end
    ], null));

    if v_lat is null or v_lon is null then
      v_missing_gps := v_missing_gps + 1;
    end if;

    insert into public.pmr_sites (
      site_id, location, latitude, longitude, site_status, site_type, vendor, region, district,
      source_id, source_row, refreshed_at, validation_errors
    ) values (
      v_row->>'site_id',
      nullif(v_row->>'location', ''),
      v_lat,
      v_lon,
      nullif(v_row->>'site_status', ''),
      v_type,
      nullif(v_row->>'vendor', ''),
      nullif(v_row->>'region', ''),
      nullif(v_row->>'district', ''),
      p_sheet_id,
      (v_row->>'source_row')::int,
      now(),
      v_errors
    )
    on conflict (site_id) do update set
      location = excluded.location,
      latitude = excluded.latitude,
      longitude = excluded.longitude,
      site_status = excluded.site_status,
      site_type = excluded.site_type,
      vendor = excluded.vendor,
      region = excluded.region,
      district = excluded.district,
      source_id = excluded.source_id,
      source_row = excluded.source_row,
      refreshed_at = excluded.refreshed_at,
      validation_errors = excluded.validation_errors;

    v_upserted := v_upserted + 1;
  end loop;

  select count(*) into v_absent
  from public.pmr_sites s
  where s.source_id = p_sheet_id
    and not exists (
      select 1 from jsonb_array_elements(v_rows) r
      where r->>'site_id' = s.site_id
    );

  v_counts := jsonb_build_object(
    'received', jsonb_array_length(v_rows),
    'upserted', v_upserted,
    'missing_gps', v_missing_gps,
    'absent_from_sheet', v_absent
  );

  insert into pmr_private.schedule_sync_runs (source_id, source_tab, status, counts)
  values (p_sheet_id, c_tab, 'ok', v_counts)
  returning run_id into v_run_id;

  return jsonb_build_object('ok', true, 'run_id', v_run_id, 'counts', v_counts);
end;
$$;

revoke all on function pmr_private.assert_sync_token() from public, anon, authenticated;
revoke all on function public.pmr_sync_schedule(text, jsonb) from public, anon, authenticated;
revoke all on function public.pmr_sync_sites(text, jsonb) from public, anon, authenticated;
grant execute on function public.pmr_sync_schedule(text, jsonb) to anon;
grant execute on function public.pmr_sync_sites(text, jsonb) to anon;

commit;

-- Token setup, run once by the project owner after applying this file. Do not commit the raw token.
-- 1. Generate a raw token locally (for example: openssl rand -base64 48) and save it only as the Apps Script
--    Script Property SYNC_TOKEN.
-- 2. Compute its SHA-256 hex digest locally (for example: printf '%s' "$TOKEN" | shasum -a 256).
-- 3. Insert only the digest:
--    insert into pmr_private.schedule_sync_tokens (name, token_sha256)
--    values ('apps-script-sync', '<64 lowercase hex characters>');
-- Rotate the existing named row with an upsert; revoke its old digest before installing a new token.