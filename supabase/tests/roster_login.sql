-- Local migrated development database only. Auth fixtures simulate admin.createUser.
begin;
insert into auth.users (id, email, raw_app_meta_data) values
  ('91000000-0000-0000-0000-000000000001', 'roster-teacher@test.invalid', '{}'),
  ('91000000-0000-0000-0000-000000000002', 'legacy@test.invalid', '{}');
update profiles set role = 'instructor' where id = '91000000-0000-0000-0000-000000000001';
insert into courses (id, title, owner_id) values
  ('92000000-0000-0000-0000-000000000001', 'Login test', '91000000-0000-0000-0000-000000000001');
insert into classes (id, name, school, course_id, join_code, created_by) values
  ('93000000-0000-0000-0000-000000000001', 'Roster test', 'Test school', '92000000-0000-0000-0000-000000000001', 'QA-ROSTER', '91000000-0000-0000-0000-000000000001');
insert into class_students (id, class_id, display_name, passcode, profile_id) values
  ('94000000-0000-0000-0000-000000000001', '93000000-0000-0000-0000-000000000001', 'Imported learner', '012345', null),
  ('94000000-0000-0000-0000-000000000002', '93000000-0000-0000-0000-000000000001', 'Existing learner', '654321', '91000000-0000-0000-0000-000000000002');

do $$ begin
  if has_function_privilege('anon', 'prepare_roster_login(text,text)', 'execute')
     or has_function_privilege('authenticated', 'bind_roster_login(uuid,text,text,uuid)', 'execute') then
    raise exception 'Client can call privileged provisioning';
  end if;
  if prepare_roster_login(' qa-roster ', '012345')->>'email' <> '94000000-0000-0000-0000-000000000001@students.cic.invalid' then
    raise exception 'Login card did not resolve';
  end if;
end $$;
-- An attacker preclaims the predictable identity without the trusted marker.
insert into auth.users (id, email, raw_app_meta_data) values
  ('91000000-0000-0000-0000-000000000003', '94000000-0000-0000-0000-000000000001@students.cic.invalid', '{}');
do $$ begin
  if bind_roster_login('94000000-0000-0000-0000-000000000001', 'QA-ROSTER', '012345', '91000000-0000-0000-0000-000000000003')->>'error' is distinct from 'INVALID_LOGIN' then
    raise exception 'Untrusted identity was bound';
  end if;
end $$;
delete from auth.users where id = '91000000-0000-0000-0000-000000000003';
insert into auth.users (id, email, raw_app_meta_data) values
  ('91000000-0000-0000-0000-000000000003', '94000000-0000-0000-0000-000000000001@students.cic.invalid', '{"cic_roster_id":"94000000-0000-0000-0000-000000000001"}');

set local role service_role;
do $$ begin
  if prepare_roster_login('QA-ROSTER', '012345')->>'profile_id' is distinct from '91000000-0000-0000-0000-000000000003' then
    raise exception 'Interrupted creation could not be resumed';
  end if;
  for i in 1..2 loop
    if bind_roster_login('94000000-0000-0000-0000-000000000001', 'QA-ROSTER', '012345', '91000000-0000-0000-0000-000000000003')->>'profile_id' is distinct from '91000000-0000-0000-0000-000000000003' then
      raise exception 'First/repeated login failed';
    end if;
  end loop;
  if bind_roster_login('94000000-0000-0000-0000-000000000002', 'QA-ROSTER', '654321', '91000000-0000-0000-0000-000000000002')->>'email' is distinct from 'legacy@test.invalid' then
    raise exception 'Existing identity was not preserved';
  end if;
end $$;
reset role;
do $$ begin
  if (select count(*) from class_students where class_id = '93000000-0000-0000-0000-000000000001') <> 2
     or (select count(*) from enrollments where class_id = '93000000-0000-0000-0000-000000000001') <> 2 then
    raise exception 'Login created duplicate roster rows or missed enrollment';
  end if;
  if not exists (select 1 from profiles where id = '91000000-0000-0000-0000-000000000003' and display_name = 'Imported learner' and school = 'Test school') then
    raise exception 'Roster name and school were not retained';
  end if;
end $$;
update class_students set passcode = '111111' where id = '94000000-0000-0000-0000-000000000001';
do $$ begin
  if bind_roster_login('94000000-0000-0000-0000-000000000001', 'QA-ROSTER', '012345', '91000000-0000-0000-0000-000000000003')->>'error' is distinct from 'INVALID_LOGIN' then raise exception 'Changed passcode accepted'; end if;
  if bind_roster_login('94000000-0000-0000-0000-000000000001', 'QA-ROSTER', '111111', '91000000-0000-0000-0000-000000000002')->>'error' is distinct from 'INVALID_LOGIN' then raise exception 'Identity reassignment accepted'; end if;
end $$;
update profiles set archived_at = now() where id = '91000000-0000-0000-0000-000000000003';
do $$ begin
  if prepare_roster_login('QA-ROSTER', '111111')->>'error' is distinct from 'INVALID_LOGIN' then raise exception 'Archived student accepted'; end if;
end $$;
update profiles set archived_at = null, role = 'admin' where id = '91000000-0000-0000-0000-000000000003';
do $$ begin
  if prepare_roster_login('QA-ROSTER', '111111')->>'error' is distinct from 'INVALID_LOGIN' then raise exception 'Staff identity accepted'; end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '91000000-0000-0000-0000-000000000001', true);
do $$ begin
  begin
    update class_students set profile_id = '91000000-0000-0000-0000-000000000001' where id = '94000000-0000-0000-0000-000000000002';
    raise exception 'Client relink succeeded';
  exception when raise_exception then
    if sqlerrm <> 'ROSTER_IDENTITY_MANAGED_BY_SERVER' then raise; end if;
  end;
end $$;
reset role;
do $$ begin
  for i in 1..11 loop perform prepare_roster_login('QA-ROSTER', '999999'); end loop;
  if prepare_roster_login('QA-ROSTER', '999999')->>'error' is distinct from 'TRY_LATER' then raise exception 'Denied attempts did not persist'; end if;
  for i in 1..121 loop perform prepare_roster_login('QA-ROSTER', lpad(i::text, 6, '0')); end loop;
  if prepare_roster_login('QA-ROSTER', '654321')->>'error' is distinct from 'TRY_LATER' then raise exception 'Rotating passcodes bypassed the class limit'; end if;
end $$;
rollback;
