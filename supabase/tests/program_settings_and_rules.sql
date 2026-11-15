-- Migration 2006: program_settings, class_module_settings and the defaults used by grading.
-- Run against a local database with all migrations applied. All fixtures roll back.
begin;

insert into auth.users (id) values
  ('81000000-0000-0000-0000-000000000001'), ('81000000-0000-0000-0000-000000000002'),
  ('81000000-0000-0000-0000-000000000003'), ('81000000-0000-0000-0000-000000000004'),
  ('81000000-0000-0000-0000-000000000005');
insert into profiles (id, role, display_name) values
  ('81000000-0000-0000-0000-000000000001', 'instructor', 'Teacher A'),
  ('81000000-0000-0000-0000-000000000002', 'instructor', 'Teacher B'),
  ('81000000-0000-0000-0000-000000000003', 'admin', 'Admin'),
  ('81000000-0000-0000-0000-000000000004', 'student', 'Student'),
  ('81000000-0000-0000-0000-000000000005', 'instructor', 'Creator only')
on conflict (id) do update set role = excluded.role;

insert into courses (id, title, owner_id, published, delivery_mode, is_library) values
  ('82000000-0000-0000-0000-000000000001', 'Rules QA', '81000000-0000-0000-0000-000000000001', true, 'instructor_led', true);
-- Rule differences are class-specific even when classes use one global template.
insert into modules (id, course_id, position, title, concept, published) values
  ('83000000-0000-0000-0000-000000000001', '82000000-0000-0000-0000-000000000001', 1, 'Module 1', 'Variables', true),
  ('83000000-0000-0000-0000-000000000002', '82000000-0000-0000-0000-000000000001', 2, 'Module 2', 'Loops', true);
insert into lessons (id, module_id, position, title) values
  ('84000000-0000-0000-0000-000000000001', '83000000-0000-0000-0000-000000000001', 1, 'Lesson 1');
insert into activities (id, lesson_id, position, type, concept, counts_toward_unlock, content) values
  ('85000000-0000-0000-0000-000000000001', '84000000-0000-0000-0000-000000000001', 1, 'posttest', 'Variables', true,
   '{"items":[{"id":"q1","prompt":"Pick A","choices":[{"id":"a","label":"A"},{"id":"b","label":"B"}],"answer":"a"}]}');

insert into classes (id, name, school, course_id, join_code, created_by) values
  ('86000000-0000-0000-0000-000000000001', 'Class A', 'School', '82000000-0000-0000-0000-000000000001', 'QA-RULES-A', '81000000-0000-0000-0000-000000000001'),
  ('86000000-0000-0000-0000-000000000002', 'Class B', 'School', '82000000-0000-0000-0000-000000000001', 'QA-RULES-B', '81000000-0000-0000-0000-000000000002');
-- Class A's creator teaches it (trigger); Class C's creator is then removed from its teachers.
insert into classes (id, name, school, course_id, join_code, created_by) values
  ('86000000-0000-0000-0000-000000000003', 'Class C', 'School', '82000000-0000-0000-0000-000000000001', 'QA-RULES-C', '81000000-0000-0000-0000-000000000005');
delete from class_instructors where class_id = '86000000-0000-0000-0000-000000000003';
insert into enrollments (class_id, student_id) values
  ('86000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000004');
insert into class_modules (class_id, module_id) values
  ('86000000-0000-0000-0000-000000000001', '83000000-0000-0000-0000-000000000001');
insert into module_rules (class_id, module_id, pass_mark) values
  ('86000000-0000-0000-0000-000000000001', '83000000-0000-0000-0000-000000000002', 0.85),
  ('86000000-0000-0000-0000-000000000003', '83000000-0000-0000-0000-000000000001', 0.55);

do $$
begin
  if (select count(*) from program_settings) <> 1 then raise exception 'program_settings must hold exactly one row'; end if;
  if (select (inactive_days, low_score_pct, default_pass_mark, default_max_posttest_tries) from program_settings)
     is distinct from (3, 60, 0.70, 3) then
    raise exception 'program_settings defaults changed';
  end if;
  -- A module_rules row inserted without values takes the program defaults.
  if (select max_posttest_tries from module_rules where class_id = '86000000-0000-0000-0000-000000000001') <> 3 then
    raise exception 'module_rules.max_posttest_tries default does not follow program_settings';
  end if;
  begin
    insert into program_settings (id) values (false);
    raise exception 'a second settings row was accepted';
  exception when check_violation then null;
  end;
end $$;

-- Teacher A: reads settings, cannot change them, sees only Class A in the view.
set local role authenticated;
select set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000001', true);
do $$
declare
  n int;
begin
  if (select inactive_days from program_settings) <> 3 then raise exception 'teacher cannot read program settings'; end if;
  update program_settings set inactive_days = 10;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'a teacher changed program settings'; end if;

  if exists (select 1 from class_module_settings where class_id <> '86000000-0000-0000-0000-000000000001') then
    raise exception 'teacher A sees another class''s rules';
  end if;
  if (select count(*) from class_module_settings) <> 2 then
    raise exception 'teacher A should see both modules of Class A, assigned or not';
  end if;
  if (select (pass_mark, max_posttest_tries) from class_module_settings where module_id = '83000000-0000-0000-0000-000000000001')
     is distinct from (0.70, 3) then
    raise exception 'module without rules must use the program defaults';
  end if;
  if (select (pass_mark, max_posttest_tries) from class_module_settings where module_id = '83000000-0000-0000-0000-000000000002')
     is distinct from (0.85, 3) then
    raise exception 'module_rules override is not applied';
  end if;
end $$;

-- A class creator who no longer teaches the class still manages it, so sees its override.
select set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000005', true);
do $$
begin
  if (select pass_mark from class_module_settings
      where class_id = '86000000-0000-0000-0000-000000000003' and module_id = '83000000-0000-0000-0000-000000000001') is distinct from 0.55 then
    raise exception 'class creator does not see the class''s module rules';
  end if;
end $$;

-- Admin: sees every class and changes the program defaults.
select set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000003', true);
do $$
declare
  n int;
begin
  if (select count(distinct class_id) from class_module_settings
      where class_id::text like '86000000-%') <> 3 then
    raise exception 'admin should see every class';
  end if;
  update program_settings set default_pass_mark = 0.80, default_max_posttest_tries = 2;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'admin could not change program settings'; end if;
  if (select (pass_mark, max_posttest_tries) from class_module_settings
      where class_id = '86000000-0000-0000-0000-000000000001' and module_id = '83000000-0000-0000-0000-000000000001')
     is distinct from (0.80, 2) then
    raise exception 'view does not follow new program defaults';
  end if;
end $$;

-- Grading follows the new default of 2 counted post-test tries (no module_rules row for Module 1).
select set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000004', true);
do $$
declare
  r jsonb;
begin
  r := submit_attempt('85000000-0000-0000-0000-000000000001', '{"answers":{"q1":"b"}}', 1000);
  if not (r ->> 'counts')::boolean then raise exception 'try 1 should count'; end if;
  r := submit_attempt('85000000-0000-0000-0000-000000000001', '{"answers":{"q1":"b"}}', 1000);
  if not (r ->> 'counts')::boolean then raise exception 'try 2 should count'; end if;
  r := submit_attempt('85000000-0000-0000-0000-000000000001', '{"answers":{"q1":"a"}}', 1000);
  if (r ->> 'counts')::boolean then raise exception 'try 3 is past the default max tries and should be practice'; end if;
end $$;

-- _course_state uses the same defaults: pass mark 0.80, max tries 2, best counted score 0.
reset role;
do $$
declare
  s record;
begin
  select * into s from _course_state('81000000-0000-0000-0000-000000000004', '82000000-0000-0000-0000-000000000001')
  where module_id = '83000000-0000-0000-0000-000000000001';
  if (s.pass_mark, s.max_tries, s.posttest_tries, s.posttest_best) is distinct from (0.80, 2, 3, 0.000) then
    raise exception '_course_state defaults wrong: %', row_to_json(s);
  end if;
  if s.state <> 'completed' then raise exception 'tries used up should complete the module, got %', s.state; end if;
end $$;

select 'program_settings_and_rules: all checks passed' as result;
rollback;
