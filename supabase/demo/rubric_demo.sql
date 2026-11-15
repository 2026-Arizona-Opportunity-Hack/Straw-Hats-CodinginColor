-- Demo file-upload assignment with a rubric for Maryvale Period 3, plus three fictional
-- submissions that point at a sample PDF. Run after migration 2003 and after uploading
-- supabase/demo/sample-write-up.pdf for the first three roster students:
--   npx supabase storage cp --experimental --remote supabase/demo/sample-write-up.pdf \
--     "ss:///submission-files/20000000-0000-0000-0000-000000000001/50000000-0000-0000-0000-000000000003/<class_student_id>/write-up.pdf"
--   npx supabase db query --remote --file supabase/demo/rubric_demo.sql
-- Fixed ids make re-running a no-op.

insert into assignments (id, class_id, kind, title, instructions, points, due_at, published, content) values
  ('50000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', 'file',
   'Project write-up: my first program', 'Write one page about the program you built: what it does, how you used a loop, and what you would add next.',
   15, now() + interval '3 days', true,
   '{"shuffle": false, "showAnswers": "after_submit", "blocks": [{"id": "df1", "type": "file", "prompt": "Upload your write-up as a PDF or Word document.",
     "fileTypes": ["pdf", "document"], "maxFiles": 1, "maxSizeMb": 10, "points": 15, "rubric": [
       {"id": "r-explain", "title": "Explains the program", "description": "Says what the program does and who it is for.", "ratings": [
         {"id": "r-explain-5", "label": "Clear", "description": "Anyone could understand it.", "points": 5},
         {"id": "r-explain-3", "label": "Partly clear", "description": "Some steps are missing.", "points": 3},
         {"id": "r-explain-0", "label": "Missing", "description": "", "points": 0}]},
       {"id": "r-loop", "title": "Uses a loop correctly", "description": "Shows the loop and explains why it repeats.", "ratings": [
         {"id": "r-loop-5", "label": "Correct", "description": "Loop is shown and explained.", "points": 5},
         {"id": "r-loop-2", "label": "Attempted", "description": "Loop is shown but not explained.", "points": 2},
         {"id": "r-loop-0", "label": "Missing", "description": "", "points": 0}]},
       {"id": "r-next", "title": "Next steps", "description": "Names one thing to add or improve.", "ratings": [
         {"id": "r-next-5", "label": "Specific", "description": "", "points": 5},
         {"id": "r-next-2", "label": "Vague", "description": "", "points": 2},
         {"id": "r-next-0", "label": "Missing", "description": "", "points": 0}]}]}]}')
on conflict (id) do nothing;

with roster as (
  select cs.id, cs.display_name, row_number() over (order by cs.created_at, cs.id) as rn
  from class_students cs where cs.class_id = '20000000-0000-0000-0000-000000000001'
)
insert into assignment_submissions (assignment_id, class_id, class_student_id, responses, manual_scores, rubric_scores, feedback, submitted_at, graded_at)
select '50000000-0000-0000-0000-000000000003'::uuid, '20000000-0000-0000-0000-000000000001'::uuid, id,
  jsonb_build_object('df1', jsonb_build_array(jsonb_build_object(
    'path', '20000000-0000-0000-0000-000000000001/50000000-0000-0000-0000-000000000003/' || id || '/write-up.pdf',
    'name', split_part(display_name, ' ', 1) || '-write-up.pdf', 'size', 877, 'type', 'application/pdf'))),
  case when rn = 1 then '{"df1": 12}'::jsonb else '{}'::jsonb end,
  case when rn = 1 then '{"df1": {"r-explain": "r-explain-5", "r-loop": "r-loop-5", "r-next": "r-next-2"}}'::jsonb else '{}'::jsonb end,
  case when rn = 1 then 'Strong explanation. Next time, name a specific feature you would add.' else '' end,
  now() - (rn || ' hours')::interval,
  case when rn = 1 then now() end
from roster where rn <= 3
on conflict (assignment_id, class_student_id) do nothing;
