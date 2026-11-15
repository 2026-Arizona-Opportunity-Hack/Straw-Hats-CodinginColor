-- Disposable migrated database only; all fixtures roll back.
begin;
insert into auth.users (id) values
  ('b1000000-0000-0000-0000-000000000001'),
  ('b1000000-0000-0000-0000-000000000002'),
  ('b1000000-0000-0000-0000-000000000003');
update profiles set role = 'instructor' where id in
  ('b1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000002');
insert into courses (id, title, owner_id) values
  ('b2000000-0000-0000-0000-000000000001', 'Class role fixture', 'b1000000-0000-0000-0000-000000000001');
insert into classes (id, name, school, course_id, join_code, created_by) values
  ('b3000000-0000-0000-0000-000000000001', 'Class role fixture', 'Test school',
   'b2000000-0000-0000-0000-000000000001', 'CLASS-ROLE-TEST', 'b1000000-0000-0000-0000-000000000001');
insert into class_instructors (class_id, instructor_id) values
  ('b3000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000002');
insert into enrollments (class_id, student_id) values
  ('b3000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000003');
insert into modules (id, course_id, position, title, concept) values
  ('b4000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001', 1, 'Module', 'QA');
insert into lessons (id, module_id, position, title) values
  ('b5000000-0000-0000-0000-000000000001', 'b4000000-0000-0000-0000-000000000001', 1, 'Lesson');
insert into activities (id, lesson_id, position, type, concept) values
  ('b6000000-0000-0000-0000-000000000001', 'b5000000-0000-0000-0000-000000000001', 1, 'check', 'QA');
insert into activity_attempts (student_id, activity_id, class_id) values
  ('b1000000-0000-0000-0000-000000000003', 'b6000000-0000-0000-0000-000000000001', 'b3000000-0000-0000-0000-000000000001');

do $$
declare t record; changed int;
begin
  for t in select * from (values
    ('instructor', false, true), ('reviewer', false, false),
    ('student', false, false), ('instructor', true, false), ('admin', false, true)
  ) as cases(role, archived, allowed) loop
    update profiles set role = t.role::user_role, archived_at = case when t.archived then now() end
      where id = 'b1000000-0000-0000-0000-000000000001';
    set local role authenticated;
    perform set_config('request.jwt.claim.sub', 'b1000000-0000-0000-0000-000000000001', true);
    if (select count(passcode) from class_students where class_id = 'b3000000-0000-0000-0000-000000000001') <> t.allowed::int
       or (select count(*) from activity_attempts where class_id = 'b3000000-0000-0000-0000-000000000001') <> t.allowed::int then
      raise exception 'Student records exposed/hidden incorrectly for %, archived %', t.role, t.archived;
    end if;
    update class_students set display_name = display_name where class_id = 'b3000000-0000-0000-0000-000000000001';
    get diagnostics changed = row_count;
    if changed <> t.allowed::int then raise exception 'Wrong roster-write access for %', t.role; end if;
    reset role;
  end loop;
end $$;

-- An active assigned teacher keeps access, independent of the creator's status.
update profiles set role = 'reviewer' where id = 'b1000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b1000000-0000-0000-0000-000000000002', true);
do $$ begin
  if not teaches_class('b3000000-0000-0000-0000-000000000001')
     or (select count(passcode) from class_students where class_id = 'b3000000-0000-0000-0000-000000000001') <> 1 then
    raise exception 'Assigned instructor lost roster access';
  end if;
end $$;
reset role;

-- An active instructor creator keeps management access without an assignment.
delete from class_instructors where instructor_id = 'b1000000-0000-0000-0000-000000000001';
update profiles set role = 'instructor', archived_at = null where id = 'b1000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b1000000-0000-0000-0000-000000000001', true);
do $$ begin
  if teaches_class('b3000000-0000-0000-0000-000000000001')
     or not can_manage_class('b3000000-0000-0000-0000-000000000001')
     or (select count(passcode) from class_students where class_id = 'b3000000-0000-0000-0000-000000000001') <> 1 then
    raise exception 'Active creator lost management access';
  end if;
end $$;
reset role;
rollback;
