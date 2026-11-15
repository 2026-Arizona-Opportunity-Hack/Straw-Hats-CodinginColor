-- Reserve a paid image attempt for a generated draft across API instances.
create table public.curriculum_image_quota (
  owner_id uuid not null references public.profiles(id) on delete cascade,
  draft_id uuid not null,
  expires_at timestamptz not null,
  attempts integer not null check (attempts between 1 and 5),
  primary key (owner_id, draft_id)
);

alter table public.curriculum_image_quota enable row level security;
revoke all on public.curriculum_image_quota from public, anon, authenticated;

create function public.reserve_curriculum_image(p_draft_id uuid, p_expires_at timestamptz)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  remaining integer;
begin
  if caller is null or not exists (
    select 1 from public.profiles p where p.id = caller and p.role in ('instructor', 'admin')
  ) then
    raise exception 'Instructor or admin required' using errcode = '42501';
  end if;
  if p_draft_id is null or p_expires_at is null or p_expires_at <= now()
    or p_expires_at > now() + interval '8 hours 5 minutes' then
    raise exception 'A current draft is required' using errcode = '22023';
  end if;

  delete from public.curriculum_image_quota where owner_id = caller and expires_at <= now();
  insert into public.curriculum_image_quota as quota (owner_id, draft_id, expires_at, attempts)
  values (caller, p_draft_id, p_expires_at, 1)
  on conflict (owner_id, draft_id) do update set attempts = quota.attempts + 1,
    expires_at = greatest(quota.expires_at, excluded.expires_at)
  where quota.attempts < 5
  returning 5 - quota.attempts into remaining;
  return remaining;
end;
$$;

revoke all on function public.reserve_curriculum_image(uuid, timestamptz) from public, anon;
grant execute on function public.reserve_curriculum_image(uuid, timestamptz) to authenticated;
