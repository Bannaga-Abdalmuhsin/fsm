-- Scheduling and quality configuration use the exact existing source staging contract.
create schema if not exists pmr_private;
revoke all on schema pmr_private from public,anon,authenticated;
create or replace function public.pmr_save_quality_policy(p_policy jsonb) returns void language plpgsql security definer set search_path='' as $$
declare m public.pmr_members; k text; total numeric:=0; begin
 select * into m from public.pmr_me(); if not public.pmr_is_admin() then raise exception 'Admin access required'; end if;
 if jsonb_typeof(p_policy) is distinct from 'object' or jsonb_typeof(p_policy->'weights') is distinct from 'object' then raise exception 'Invalid quality policy'; end if;
 foreach k in array array['clarity','coverage','integrity','location','time'] loop
 if jsonb_typeof(p_policy->'weights'->k) is distinct from 'number' or (p_policy->'weights'->>k)::numeric<0 then raise exception 'Invalid quality weights'; end if;
 total:=total+(p_policy->'weights'->>k)::numeric; end loop;
 foreach k in array array['review','pass','radius','maxAccuracy','maxFixAgeSeconds'] loop
 if jsonb_typeof(p_policy->k) is distinct from 'number' then raise exception 'Quality thresholds and location limits are required numbers'; end if; end loop;
 if total<>100 or (p_policy->>'review')::numeric not between 0 and 100 or (p_policy->>'pass')::numeric not between 0 and 100 or (p_policy->>'pass')::numeric<(p_policy->>'review')::numeric then raise exception 'Weights must total 100 and thresholds must be ordered'; end if;
 if (p_policy->>'maxAccuracy')::numeric<=0 or (p_policy->>'maxFixAgeSeconds')::numeric<=0 or coalesce((p_policy->>'radius')::numeric,250)<>250 or coalesce((p_policy->>'maxAccuracy')::numeric,50)>50 or coalesce((p_policy->>'maxFixAgeSeconds')::numeric,120)>120 then raise exception 'Site location protections cannot be relaxed'; end if;
 insert into public.pmr_policies(id,owner_email,org_id,policy,created_at) values(gen_random_uuid()::text,public.pmr_email(),m.org_id,p_policy,public.pmr_iso(now()));
end $$;
create or replace function public.pmr_schedule_issues() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare m public.pmr_members; begin
 select * into m from public.pmr_me(); if m.role not in ('admin','supervisor','regional_manager') then raise exception 'Scheduling scope required'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('site_id',s.site_id,'date',s.scheduled_date,'team',s.team_name,'state',s.state,'errors',s.validation_errors,'order_id',s.order_id) order by s.scheduled_date) from public.pmr_schedule_rows s where m.regions @> jsonb_build_array(public.pmr_region_code(s.region))),'[]'::jsonb);
end $$;
create or replace function pmr_private.try_promote_schedule(p_source text,p_sync uuid) returns void language plpgsql security definer set search_path='' as $$
declare s public.pmr_schedule_rows; n jsonb; site public.pmr_sites; member public.pmr_members;
 region_code text; tech text; matches int; id text; template jsonb; policy jsonb; start_at timestamptz; end_at timestamptz;
begin
 select * into s from public.pmr_schedule_rows where source_id=p_source and sync_id=p_sync for update;
 if not found or s.order_id is not null or s.state='conflict' then return; end if;
 n:=s.raw->'normalized'; select * into site from public.pmr_sites where site_id=s.site_id;
 region_code:=public.pmr_region_code(site.region);
 if region_code is null or region_code is distinct from public.pmr_region_code(s.region) or site.site_type is null or site.latitude is null or site.longitude is null or s.scheduled_date is null or coalesce(btrim(s.tcn_number),'')='' or coalesce(btrim(n->>'wo_number'),'')='' or n->>'tcn_start' is null or n->>'tcn_end' is null then return; end if;
 begin start_at:=(n->>'tcn_start')::timestamptz;end_at:=(n->>'tcn_end')::timestamptz;
 exception when others then return; end;
 if end_at<=start_at or (start_at at time zone 'Asia/Riyadh')::date<>s.scheduled_date then return; end if;
 tech:=lower(nullif(btrim(n->>'technician_email'),''));
 if tech is null then
 select count(*),min(t.email) into matches,tech from public.pmr_team_members t where t.team=s.team_name and t.region=region_code;
 if matches<>1 then return; end if;
 end if;
 select count(*) into matches from public.pmr_team_members t join public.pmr_members m on m.org_id=t.org_id and lower(m.owner_email)=t.email where t.email=tech and t.team=s.team_name and t.region=region_code and m.role='technician' and m.regions @> jsonb_build_array(region_code);
 if matches<>1 then return; end if;
 select m.* into member from public.pmr_members m join public.pmr_team_members t on t.org_id=m.org_id and t.email=lower(m.owner_email) where t.email=tech and t.team=s.team_name and t.region=region_code and m.role='technician';
 select c.checklist into template from public.pmr_checklist_catalogue c where c.site_type=site.site_type;
 if template is null then return; end if;
 select p.policy into policy from public.pmr_policies p where p.org_id=member.org_id order by p.created_at::timestamptz desc limit 1;
 policy:=coalesce(policy,'{"version":1,"weights":{"clarity":25,"coverage":25,"integrity":20,"location":15,"time":15},"pass":90,"review":75,"radius":250,"maxAccuracy":50,"maxFixAgeSeconds":120,"timeToleranceSeconds":120,"nearDuplicateDistance":4}'::jsonb);
 -- Prevent two source rows from creating the same WO in the same organization.
 perform pg_advisory_xact_lock(hashtext(member.org_id||'/'||(n->>'wo_number')));
 if exists(select 1 from public.pmr_orders o where o.org_id=member.org_id and o.wo=n->>'wo_number') then
 update public.pmr_schedule_rows set state='conflict',validation_errors=validation_errors||jsonb_build_array('WO number already exists; reconcile duplicate source row') where source_id=p_source and sync_id=p_sync; return;
 end if;
 id:=gen_random_uuid()::text;
 insert into public.pmr_orders(id,owner_email,org_id,site_id,site_type,region,team,assignee,wo,tcn,month,latitude,longitude,scheduled_start,scheduled_end,tcn_start,tcn_end,status,inventory,checklist,policy,version,created_at,updated_at,site_reference)
 values(id,member.owner_email,member.org_id,site.site_id,site.site_type,region_code,s.team_name,tech,n->>'wo_number',s.tcn_number,to_char(s.scheduled_date,'YYYY-MM'),site.latitude,site.longitude,public.pmr_iso(start_at),public.pmr_iso(end_at),public.pmr_iso(start_at),public.pmr_iso(end_at),'Assigned','{}',template,policy,1,public.pmr_iso(now()),public.pmr_iso(now()),to_jsonb(site)-'source_id'-'source_row');
 update public.pmr_schedule_rows set order_id=id,state='linked',validation_errors='[]' where source_id=p_source and sync_id=p_sync;
 perform public.pmr_log(member.owner_email,member.org_id,id,'schedule-linked',p_source||':'||p_sync::text);
end $$;
create or replace function pmr_private.promote_schedule_trigger() returns trigger language plpgsql security definer set search_path='' as $$
begin perform pmr_private.try_promote_schedule(new.source_id,new.sync_id);return new;end $$;
create trigger pmr_schedule_promote after insert or update of raw,site_reference,site_id on public.pmr_schedule_rows for each row when(new.order_id is null) execute function pmr_private.promote_schedule_trigger();
create or replace function public.pmr_promote_ready_schedules() returns void language plpgsql security definer set search_path='' as $$
declare s record; begin
 if not public.pmr_is_admin() then raise exception 'Admin access required'; end if;
 for s in select source_id,sync_id from public.pmr_schedule_rows where order_id is null loop perform pmr_private.try_promote_schedule(s.source_id,s.sync_id);end loop;
end $$;
revoke all on function pmr_private.try_promote_schedule(text,uuid),pmr_private.promote_schedule_trigger() from public,anon,authenticated;
revoke all on function public.pmr_schedule_issues(),public.pmr_promote_ready_schedules(),public.pmr_save_quality_policy(jsonb) from public,anon;
grant execute on function public.pmr_schedule_issues(),public.pmr_promote_ready_schedules(),public.pmr_save_quality_policy(jsonb) to authenticated;
