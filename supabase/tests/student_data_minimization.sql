-- Run against a disposable migrated Supabase database as postgres.
begin;
create function pg_temp.expect_denied(q text, expected text) returns void
language plpgsql as $$
begin
  begin
    execute q;
  exception when others then
    if position(expected in sqlerrm) > 0 then return; end if;
    raise;
  end;
  raise exception 'Expected rejection: %', q;
end $$;

insert into auth.users (id, email) values
  ('f1000000-0000-0000-0000-000000000001', 'legacy@example.invalid'),
  ('f1000000-0000-0000-0000-000000000002', 'admin@example.invalid');
update profiles set role = 'admin' where id = 'f1000000-0000-0000-0000-000000000002';
insert into courses (id, title, owner_id) values
  ('f2000000-0000-0000-0000-000000000001', 'Privacy fixture', 'f1000000-0000-0000-0000-000000000002');
insert into classes (id, name, school, course_id, join_code, created_by) values
  ('f3000000-0000-0000-0000-000000000001', 'Privacy class', 'Example school',
   'f2000000-0000-0000-0000-000000000001', 'PRIVACY-QA', 'f1000000-0000-0000-0000-000000000002');
insert into class_students (id, class_id, display_name, passcode) values
  ('f4000000-0000-0000-0000-000000000001', 'f3000000-0000-0000-0000-000000000001', 'Roster student', '947321');

-- GoTrue's database connection is not the privileged SQL/seed operator.
set session authorization supabase_auth_admin;
select pg_temp.expect_denied($q$insert into auth.users (id, email) values
  ('f1000000-0000-0000-0000-000000000003', 'new-student@example.invalid')$q$, 'STUDENT_ROSTER_REQUIRED');
select pg_temp.expect_denied($q$insert into auth.users (id, email, raw_user_meta_data) values
  ('f1000000-0000-0000-0000-000000000003', 'f4000000-0000-0000-0000-000000000001@students.cic.invalid',
   '{"cic_roster_id":"f4000000-0000-0000-0000-000000000001"}')$q$, 'STUDENT_ROSTER_REQUIRED');
select pg_temp.expect_denied($q$insert into auth.users (id, email, raw_app_meta_data) values
  ('f1000000-0000-0000-0000-000000000003', 'new-student@example.invalid',
   '{"cic_roster_id":"f4000000-0000-0000-0000-000000000001"}')$q$, 'STUDENT_ROSTER_REQUIRED');
insert into auth.users (id, email, raw_app_meta_data) values
  ('f1000000-0000-0000-0000-000000000003', 'f4000000-0000-0000-0000-000000000001@students.cic.invalid',
   '{"cic_roster_id":"f4000000-0000-0000-0000-000000000001"}');
select pg_temp.expect_denied($q$update auth.users set email_change = 'personal@example.invalid'
  where id = 'f1000000-0000-0000-0000-000000000003'$q$, 'STUDENT_ROSTER_REQUIRED');
select pg_temp.expect_denied($q$update auth.users set email = 'personal@example.invalid'
  where id = 'f1000000-0000-0000-0000-000000000001'$q$, 'STUDENT_ROSTER_REQUIRED');
-- Existing student login updates and staff email changes still work.
update auth.users set updated_at = now(), email = email
  where id = 'f1000000-0000-0000-0000-000000000001';
update auth.users set email = 'staff-new@example.invalid'
  where id = 'f1000000-0000-0000-0000-000000000002';
reset session authorization;

set local role anon;
select pg_temp.expect_denied($q$select student_sign_up('bypass@example.invalid', 'test-password', 'Test')$q$,
  'permission denied');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'f1000000-0000-0000-0000-000000000001', true);
select pg_temp.expect_denied($q$select student_sign_up('bypass@example.invalid', 'test-password', 'Test')$q$,
  'permission denied');
select pg_temp.expect_denied($q$select admin_create_user('bypass@example.invalid', 'test-password', 'Test', 'admin')$q$,
  'ADMINS_ONLY');
select set_config('request.jwt.claim.sub', 'f1000000-0000-0000-0000-000000000002', true);
select pg_temp.expect_denied($q$select admin_create_user('bypass@example.invalid', 'test-password', 'Test', 'student')$q$,
  'USE_STUDENT_ROSTER');
select admin_create_user('new-teacher@example.invalid', 'test-password', 'Teacher', 'instructor', null,
  'f3000000-0000-0000-0000-000000000001');
select admin_create_user('new-reviewer@example.invalid', 'test-password', 'Reviewer', 'reviewer');
select admin_create_user('new-admin@example.invalid', 'test-password', 'Admin', 'admin');
reset role;
do $$ begin
  if (select count(*) from profiles where display_name in ('Teacher','Reviewer','Admin') and role <> 'student') <> 3
    or (select email from auth.users where id = 'f1000000-0000-0000-0000-000000000001') <> 'legacy@example.invalid'
    or not exists (select 1 from class_instructors ci join profiles p on p.id = ci.instructor_id
      where ci.class_id = 'f3000000-0000-0000-0000-000000000001' and p.display_name = 'Teacher') then
    raise exception 'Staff provisioning or legacy account preservation failed';
  end if;
end $$;
rollback;
