-- Month discovery obeys the same per-user RLS as the issued register.
create function public.pmr_project_wo_periods() returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(p.period order by p.period desc),'[]'::jsonb) from (select distinct period from public.pmr_project_work_orders where present_in_source) p
$$;
revoke all on function public.pmr_project_wo_periods() from public,anon;
grant execute on function public.pmr_project_wo_periods() to authenticated;
