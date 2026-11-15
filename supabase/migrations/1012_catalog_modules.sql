-- Owner: Shivraj. Explore shows a course's module list before a student adds it.
-- RLS on modules (1004) only lets students read modules of courses they are in, so this
-- returns titles only (no lessons, no activities) of published modules in published
-- original courses: the same courses listCatalog shows.

create function catalog_modules()
returns table (course_id uuid, module_position int, module_title text, module_concept text)
language sql stable security definer set search_path = public as $$
  select m.course_id, m.position, m.title, m.concept
  from modules m
  join courses c on c.id = m.course_id
  where c.published and c.copied_from is null and m.published
  order by m.course_id, m.position
$$;

revoke all on function catalog_modules() from public, anon;
grant execute on function catalog_modules() to authenticated;

notify pgrst, 'reload schema';
