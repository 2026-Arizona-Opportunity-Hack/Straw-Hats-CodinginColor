-- INSERT ... ON CONFLICT and RETURNING check SELECT policies on the proposed
-- row. The stable 2011 lookup cannot see a new course in its own INSERT yet.
-- Evaluate the same admin/instructor-owner permissions directly on that row;
-- retain 2011's scoped helper for co-teachers, enrolled students and globals.
alter policy "read scoped courses" on public.courses
  using (
    (select public.current_role_is('admin'))
    or ((select public.current_role_is('instructor')) and owner_id = (select auth.uid()))
    or (select curriculum_private.can_read_course(id))
  );
