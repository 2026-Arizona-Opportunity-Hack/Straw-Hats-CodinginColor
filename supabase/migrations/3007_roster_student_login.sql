-- Login cards authenticate through the server-only roster-login Edge Function.
-- Auth users are provisioned with the Auth admin API, never by writing auth tables.
create schema if not exists private;
create table private.roster_login_limits (
  bucket text primary key,
  started_at timestamptz not null,
  attempts integer not null
);
alter table private.roster_login_limits enable row level security;
revoke all on private.roster_login_limits from public, anon, authenticated;

create function private.roster_login_allow(p_bucket text, p_limit integer) returns boolean
language plpgsql set search_path = '' as $$
declare v_attempts integer;
begin
  insert into private.roster_login_limits as limits values (p_bucket, now(), 1)
  on conflict (bucket) do update set
    started_at = case when limits.started_at < now() - interval '15 minutes' then now() else limits.started_at end,
    attempts = case when limits.started_at < now() - interval '15 minutes' then 1 else least(limits.attempts + 1, p_limit + 1) end
  returning attempts into v_attempts;
  return v_attempts <= p_limit;
end $$;
revoke all on function private.roster_login_allow(text, integer) from public, anon, authenticated;

-- Return denied attempts rather than raising: exceptions would roll back the throttle.
create function prepare_roster_login(p_class_code text, p_passcode text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_code text := upper(trim(coalesce(p_class_code, '')));
  v_class public.classes%rowtype;
  v_student public.class_students%rowtype;
  v_id uuid;
  v_email text;
  v_class_allowed boolean;
  v_card_allowed boolean;
begin
  if length(v_code) not between 1 and 100 or coalesce(p_passcode, '') !~ '^[0-9]{6}$' then
    return '{"error":"INVALID_LOGIN"}'::jsonb;
  end if;
  select * into v_class from public.classes where upper(join_code) = v_code and archived_at is null;
  if not found then return '{"error":"INVALID_LOGIN"}'::jsonb; end if;
  -- A class ceiling bounds attempts that rotate through different six-digit cards.
  -- Remove expired buckets so guesses cannot grow this private table indefinitely.
  delete from private.roster_login_limits where started_at < now() - interval '1 day';
  v_class_allowed := private.roster_login_allow('class:' || encode(extensions.digest(v_code, 'sha256'), 'hex'), 120);
  if not v_class_allowed then return '{"error":"TRY_LATER"}'::jsonb; end if;
  v_card_allowed := private.roster_login_allow('card:' || encode(extensions.digest(v_code || ':' || p_passcode, 'sha256'), 'hex'), 10);
  if not v_card_allowed then return '{"error":"TRY_LATER"}'::jsonb; end if;
  select * into v_student from public.class_students where class_id = v_class.id and passcode = p_passcode;
  if not found then return '{"error":"INVALID_LOGIN"}'::jsonb; end if;
  v_email := v_student.id::text || '@students.cic.invalid';
  v_id := v_student.profile_id;
  if v_id is null then
    -- Recover an interrupted provisioning attempt only when its server-owned marker matches.
    select id into v_id from auth.users where email = v_email
      and raw_app_meta_data ->> 'cic_roster_id' = v_student.id::text;
  else
    select email into v_email from auth.users where id = v_id;
  end if;
  if v_id is not null and not exists (select 1 from public.profiles where id = v_id and role = 'student' and archived_at is null) then
    return '{"error":"INVALID_LOGIN"}'::jsonb;
  end if;
  return jsonb_build_object('roster_id', v_student.id, 'profile_id', v_id, 'email', v_email);
end $$;

create function bind_roster_login(p_roster_id uuid, p_class_code text, p_passcode text, p_profile_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_student public.class_students%rowtype;
  v_class public.classes%rowtype;
  v_email text;
  v_marker text;
begin
  -- Revalidate after the Auth request and serialize competing first logins.
  select * into v_student from public.class_students where id = p_roster_id for update;
  if not found or v_student.passcode is distinct from p_passcode then return '{"error":"INVALID_LOGIN"}'::jsonb; end if;
  select * into v_class from public.classes where id = v_student.class_id and archived_at is null for share;
  if not found or upper(v_class.join_code) is distinct from upper(trim(p_class_code)) then return '{"error":"INVALID_LOGIN"}'::jsonb; end if;
  perform 1 from public.profiles where id = p_profile_id and role = 'student' and archived_at is null for share;
  if not found then return '{"error":"INVALID_LOGIN"}'::jsonb; end if;
  select email, raw_app_meta_data ->> 'cic_roster_id' into v_email, v_marker from auth.users where id = p_profile_id;
  if v_email is null or (v_student.profile_id is not null and v_student.profile_id <> p_profile_id)
     or (v_student.profile_id is null and (v_email <> p_roster_id::text || '@students.cic.invalid' or v_marker is distinct from p_roster_id::text)) then
    return '{"error":"INVALID_LOGIN"}'::jsonb;
  end if;
  if v_student.profile_id is null then
    update public.profiles set display_name = v_student.display_name, school = v_class.school where id = p_profile_id;
    -- Link first: the enrollment trigger then reuses this row instead of duplicating it.
    update public.class_students set profile_id = p_profile_id where id = p_roster_id;
  end if;
  if not exists (select 1 from public.enrollments where class_id = v_class.id and student_id = p_profile_id) then
    perform public._join_class(p_profile_id, v_class.join_code);
  end if;
  return jsonb_build_object('profile_id', p_profile_id, 'email', v_email);
end $$;

revoke all on function prepare_roster_login(text, text) from public, anon, authenticated;
revoke all on function bind_roster_login(uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function prepare_roster_login(text, text) to service_role;
grant execute on function bind_roster_login(uuid, text, text, uuid) to service_role;

-- Owning a class must not let a client point a login card at someone else's account.
-- The existing enrollment trigger and the service-only binder run as trusted definers.
create function guard_roster_profile_link() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user in ('anon', 'authenticated') and new.profile_id is not null
     and (tg_op = 'INSERT' or new.profile_id is distinct from old.profile_id) then
    raise exception 'ROSTER_IDENTITY_MANAGED_BY_SERVER';
  end if;
  return new;
end $$;
create trigger guard_roster_profile_link before insert or update of profile_id on class_students
  for each row execute function guard_roster_profile_link();
revoke all on function guard_roster_profile_link() from public, anon, authenticated;
