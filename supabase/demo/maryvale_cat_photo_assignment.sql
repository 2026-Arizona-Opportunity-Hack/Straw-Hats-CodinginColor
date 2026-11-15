-- Publish the existing Maryvale demo draft after migration 2004.
-- Run as the database owner on the CIC demo project only. Safe to rerun.
begin;
set local lock_timeout = '3s';

-- Close the gap between scanning existing attempts and enabling the trigger
-- for this assignment. New attempts wait briefly until activation commits.
lock table public.activity_attempts in share mode;

do $$
declare
  assignment_id constant uuid := '91d5eae4-80fa-4744-bec6-d966030e6365';
  maryvale_id constant uuid := '20000000-0000-0000-0000-000000000001';
  cat_module_id constant uuid := '40eb3762-8ea8-4537-92b0-9192dd9b0bed';
  progress_block_id constant text := '69cc59dc-718d-473b-9151-d7835d121d5f';
  student uuid;
begin
  update public.assignments a set published = true
  from public.classes g, public.modules m, public.courses c
  where a.id = assignment_id and a.class_id = maryvale_id and a.module_id = cat_module_id
    and a.title = 'Cat Photo App' and a.points = 13 and a.due_at is null
    and a.content @> jsonb_build_object('blocks', jsonb_build_array(jsonb_build_object(
      'id', progress_block_id, 'type', 'html', 'reportsScore', true, 'points', 13
    )))
    and g.id = a.class_id and g.name = 'Maryvale Period 3' and g.archived_at is null
    and m.id = a.module_id and m.published and c.id = m.course_id and c.published;
  if not found then
    raise exception 'Maryvale Cat Photo App assignment, module or completion block changed';
  end if;

  insert into curriculum_private.assignment_module_progress values (assignment_id, cat_module_id, progress_block_id)
  on conflict on constraint assignment_module_progress_pkey do update
    set module_id = excluded.module_id, score_block_id = excluded.score_block_id;

  for student in select e.student_id from public.enrollments e where e.class_id = maryvale_id order by e.student_id loop
    perform curriculum_private.sync_module_assignment_progress(assignment_id, student);
  end loop;
end;
$$;

commit;
