-- Publish the existing Maryvale demo assignment after migration 2007 and backfill completion.
-- Run as the database owner on the CIC demo project only. Safe to rerun.
begin;
set local lock_timeout = '3s';

-- A submission goes through before the backfill or after tracking is active.
lock table public.activity_attempts in share mode;

do $$
declare
  target constant uuid := '91d5eae4-80fa-4744-bec6-d966030e6365';
  maryvale constant uuid := '20000000-0000-0000-0000-000000000001';
  cat_module constant uuid := '40eb3762-8ea8-4537-92b0-9192dd9b0bed';
  lab constant uuid := 'ec424b99-2651-471b-8eba-11f846646c14';
  reflection constant uuid := '6cb75099-5b1b-474c-9177-1ea35302ea7f';
  original_block constant text := '69cc59dc-718d-473b-9151-d7835d121d5f';
  lab_block constant text := 'cat-photo-lab';
  reflection_block constant text := 'cat-photo-reflection';
  checkpoints jsonb := jsonb_build_array(
    jsonb_build_object('id', lab_block, 'type', 'completion', 'title', 'Coding lab', 'points', 1),
    jsonb_build_object('id', reflection_block, 'type', 'completion', 'title', 'Reflection', 'points', 1)
  );
begin
  if (select count(*) from public.activities a join public.lessons l on l.id = a.lesson_id
      where l.module_id = cat_module and (
        (a.id = lab and a.type = 'code' and a.content #>> '{lab,verifier}' = 'cat-photo-v1')
        or (a.id = reflection and a.type = 'worksheet')
      )) <> 2 then
    raise exception 'The Cat Photo App lab or reflection is missing';
  end if;

  update public.assignments a set published = true, points = 2,
    instructions = 'Open Cat Photo App. Pass the coding lab checks and submit your reflection. Each is worth one completion point.',
    content = jsonb_set(a.content, '{blocks}', (
      select coalesce(jsonb_agg(b.block order by b.position), '[]'::jsonb)
      from jsonb_array_elements(a.content -> 'blocks') with ordinality b(block, position)
      where b.block ->> 'id' not in (original_block, lab_block, reflection_block)
    ) || checkpoints)
  from public.classes g, public.modules m, public.courses c
  where a.id = target and a.class_id = maryvale and a.module_id = cat_module
    and a.title = 'Cat Photo App' and a.kind = 'link'
    and g.id = maryvale and g.name = 'Maryvale Period 3' and g.archived_at is null
    and m.id = cat_module and m.published and c.id = m.course_id and c.published and c.delivery_mode = 'self_paced'
    and (a.content -> 'blocks' @> jsonb_build_array(jsonb_build_object('id', original_block, 'type', 'html'))
         or a.content -> 'blocks' @> checkpoints);
  if not found then
    raise exception 'The Maryvale Cat Photo App assignment or its completion blocks changed';
  end if;

  insert into curriculum_private.assignment_activities (assignment_id, activity_id, block_id, requires_pass)
  values (target, lab, lab_block, true), (target, reflection, reflection_block, false)
  on conflict (assignment_id, activity_id) do nothing;

  perform curriculum_private.sync_assignment_completion(target, null);
end;
$$;

commit;
