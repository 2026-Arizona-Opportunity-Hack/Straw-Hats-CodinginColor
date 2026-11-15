-- Demo assignments and student submissions for Maryvale Period 3, so the gradebook has
-- work to grade in the demo. Fictional data, not part of the schema. Run once, after
-- migration 2002, as the database owner (it bypasses RLS):
--   npx supabase db query --remote --file supabase/demo/grading_demo.sql
-- Fixed ids make re-running a no-op.

insert into assignments (id, class_id, kind, title, instructions, points, due_at, max_attempts, published, content) values
  ('50000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'quiz',
   'Variables quick check', 'Five minutes, one attempt. Answer on your own.', 3, now() + interval '2 days', 1, true,
   '{"shuffle": false, "showAnswers": "after_submit", "blocks": [
      {"id": "dq1", "type": "question", "question": {"id": "dq1q", "kind": "single", "prompt": "After score = 0 and score = score + 1, what is score?", "points": 1, "choices": ["0", "1", "2"], "correct": [1], "accepted": [], "answer": null, "tolerance": 0}},
      {"id": "dq2", "type": "question", "question": {"id": "dq2q", "kind": "truefalse", "prompt": "A variable name can start with a number.", "points": 1, "choices": ["True", "False"], "correct": [1], "accepted": [], "answer": null, "tolerance": 0}},
      {"id": "dq3", "type": "question", "question": {"id": "dq3q", "kind": "short", "prompt": "Which function shows a value on the screen?", "points": 1, "choices": [], "correct": [], "accepted": ["print", "print()"], "answer": null, "tolerance": 0}}
   ]}'),
  ('50000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 'written',
   'Reflection: where do you see loops?', 'Two short answers. Use your own words.', 10, now() - interval '1 day', null, true,
   '{"shuffle": false, "showAnswers": "after_submit", "blocks": [
      {"id": "dw1", "type": "written", "prompt": "Describe something in your day that repeats like a loop.", "points": 5},
      {"id": "dw2", "type": "written", "prompt": "How would you write it as a for loop?", "points": 5}
   ]}')
on conflict (id) do nothing;

with roster as (
  select id, row_number() over (order by created_at, id) as rn
  from class_students where class_id = '20000000-0000-0000-0000-000000000001'
)
insert into assignment_submissions (assignment_id, class_id, class_student_id, responses, manual_scores, feedback, submitted_at, graded_at)
select '50000000-0000-0000-0000-000000000001'::uuid, '20000000-0000-0000-0000-000000000001'::uuid, id,
  jsonb_build_object('dq1', jsonb_build_array(case when rn % 4 = 3 then 0 else 1 end),
                     'dq2', jsonb_build_array(case when rn % 3 = 1 then 0 else 1 end),
                     'dq3', case when rn % 2 = 0 then 'print' else 'show' end),
  '{}'::jsonb, '', now() - (rn || ' hours')::interval, now()
from roster where rn <= 6
union all
select '50000000-0000-0000-0000-000000000002'::uuid, '20000000-0000-0000-0000-000000000001'::uuid, id,
  case rn
    when 1 then '{"dw1": "My alarm goes off every 5 minutes until I get up.", "dw2": "for snooze in range(5): print(\"wake up\")"}'::jsonb
    when 2 then '{"dw1": "Practicing free throws: shoot, rebound, repeat.", "dw2": "for shot in range(10): shoot()"}'::jsonb
    else '{"dw1": "Brushing each tooth.", "dw2": ""}'::jsonb
  end,
  case when rn = 1 then '{"dw1": 5, "dw2": 4}'::jsonb else '{}'::jsonb end,
  case when rn = 1 then 'Great real-world example. Check the indentation in your loop.' else '' end,
  -- The third student turns it in after the due date.
  case when rn = 3 then now() else now() - interval '2 days' end,
  case when rn = 1 then now() - interval '1 day' end
from roster where rn <= 3
on conflict (assignment_id, class_student_id) do nothing;
