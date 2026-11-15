-- Enable the existing Cat Photo App reflection for the Maryvale demo cohort.
-- Students still need access to the published module through their enrollment.
with target as (
  select a.id, l.module_id, c.id as class_id from public.activities a
  join public.lessons l on l.id = a.lesson_id
  join public.classes c on c.id = '20000000-0000-0000-0000-000000000001'
  where a.id = '6cb75099-5b1b-474c-9177-1ea35302ea7f' and a.type = 'worksheet'
    and l.module_id = '40eb3762-8ea8-4537-92b0-9192dd9b0bed'
    and c.name = 'Maryvale Period 3' and c.archived_at is null
), cohort as (
  insert into curriculum_private.discussion_audiences (activity_id, class_id)
  select id, class_id from target
  on conflict (activity_id) do nothing
  returning activity_id
), enabled as (
  update public.activities a set content = a.content || '{"discussion_enabled":true}'::jsonb
  from target t where a.id = t.id and (
    exists (select 1 from cohort where activity_id = t.id)
    or exists (select 1 from curriculum_private.discussion_audiences x where x.activity_id = t.id and x.class_id = t.class_id)
  ) and a.content -> 'discussion_enabled' is distinct from 'true'::jsonb
  returning t.module_id
)
update public.courses c set publication_revision = publication_revision + 1
from public.modules m join enabled e on e.module_id = m.id where c.id = m.course_id;
