-- Disposable migrated database. All fixtures roll back.
begin;
do $$
declare
  teacher uuid := gen_random_uuid();
  outsider uuid := gen_random_uuid();
  course_id uuid := gen_random_uuid();
  qa_class uuid := gen_random_uuid();
  outsider_class uuid := gen_random_uuid();
  outsider_course uuid := gen_random_uuid();
  module_id uuid := gen_random_uuid();
  lesson_id uuid := gen_random_uuid();
  activity_id uuid := gen_random_uuid();
  assignment_id uuid := gen_random_uuid();
  imported uuid := gen_random_uuid();
  occupied uuid := gen_random_uuid();
  other_import uuid := gen_random_uuid();
  account uuid;
  student uuid;
  signup jsonb;
  actor uuid;
begin
  insert into auth.users (id) values (teacher), (outsider);
  update public.profiles set role = 'instructor' where id in (teacher, outsider);
  insert into public.courses (id, title, owner_id, published)
  values (course_id, 'Roster matching fixture', teacher, true),
         (outsider_course, 'Unrelated course fixture', outsider, true);
  insert into public.classes (id, name, school, course_id, join_code, created_by)
  values (qa_class, 'QA class', 'Fixture school', course_id, 'QA-NAME-MATCH', teacher),
         (outsider_class, 'Other class', 'Other school', outsider_course, 'QA-OTHER-MATCH', outsider);

  insert into public.class_students (id, class_id, display_name, passcode)
  values (imported, qa_class, '  SOFÍA   Rivera  ', '810201'),
         (occupied, qa_class, 'Saved Work', '810202'),
         (other_import, outsider_class, 'Sofía Rivera', '810203');
  insert into public.class_students (class_id, display_name, passcode)
  values (qa_class, 'Same Name', '810204'), (qa_class, 'Same Name', '810205'),
         (qa_class, 'Two Accounts', '810206'), (qa_class, 'Archived Student', '810207');

  set local role anon;
  signup := public.student_create_account('Sofía', 'Rivera', 'fixture-password-88', 'QA-NAME-MATCH');
  perform public.student_create_account('Saved', 'Work', 'fixture-password-88', 'QA-NAME-MATCH');
  perform public.student_create_account('Same', 'Name', 'fixture-password-88', 'QA-NAME-MATCH');
  perform public.student_create_account('Two', 'Accounts', 'fixture-password-88', 'QA-NAME-MATCH');
  perform public.student_create_account('Two', 'Accounts', 'fixture-password-88', 'QA-NAME-MATCH');
  perform public.student_create_account('Archived', 'Student', 'fixture-password-88', 'QA-NAME-MATCH');
  reset role;
  student := (signup ->> 'user_id')::uuid;
  select r.id into strict account from public.class_students r where r.profile_id = student;
  update public.profiles set archived_at = now() where display_name = 'Archived Student';

  insert into public.modules (id, course_id, position, title, concept, published) values (module_id, course_id, 1, 'QA module', 'QA concept', true);
  insert into public.lessons (id, module_id, position, title) values (lesson_id, module_id, 1, 'QA lesson');
  insert into public.activities (id, lesson_id, position, type, concept, content) values (activity_id, lesson_id, 1, 'worksheet', 'QA concept', '{}');
  insert into public.activity_attempts (student_id, activity_id, class_id, score, response, submitted_at)
  values (student, activity_id, qa_class, .75, '{"text":"Keep this response"}', now());
  insert into public.assignments (id, class_id, kind, title) values (assignment_id, qa_class, 'written', 'QA written work');
  insert into public.assignment_submissions (assignment_id, class_id, class_student_id, responses)
  values (assignment_id, qa_class, account, '{"answer":"Keep this submission"}'),
         (assignment_id, qa_class, occupied, '{"answer":"Keep imported work too"}');

  if has_function_privilege('anon', 'public.list_roster_name_matches(uuid)', 'execute')
     or has_function_privilege('anon', 'public.confirm_roster_name_match(uuid,uuid,uuid)', 'execute') then
    raise exception 'Anonymous role has roster matching access';
  end if;
  foreach actor in array array[outsider, student] loop
    perform set_config('request.jwt.claim.sub', actor::text, true);
    set local role authenticated;
    if exists (select 1 from public.list_roster_name_matches(qa_class)) then raise exception 'Roster suggestions crossed access scope'; end if;
    begin
      perform public.confirm_roster_name_match(qa_class, imported, account);
      raise exception 'Unauthorized confirmation';
    exception when insufficient_privilege then null;
    end;
    reset role;
  end loop;

  perform set_config('request.jwt.claim.sub', teacher::text, true);
  set local role authenticated;
  if (select count(*) from public.list_roster_name_matches(qa_class)) <> 1
     or not exists (select 1 from public.list_roster_name_matches(qa_class) m
                   where m.imported_id = imported and m.account_id = account and m.username = signup ->> 'username') then
    raise exception 'Suggestion should contain exactly one scoped, unambiguous name match';
  end if;
  begin
    perform public.confirm_roster_name_match(qa_class, other_import, account);
    raise exception 'Confirmed an entry from the wrong class';
  exception when raise_exception then
    if sqlerrm <> 'ROSTER_MATCH_CHANGED' then raise; end if;
  end;
  perform public.confirm_roster_name_match(qa_class, imported, account);
  begin
    perform public.confirm_roster_name_match(qa_class, imported, account);
    raise exception 'Stale confirmation succeeded';
  exception when raise_exception then
    if sqlerrm <> 'ROSTER_MATCH_CHANGED' then raise; end if;
  end;
  reset role;

  if exists (select 1 from public.class_students r where r.id = imported)
     or not exists (select 1 from public.class_students r where r.id = account and r.profile_id = student)
     or not exists (select 1 from public.enrollments e where e.class_id = qa_class and e.student_id = student)
     or not exists (select 1 from public.activity_attempts a where a.student_id = student and a.score = .75)
     or (select count(*) from public.assignment_submissions s where s.class_student_id in (account, occupied)) <> 2 then
    raise exception 'Confirmation did not preserve the linked roster, enrollment, progress and submissions';
  end if;
end
$$;
rollback;
