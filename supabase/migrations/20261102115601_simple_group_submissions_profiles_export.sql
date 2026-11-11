-- Simple field assessments retain the complete, frozen ETL mapping for office reporting.
create table public.pmr_group_submissions(
 order_id text not null references public.pmr_orders(id) on delete cascade,
 group_id text not null, status text not null check(status in ('Pass','Fail','Not applicable','Not tested')),
 remarks text not null default '', measurements jsonb not null default '{}',
 revision int not null default 1, updated_at timestamptz not null default now(),
 primary key(order_id,group_id)
);
alter table public.pmr_group_submissions enable row level security;
revoke all on public.pmr_group_submissions from public,anon,authenticated;
grant select on public.pmr_group_submissions to authenticated;
create policy pmr_group_read on public.pmr_group_submissions for select to authenticated using(exists(select 1 from public.pmr_orders o where o.id=order_id and (public.pmr_can_operate_order(o) or public.pmr_can_manage_order(o))));
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
 if (k='temperature_c' and (n < -100 or n > 250)) or (k<>'temperature_c' and (n < 0 or n > 1000)) then raise exception 'Reading outside supported measurement range'; end if;
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
-- Preserve legacy ETL submission behavior for older app versions.
alter function public.pmr_submit_order(text,int) rename to pmr_submit_order_legacy;
revoke all on function public.pmr_submit_order_legacy(text,int) from public,anon,authenticated;
create function public.pmr_submit_order(p_order text,p_expected_version int) returns void language plpgsql security definer set search_path='' as $$
declare o public.pmr_orders; begin
 o:=public.pmr_locked_order(p_order);
 if not exists(select 1 from public.pmr_group_submissions where order_id=o.id) then perform public.pmr_submit_order_legacy(p_order,p_expected_version); return; end if;
 if o.version is distinct from p_expected_version or o.status<>'In progress' then raise exception 'Start work and reload before submitting'; end if;
 if coalesce((o.inventory->>'admin_test')::boolean,false) then raise exception 'Admin tests cannot be submitted'; end if;
 if exists(select 1 from jsonb_array_elements(o.checklist) g where not exists(select 1 from public.pmr_group_submissions s where s.order_id=o.id and s.group_id=g->>'id')) then raise exception 'Save a result for every photo group'; end if;
 if exists(select 1 from public.pmr_group_submissions s where s.order_id=o.id and s.status in ('Pass','Fail') and not exists(select 1 from public.pmr_evidence e where e.order_id=o.id and e.group_id=s.group_id and e.state in ('Accepted','Supervisor review','Pending analysis'))) then raise exception 'Upload a photo for every PASS or FAIL group'; end if;
 if exists(select 1 from public.pmr_evidence where order_id=o.id and state='Retake required') then raise exception 'Resolve photo retake requests before submission'; end if;
 perform set_config('pmr.workflow','on',true);
 update public.pmr_orders set status='Submitted',version=version+1,updated_at=public.pmr_iso(now()) where id=o.id;
 perform public.pmr_log(o.owner_email,o.org_id,o.id,'submit','group submission; pending QC remains pending');
end $$;
-- Remarks and ticket references remain optional for the simplified group workflow.
create or replace function public.pmr_review_result(p_result text,p_expected_updated_at text,p_decision text,p_note text) returns void language plpgsql security definer set search_path='' as $$
declare r public.pmr_results; o public.pmr_orders; review_level text; begin
 select * into r from public.pmr_results where id=p_result for update;
 select * into o from public.pmr_orders where id=r.order_id for update;
 if o.id is null then raise exception 'ETL result not found'; end if;
 review_level:=public.pmr_review_stage(o);
 if o.status='Approved' then raise exception 'Return the approved PMR before changing ETL reviews'; end if;
 if r.updated_at<>p_expected_updated_at then raise exception 'ETL changed. Refresh and retry.'; end if;
 if p_decision not in ('approved','returned') then raise exception 'Invalid decision'; end if;
 if p_decision='returned' and coalesce(btrim(p_note),'')='' then raise exception 'Return reason required'; end if;
 if p_decision='approved' then
 if not exists(select 1 from public.pmr_group_submissions where order_id=o.id and group_id=r.instance) then
 if r.status='Fail' and btrim(r.tt)='' then raise exception 'FAIL needs a TT'; end if;
 if r.status in ('Not applicable','Not tested') and btrim(r.remarks)='' then raise exception 'Exception reason required'; end if;
 end if;
 if review_level='regional_manager' and not exists(select 1 from public.pmr_review_events v where v.kind='etl' and v.target_id=r.id and v.stage='team_leader' and v.decision='approved' and v.fingerprint=r.updated_at) then raise exception 'Team leader must approve this ETL first'; end if;
 end if;
 insert into public.pmr_review_events values(o.id,'etl',r.id,review_level,p_decision,r.updated_at,left(coalesce(p_note,''),2000),public.pmr_email(),now()) on conflict(kind,target_id,stage) do update set decision=excluded.decision,fingerprint=excluded.fingerprint,note=excluded.note,reviewer=excluded.reviewer,reviewed_at=now();
 if p_decision='returned' and o.status in ('Submitted','Leader approved') then
 perform set_config('pmr.workflow','on',true);
 update public.pmr_orders set status='In progress',review_note=left(p_note,2000),version=version+1,updated_at=public.pmr_iso(now()) where id=o.id;
 end if;
 perform public.pmr_log(o.owner_email,o.org_id,o.id,'etl-review',review_level||' '||p_decision||' '||r.etl_code);
end $$;
create table public.pmr_profiles(
 user_id uuid primary key references auth.users(id) on delete cascade,
 org_id text not null, name text not null default '', mobile text not null default '',
 avatar_path text, locale text not null default 'en' check(locale in ('en','hi','ur','ar')),
 updated_at timestamptz not null default now()
);
alter table public.pmr_profiles enable row level security;
revoke all on public.pmr_profiles from public,anon,authenticated;
grant select on public.pmr_profiles to authenticated;
create policy pmr_profile_read on public.pmr_profiles for select to authenticated using(user_id=auth.uid() or exists(select 1 from public.pmr_me() m where m.org_id=pmr_profiles.org_id and m.role in ('admin','supervisor','team_leader','regional_manager')));
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('pmr-profiles','pmr-profiles',false,2097152,array['image/jpeg','image/png']) on conflict(id) do nothing;
create policy pmr_avatar_read on storage.objects for select to authenticated using(bucket_id='pmr-profiles' and name like auth.uid()::text||'/%' and exists(select 1 from public.pmr_me()));
create policy pmr_avatar_insert on storage.objects for insert to authenticated with check(bucket_id='pmr-profiles' and name like auth.uid()::text||'/%' and exists(select 1 from public.pmr_me()));
create policy pmr_avatar_delete on storage.objects for delete to authenticated using(bucket_id='pmr-profiles' and name like auth.uid()::text||'/%' and exists(select 1 from public.pmr_me()));
create function public.pmr_save_profile(p_name text,p_mobile text,p_locale text,p_avatar text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.pmr_members; p public.pmr_profiles; begin
 select * into m from public.pmr_me(); if m.id is null then raise exception 'Provisioned account required'; end if;
 if p_name is null or length(btrim(p_name))>120 or p_mobile is null or length(p_mobile)>32 or (p_mobile<>'' and p_mobile !~ '^[+0-9 ()-]{3,32}$') or p_locale is null or p_locale not in ('en','hi','ur','ar') then raise exception 'Invalid profile details'; end if;
 if p_avatar is not null and (p_avatar !~ ('^'||auth.uid()::text||'/[0-9a-f-]+\.jpg$') or not exists(select 1 from storage.objects where bucket_id='pmr-profiles' and name=p_avatar)) then raise exception 'Upload your own profile image first'; end if;
 insert into public.pmr_profiles(user_id,org_id,name,mobile,locale,avatar_path) values(auth.uid(),m.org_id,btrim(p_name),btrim(p_mobile),p_locale,p_avatar)
 on conflict(user_id) do update set name=excluded.name,mobile=excluded.mobile,locale=excluded.locale,avatar_path=excluded.avatar_path,updated_at=now() returning * into p;
 return to_jsonb(p);
end $$;
create function public.pmr_export_snapshot(p_order text) returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.pmr_orders; begin
 select * into o from public.pmr_orders where id=p_order;
 if o.id is null or not public.pmr_can_manage_order(o) then raise exception 'Office access to this work order required'; end if;
 perform public.pmr_log(o.owner_email,o.org_id,o.id,'export','WO submission package requested');
 return jsonb_build_object('order',to_jsonb(o),'groups',coalesce((select jsonb_agg(s order by s.group_id) from public.pmr_group_submissions s where s.order_id=o.id),'[]'),
 'results',coalesce((select jsonb_agg(r order by r.instance,r.etl_code) from public.pmr_results r where r.order_id=o.id),'[]'),
 'evidence',coalesce((select jsonb_agg(e order by e.group_id,e.captured_at) from public.pmr_evidence e where e.order_id=o.id and e.state<>'Superseded'),'[]'),
 'reviews',coalesce((select jsonb_agg(v) from public.pmr_review_events v where v.order_id=o.id),'[]'),
 'profile',(select to_jsonb(p)-'user_id'-'avatar_path'-'org_id' from public.pmr_profiles p join auth.users u on u.id=p.user_id where lower(u.email)=lower(o.assignee) and p.org_id=o.org_id), 'exported_at',now());
end $$;
revoke all on function public.pmr_save_group(text,text,text,text,jsonb,int),public.pmr_submit_order(text,int),public.pmr_save_profile(text,text,text,text),public.pmr_export_snapshot(text) from public,anon;
grant execute on function public.pmr_save_group(text,text,text,text,jsonb,int),public.pmr_submit_order(text,int),public.pmr_save_profile(text,text,text,text),public.pmr_export_snapshot(text) to authenticated;
