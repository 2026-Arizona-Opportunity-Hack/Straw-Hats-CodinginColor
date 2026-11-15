-- Run against a disposable migrated database. Student and staff identifiers are fixtures.
begin;
do $$
declare
  staff uuid := gen_random_uuid();
  student uuid := gen_random_uuid();
  course uuid := gen_random_uuid();
  class uuid := gen_random_uuid();
  module uuid := gen_random_uuid();
  lesson uuid := gen_random_uuid();
  pre uuid;
  post uuid;
  report jsonb;
  pre_content jsonb;
  pre_key jsonb;
begin
  insert into auth.users (id, email) values
    (staff, 'assessment-teacher@test.invalid'), (student, 'assessment-student@test.invalid');
  update profiles set role = 'admin' where id = staff;
  insert into courses (id, title, owner_id, published) values (course, 'Assessment fixture', staff, true);
  insert into classes (id, name, school, course_id, join_code, created_by)
  values (class, 'Assessment fixture', 'Test school', course, 'ASSESSMENT-QA', staff);
  insert into enrollments (class_id, student_id) values (class, student);
  insert into modules (id, course_id, position, title, concept, published)
  values (module, course, 1, 'Assessment fixture', 'loops', true);
  insert into lessons (id, module_id, position, title) values (lesson, module, 1, 'Assessment fixture');
  insert into module_rules (class_id, module_id, max_posttest_tries) values (class, module, 2);

  perform set_config('request.jwt.claim.sub', staff::text, true);
  set local role authenticated;
  if public.module_assessment_ready(module) is distinct from false then raise exception 'Empty pair passed readiness'; end if;
  report := public.generate_module_assessment(module);
  if report->>'ready' <> 'false' then raise exception 'Missing keyed checks passed generation'; end if;
  reset role;

  insert into activities (lesson_id, position, type, concept, content)
  values (lesson, 1, 'check', 'loops', '{"prompt":"Which loop repeats?", "choices":[{"id":"a","label":"for"},{"id":"b","label":"else"}],"answer":"a"}');
  set local role authenticated;
  report := public.generate_module_assessment(module);
  if report @> '{"ready":true,"written":true}'::jsonb is distinct from true then raise exception 'Keyed checks did not generate scored pair'; end if;
  reset role;

  select id, content into pre, pre_content from activities where lesson_id = lesson and type = 'pretest';
  select id into post from activities where lesson_id = lesson and type = 'posttest';
  select key into pre_key from activity_keys where activity_id = pre;
  insert into activity_attempts (student_id, activity_id, class_id, score, attempt_no, submitted_at) values
    (student, pre, class, 0.2, 1, now()), (student, pre, class, 1, 2, now()),
    (student, post, class, 0.7, 1, now()), (student, post, class, 0.4, 2, now()), (student, post, class, 1, 3, now());

  set local role authenticated;
  report := public.generate_module_assessment(module);
  if report @> '{"ready":true,"written":false}'::jsonb is distinct from true then raise exception 'Complete pair was treated as a failed or new generation'; end if;
  reset role;
  if (select content from activities where id = pre) is distinct from pre_content
    or (select key from activity_keys where activity_id = pre) is distinct from pre_key then
    raise exception 'Generation replaced existing questions or answers';
  end if;

  perform set_config('request.jwt.claim.sub', student::text, true);
  set local role authenticated;
  if public.module_assessment_ready(module) is not null then raise exception 'Student reached editor readiness'; end if;
  if (select best_score from public.my_module_activities(module) where activity_id = pre) is distinct from 0.2
      or (select best_score from public.my_module_activities(module) where activity_id = post) is distinct from 0.7
      or (select tries from public.my_module_activities(module) where activity_id = post) is distinct from 3 then
    raise exception 'Student status did not show the first/best eligible score and preserve all attempts';
  end if;
  reset role;

  -- A missing final check must not cause replacement of the attempted warm-up.
  delete from activities where id = post;
  perform set_config('request.jwt.claim.sub', staff::text, true);
  set local role authenticated;
  report := public.generate_module_assessment(module);
  if report @> '{"ready":false,"written":false,"reason":"existing_attempts"}'::jsonb is distinct from true then
    raise exception 'Incomplete pair with attempts was regenerated';
  end if;
  reset role;
end
$$;
rollback;
