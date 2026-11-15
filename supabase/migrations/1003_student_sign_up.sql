-- 1003 student sign-up: a profile for every new login, email + password sign-up
-- without a confirmation email, and joining a class with a code.
-- Owner: Shivraj. Append-only after merge.
--
-- Google sign-in creates the auth user through Supabase Auth; the trigger below
-- gives it a student profile. Email + password sign-up goes through
-- student_sign_up(), which creates an already-confirmed account (Supabase's
-- built-in mailer cannot reach students). Nobody can sign up as staff: every
-- new profile is a student, and an admin changes the role.

-- ---------------------------------------------------------------------------
-- 1. Every new auth user gets a student profile
-- ---------------------------------------------------------------------------
create function handle_new_auth_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, role, display_name)
  values (
    new.id,
    'student',
    left(coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Student'), 100))
  on conflict (id) do nothing;
  return new;
end
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_auth_user();

revoke all on function handle_new_auth_user() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Join a class with its code (shared by sign-up and the student home page)
-- ---------------------------------------------------------------------------
-- Internal: enrolls p_student. If they were taking the class's course on their
-- own, their progress moves into the class and the self-chosen copy is removed.
create function _join_class(p_student uuid, p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_class classes%rowtype;
begin
  select * into v_class from classes where upper(join_code) = upper(trim(coalesce(p_code, '')));
  if not found then
    raise exception 'BAD_CLASS_CODE';
  end if;
  if exists (select 1 from enrollments where class_id = v_class.id and student_id = p_student) then
    raise exception 'ALREADY_IN_CLASS';
  end if;
  if _class_for(p_student, v_class.course_id) is not null then
    raise exception 'COURSE_ALREADY_IN_ANOTHER_CLASS';
  end if;

  insert into enrollments (class_id, student_id) values (v_class.id, p_student);

  update activity_attempts t set class_id = v_class.id
  from activities a
  join lessons l on l.id = a.lesson_id
  join modules m on m.id = l.module_id
  where t.activity_id = a.id and t.student_id = p_student and t.class_id is null
    and m.course_id = v_class.course_id;
  delete from course_enrollments where student_id = p_student and course_id = v_class.course_id;

  return jsonb_build_object('class_id', v_class.id, 'class_name', v_class.name, 'course_id', v_class.course_id);
end
$$;

revoke all on function _join_class(uuid, text) from public, anon, authenticated;

create function join_class(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not current_role_is('student') then
    raise exception 'STUDENTS_ONLY';
  end if;
  return _join_class(auth.uid(), p_code);
end
$$;

revoke all on function join_class(text) from public, anon;
grant execute on function join_class(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Email + password sign-up (callable while signed out)
-- ---------------------------------------------------------------------------
-- Creates a confirmed account, a student profile, and (optionally) joins a
-- class. Everything happens in one transaction: a bad class code means no
-- account. The app signs in with supabase.auth.signInWithPassword afterwards.
create function student_sign_up(
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
    jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
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

revoke all on function student_sign_up(text, text, text, text, text) from public;
grant execute on function student_sign_up(text, text, text, text, text) to anon, authenticated;
