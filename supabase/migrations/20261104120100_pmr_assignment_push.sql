create table public.pmr_push_devices (
  token text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  org_id text not null,
  email text not null,
  updated_at timestamptz not null default now()
);
create table public.pmr_assignment_push (
  id bigint generated always as identity primary key,
  order_id text not null references public.pmr_orders(id) on delete cascade,
  token text not null references public.pmr_push_devices(token) on delete cascade,
  user_id uuid not null,
  attempts int not null default 0,
  ready_at timestamptz not null default now(),
  finished_at timestamptz
);
alter table public.pmr_push_devices enable row level security;
alter table public.pmr_assignment_push enable row level security;
revoke all on public.pmr_push_devices, public.pmr_assignment_push from public, anon, authenticated;
create index pmr_push_devices_assignee on public.pmr_push_devices(org_id, email);
create index pmr_assignment_push_ready on public.pmr_assignment_push(ready_at) where finished_at is null;

create function public.pmr_register_push_device(p_token text)
returns void language plpgsql security definer set search_path='' as $$
declare member public.pmr_members;
begin
  select * into member from public.pmr_me();
  if auth.uid() is null or member.role is distinct from 'technician' then
    raise exception 'Technician membership required';
  end if;
  if p_token is null or length(p_token)>256
     or p_token !~ '^(Expo|Exponent)PushToken\[[A-Za-z0-9_-]+\]$' then
    raise exception 'Invalid Expo push token';
  end if;
  insert into public.pmr_push_devices(token,user_id,org_id,email)
  values(p_token,auth.uid(),member.org_id,public.pmr_email())
  on conflict(token) do update set
    user_id=excluded.user_id, org_id=excluded.org_id,
    email=excluded.email, updated_at=now();
end $$;

create function public.pmr_unregister_push_device(p_token text)
returns void language sql security definer set search_path='' as $$
  delete from public.pmr_push_devices where token=p_token and user_id=auth.uid();
$$;

create function public.pmr_enqueue_assignment_push()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.status <> 'Assigned' or coalesce(new.inventory->>'admin_test','false')='true' then
    return new;
  end if;
  if tg_op='UPDATE' then
    if lower(new.assignee) is not distinct from lower(old.assignee)
       and new.status is not distinct from old.status then
      return new;
    end if;
  end if;
  insert into public.pmr_assignment_push(order_id,token,user_id)
  select new.id, d.token, d.user_id from public.pmr_push_devices d
  where d.org_id=new.org_id and d.email=lower(new.assignee);
  return new;
end $$;

create trigger pmr_enqueue_assignment_push
after insert or update of assignee,status on public.pmr_orders
for each row execute function public.pmr_enqueue_assignment_push();

-- Check assignment and membership again before leasing queued notifications.
create function public.pmr_claim_assignment_push()
returns table(id bigint, token text, attempts int)
language sql security definer set search_path='' as $$
  with available as (
    select q.id from public.pmr_assignment_push q
    join public.pmr_orders o on o.id=q.order_id
    join public.pmr_push_devices d on d.token=q.token and d.user_id=q.user_id
    where q.finished_at is null and q.ready_at<=now() and q.attempts<5
      and o.status='Assigned' and d.org_id=o.org_id and d.email=lower(o.assignee)
      and exists(select 1 from public.pmr_members m
                 where m.org_id=d.org_id and lower(m.owner_email)=d.email
                   and m.role='technician' and m.regions @> jsonb_build_array(o.region))
    order by q.ready_at,q.id limit 50 for update of q skip locked
  )
  update public.pmr_assignment_push q
  set attempts=q.attempts+1, ready_at=now()+interval '2 minutes'
  from available a where q.id=a.id
  returning q.id,q.token,q.attempts;
$$;

revoke all on function public.pmr_register_push_device(text),
  public.pmr_unregister_push_device(text), public.pmr_enqueue_assignment_push(),
  public.pmr_claim_assignment_push() from public, anon, authenticated;
grant execute on function public.pmr_register_push_device(text),
  public.pmr_unregister_push_device(text) to authenticated;
grant execute on function public.pmr_claim_assignment_push() to service_role;

grant select, update on public.pmr_assignment_push to service_role;
