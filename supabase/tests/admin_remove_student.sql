-- Local migrated database only. All fixtures and mutations roll back.
begin;

insert into auth.users (id) values
  ('84900000-0000-0000-0000-000000000001'), ('84900000-0000-0000-0000-000000000002'),
  ('84900000-0000-0000-0000-000000000003'), ('84900000-0000-0000-0000-000000000004');
insert into profiles (id, role, display_name, archived_at) values
  ('84900000-0000-0000-0000-000000000001', 'admin', 'QA admin', null),
  ('84900000-0000-0000-0000-000000000002', 'instructor', 'QA instructor', null),
  ('84900000-0000-0000-0000-000000000003', 'student', 'QA student', null),
  ('84900000-0000-0000-0000-000000000004', 'admin', 'QA archived admin', now())
on conflict (id) do update set role = excluded.role, display_name = excluded.display_name, archived_at = excluded.archived_at;
insert into courses (id, title, owner_id, published) values
  ('84900000-0000-0000-0000-000000000011', 'QA course one', '84900000-0000-0000-0000-000000000002', true),
  ('84900000-0000-0000-0000-000000000012', 'QA course two', '84900000-0000-0000-0000-000000000002', true);
insert into classes (id, name, school, course_id, join_code, created_by) values
  ('84900000-0000-0000-0000-000000000021', 'Period 1', 'QA North', '84900000-0000-0000-0000-000000000011',
   'QA-REMOVE-N', '84900000-0000-0000-0000-000000000002'),
  ('84900000-0000-0000-0000-000000000022', 'Period 1', 'QA South', '84900000-0000-0000-0000-000000000012',
   'QA-REMOVE-S', '84900000-0000-0000-0000-000000000002');
insert into enrollments (class_id, student_id) values
  ('84900000-0000-0000-0000-000000000021', '84900000-0000-0000-0000-000000000003'),
  ('84900000-0000-0000-0000-000000000022', '84900000-0000-0000-0000-000000000003');
insert into assignments (id, class_id, kind, title) values
  ('84900000-0000-0000-0000-000000000031', '84900000-0000-0000-0000-000000000021', 'written', 'QA assignment');

do $$
declare
  admin_id uuid := '84900000-0000-0000-0000-000000000001';
  instructor_id uuid := '84900000-0000-0000-0000-000000000002';
  student uuid := '84900000-0000-0000-0000-000000000003';
  archived_id uuid := '84900000-0000-0000-0000-000000000004';
  north uuid := '84900000-0000-0000-0000-000000000021';
  south uuid := '84900000-0000-0000-0000-000000000022';
  card public.class_students%rowtype;
  actor uuid;
begin
  select * into strict card from class_students where class_id = north and profile_id = student;
  insert into assignment_submissions (assignment_id, class_id, class_student_id, responses)
  values ('84900000-0000-0000-0000-000000000031', north, card.id, '{"answer":"Keep this work"}');

  if has_function_privilege('anon', 'public.admin_remove_student(uuid,uuid)', 'EXECUTE') then
    raise exception 'Anonymous class removal is available';
  end if;
  foreach actor in array array[instructor_id, student, archived_id] loop
    perform set_config('request.jwt.claim.sub', actor::text, true);
    set local role authenticated;
    begin
      perform admin_remove_student(student, north);
      raise exception 'Unauthorized removal by %', actor;
    exception when insufficient_privilege then
      if sqlerrm <> 'ADMINS_ONLY' then raise; end if;
    end;
    reset role;
  end loop;

  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  set local role authenticated;
  perform admin_remove_student(student, north);
  perform admin_remove_student(student, north);
  reset role;

  if exists (select 1 from enrollments e where e.class_id = north and e.student_id = student)
     or not exists (select 1 from enrollments e where e.class_id = south and e.student_id = student)
     or not exists (select 1 from profiles where id = student)
     or not exists (select 1 from class_students where id = card.id and passcode is null)
     or not exists (select 1 from assignment_submissions where class_student_id = card.id and responses->>'answer' = 'Keep this work') then
    raise exception 'Removal changed the wrong enrollment, account, card, or assignment history';
  end if;
  if prepare_roster_login('QA-REMOVE-N', card.passcode)->>'error' is distinct from 'INVALID_LOGIN'
     or bind_roster_login(card.id, 'QA-REMOVE-N', card.passcode, student)->>'error' is distinct from 'INVALID_LOGIN' then
    raise exception 'Retired card can still sign in or finish a pending login';
  end if;

  perform set_config('request.jwt.claim.sub', instructor_id::text, true);
  set local role authenticated;
  begin
    update class_students set passcode = card.passcode where id = card.id;
    raise exception 'Stale roster update restored the retired card';
  exception when insufficient_privilege then
    if sqlerrm <> 'ROSTER_CARD_RETIRED' then raise; end if;
  end;
  reset role;

  perform set_config('request.jwt.claim.sub', student::text, true);
  set local role authenticated;
  if exists (select 1 from my_courses() c where c.class_id = north)
     or not exists (select 1 from my_courses() c where c.class_id = south) then
    raise exception 'Student class access does not match their remaining enrollment';
  end if;
  reset role;

  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  set local role authenticated;
  perform admin_enroll_student(student, north);
  reset role;
  if not exists (select 1 from class_students where id = card.id and passcode is not null)
     or not exists (select 1 from assignment_submissions where class_student_id = card.id) then
    raise exception 'Re-enrollment failed to restore the card and its prior work';
  end if;
end $$;

rollback;
