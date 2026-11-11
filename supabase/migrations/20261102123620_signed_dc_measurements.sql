-- Telecom DC systems can use negative polarity; preserve the measured sign.
create or replace function public.pmr_save_group(p_order text,p_group text,p_status text,p_remarks text default '',p_measurements jsonb default '{}',p_revision int default 0)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.pmr_orders; g jsonb; e jsonb; v jsonb; k text; n numeric; saved public.pmr_group_submissions; stamp text:=public.pmr_iso(clock_timestamp());
begin
 o:=public.pmr_locked_order(p_order);
 if o.status not in ('Checked in','In progress') then raise exception 'Start the visit before saving groups'; end if;
 select value into g from jsonb_array_elements(o.checklist) where value->>'id'=p_group;
 if g is null then raise exception 'Unknown group in this work order'; end if;
 if p_status is null or p_status not in ('Pass','Fail','Not applicable','Not tested') then raise exception 'Choose a group result'; end if;
 if p_remarks is null or length(p_remarks)>2000 or p_measurements is null or jsonb_typeof(p_measurements)<>'object' then raise exception 'Invalid group fields'; end if;
 for k,v in select * from jsonb_each(p_measurements) loop
 if k not in ('temperature_c','dc_busbar_v','bbu_v','ac_v') or jsonb_typeof(v)<>'number' then raise exception 'Only numeric temperature and voltage readings are supported'; end if;
 n:=v::text::numeric;
 if (k='temperature_c' and (n < -100 or n > 250)) or (k='ac_v' and (n < 0 or n > 1000)) or (k in ('dc_busbar_v','bbu_v') and (n < -1000 or n > 1000)) then raise exception 'Reading outside supported measurement range'; end if;
 end loop;
 select * into saved from public.pmr_group_submissions where order_id=o.id and group_id=p_group;
 if coalesce(saved.revision,0) is distinct from p_revision then raise exception 'Group changed. Refresh before saving'; end if;
 insert into public.pmr_group_submissions(order_id,group_id,status,remarks,measurements) values(o.id,p_group,p_status,btrim(p_remarks),p_measurements)
 on conflict(order_id,group_id) do update set status=excluded.status,remarks=excluded.remarks,measurements=excluded.measurements,revision=pmr_group_submissions.revision+1,updated_at=clock_timestamp() returning * into saved;
 for e in select value from jsonb_array_elements(g->'etls') loop
 insert into public.pmr_results(id,owner_email,org_id,order_id,etl_code,instance,status,remarks,readings,tt,noc,updated_at)
 values(extensions.gen_random_uuid()::text,public.pmr_email(),o.org_id,o.id,e->>'code',p_group,p_status,btrim(p_remarks),case when p_measurements='{}' then '' else p_measurements::text end,'','',stamp)
 on conflict(order_id,etl_code,instance) do update set status=excluded.status,remarks=excluded.remarks,readings=excluded.readings,tt='',noc='',updated_at=excluded.updated_at;
 end loop;
 perform public.pmr_log(o.owner_email,o.org_id,o.id,'group-assessment',p_group||' '||p_status);
 return to_jsonb(saved);
end $$;
