-- Publish the selected module and course details in one transaction.
-- Drafts remain in the signed-in author's browser.
alter table public.courses add column publication_revision integer not null default 0;

create function public.publish_curriculum(
  p_course jsonb, p_module_id uuid, p_expected_revision integer,
  p_modules jsonb, p_lessons jsonb, p_activities jsonb,
  p_removed_lessons uuid[], p_removed_activities uuid[]
) returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_course_id uuid := (p_course ->> 'id')::uuid;
  revision integer;
  writes integer;
begin
  if not (public.current_role_is('instructor') or public.current_role_is('admin')) then
    raise exception 'Only instructors and admins can publish curriculum.';
  end if;

  if exists (select 1 from public.courses c where c.id = target_course_id)
     and not public.can_edit_course(target_course_id) then
    raise exception 'You do not have permission to publish this course.';
  end if;
  select c.publication_revision into revision from public.courses c where c.id = target_course_id for update;
  if revision is distinct from p_expected_revision then
    raise exception 'This course changed since you started the draft. Reload to see the latest publication. Your draft is saved in this browser.';
  end if;

  if revision is null then
    revision := 1;
    insert into public.courses (id, title, description, level, owner_id, published, publication_revision)
    values (target_course_id, p_course ->> 'title', p_course ->> 'description',
      (p_course ->> 'level')::public.course_level, auth.uid(), true, revision);
  else
    revision := revision + 1;
    update public.courses c set title = p_course ->> 'title', description = p_course ->> 'description',
      level = (p_course ->> 'level')::public.course_level, publication_revision = revision
    where c.id = target_course_id;
    if not found then raise exception 'You do not have permission to publish this course.'; end if;
  end if;

  insert into public.modules as old (id, course_id, position, title, concept, published)
  select m.id, target_course_id, m.position, m.title, m.concept, m.published
  from jsonb_to_recordset(p_modules) m(id uuid, position integer, title text, concept text, published boolean)
  where m.id = p_module_id or exists (select 1 from public.modules sibling where sibling.id = m.id and sibling.course_id = target_course_id)
  on conflict (id) do update set position = excluded.position,
    title = case when old.id = p_module_id then excluded.title else old.title end,
    concept = case when old.id = p_module_id then excluded.concept else old.concept end,
    published = case when old.id = p_module_id then excluded.published else old.published end
  where old.course_id = excluded.course_id;
  get diagnostics writes = row_count;
  if writes <> jsonb_array_length(p_modules) or not exists (
    select 1 from public.modules m where m.id = p_module_id and m.course_id = target_course_id
  ) then raise exception 'The selected module does not belong to this course.'; end if;

  delete from public.activities a using public.lessons l
    where a.id = any(p_removed_activities) and a.lesson_id = l.id and l.module_id = p_module_id;
  delete from public.lessons l where l.id = any(p_removed_lessons) and l.module_id = p_module_id;

  insert into public.lessons as old (id, module_id, position, title)
  select l.id, p_module_id, l.position, l.title
  from jsonb_to_recordset(p_lessons) l(id uuid, module_id uuid, position integer, title text)
  where l.module_id = p_module_id
  on conflict (id) do update set position = excluded.position, title = excluded.title
    where old.module_id = excluded.module_id;
  get diagnostics writes = row_count;
  if writes <> jsonb_array_length(p_lessons) then raise exception 'A lesson belongs to a different module.'; end if;

  insert into public.activities as old (id, lesson_id, position, type, concept, points, content)
  select a.id, a.lesson_id, a.position, a.type, a.concept, a.points, a.content
  from jsonb_to_recordset(p_activities) a(id uuid, lesson_id uuid, position integer,
    type public.activity_type, concept text, points integer, content jsonb)
  join public.lessons l on l.id = a.lesson_id and l.module_id = p_module_id
  on conflict (id) do update set position = excluded.position, type = excluded.type,
    concept = excluded.concept, points = excluded.points, content = old.content || excluded.content
    where old.lesson_id = excluded.lesson_id;
  get diagnostics writes = row_count;
  if writes <> jsonb_array_length(p_activities) then raise exception 'An activity belongs to a different lesson.'; end if;

  return revision;
end;
$$;

revoke all on function public.publish_curriculum(jsonb, uuid, integer, jsonb, jsonb, jsonb, uuid[], uuid[]) from public, anon, authenticated;
grant execute on function public.publish_curriculum(jsonb, uuid, integer, jsonb, jsonb, jsonb, uuid[], uuid[]) to authenticated;
