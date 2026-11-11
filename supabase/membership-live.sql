
create or replace function public.pmr_membership() returns jsonb language plpgsql stable security definer set search_path='' as $function$
declare v_email text; v_org text; v_count integer; m public.pmr_members%rowtype;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 select lower(u.email) into v_email from auth.users u where u.id=auth.uid() and u.email_confirmed_at is not null;
 if v_email is null then return jsonb_build_object('state','unprovisioned'); end if;
 v_org:=nullif(auth.jwt()->'app_metadata'->>'pmr_org_id','');
 select count(*) into v_count from public.pmr_members x where lower(x.owner_email)=v_email and(v_org is null or x.org_id=v_org);
 if v_count=0 then return jsonb_build_object('state','unprovisioned'); elsif v_count>1 then return jsonb_build_object('state','ambiguous'); end if;
 select * into m from public.pmr_members x where lower(x.owner_email)=v_email and(v_org is null or x.org_id=v_org);
 return jsonb_build_object('state','ready','member',jsonb_build_object('owner_email',m.owner_email,'org_id',m.org_id,'role',m.role,'regions',m.regions,'teams',m.teams));
end $function$;
revoke all on function public.pmr_membership() from public,anon;
grant execute on function public.pmr_membership() to authenticated;
notify pgrst,'reload schema';
