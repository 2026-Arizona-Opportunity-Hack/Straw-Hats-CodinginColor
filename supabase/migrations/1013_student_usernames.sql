-- 1013 student usernames. Owner: Shivraj. Append-only after merge.
--
-- Students are minors: we keep name, school and class only, no email. A student signs up
-- with first name, last name, password and an optional class code, and gets a username
-- in the ASURITE style: first initial + last name + the lowest free number (jsmith1,
-- jsmith2, ... jsmith10). Supabase Auth still needs an email, so each student account
-- uses a hidden address <username>@students.cic-learn.invalid. The .invalid domain is
-- reserved (RFC 2606): it can never receive mail, and it is never shown.
--
-- Google sign-in is now for K-12 educators: a new Google account gets the reviewer role.
-- Staff accounts are unchanged (email + password, created by an admin).

-- ---------------------------------------------------------------------------
-- 1. Username column
-- ---------------------------------------------------------------------------
alter table profiles add column username text unique
  check (username ~ '^[a-z][a-z0-9]{1,39}$');

-- ---------------------------------------------------------------------------
-- 2. Username generator
-- ---------------------------------------------------------------------------
-- Letters only, common accents folded (José Núñez -> jnunez). Empty -> 'student'.
create function _username_base(p_first text, p_last text) returns text
language sql immutable set search_path = public as $$
  with clean as (
    select regexp_replace(translate(lower(coalesce(p_first, '')),
             'áàâäãåéèêëíìîïóòôöõúùûüñçý', 'aaaaaaeeeeiiiiooooouuuuncy'), '[^a-z]', '', 'g') as f,
           regexp_replace(translate(lower(coalesce(p_last, '')),
             'áàâäãåéèêëíìîïóòôöõúùûüñçý', 'aaaaaaeeeeiiiiooooouuuuncy'), '[^a-z]', '', 'g') as l
  )
  select left(coalesce(nullif(left(f, 1) || l, ''), 'student'), 20) from clean
$$;

-- Lowest free number for the base. The advisory lock makes two sign-ups with the same
-- name wait for each other instead of picking the same number.
create function _next_username(p_first text, p_last text) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_base text := _username_base(p_first, p_last);
  v_n int := 1;
begin
  perform pg_advisory_xact_lock(hashtext('cic-username:' || v_base));
  while exists (select 1 from profiles where username = v_base || v_n) loop
    v_n := v_n + 1;
  end loop;
  return v_base || v_n;
end
$$;

revoke all on function _username_base(text, text) from public, anon, authenticated;
revoke all on function _next_username(text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Internal: create a student account with a username
-- ---------------------------------------------------------------------------
-- Reuses student_sign_up (1003) for the auth rows and the class join. The school comes
-- from the class when the student joins one.
create function _create_student(p_first text, p_last text, p_password text, p_class_code text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_first text := trim(coalesce(p_first, ''));
  v_last text := trim(coalesce(p_last, ''));
  v_username text;
  v_result jsonb;
  v_id uuid;
begin
  if char_length(v_first) not between 1 and 50 or char_length(v_last) > 50
     or (v_first || v_last) !~ '[[:alpha:]]' then
    raise exception 'BAD_NAME';
  end if;
  v_username := _next_username(v_first, v_last);
  v_result := student_sign_up(v_username || '@students.cic-learn.invalid', p_password,
    trim(v_first || ' ' || v_last), null, p_class_code);
  v_id := (v_result ->> 'user_id')::uuid;
  update profiles p set username = v_username,
    school = coalesce(p.school, (select c.school from classes c where c.id = (v_result -> 'class' ->> 'class_id')::uuid))
  where p.id = v_id;
  return v_result || jsonb_build_object('username', v_username);
end
$$;

revoke all on function _create_student(text, text, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Public: student sign-up (signed out) and admin "add student"
-- ---------------------------------------------------------------------------
create function student_create_account(
  p_first_name text, p_last_name text, p_password text, p_class_code text default null
) returns jsonb
language sql security definer set search_path = public as $$
  select _create_student(p_first_name, p_last_name, p_password, p_class_code)
$$;

revoke all on function student_create_account(text, text, text, text) from public;
grant execute on function student_create_account(text, text, text, text) to anon, authenticated;

create function admin_create_student(
  p_first_name text, p_last_name text, p_password text, p_class_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_code text;
begin
  if not current_role_is('admin') then
    raise exception 'ADMINS_ONLY';
  end if;
  if p_class_id is not null then
    select join_code into v_code from classes where id = p_class_id;
    if v_code is null then
      raise exception 'BAD_CLASS';
    end if;
  end if;
  return _create_student(p_first_name, p_last_name, p_password, v_code);
end
$$;

revoke all on function admin_create_student(text, text, text, uuid) from public, anon;
grant execute on function admin_create_student(text, text, text, uuid) to authenticated;

-- Email sign-up is no longer open to the public: students use student_create_account and
-- staff accounts come from admin_create_user (3002/3003), which calls this internally.
revoke execute on function student_sign_up(text, text, text, text, text) from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. New auth users: Google = K-12 educator (reviewer), everything else = student
-- ---------------------------------------------------------------------------
create or replace function handle_new_auth_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, role, display_name)
  values (
    new.id,
    case when new.raw_app_meta_data ->> 'provider' = 'google' then 'reviewer' else 'student' end::user_role,
    left(coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Educator'), 100))
  on conflict (id) do nothing;
  return new;
end
$$;

notify pgrst, 'reload schema';
