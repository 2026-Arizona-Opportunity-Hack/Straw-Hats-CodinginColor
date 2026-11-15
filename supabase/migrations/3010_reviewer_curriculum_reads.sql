-- Restrictive policies also apply when an ownership policy permits a row.
-- Other roles keep their existing curriculum permissions.
create policy "reviewer reads published library courses"
on public.courses as restrictive for select to authenticated
using (
  not (select public.current_role_is('reviewer'))
  or (published and is_library and copied_from is null)
);

create policy "reviewer reads published library modules"
on public.modules as restrictive for select to authenticated
using (
  not (select public.current_role_is('reviewer'))
  or (published and exists (select 1 from public.courses c where c.id = modules.course_id))
);

create policy "reviewer reads lessons of visible modules"
on public.lessons as restrictive for select to authenticated
using (
  not (select public.current_role_is('reviewer'))
  or exists (select 1 from public.modules m where m.id = lessons.module_id)
);

create policy "reviewer reads activities of visible lessons"
on public.activities as restrictive for select to authenticated
using (
  not (select public.current_role_is('reviewer'))
  or exists (select 1 from public.lessons l where l.id = activities.lesson_id)
);

create policy "reviewer cannot read answer keys"
on public.activity_keys as restrictive for select to authenticated
using (not (select public.current_role_is('reviewer')));

-- Explore lists global courses and module titles before students enroll.
-- Preserve the durable class-local scope set by migration 2011, even when
-- the source template has been deleted and copied_from is now null.
-- Reviewers load the library through its row policies, outside Explore.
create or replace function public.catalog_courses()
returns table (id uuid, title text, description text, level public.course_level, delivery_mode public.delivery_mode)
language sql stable security definer set search_path = '' as $$
  select c.id, c.title, c.description, c.level, c.delivery_mode
  from public.courses c
  where c.published and not curriculum_private.is_local_course(c.id)
    and (select public.current_role_is('student')
      or public.current_role_is('instructor')
      or public.current_role_is('admin'))
  order by c.title, c.id
$$;

create or replace function public.catalog_modules()
returns table (course_id uuid, module_position int, module_title text, module_concept text)
language sql stable security definer set search_path = '' as $$
  select m.course_id, m.position, m.title, m.concept
  from public.modules m
  join public.courses c on c.id = m.course_id
  where c.published and m.published and not curriculum_private.is_local_course(c.id)
    and (select public.current_role_is('student')
      or public.current_role_is('instructor')
      or public.current_role_is('admin'))
  order by m.course_id, m.position
$$;
