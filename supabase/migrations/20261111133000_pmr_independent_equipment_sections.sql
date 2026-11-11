create or replace function public.pmr_save_equipment_group(
  p_order text, p_group text, p_checks jsonb, p_remarks text,
  p_measurements jsonb, p_generator_state text, p_revision int
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  o public.pmr_orders;
  g jsonb;
  check_row jsonb;
  merged_checks jsonb;
  group_result text;
  group_code text := regexp_replace(p_group, '_GEN[0-9]+$', '');
  required_readings text[];
  reading text;
  measurement numeric;
  saved public.pmr_group_submissions;
  stamp text := public.pmr_iso(clock_timestamp());
begin
  o := public.pmr_locked_order(p_order);
  if o.status not in ('Checked in', 'In progress') then
    raise exception 'Start the visit before saving equipment checks';
  end if;
  select value into g from jsonb_array_elements(o.checklist) where value->>'id'=p_group;
  if g is null then raise exception 'Unknown equipment group in this work order'; end if;
  if jsonb_typeof(p_checks) is distinct from 'object' or jsonb_typeof(p_measurements) is distinct from 'object'
    or p_remarks is null or length(p_remarks)>2000 then raise exception 'Invalid equipment fields'; end if;
  if p_checks = '{}'::jsonb then raise exception 'Answer the equipment checks'; end if;
  if exists (
    select 1 from jsonb_each_text(p_checks) as answer(code, result)
    where answer.result is null or answer.result not in ('Pass','Fail','Not applicable','Not tested')
       or not exists (select 1 from jsonb_array_elements(g->'etls') as item where item->>'code'=answer.code)
  ) then raise exception 'Invalid equipment check'; end if;
  select case
    when bool_or(value='Fail') then 'Fail'
    when bool_or(value='Pass') then 'Pass'
    when bool_or(value='Not tested') then 'Not tested'
    else 'Not applicable' end
  into group_result from jsonb_each_text(p_checks);
  if exists (select 1 from jsonb_each_text(p_checks) where value in ('Fail','Not tested'))
    and btrim(p_remarks)='' then raise exception 'Add remarks for issues or checks you could not perform'; end if;
  if group_code in ('O09','S16') then
    if p_generator_state is null or p_generator_state not in ('Running','Standby','Fault','Not checked') then
      raise exception 'Select the generator operating status';
    end if;
  elsif p_generator_state is not null then raise exception 'Generator status belongs to generator controls'; end if;

  required_readings := case
    when group_code in ('O03','S05') then array['strings']
    when group_code in ('O04','S06') then array['bbu_v']
    when group_code in ('O08','S15') then array['fuel_pct']
    when group_code in ('O09','S16') then array['running_hours','ac_v','frequency_hz']
    when group_code in ('O10','S17') then array['starter_v']
    when group_code in ('O13','S25') then array['modules_working','modules_total']
    when group_code in ('O14','S26') then array['dc_busbar_v','dc_output_a']
    when group_code='S19' then array['cooling_working','cooling_total','temperature_c']
    else array[]::text[] end;
  if group_result not in ('Pass','Fail') then required_readings := array[]::text[]; end if;
  if (select count(*) from jsonb_object_keys(p_measurements)) <> cardinality(required_readings) then
    raise exception 'Enter all required equipment readings';
  end if;
  foreach reading in array required_readings loop
    if jsonb_typeof(p_measurements->reading) is distinct from 'number' then
      raise exception 'Enter numeric equipment readings';
    end if;
    measurement := (p_measurements->>reading)::numeric;
    if (reading='fuel_pct' and measurement not between 0 and 100)
      or (reading='temperature_c' and measurement not between -100 and 250)
      or (reading in ('dc_busbar_v','bbu_v') and abs(measurement)>1000)
      or (reading not in ('temperature_c','dc_busbar_v','bbu_v') and measurement<0)
      or (reading in ('strings','modules_working','modules_total','cooling_working','cooling_total')
        and measurement<>trunc(measurement)) then raise exception 'Reading outside supported range'; end if;
  end loop;
  if (p_measurements->>'modules_working')::numeric > (p_measurements->>'modules_total')::numeric
    or (p_measurements->>'cooling_working')::numeric > (p_measurements->>'cooling_total')::numeric then
    raise exception 'Working units cannot exceed installed units';
  end if;

  select * into saved from public.pmr_group_submissions where order_id=o.id and group_id=p_group;
  if coalesce(saved.revision,0) is distinct from p_revision then raise exception 'Group changed. Refresh before saving'; end if;
  merged_checks := coalesce(saved.field_checks, '{}'::jsonb) || p_checks;
  select case when bool_or(value='Fail') then 'Fail' when bool_or(value='Pass') then 'Pass'
    when bool_or(value='Not tested') then 'Not tested' else 'Not applicable' end
    into group_result from jsonb_each_text(merged_checks);
  insert into public.pmr_group_submissions(order_id,group_id,status,remarks,measurements,field_checks,generator_state)
    values(o.id,p_group,group_result,btrim(p_remarks),p_measurements,merged_checks,p_generator_state)
  on conflict(order_id,group_id) do update set status=excluded.status,remarks=excluded.remarks,
    measurements=excluded.measurements,field_checks=excluded.field_checks,generator_state=excluded.generator_state,
    revision=pmr_group_submissions.revision+1,updated_at=clock_timestamp()
  returning * into saved;
  for check_row in select value from jsonb_array_elements(g->'etls') where p_checks ? (value->>'code') loop
    insert into public.pmr_results(id,owner_email,org_id,order_id,etl_code,instance,status,remarks,readings,tt,noc,updated_at)
    values(extensions.gen_random_uuid()::text,public.pmr_email(),o.org_id,o.id,check_row->>'code',p_group,
      p_checks->>(check_row->>'code'),btrim(p_remarks),
      coalesce(nullif((p_measurements || jsonb_strip_nulls(jsonb_build_object('generator_status',p_generator_state)))::text,'{}'),''),
      '','',stamp)
    on conflict(order_id,etl_code,instance) do update set status=excluded.status,remarks=excluded.remarks,
      readings=excluded.readings,tt='',noc='',updated_at=excluded.updated_at;
  end loop;
  perform public.pmr_log(o.owner_email,o.org_id,o.id,'group-assessment',p_group||' '||group_result);
  return to_jsonb(saved);
end $$;

-- Preserve the installed submission policy while preventing incomplete partial saves.
create function public.pmr_require_complete_equipment_checks() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.status='Submitted' and old.status is distinct from new.status and exists (
    select 1 from jsonb_array_elements(new.checklist) as g
    join public.pmr_group_submissions as s on s.order_id=new.id and s.group_id=g->>'id'
    where s.field_checks is not null and exists (
      select 1 from jsonb_array_elements(g->'etls') as e where not (s.field_checks ? (e->>'code'))
    )
  ) then raise exception 'Complete the equipment checks before submitting PMR'; end if;
  return new;
end $$;
revoke all on function public.pmr_require_complete_equipment_checks() from public,anon,authenticated;
create trigger pmr_require_complete_equipment_checks before update of status on public.pmr_orders
for each row execute function public.pmr_require_complete_equipment_checks();
