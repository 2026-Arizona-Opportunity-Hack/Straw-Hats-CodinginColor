-- 3003: admins can also add other admins from People & roles. Owner: Aryan.
-- Replaces admin_create_user (3002); grants are kept. Reviewers still sign up themselves
-- and an admin changes their role in the directory.
create or replace function admin_create_user(
  p_email text,
  p_password text,
  p_display_name text,
  p_role user_role,
  p_school text default null,
  p_class_id uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_code text;
  v_id uuid;
begin
  if not current_role_is('admin') then
    raise exception 'ADMINS_ONLY';
  end if;
  if p_role not in ('student', 'instructor', 'admin') then
    raise exception 'BAD_ROLE';
  end if;
  if p_class_id is not null and p_role <> 'admin' then
    select join_code into v_code from classes where id = p_class_id;
    if v_code is null then
      raise exception 'BAD_CLASS';
    end if;
  end if;

  v_id := (student_sign_up(p_email, p_password, p_display_name, p_school,
    case when p_role = 'student' then v_code end) ->> 'user_id')::uuid;

  if p_role <> 'student' then
    update profiles set role = p_role where id = v_id;
  end if;
  if p_role = 'instructor' and v_code is not null then
    insert into class_instructors (class_id, instructor_id) values (p_class_id, v_id);
  end if;
  return v_id;
end
$$;

notify pgrst, 'reload schema';
