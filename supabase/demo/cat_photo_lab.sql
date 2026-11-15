-- Activate the verified lab in the existing hosted Cat Photo App after migration 1005.
-- The optional lab retains its own completion without changing existing lesson totals.
with target as (
  select l.id as lesson_id, m.course_id
  from public.lessons l join public.modules m on m.id = l.module_id
  where l.id = '21b3e436-52ea-41ed-aae6-10c74d7c8e65'
    and m.id = '40eb3762-8ea8-4537-92b0-9192dd9b0bed'
    and m.course_id = '263fa926-3595-4df9-b416-1af4f59b638c'
), inserted as (
  insert into public.activities (id, lesson_id, position, type, concept, points, counts_toward_unlock, content)
  select 'ec424b99-2651-471b-8eba-11f846646c14', t.lesson_id,
    (select coalesce(max(a.position), 0) + 1 from public.activities a where a.lesson_id = t.lesson_id),
    'code', 'HTML headings, paragraphs, and images', 1, false, jsonb_build_object(
      'title', 'Coding lab · Build your Cat Photo App',
      'prompt', 'Change the heading to Cat Photo App, introduce your cat in a paragraph, and add an alt description to the photo. Run to preview. Check your work to complete the lab.',
      'starter_code', E'<h1>My cat page</h1>\n<p></p>\n<img src="cat.jpg" alt="">\n',
      'tests', '[]'::jsonb,
      'lab', '{"language":"web","verifier":"cat-photo-v1","starterCss":"body { font-family: system-ui; padding: 1rem; }\nimg { max-width: 100%; }","checks":[]}'::jsonb
    )
  from target t
  on conflict (id) do nothing
  returning lesson_id
)
update public.courses c set publication_revision = publication_revision + 1
from target t join inserted i on i.lesson_id = t.lesson_id where c.id = t.course_id;
