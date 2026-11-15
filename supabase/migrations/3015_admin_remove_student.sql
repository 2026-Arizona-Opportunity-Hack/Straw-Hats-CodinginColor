-- A retired card has no passcode. Keep its roster ID for past submissions.
alter table public.class_students alter column passcode drop not null;
comment on column public.class_students.passcode is 'Null when an admin retires a linked roster card upon unenrollment.';

-- Relinking through a fresh enrollment restores a card without duplicating the roster or losing work.
create or replace function public.add_roster_row_for_enrollment() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  code text;
begin
  loop
    code := (100000 + floor(random() * 900000))::int::text;
    exit when not exists (
      select 1 from public.class_students where class_id = new.class_id and passcode = code
    );
  end loop;
  insert into public.class_students as roster (class_id, display_name, passcode, profile_id)
  select new.class_id, p.display_name, code, p.id from public.profiles p where p.id = new.student_id
  on conflict (class_id, profile_id) do update set passcode = excluded.passcode
    where roster.passcode is null;
  return new;
end $$;

-- A roster form opened before an admin removed a student cannot restore the retired login card.
create function private.guard_retired_class_card() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user in ('anon', 'authenticated') and old.passcode is null and new.passcode is not null then
    raise exception 'ROSTER_CARD_RETIRED' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function private.guard_retired_class_card() from public, anon, authenticated;
create trigger guard_retired_class_card before update of passcode on public.class_students
  for each row execute function private.guard_retired_class_card();

create function public.admin_remove_student(p_student uuid, p_class uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.current_role_is('admin') then
    raise exception 'ADMINS_ONLY' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = p_student and role = 'student') then
    raise exception 'STUDENTS_ONLY';
  end if;

  update public.class_students set passcode = null
  where class_id = p_class and profile_id = p_student and passcode is not null;
  delete from public.enrollments where class_id = p_class and student_id = p_student;
end $$;

revoke all on function public.admin_remove_student(uuid, uuid) from public, anon;
grant execute on function public.admin_remove_student(uuid, uuid) to authenticated;
notify pgrst, 'reload schema';
