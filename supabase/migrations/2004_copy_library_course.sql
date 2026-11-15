-- 2004: an instructor imports a library course as their own editable copy. Owner: Ruthvik.
-- Append-only after merge.
--
-- Library courses (is_library) are shared and read-only for instructors: "owner writes course"
-- only lets the owner or an admin change them. copy_library_course deep-copies one into a course
-- the caller owns (modules, lessons, activities and answer keys, all with new ids), so edits to
-- the copy never touch the library. The copy is published so it can be picked in class setup;
-- each module keeps its own published flag.
create function copy_library_course(p_course_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_course uuid := gen_random_uuid();
  v_module uuid;
  v_lesson uuid;
  v_activity uuid;
  m modules%rowtype;
  l lessons%rowtype;
  a activities%rowtype;
begin
  if not (current_role_is('instructor') or current_role_is('admin')) then
    raise exception 'INSTRUCTORS_ONLY';
  end if;
  if not exists (select 1 from courses where id = p_course_id and is_library and published) then
    raise exception 'NOT_A_LIBRARY_COURSE';
  end if;

  insert into courses (id, title, description, level, delivery_mode, is_library, copied_from, owner_id, published)
  select v_course, title, description, level, delivery_mode, false, id, auth.uid(), true
  from courses where id = p_course_id;

  for m in select * from modules where course_id = p_course_id order by position loop
    insert into modules (course_id, position, title, concept, published)
    values (v_course, m.position, m.title, m.concept, m.published)
    returning id into v_module;

    for l in select * from lessons where module_id = m.id order by position loop
      insert into lessons (module_id, position, title, is_checkpoint)
      values (v_module, l.position, l.title, l.is_checkpoint)
      returning id into v_lesson;

      for a in select * from activities where lesson_id = l.id order by position loop
        -- Content holds no answers (move_answers_to_keys strips them), so copy the key row too.
        insert into activities (lesson_id, position, type, concept, points, counts_toward_unlock, content)
        values (v_lesson, a.position, a.type, a.concept, a.points, a.counts_toward_unlock, a.content)
        returning id into v_activity;

        insert into activity_keys (activity_id, key)
        select v_activity, k.key from activity_keys k where k.activity_id = a.id
        on conflict (activity_id) do update set key = activity_keys.key || excluded.key, updated_at = now();
      end loop;
    end loop;
  end loop;

  return v_course;
end
$$;

revoke all on function copy_library_course(uuid) from public, anon;
grant execute on function copy_library_course(uuid) to authenticated;

notify pgrst, 'reload schema';
