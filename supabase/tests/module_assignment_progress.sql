-- Run against a disposable migrated database. Fixtures roll back.
begin;

insert into auth.users (id) values
  ('81000000-0000-0000-0000-000000000001'),
  ('81000000-0000-0000-0000-000000000002'),
  ('81000000-0000-0000-0000-000000000003');
insert into profiles (id, role, display_name) values
  ('81000000-0000-0000-0000-000000000001', 'instructor', 'Test teacher'),
  ('81000000-0000-0000-0000-000000000002', 'student', 'Test pupil'),
  ('81000000-0000-0000-0000-000000000003', 'student', 'Other pupil')
on conflict (id) do update set role = excluded.role;

insert into courses (id, title, delivery_mode, published) values
  ('82000000-0000-0000-0000-000000000001', 'Test Python', 'instructor_led', true),
  ('82000000-0000-0000-0000-000000000002', 'Test Web', 'self_paced', true);
insert into modules (id, course_id, position, title, concept, published) values
  ('83000000-0000-0000-0000-000000000001', '82000000-0000-0000-0000-000000000001', 1, 'Python', 'Loops', true),
  ('83000000-0000-0000-0000-000000000002', '82000000-0000-0000-0000-000000000002', 1, 'HTML', 'Tags', true);
insert into lessons (id, module_id, position, title) values
  ('84000000-0000-0000-0000-000000000001', '83000000-0000-0000-0000-000000000002', 1, 'First lesson');
insert into activities (id, lesson_id, position, type, concept, counts_toward_unlock, content) values
  ('85000000-0000-0000-0000-000000000001', '84000000-0000-0000-0000-000000000001', 1, 'content', 'Read', true, '{}'),
  ('85000000-0000-0000-0000-000000000002', '84000000-0000-0000-0000-000000000001', 2, 'check', 'Check', true,
    '{"choices":[{"id":"a","label":"A"},{"id":"b","label":"B"}],"answer":"a"}'),
  ('85000000-0000-0000-0000-000000000003', '84000000-0000-0000-0000-000000000001', 3, 'content', 'Optional', false, '{}');

insert into classes (id, name, school, course_id, join_code, created_by) values
  ('86000000-0000-0000-0000-000000000001', 'Test period', 'Test school', '82000000-0000-0000-0000-000000000001', 'QA-PROGRESS', '81000000-0000-0000-0000-000000000001'),
  ('86000000-0000-0000-0000-000000000002', 'Other period', 'Test school', '82000000-0000-0000-0000-000000000002', 'QA-PROGRESS-OTHER', '81000000-0000-0000-0000-000000000001');
insert into enrollments (class_id, student_id) values
  ('86000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000002');
insert into class_modules (class_id, module_id) values
  ('86000000-0000-0000-0000-000000000001', '83000000-0000-0000-0000-000000000001');
insert into course_enrollments (student_id, course_id) values
  ('81000000-0000-0000-0000-000000000002', '82000000-0000-0000-0000-000000000002'),
  ('81000000-0000-0000-0000-000000000003', '82000000-0000-0000-0000-000000000002');
insert into assignments (id, class_id, kind, title, module_id, published, points, content) values
  ('87000000-0000-0000-0000-000000000001', '86000000-0000-0000-0000-000000000001', 'link', 'Module assignment',
   '83000000-0000-0000-0000-000000000002', false, 2, '{"blocks":[{"id":"completion","type":"html","reportsScore":true,"points":2}]}'),
  ('87000000-0000-0000-0000-000000000002', '86000000-0000-0000-0000-000000000001', 'code', 'Python assignment',
   '83000000-0000-0000-0000-000000000001', true, 5, '{}');
insert into curriculum_private.assignment_module_progress values
  ('87000000-0000-0000-0000-000000000001', '83000000-0000-0000-0000-000000000002', 'completion');

set local role authenticated;
select set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000002', true);
select public.submit_attempt('85000000-0000-0000-0000-000000000001', '{}', 0);
reset role;

-- A full completion in a different class must not count in this gradebook.
insert into activity_attempts (student_id, activity_id, class_id, submitted_at) values
  ('81000000-0000-0000-0000-000000000002', '85000000-0000-0000-0000-000000000002',
   '86000000-0000-0000-0000-000000000002', now());
do $$ begin
  if exists (select 1 from assignment_submissions where assignment_id = '87000000-0000-0000-0000-000000000001') then
    raise exception 'Draft work appeared in the gradebook';
  end if;
end $$;

update assignments set published = true where id = '87000000-0000-0000-0000-000000000001';
select curriculum_private.sync_module_assignment_progress('87000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000002');

set local role authenticated;
select set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000001', true);
do $$ begin
  if (select (responses ->> 'completion')::numeric from assignment_submissions
      where assignment_id = '87000000-0000-0000-0000-000000000001') is distinct from 0.5 then
    raise exception 'Teacher did not see prior work as one of two required steps';
  end if;
end $$;
update assignment_submissions set manual_scores = '{"completion":1}', feedback = 'Keep this feedback'
where assignment_id = '87000000-0000-0000-0000-000000000001';

select set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000002', true);
select public.submit_attempt('85000000-0000-0000-0000-000000000001', '{}', 0);
select public.submit_attempt('85000000-0000-0000-0000-000000000003', '{}', 0);
do $$ begin
  if exists (select 1 from assignment_submissions where assignment_id = '87000000-0000-0000-0000-000000000001')
     or has_function_privilege(current_user, 'curriculum_private.sync_module_assignment_progress(uuid,uuid)', 'execute') then
    raise exception 'Student can access the gradebook or its private write function';
  end if;
end $$;
reset role;

do $$ begin
  if (select (responses ->> 'completion')::numeric from assignment_submissions
      where assignment_id = '87000000-0000-0000-0000-000000000001') is distinct from 0.5 then
    raise exception 'A repeated or optional step counted toward completion';
  end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000003', true);
select public.submit_attempt('85000000-0000-0000-0000-000000000001', '{}', 0);
select set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000002', true);
select public.submit_attempt('85000000-0000-0000-0000-000000000002', '{"choice_id":"b"}', 0);
select set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000001', true);
do $$ begin
  if (select count(*) from assignment_submissions where class_id = '86000000-0000-0000-0000-000000000001') <> 1
     or not exists (
       select 1 from assignment_submissions where assignment_id = '87000000-0000-0000-0000-000000000001'
         and (responses ->> 'completion')::numeric = 1
         and manual_scores = '{"completion":1}' and feedback = 'Keep this feedback'
     ) or not exists (
       select 1 from assignments a join class_modules cm on cm.class_id = a.class_id and cm.module_id = a.module_id
       where a.id = '87000000-0000-0000-0000-000000000002' and a.published and a.points = 5
     ) then
    raise exception 'Completion, roster isolation, teacher grading or Python assignment was lost';
  end if;
end $$;

rollback;
