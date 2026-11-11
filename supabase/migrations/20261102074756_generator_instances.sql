-- Declare actual equipment counts before check-in; freeze repeated group instances with the WO.
create or replace function public.pmr_set_generator_count(p_order text,p_expected_version int,p_count int)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.pmr_orders; base jsonb; expanded jsonb:='[]'; g jsonb; n int; repeated boolean;
begin
 o:=public.pmr_locked_order(p_order);
 if o.version is distinct from p_expected_version or o.status<>'Assigned' then raise exception 'Equipment inventory can change only before check-in; refresh the WO'; end if;
 if p_count is null or p_count not between 1 and 10 then raise exception 'Generator count must be 1 to 10'; end if;
 select checklist into base from public.pmr_checklist_catalogue where site_type=o.site_type;
 if base is null then raise exception 'Checklist catalogue unavailable'; end if;
 for g in select value from jsonb_array_elements(base) loop
 repeated:=g->>'id'=any(case when o.site_type='ODU' then array['O07','O08','O09','O10','O11'] else array['S14','S15','S16','S17','S18'] end);
 for n in 1..case when repeated then p_count else 1 end loop
 expanded:=expanded||jsonb_build_array(case when repeated then g||jsonb_build_object('id',g->>'id'||case when n=1 then '' else '_GEN'||n end,'title',(g->>'title')||' · Generator '||n) else g end);
 end loop; end loop;
 update public.pmr_orders set checklist=expanded,inventory=inventory||jsonb_build_object('generators',p_count,'declared_by',public.pmr_email(),'declared_at',public.pmr_iso(now())),version=version+1,updated_at=public.pmr_iso(now()) where id=o.id returning * into o;
 perform public.pmr_log(o.owner_email,o.org_id,o.id,'equipment-inventory','Generator count '||p_count);
 return to_jsonb(o);
end $$;
revoke all on function public.pmr_set_generator_count(text,int,int) from public,anon;
grant execute on function public.pmr_set_generator_count(text,int,int) to authenticated;
