-- Disposable migrated database; use the real Auth worker session, not postgres.
begin;
create function pg_temp.expect_denied(q text) returns void language plpgsql as $$
begin
  begin execute q;
  exception when others then
    if position('STUDENT_ROSTER_REQUIRED' in sqlerrm) > 0 then return; end if;
    raise;
  end;
  raise exception 'Expected privacy rejection';
end $$;

insert into auth.users (id, email) values
  ('fa000000-0000-0000-0000-000000000001', 'timing-admin@example.invalid');
update profiles set role = 'admin' where id = 'fa000000-0000-0000-0000-000000000001';
insert into courses (id, title, owner_id) values
  ('fa000000-0000-0000-0000-000000000002', 'Timing fixture', 'fa000000-0000-0000-0000-000000000001');
insert into classes (id, name, school, course_id, join_code, created_by) values
  ('fa000000-0000-0000-0000-000000000003', 'Timing class', 'Example school',
   'fa000000-0000-0000-0000-000000000002', 'TIMING-QA', 'fa000000-0000-0000-0000-000000000001');
insert into class_students (id, class_id, display_name, passcode) values
  ('fa000000-0000-0000-0000-000000000004', 'fa000000-0000-0000-0000-000000000003', 'Timing student', '839751');
set constraints auth.guard_student_creation immediate;
set constraints auth.guard_student_creation deferred;
select set_config('request.jwt.claim.sub', '', true);
set session authorization supabase_auth_admin;

-- Personal email is rejected by the statement, before Auth could send mail.
select pg_temp.expect_denied($q$insert into auth.users (id, email, raw_app_meta_data)
  values (gen_random_uuid(), 'personal@example.invalid', '{"provider":"email"}')$q$);
-- A nonexistent roster address cannot even enter the deferred path.
select pg_temp.expect_denied($q$insert into auth.users (id, email)
  values (gen_random_uuid(), 'fa000000-0000-0000-0000-000000000099@students.cic.invalid')$q$);

-- Reproduce supported admin.createUser: marker arrives AFTER the INSERT.
insert into auth.users (id, email, raw_app_meta_data) values
  ('fa000000-0000-0000-0000-000000000005', 'fa000000-0000-0000-0000-000000000004@students.cic.invalid', '{"provider":"email"}');
update auth.users set raw_app_meta_data = raw_app_meta_data ||
  '{"cic_roster_id":"fa000000-0000-0000-0000-000000000004"}'::jsonb
  where id = 'fa000000-0000-0000-0000-000000000005';
-- Email changes must remain immediate even while creation is deferred.
select pg_temp.expect_denied($q$update auth.users set email_change = 'personal@example.invalid'
  where id = 'fa000000-0000-0000-0000-000000000005'$q$);
set constraints auth.guard_student_creation immediate;
delete from auth.users where id = 'fa000000-0000-0000-0000-000000000005';
set constraints auth.guard_student_creation deferred;

-- Force the transaction-end check inside each rollbackable negative case.
-- Neither knowing an existing card's address nor spoofing user_metadata works.
select pg_temp.expect_denied($q$
  insert into auth.users (id, email, raw_app_meta_data) values
    (gen_random_uuid(), 'fa000000-0000-0000-0000-000000000004@students.cic.invalid', '{"provider":"email"}');
  set constraints auth.guard_student_creation immediate$q$);
select pg_temp.expect_denied($q$
  insert into auth.users (id, email, raw_user_meta_data) values
    (gen_random_uuid(), 'fa000000-0000-0000-0000-000000000004@students.cic.invalid',
     '{"cic_roster_id":"fa000000-0000-0000-0000-000000000004","provider":"google"}');
  set constraints auth.guard_student_creation immediate$q$);
-- Validate final metadata, including removal of a marker present at INSERT.
select pg_temp.expect_denied($q$
  insert into auth.users (id, email, raw_app_meta_data) values
    ('fa000000-0000-0000-0000-000000000006', 'fa000000-0000-0000-0000-000000000004@students.cic.invalid',
     '{"cic_roster_id":"fa000000-0000-0000-0000-000000000004"}');
  update auth.users set raw_app_meta_data = '{"provider":"email"}'
    where id = 'fa000000-0000-0000-0000-000000000006';
  set constraints auth.guard_student_creation immediate$q$);
select pg_temp.expect_denied($q$
  insert into auth.users (id, email, raw_app_meta_data) values
    (gen_random_uuid(), 'fa000000-0000-0000-0000-000000000004@students.cic.invalid',
     '{"cic_roster_id":"fa000000-0000-0000-0000-000000000099"}');
  set constraints auth.guard_student_creation immediate$q$);

-- Deleted-in-transaction accounts leave nothing for the deferred guard to protect.
insert into auth.users (id, email) values
  ('fa000000-0000-0000-0000-000000000007', 'fa000000-0000-0000-0000-000000000004@students.cic.invalid');
delete from auth.users where id = 'fa000000-0000-0000-0000-000000000007';
set constraints auth.guard_student_creation immediate;
reset session authorization;
do $$ begin
  if exists (select 1 from auth.users where email = 'fa000000-0000-0000-0000-000000000004@students.cic.invalid') then
    raise exception 'Rejected synthetic identity persisted';
  end if;
end $$;
rollback;
