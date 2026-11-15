-- Run on a local database with all migrations applied. Fixtures always roll back.
begin;
do $$
declare
  owner_id uuid := gen_random_uuid(); a uuid := gen_random_uuid(); b uuid := gen_random_uuid();
  c uuid := gen_random_uuid(); d uuid := gen_random_uuid(); classroom uuid := gen_random_uuid();
  course uuid := gen_random_uuid(); self_course uuid := gen_random_uuid(); empty_course uuid := gen_random_uuid();
  m uuid := gen_random_uuid(); hidden uuid := gen_random_uuid(); sm uuid := gen_random_uuid();
  l uuid := gen_random_uuid(); sl uuid := gen_random_uuid();
  pre uuid := gen_random_uuid(); post uuid := gen_random_uuid(); sp uuid := gen_random_uuid(); st uuid := gen_random_uuid();
  digest text := repeat('a', 64); report jsonb; cohort jsonb; who text;
begin
  insert into auth.users (id) values (owner_id), (a), (b), (c), (d);
  update profiles set role = 'admin' where id = owner_id;
  update profiles set display_name = 'PRIVATE STUDENT' where id in (a, b, c, d);
  insert into courses (id, title, published) values (course, 'Class course', true), (self_course, 'Self course', true), (empty_course, 'Empty course', true);
  insert into modules (id, course_id, position, title, concept, published) values
    (m, course, 1, 'Visible', 'A', true), (hidden, course, 2, 'Future release', 'B', true), (sm, self_course, 1, 'Self', 'A', true);
  insert into lessons (id, module_id, position, title) values (l, m, 1, 'Class lesson'), (sl, sm, 1, 'Self lesson');
  insert into activities (id, lesson_id, position, type, concept) values
    (pre, l, 1, 'pretest', 'A'), (post, l, 2, 'posttest', 'A'), (gen_random_uuid(), l, 3, 'worksheet', 'A'),
    (sp, sl, 1, 'pretest', 'A'), (st, sl, 2, 'posttest', 'A');
  insert into classes (id, name, school, course_id, join_code, created_by)
    values (classroom, 'Cohort', 'School', course, classroom::text, owner_id);
  insert into enrollments (class_id, student_id) values (classroom, a), (classroom, b), (classroom, c);
  -- Duplicate self enrollment must not double-count the student's class progress.
  insert into course_enrollments (student_id, course_id) values (a, course), (d, self_course), (d, empty_course);
  insert into class_modules (class_id, module_id, released_at) values (classroom, m, now()), (classroom, hidden, now() + interval '1 day');
  insert into module_rules (class_id, module_id, max_posttest_tries) values (classroom, m, 2);
  insert into activity_attempts (student_id, activity_id, class_id, attempt_no, score) values
    (a, pre, classroom, 1, 0.2), (a, pre, classroom, 2, 1),
    (a, post, classroom, 1, 0.4), (a, post, classroom, 2, 0.6), (a, post, classroom, 3, 1),
    (b, pre, classroom, 1, 0.9), (c, pre, classroom, 1, 0.1), (c, post, classroom, 1, 0),
    (d, sp, null, 1, 0.4), (d, st, null, 1, 0.5), (d, st, null, 4, 0.8);
  insert into api_keys (label, key_hash, created_by) values ('Read API fixture', digest, owner_id);

  foreach who in array array['anon', 'authenticated'] loop
    execute format('set local role %I', who);
    begin
      perform public.read_api_progress(digest);
      raise exception '% bypassed the HTTP key gate', who;
    exception when insufficient_privilege then null;
    end;
    reset role;
  end loop;
  set local role service_role;
  report := public.read_api_progress(digest);
  if public.read_api_progress(repeat('b', 64)) is not null then raise exception 'Unknown key accepted'; end if;
  reset role;
  if report->>'version' <> '1' or jsonb_array_length(report->'cohorts') <> 3 then raise exception 'Wrong cohort envelope %', report; end if;
  select x into cohort from jsonb_array_elements(report->'cohorts') x where x->>'class_id' = classroom::text;
  if not cohort @> '{"enrolled_students":3,"module_opportunities":3,"completed_modules":1,"tested_out_modules":1,"completion_pct":33.33,"assessment_pairs":2,"paired_pretest_pct":15,"paired_posttest_pct":30,"learning_gain_points":15}' then
    raise exception 'Class rules, tested-out completion, or paired scores incorrect %', cohort;
  end if;
  select x into cohort from jsonb_array_elements(report->'cohorts') x where x->>'course_id' = self_course::text;
  if not cohort @> '{"class_id":null,"enrolled_students":1,"module_opportunities":1,"completed_modules":1,"completion_pct":100,"assessment_pairs":1,"paired_pretest_pct":40,"paired_posttest_pct":80,"learning_gain_points":40}' then
    raise exception 'Self-paced best attempt incorrect %', cohort;
  end if;
  select x into cohort from jsonb_array_elements(report->'cohorts') x where x->>'course_id' = empty_course::text;
  if not cohort @> '{"module_opportunities":0,"completion_pct":null,"assessment_pairs":0,"paired_pretest_pct":null,"paired_posttest_pct":null,"learning_gain_points":null}' then
    raise exception 'Empty denominators must remain null %', cohort;
  end if;
  for cohort in select value from jsonb_array_elements(report->'cohorts') loop
    if cohort - array['course_id','class_id','course_title','class_name','enrolled_students','module_opportunities','completed_modules','tested_out_modules','completion_pct','assessment_pairs','paired_pretest_pct','paired_posttest_pct','learning_gain_points'] <> '{}'::jsonb then
      raise exception 'Unexpected report fields %', cohort;
    end if;
  end loop;
  if report::text like '%PRIVATE STUDENT%' or report::text like '%' || a::text || '%' then raise exception 'Student identity leaked'; end if;
  update api_keys set revoked_at = now() where key_hash = digest;
  set local role service_role;
  if public.read_api_progress(digest) is not null then raise exception 'Revoked key accepted'; end if;
  reset role;
end $$;
select 'aggregate_read_api: all checks passed' as result;
rollback;
