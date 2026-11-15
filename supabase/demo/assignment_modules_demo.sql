-- Links demo assignments to the module of their class's course that they are about, so the
-- module drop-downs on the class Dashboard list work. Fictional demo data, not part of the schema.
-- Run as the database owner (it bypasses RLS), after grading_demo.sql and rubric_demo.sql:
--   npx supabase db query --remote --file supabase/demo/assignment_modules_demo.sql
--
-- How a module is chosen, for each assignment that has no module yet:
--   * Only modules of the class's own course are candidates.
--   * Words from the module's title and concept (4+ letters, plural "s" dropped) are matched
--     against the start of words in the assignment title, then its instructions. A few whole
--     words teachers use for the Intro to Python concepts count too ("if" for conditionals).
--   * Most title matches wins, then most instruction matches, then a module assigned to the
--     class, then the earliest module.
-- Assignments that already have a module are never changed, so re-running is a no-op and an
-- instructor's own choice is kept. Assignments with no matching words stay unlinked.

with words as (
  -- Word starts taken from the module title and concept ("Loops" matches "loop", "loops").
  select m.id as module_id, m.course_id, m.position, '\m' || t.token as pattern
  from modules m
  cross join lateral (
    select distinct regexp_replace(w, 's$', '') as token
    from regexp_split_to_table(lower(m.title || ' ' || m.concept), '[^a-z0-9]+') as w
    where length(w) >= 4
      and w not in ('with', 'your', 'from', 'what', 'that', 'this', 'into', 'intro', 'introduction',
                    'basics', 'making', 'part', 'unit', 'module', 'types', 'data', 'more')
  ) t
),
synonyms as (
  -- Whole words teachers use for the Intro to Python concepts ("If statements" is about conditionals).
  select m.id as module_id, m.course_id, m.position, '\m' || s.word || '\M' as pattern
  from modules m
  join (values ('conditionals', 'if'), ('conditionals', 'else'), ('conditionals', 'elif'),
               ('loops', 'while'), ('loops', 'repeat'), ('functions', 'def'), ('functions', 'return')) as s (concept, word)
    on lower(m.concept) = s.concept
),
tokens as (
  select * from words union select * from synonyms
),
candidates as (
  select a.id as assignment_id, k.module_id, k.position,
         exists (select 1 from class_modules cm where cm.class_id = a.class_id and cm.module_id = k.module_id) as assigned,
         count(*) filter (where a.title ~* k.pattern) as title_hits,
         count(*) filter (where a.instructions ~* k.pattern) as text_hits
  from assignments a
  join classes c on c.id = a.class_id
  join tokens k on k.course_id = c.course_id
  where a.module_id is null
  group by a.id, a.class_id, k.module_id, k.position
),
best as (
  select distinct on (assignment_id) assignment_id, module_id
  from candidates
  where title_hits + text_hits > 0
  order by assignment_id, title_hits desc, text_hits desc, assigned desc, position
)
update assignments a
set module_id = b.module_id
from best b
where a.id = b.assignment_id and a.module_id is null;

-- What is linked now, for a quick look after running.
select c.name as class, a.title as assignment, m.title as module
from assignments a
join classes c on c.id = a.class_id
left join modules m on m.id = a.module_id
order by c.name, a.created_at;
