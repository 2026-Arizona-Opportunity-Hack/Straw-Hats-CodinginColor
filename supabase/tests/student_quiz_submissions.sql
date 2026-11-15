-- Run against a disposable database with all migrations applied.
begin;

insert into auth.users (id) values
  ('91800000-0000-0000-0000-000000000001'),
  ('91800000-0000-0000-0000-000000000002'),
  ('91800000-0000-0000-0000-000000000003');
insert into public.profiles (id, role, display_name) values
  ('91800000-0000-0000-0000-000000000001', 'instructor', 'Quiz teacher'),
  ('91800000-0000-0000-0000-000000000002', 'student', 'Enrolled learner'),
  ('91800000-0000-0000-0000-000000000003', 'student', 'Other learner')
on conflict (id) do update set role = excluded.role, display_name = excluded.display_name;
insert into public.courses (id, title, owner_id, published)
values ('91800000-0000-0000-0000-000000000010', 'Quiz course', '91800000-0000-0000-0000-000000000001', true);
insert into public.classes (id, name, school, join_code, course_id, created_by)
values ('91800000-0000-0000-0000-000000000020', 'Quiz class', 'Quiz school', 'QA-QUIZ-3020',
        '91800000-0000-0000-0000-000000000010', '91800000-0000-0000-0000-000000000001');
insert into public.enrollments (class_id, student_id)
values ('91800000-0000-0000-0000-000000000020', '91800000-0000-0000-0000-000000000002');

do $$
declare
  teacher constant uuid := '91800000-0000-0000-0000-000000000001';
  learner constant uuid := '91800000-0000-0000-0000-000000000002';
  outsider constant uuid := '91800000-0000-0000-0000-000000000003';
  classroom constant uuid := '91800000-0000-0000-0000-000000000020';
  quiz constant uuid := '91800000-0000-0000-0000-000000000030';
  legacy constant uuid := '91800000-0000-0000-0000-000000000031';
  contents jsonb;
  revision timestamptz;
  first_answers constant jsonb := '{"choice":[0,2],"word":"Example","explain":"I checked my output."}';
  latest_answers constant jsonb := '{"choice":[0,2],"word":"Example updated","explain":"I checked my output."}';
begin
  perform set_config('request.jwt.claim.sub', teacher::text, true);
  set local role authenticated;
  insert into public.assignments (id, class_id, kind, title, max_attempts, content)
  values
    (quiz, classroom, 'quiz', 'Three quiz blocks', 3, '{"blocks":[
      {"id":"choice","type":"question","question":{"kind":"multiple","prompt":"Pick two","points":2,"choices":["A","B","C"],"correct":[0,2]}},
      {"id":"word","type":"question","question":{"kind":"short","prompt":"Word","points":1,"accepted":["Example"]}},
      {"id":"explain","type":"written","prompt":"Explain","points":2}]}'),
    (legacy, classroom, 'quiz', 'Legacy quiz', 1, '{"quiz":{"questions":[
      {"id":"old-id","kind":"numeric","prompt":"Number","points":2,"answer":7,"tolerance":0},
      {"id":"tolerance-id","kind":"numeric","prompt":"Tolerance boundary","points":1,"answer":0.3,"tolerance":0.1}]}}');
  update public.assignments set published = true where id = legacy;

  perform set_config('request.jwt.claim.sub', learner::text, true);
  if exists (select 1 from public.my_class_quizzes() where id = quiz) or public.my_class_quiz(quiz) is not null then
    raise exception 'Draft visible to learner';
  end if;
  perform public.submit_class_quiz(legacy, '{"legacy-question-1":"7","legacy-question-2":"0.4"}', 0,
    (public.my_class_quiz(legacy)->>'revision')::timestamptz);
  if public.my_class_quiz(legacy) #>> '{blocks,0,id}' <> 'legacy-question-1'
     or (public.my_class_quiz(legacy) #> '{blocks,0,question}') ?| array['answer','tolerance']
     or public.my_class_quiz(legacy)->'score' <> '{"earned":2,"possible":3}'::jsonb
     or not exists (select 1 from public.my_class_quizzes() where id = legacy and graded) then
    raise exception 'Legacy question not normalized or leaky';
  end if;

  perform set_config('request.jwt.claim.sub', teacher::text, true);
  update public.assignments set published = true where id = quiz returning updated_at into revision;
  perform set_config('request.jwt.claim.sub', outsider::text, true);
  if exists (select 1 from public.my_class_quizzes() where id = quiz) or public.my_class_quiz(quiz) is not null then
    raise exception 'Quiz visible to an unenrolled learner';
  end if;
  begin
    perform public.submit_class_quiz(quiz, first_answers, 0, revision);
    raise exception 'Unenrolled submission accepted';
  exception when insufficient_privilege then
    if sqlerrm <> 'QUIZ_UNAVAILABLE' then raise; end if;
  end;

  perform set_config('request.jwt.claim.sub', learner::text, true);
  contents := public.my_class_quiz(quiz);
  if contents is null or exists (select from public.assignments where id = quiz)
     or (contents #> '{blocks,0,question}') ? 'correct' or (contents #> '{blocks,1,question}') ? 'accepted' then
    raise exception 'Published quiz unavailable or answer key exposed';
  end if;
  begin
    perform public.submit_class_quiz(quiz, first_answers, 0, revision - interval '1 second');
    raise exception 'A stale quiz revision accepted a submission';
  exception when invalid_parameter_value then
    if sqlerrm <> 'QUIZ_CHANGED' then raise; end if;
  end;
  perform public.submit_class_quiz(quiz, first_answers, 0, revision);
  perform public.submit_class_quiz(quiz, first_answers, 0, revision);
  if (public.my_class_quiz(quiz)->>'attemptCount')::int <> 1 then raise exception 'Retry counted twice'; end if;
  perform public.submit_class_quiz(quiz, latest_answers, 1, revision);
  begin
    perform public.submit_class_quiz(quiz, first_answers, 0, revision);
    raise exception 'Stale submission overwrote the latest work';
  exception when invalid_parameter_value then
    if sqlerrm <> 'QUIZ_SUBMISSION_CLOSED' then raise; end if;
  end;

  perform set_config('request.jwt.claim.sub', teacher::text, true);
  if not exists (select from public.assignment_submissions where assignment_id = quiz
      and responses = latest_answers and attempt_count = 2) then
    raise exception 'Teacher cannot see the actual submitted answers';
  end if;
  begin
    delete from public.assignments where id = quiz;
    raise exception 'Deleting the quiz removed existing submissions';
  exception when check_violation then
    if sqlerrm not like 'This quiz has submissions.%' then raise; end if;
  end;
  begin
    update public.assignments set content = '{"blocks":[]}' where id = quiz;
    raise exception 'Editing the quiz changed the meaning of submitted answers';
  exception when check_violation then
    if sqlerrm not like 'This quiz has submissions.%' then raise; end if;
  end;
  update public.assignment_submissions set feedback = 'Draft feedback' where assignment_id = quiz;
  perform set_config('request.jwt.claim.sub', learner::text, true);
  contents := public.my_class_quiz(quiz);
  if contents->>'feedback' is not null or (contents->>'canSubmit')::boolean then
    raise exception 'Partial grading leaked feedback or kept retry open';
  end if;
  begin
    perform public.submit_class_quiz(quiz, first_answers, 2, revision);
    raise exception 'A retry replaced a partially graded submission';
  exception when invalid_parameter_value then
    if sqlerrm <> 'QUIZ_SUBMISSION_CLOSED' then raise; end if;
  end;
  perform set_config('request.jwt.claim.sub', teacher::text, true);
  update public.assignment_submissions set manual_scores = '{"explain":2}', feedback = 'Clear explanation.',
    graded_at = now(), graded_by = teacher where assignment_id = quiz;

  perform set_config('request.jwt.claim.sub', learner::text, true);
  contents := public.my_class_quiz(quiz);
  if contents->>'feedback' <> 'Clear explanation.' or contents->>'gradedAt' is null
     or contents->'score' <> '{"earned":4,"possible":5}'::jsonb
     or (contents->>'canSubmit')::boolean or exists (select from public.assignment_submissions where assignment_id = quiz) then
    raise exception 'Grade review did not preserve learner privacy or submitted work';
  end if;
  reset role;

  if has_function_privilege('anon', 'public.submit_class_quiz(uuid,jsonb,integer,timestamptz)', 'EXECUTE') then
    raise exception 'Anonymous submissions are possible';
  end if;
end $$;

rollback;
