-- 3004: admins add an existing student to any class from People & roles. Owner: Aryan.
-- Reuses _join_class (1003), so the same rules apply as when a student joins with a code:
-- no duplicate enrollment, one class per course, and self-paced progress moves into the class.
create function admin_enroll_student(p_student uuid, p_class uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_code text;
begin
  if not current_role_is('admin') then
    raise exception 'ADMINS_ONLY';
  end if;
  if not exists (select 1 from profiles where id = p_student and role = 'student') then
    raise exception 'STUDENTS_ONLY';
  end if;
  select join_code into v_code from classes where id = p_class;
  if v_code is null then
    raise exception 'BAD_CLASS';
  end if;
  perform _join_class(p_student, v_code);
end
$$;

revoke all on function admin_enroll_student(uuid, uuid) from public, anon;
grant execute on function admin_enroll_student(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
