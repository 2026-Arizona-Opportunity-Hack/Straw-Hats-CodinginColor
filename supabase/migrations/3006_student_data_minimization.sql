-- New students use teacher-issued roster cards, never a personal email.
-- Retain the old helper privately for the authorized staff-creation RPC.
revoke all on function public.student_sign_up(text, text, text, text, text)
  from public, anon, authenticated, service_role;

create or replace function public.admin_create_user(
  p_email text, p_password text, p_display_name text, p_role public.user_role,
  p_school text default null, p_class_id uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not current_role_is('admin') then raise exception 'ADMINS_ONLY'; end if;
  if p_role not in ('instructor', 'admin', 'reviewer') then
    raise exception 'USE_STUDENT_ROSTER';
  end if;
  if p_class_id is not null and p_role = 'instructor'
    and not exists (select 1 from classes where id = p_class_id) then
    raise exception 'BAD_CLASS';
  end if;
  v_id := (student_sign_up(p_email, p_password, p_display_name, p_school, null)->>'user_id')::uuid;
  update profiles set role = p_role where id = v_id;
  if p_class_id is not null and p_role = 'instructor' then
    insert into class_instructors (class_id, instructor_id) values (p_class_id, v_id);
  end if;
  return v_id;
end $$;

-- Also close direct Supabase email/OAuth signup and student email-change paths.
-- app_metadata is server-controlled; user_metadata must never authorize this.
create function public.guard_student_email() returns trigger
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
    if exists (
      select 1 from public.class_students r
      where r.id::text = new.raw_app_meta_data->>'cic_roster_id'
        and new.email = r.id::text || '@students.cic.invalid'
        and nullif(new.email_change, '') is null
    ) then return new; end if;
  end if;
  raise exception 'STUDENT_ROSTER_REQUIRED';
end $$;
revoke all on function public.guard_student_email() from public, anon, authenticated, service_role;
create trigger guard_student_email before insert or update of email, email_change on auth.users
  for each row execute function public.guard_student_email();
