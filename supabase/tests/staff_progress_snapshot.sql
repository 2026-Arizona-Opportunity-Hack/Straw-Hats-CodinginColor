-- All migrations first, on disposable local PostgreSQL. No fixtures survive.
begin;
do $$
declare
  teacher uuid := gen_random_uuid(); other_teacher uuid := gen_random_uuid(); admin_id uuid := gen_random_uuid();
  student uuid := gen_random_uuid(); exhausted uuid := gen_random_uuid(); other_student uuid := gen_random_uuid();
  solo uuid := gen_random_uuid(); reviewer uuid := gen_random_uuid();
  course uuid := gen_random_uuid(); classroom uuid := gen_random_uuid(); other_class uuid := gen_random_uuid();
  m uuid := gen_random_uuid(); next_m uuid := gen_random_uuid(); l uuid := gen_random_uuid();
  pre uuid := gen_random_uuid(); post uuid := gen_random_uuid(); report jsonb; rows jsonb; who uuid;
begin
  insert into auth.users (id) values (teacher), (other_teacher), (admin_id), (student), (exhausted), (other_student), (solo), (reviewer);
  update profiles set role = 'instructor' where id in (teacher, other_teacher);
  update profiles set role = 'admin' where id = admin_id;
  update profiles set role = 'reviewer' where id = reviewer;
  -- This intentionally shared curriculum is global; local copies belong to one class (2011).
  insert into courses (id, title, owner_id, published, is_library) values (course, 'Canonical report fixture', teacher, true, true);
  insert into modules (id, course_id, position, title, concept, published) values
    (m, course, 1, 'First', 'A', true), (next_m, course, 2, 'Empty second', 'B', true);
  insert into lessons (id, module_id, position, title) values (l, m, 1, 'First');
  insert into activities (id, lesson_id, position, type, concept) values (pre, l, 1, 'pretest', 'A'), (post, l, 2, 'posttest', 'A');
  insert into classes (id, name, school, course_id, join_code, created_by) values
    (classroom, 'Mine', 'School', course, classroom::text, teacher), (other_class, 'Other', 'School', course, other_class::text, other_teacher);
  insert into enrollments (class_id, student_id) values (classroom, student), (classroom, exhausted), (other_class, other_student);
  insert into course_enrollments (student_id, course_id) values (solo, course);
  insert into module_rules (class_id, module_id, max_posttest_tries) values (classroom, m, 2);
  insert into activity_attempts (student_id, activity_id, class_id, attempt_no, score) values
    (student, pre, classroom, 1, 0.9), (exhausted, pre, classroom, 1, 0.2),
    (exhausted, post, classroom, 1, 0.3), (exhausted, post, classroom, 2, 0.4);
  -- Empty required work and a manual unlock are canonical states, even with no attempts.
  insert into module_unlocks (class_id, student_id, module_id, unlocked_by) values (other_class, other_student, next_m, other_teacher);

  set local role anon;
  begin
    perform public.staff_progress_snapshot();
    raise exception 'Anonymous caller accepted';
  exception when insufficient_privilege then null;
  end;
  reset role;
  set local role authenticated;
  foreach who in array array[student, reviewer] loop
    perform set_config('request.jwt.claim.sub', who::text, true);
    begin
      perform public.staff_progress_snapshot();
      raise exception 'Non-staff caller accepted';
    exception when insufficient_privilege then null;
    end;
  end loop;
  perform set_config('request.jwt.claim.sub', teacher::text, true);
  report := public.staff_progress_snapshot();
  rows := report->'modules';
  if jsonb_array_length(rows) <> 4 or exists (select 1 from jsonb_array_elements(rows) x where x->>'class_id' <> classroom::text or x->>'class_id' is null) then
    raise exception 'Teacher isolation or no-assignment fallback failed %', report;
  end if;
  if not rows @> jsonb_build_array(jsonb_build_object('student_id', student, 'module_id', m, 'state', 'completed', 'tested_out', true, 'done_count', 1, 'required_count', 2)) then
    raise exception 'Tested-out student reported incomplete';
  end if;
  if not rows @> jsonb_build_array(jsonb_build_object('student_id', exhausted, 'module_id', m, 'state', 'completed', 'posttest_best', 0.4)) then
    raise exception 'Exhausted counted attempts reported incomplete';
  end if;
  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  rows := public.staff_progress_snapshot()->'modules';
  if jsonb_array_length(rows) <> 8 or not rows @> jsonb_build_array(jsonb_build_object('student_id', solo, 'class_id', null)) then
    raise exception 'Admin cannot see every cohort';
  end if;
  if not rows @> jsonb_build_array(jsonb_build_object('student_id', other_student, 'module_id', next_m, 'state', 'completed')) then
    raise exception 'Manual unlock/zero-required completion lost';
  end if;
  if not rows @> jsonb_build_array(jsonb_build_object('student_id', solo, 'module_id', next_m, 'state', 'locked')) then
    raise exception 'Sequential lock lost';
  end if;
  reset role;
  update profiles set archived_at = now() where id = teacher;
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', teacher::text, true);
  begin
    perform public.staff_progress_snapshot();
    raise exception 'Archived teacher accepted';
  exception when insufficient_privilege then null;
  end;
  reset role;
end $$;
select 'staff_progress_snapshot: all checks passed' as result;
rollback;
