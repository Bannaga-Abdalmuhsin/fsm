create or replace function public.pmr_submit_order(p_order text,p_expected_version int) returns void language plpgsql security definer set search_path='' as $$
declare o public.pmr_orders; begin
 o:=public.pmr_locked_order(p_order);
 if not exists(select 1 from public.pmr_group_submissions where order_id=o.id) then perform public.pmr_submit_order_legacy(p_order,p_expected_version); return; end if;
 if o.version is distinct from p_expected_version or o.status<>'In progress' then raise exception 'Start work and reload before submitting'; end if;
 if coalesce((o.inventory->>'admin_test')::boolean,false) then raise exception 'Admin tests cannot be submitted'; end if;
 if exists(select 1 from jsonb_array_elements(o.checklist) g where not exists(select 1 from public.pmr_group_submissions s where s.order_id=o.id and s.group_id=g->>'id')) then raise exception 'Save a result for every photo group'; end if;
 if exists (
   select 1
   from jsonb_array_elements(o.checklist) g
   join public.pmr_group_submissions s on s.order_id=o.id and s.group_id=g->>'id'
   where s.status in ('Pass','Fail') and (
     select count(*) from public.pmr_evidence e
     where e.order_id=o.id and e.group_id=s.group_id
       and e.state in ('Accepted','Supervisor review','Pending analysis')
   ) < coalesce(
     case when jsonb_typeof(g->'required_photos')='number' then
       case when (g->>'required_photos')::numeric between 1 and 9007199254740991
         and trunc((g->>'required_photos')::numeric)=(g->>'required_photos')::numeric
       then (g->>'required_photos')::numeric end
     end,
     greatest(1,ceil(jsonb_array_length(g->'etls')/2.0))
   )
 ) then raise exception 'Upload the required number of photos for each PASS or FAIL group'; end if;
 if exists(select 1 from public.pmr_evidence where order_id=o.id and state='Retake required') then raise exception 'Resolve photo retake requests before submission'; end if;
 perform set_config('pmr.workflow','on',true);
 update public.pmr_orders set status='Submitted',version=version+1,updated_at=public.pmr_iso(now()) where id=o.id;
 perform public.pmr_log(o.owner_email,o.org_id,o.id,'submit','group submission; pending QC remains pending');
end $$;
