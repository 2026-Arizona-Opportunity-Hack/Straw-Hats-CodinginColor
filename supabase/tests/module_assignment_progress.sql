-- Run on a disposable migrated database. All fixture changes roll back.
begin;
insert into auth.users (id) values
  ('81000000-0000-0000-0000-000000000001'), ('81000000-0000-0000-0000-000000000002'),
  ('81000000-0000-0000-0000-000000000003');
insert into profiles (id, role, display_name) values
  ('81000000-0000-0000-0000-000000000001', 'instructor', 'Test teacher'),
  ('81000000-0000-0000-0000-000000000002', 'student', 'Class learner'),
  ('81000000-0000-0000-0000-000000000003', 'student', 'Independent learner')
on conflict (id) do update set role = excluded.role;

insert into courses (id, title, delivery_mode, published) values
  ('82000000-0000-0000-0000-000000000001', 'Test Python', 'instructor_led', true),
  ('82000000-0000-0000-0000-000000000002', 'Test Web', 'self_paced', true);
-- This fixture intentionally offers the same global course to classes and independent learners.
update courses set is_library = true where id = '82000000-0000-0000-0000-000000000002';
insert into modules (id, course_id, position, title, concept, published) values
  ('83000000-0000-0000-0000-000000000001', '82000000-0000-0000-0000-000000000001', 1, 'Python', 'Loops', true),
  ('83000000-0000-0000-0000-000000000002', '82000000-0000-0000-0000-000000000002', 1, 'HTML', 'Tags', true);
insert into lessons (id, module_id, position, title) values
  ('84000000-0000-0000-0000-000000000001', '83000000-0000-0000-0000-000000000002', 1, 'First lesson');
insert into activities (id, lesson_id, position, type, concept, counts_toward_unlock, content) values
  ('85000000-0000-0000-0000-000000000001', '84000000-0000-0000-0000-000000000001', 1, 'worksheet', 'Reflect', true,
   '{"fields":[{"id":"f0","kind":"long_answer","prompt":"What did you build?"}]}'),
  ('85000000-0000-0000-0000-000000000002', '84000000-0000-0000-0000-000000000001', 2, 'code', 'Lab', false,
   '{"lab":{"verifier":"cat-photo-v1"}}');

insert into classes (id, name, school, course_id, join_code, created_by) values
  ('86000000-0000-0000-0000-000000000001', 'Test period', 'Test school', '82000000-0000-0000-0000-000000000001', 'QA-PROGRESS', '81000000-0000-0000-0000-000000000001'),
  ('86000000-0000-0000-0000-000000000002', 'Other period', 'Test school', '82000000-0000-0000-0000-000000000002', 'QA-OTHER', '81000000-0000-0000-0000-000000000001');
insert into enrollments (class_id, student_id) values
  ('86000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000002');
insert into class_modules (class_id, module_id) values
  ('86000000-0000-0000-0000-000000000001', '83000000-0000-0000-0000-000000000001');
insert into course_enrollments (student_id, course_id) values
  ('81000000-0000-0000-0000-000000000003', '82000000-0000-0000-0000-000000000002');
insert into assignments (id, class_id, kind, title, module_id, published, points, content) values
  ('87000000-0000-0000-0000-000000000001', '86000000-0000-0000-0000-000000000001', 'link', 'Module assignment',
   '83000000-0000-0000-0000-000000000002', false, 2,
   '{"blocks":[{"id":"lab","type":"completion","title":"Coding lab","points":1},{"id":"reflection","type":"completion","title":"Reflection","points":1}]}'),
  ('87000000-0000-0000-0000-000000000002', '86000000-0000-0000-0000-000000000001', 'code', 'Python assignment',
   '83000000-0000-0000-0000-000000000001', true, 5, '{}');
insert into curriculum_private.assignment_activities values
  ('87000000-0000-0000-0000-000000000001', '85000000-0000-0000-0000-000000000001', 'reflection', false),
  ('87000000-0000-0000-0000-000000000001', '85000000-0000-0000-0000-000000000002', 'lab', true);

set local role authenticated;
select set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000002', true);
do $$ begin
  if exists (select 1 from public.my_module_assignments()) then raise exception 'Student received a draft'; end if;
end $$;
select public.enroll_in_course('82000000-0000-0000-0000-000000000002');
select public.submit_attempt('85000000-0000-0000-0000-000000000001', '{"fields":{"f0":"A cat page"}}', 0);
reset role;

do $$ begin
  if exists (select 1 from assignment_submissions) then raise exception 'Draft work counted'; end if;
end $$;
update assignments set published = true where id = '87000000-0000-0000-0000-000000000001';

set local role authenticated;
select set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000001', true);
do $$ begin
  if (select responses from assignment_submissions) is distinct from '{"reflection":"1"}'::jsonb then
    raise exception 'Teacher did not see only the existing reflection';
  end if;
end $$;
update assignment_submissions set manual_scores = '{"reflection":0.5}', feedback = 'Keep this feedback';
select set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000002', true);
do $$ begin
  if (select count(*) from public.my_module_assignments()) <> 1 or exists (select 1 from assignment_submissions)
    or has_function_privilege(current_user, 'curriculum_private.sync_assignment_completion(uuid,uuid)', 'execute') then
    raise exception 'Student assignment visibility or gradebook permissions failed';
  end if;
end $$;
select public.submit_attempt('85000000-0000-0000-0000-000000000001', '{"fields":{"f0":"Cat page revised"}}', 0);
select set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000003', true);
do $$ begin
  if exists (select 1 from public.my_module_assignments()) then raise exception 'Other student received the assignment'; end if;
end $$;
select public.submit_attempt('85000000-0000-0000-0000-000000000001', '{"fields":{"f0":"Private page"}}', 0);
reset role;

set local role service_role;
select public.record_cat_photo_pass('81000000-0000-0000-0000-000000000003', '85000000-0000-0000-0000-000000000002', '<p>Verified by checker</p>');
select public.record_cat_photo_pass('81000000-0000-0000-0000-000000000002', '85000000-0000-0000-0000-000000000002', '<p>Verified by checker</p>');
select public.record_cat_photo_pass('81000000-0000-0000-0000-000000000002', '85000000-0000-0000-0000-000000000002', '<p>Verified by checker</p>');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000001', true);
do $$ begin
  if (select count(*) from assignment_submissions) <> 1
     or not exists (
       select 1 from assignment_submissions where responses = '{"reflection":"1","lab":"1"}'
         and manual_scores = '{"reflection":0.5}' and feedback = 'Keep this feedback'
     ) or not exists (
       select 1 from assignments a join class_modules cm on cm.class_id = a.class_id and cm.module_id = a.module_id
       where a.id = '87000000-0000-0000-0000-000000000002' and a.published and a.points = 5 and a.title = 'Python assignment'
     ) then
    raise exception 'Checkpoint credit, roster isolation, teacher grading or Python assignment was lost';
  end if;
end $$;
rollback;
