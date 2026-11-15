-- Reconcile student privacy with 1013 username accounts and educator Google.
-- 3006 is retained unchanged. Only this private helper mints the username marker;
-- public callers cannot choose an email or app_metadata through _create_student.
-- Keep the historical direct Auth inserts in this existing signup helper. Roster
-- accounts continue to use the supported Auth admin API (3007 / roster-login).
create or replace function public.student_sign_up(
  p_email text,
  p_password text,
  p_display_name text,
  p_school text default null,
  p_class_code text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_name text := trim(coalesce(p_display_name, ''));
  v_school text := nullif(trim(coalesce(p_school, '')), '');
  v_code text := nullif(trim(coalesce(p_class_code, '')), '');
  v_id uuid := gen_random_uuid();
  v_class jsonb;
begin
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_email) > 254 then
    raise exception 'BAD_EMAIL';
  end if;
  if char_length(coalesce(p_password, '')) not between 8 and 72 then
    raise exception 'BAD_PASSWORD';
  end if;
  if char_length(v_name) not between 1 and 100 then
    raise exception 'BAD_NAME';
  end if;
  if char_length(coalesce(v_school, '')) > 120 then
    raise exception 'BAD_SCHOOL';
  end if;
  if v_code is not null and not exists (select 1 from classes where upper(join_code) = upper(v_code)) then
    raise exception 'BAD_CLASS_CODE';
  end if;
  if exists (select 1 from auth.users where lower(email) = v_email) then
    raise exception 'EMAIL_TAKEN';
  end if;

  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change)
  values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_email,
    extensions.crypt(p_password, extensions.gen_salt('bf')), now(),
    jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')) ||
      case when v_email ~ '^[a-z][a-z0-9]{1,39}@students[.]cic-learn[.]invalid$'
        then jsonb_build_object('cic_username', split_part(v_email, '@', 1)) else '{}'::jsonb end,
    jsonb_build_object('display_name', v_name), now(), now(), '', '', '', '');
  insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (v_id::text, v_id, jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true),
    'email', now(), now(), now());

  -- The trigger made the profile; add the school.
  update profiles set display_name = v_name, school = v_school where id = v_id;

  if v_code is not null then
    v_class := _join_class(v_id, v_code);
  end if;

  return jsonb_build_object('user_id', v_id, 'class', v_class);
end
$$;


create or replace function public.guard_student_email() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if (new.email is not distinct from old.email and
        new.email_change is not distinct from old.email_change)
      or not exists (select 1 from public.profiles where id = old.id and role = 'student') then
      return new;
    end if;
    -- Clearing a pending change does not collect a new address.
    if new.email is not distinct from old.email and nullif(new.email_change, '') is null then
      return new;
    end if;
  else
    -- Trusted SQL administration includes local seed/backfill operations.
    -- App staff creation is restricted to admins by admin_create_user above.
    if session_user = 'postgres' or public.current_role_is('admin') then return new; end if;
    -- Supabase owns app_metadata; client user_metadata is never trusted.
    -- Google users become reviewers in 1013's handle_new_auth_user trigger.
    if new.raw_app_meta_data->>'provider' = 'google' then return new; end if;
    if new.raw_app_meta_data->>'cic_username' ~ '^[a-z][a-z0-9]{1,39}$'
      and new.email = (new.raw_app_meta_data->>'cic_username') || '@students.cic-learn.invalid'
      and nullif(new.email_change, '') is null then return new; end if;
    if exists (
      select 1 from public.class_students r
      where r.id::text = new.raw_app_meta_data->>'cic_roster_id'
        and new.email = r.id::text || '@students.cic.invalid'
        and nullif(new.email_change, '') is null
    ) then return new; end if;
  end if;
  raise exception 'STUDENT_ROSTER_REQUIRED';
end $$;
-- CREATE OR REPLACE retains ACLs; make the private boundary explicit as well.
revoke all on function public.student_sign_up(text, text, text, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.guard_student_email() from public, anon, authenticated, service_role;
notify pgrst, 'reload schema';
