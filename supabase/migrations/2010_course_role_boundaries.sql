-- Ownership is not a staff role: students/reviewers must remain read-only even
-- when a legacy course belongs to them or an instructor has been demoted.
alter policy "owner writes course" on public.courses
  to authenticated
  using (public.current_role_is('admin') or
    (public.current_role_is('instructor') and owner_id = (select auth.uid())))
  with check (public.current_role_is('admin') or
    (public.current_role_is('instructor') and owner_id = (select auth.uid())));

-- Existing module/lesson/activity policies use this helper for both the old
-- and new parent, including moves between courses.
create or replace function public.can_edit_course(c uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.current_role_is('admin') or (
    public.current_role_is('instructor') and exists (
      select 1 from public.courses where id = c and owner_id = (select auth.uid())
    )
  )
$$;

-- Answer-key writes must follow the same role and course-ownership boundary.
-- Preserve the separate staff/reviewer SELECT policy.
create or replace function public.can_edit_activity(a uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.current_role_is('admin') or exists (
    select 1 from public.activities ac
    join public.lessons l on l.id = ac.lesson_id
    join public.modules m on m.id = l.module_id
    where ac.id = a and public.can_edit_course(m.course_id)
  )
$$;
