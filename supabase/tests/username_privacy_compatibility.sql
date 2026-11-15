-- Disposable migrated database only. Simulate PostgREST and Auth worker sessions,
-- not just SET ROLE under postgres (which is intentionally trusted for seeds).
begin;
create function pg_temp.expect_denied(q text, expected text) returns void
language plpgsql as $$
begin
  begin execute q;
  exception when others then
    if position(expected in sqlerrm) > 0 then return; end if;
    raise;
  end;
  raise exception 'Expected rejection: %', q;
end $$;
insert into auth.users (id, email) values
  ('f9000000-0000-0000-0000-000000000001', 'compat-admin@example.invalid');
update profiles set role = 'admin' where id = 'f9000000-0000-0000-0000-000000000001';

set session authorization authenticator;
set local role anon;
do $$ declare result jsonb;
begin
  result := public.student_create_account('Zoe', 'Compat', 'test-password');
  if result->>'username' <> 'zcompat1' then raise exception 'Username signup failed: %', result; end if;
  perform set_config('test.username_id', result->>'user_id', true);
  result := public.student_create_account('Zoe', 'Compat', 'test-password');
  if result->>'username' <> 'zcompat2' then raise exception 'Duplicate username: %', result; end if;
end $$;
select pg_temp.expect_denied($q$select public.student_sign_up('personal@example.invalid', 'test-password', 'Name')$q$, 'permission denied');
select pg_temp.expect_denied($q$select public._create_student('Name', 'Other', 'test-password', null)$q$, 'permission denied');
select pg_temp.expect_denied($q$insert into auth.users (id, email) values (gen_random_uuid(), 'personal@example.invalid')$q$, 'permission denied');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'f9000000-0000-0000-0000-000000000001', true);
do $$ declare result jsonb;
begin
  result := public.admin_create_student('Abby', 'Compat', 'test-password');
  if result->>'username' <> 'acompat1' then raise exception 'Admin username signup failed'; end if;
end $$;
select public.admin_create_user('compat-staff@example.invalid', 'test-password', 'Compat staff', 'reviewer');
select pg_temp.expect_denied($q$select public.admin_create_user('personal@example.invalid', 'test-password', 'Name', 'student')$q$, 'USE_STUDENT_ROSTER');
select set_config('request.jwt.claim.sub', current_setting('test.username_id'), true);
select pg_temp.expect_denied($q$select public.admin_create_student('Fake', 'Admin', 'test-password')$q$, 'ADMINS_ONLY');
select pg_temp.expect_denied($q$select public.student_sign_up('personal@example.invalid', 'test-password', 'Name')$q$, 'permission denied');
reset role;
reset session authorization;
-- A real Auth worker has no PostgREST request JWT subject.
select set_config('request.jwt.claim.sub', '', true);
set session authorization supabase_auth_admin;
select pg_temp.expect_denied($q$insert into auth.users (id, email, raw_app_meta_data) values
  (gen_random_uuid(), 'personal@example.invalid', '{"provider":"email"}')$q$, 'STUDENT_ROSTER_REQUIRED');
select pg_temp.expect_denied($q$insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  (gen_random_uuid(), 'personal@example.invalid', '{"provider":"email"}', '{"provider":"google","role":"reviewer"}')$q$, 'STUDENT_ROSTER_REQUIRED');
select pg_temp.expect_denied($q$insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  (gen_random_uuid(), 'preclaimed1@students.cic-learn.invalid', '{"provider":"email"}', '{"cic_username":"preclaimed1"}')$q$, 'STUDENT_ROSTER_REQUIRED');
select pg_temp.expect_denied($q$insert into auth.users (id, email, raw_app_meta_data) values
  (gen_random_uuid(), 'personal@example.invalid', '{"provider":"email","cic_username":"preclaimed1"}')$q$, 'STUDENT_ROSTER_REQUIRED');
select pg_temp.expect_denied($q$update auth.users set email_change = 'personal@example.invalid'
  where id = current_setting('test.username_id')::uuid$q$, 'STUDENT_ROSTER_REQUIRED');
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('f9000000-0000-0000-0000-000000000002', 'educator@example.invalid', '{"provider":"google","providers":["google"]}', '{"role":"admin","display_name":"Educator"}');
update auth.users set updated_at = now() where id = current_setting('test.username_id')::uuid;
reset session authorization;
do $$ begin
  if not exists (select 1 from profiles p join auth.users u on u.id = p.id
    where p.id = current_setting('test.username_id')::uuid and p.username = 'zcompat1'
      and p.role = 'student' and u.email = 'zcompat1@students.cic-learn.invalid'
      and u.raw_app_meta_data->>'cic_username' = 'zcompat1'
      and extensions.crypt('test-password', u.encrypted_password) = u.encrypted_password)
    or (select count(*) from auth.identities where user_id = current_setting('test.username_id')::uuid) <> 1 then
    raise exception 'Username identity or password was not preserved';
  end if;
  if (select role from profiles where id = 'f9000000-0000-0000-0000-000000000002') <> 'reviewer'
    or not exists (select 1 from profiles where display_name = 'Compat staff' and role = 'reviewer') then
    raise exception 'Google reviewer or authorized staff creation regressed';
  end if;
end $$;
rollback;
