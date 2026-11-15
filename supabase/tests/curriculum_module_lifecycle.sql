-- Fictional course, student and attempts. All rows roll back.
begin;
create function pg_temp.fixture(n int) returns uuid language sql immutable as $$
  select ('a87b0000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid
$$;
create function pg_temp.assert(ok boolean, message text) returns void language plpgsql as $$
begin
  if ok is distinct from true then raise exception '%', message; end if;
end $$;

insert into auth.users (id) values (pg_temp.fixture(1)), (pg_temp.fixture(2));
insert into profiles (id, role, display_name) values
  (pg_temp.fixture(1), 'instructor', 'Fictional instructor'), (pg_temp.fixture(2), 'student', 'Fictional student')
on conflict (id) do update set role = excluded.role;
insert into courses (id, title, published, is_library) values
  (pg_temp.fixture(3), 'Shared course', true, true), (pg_temp.fixture(4), 'Other course', true, false);
insert into modules (id, course_id, position, title, concept, published) values
  (pg_temp.fixture(5), pg_temp.fixture(3), 1, 'Target module', 'Test', true),
  (pg_temp.fixture(6), pg_temp.fixture(3), 2, 'Neighbor module', 'Test', true);
insert into lessons (id, module_id, position, title) values (pg_temp.fixture(7), pg_temp.fixture(5), 1, 'Test lesson');
insert into activities (id, lesson_id, position, type, concept) values
  (pg_temp.fixture(8), pg_temp.fixture(7), 1, 'check', 'Test');
insert into course_enrollments (course_id, student_id) values (pg_temp.fixture(3), pg_temp.fixture(2));
insert into activity_attempts (id, student_id, activity_id, score) values
  (pg_temp.fixture(9), pg_temp.fixture(2), pg_temp.fixture(8), 1);
-- Assignment rows are hidden from instructors who do not manage the class.
insert into classes (id, name, school, course_id, join_code, created_by) values
  (pg_temp.fixture(10), 'Fictional class', 'Fictional school', pg_temp.fixture(3), 'ARCHIVE-QA', pg_temp.fixture(2));
insert into class_modules (class_id, module_id) values (pg_temp.fixture(10), pg_temp.fixture(5));

set local role authenticated;
select set_config('request.jwt.claim.sub', pg_temp.fixture(1)::text, true);
do $$
begin
  begin
    perform manage_curriculum_module(pg_temp.fixture(3), pg_temp.fixture(5), 0, 'delete');
    raise exception 'Deleted a module with a class release';
  exception when raise_exception then
    if sqlerrm not like 'Unassign this module%' then raise; end if;
  end;
end $$;
reset role;
delete from class_modules where module_id = pg_temp.fixture(5);
set local role authenticated;
select pg_temp.assert(manage_curriculum_module(pg_temp.fixture(3), pg_temp.fixture(5), 0, 'archive') = 1, 'Archive did not commit');
select pg_temp.assert((select archived_at is not null and not published from modules where id = pg_temp.fixture(5)), 'Invalid archive state');
reset role;
insert into class_instructors (class_id, instructor_id) values (pg_temp.fixture(10), pg_temp.fixture(1));
set local role authenticated;
do $$
begin
  begin
    insert into class_modules (class_id, module_id) values (pg_temp.fixture(10), pg_temp.fixture(5));
    raise exception 'Assigned an archived module';
  exception when raise_exception then
    if sqlerrm not like 'Publish the archived module%' then raise; end if;
  end;
end $$;

select set_config('request.jwt.claim.sub', pg_temp.fixture(2)::text, true);
select pg_temp.assert(my_module_content(pg_temp.fixture(5)) is null, 'Archived module is visible to a student');
select pg_temp.assert(exists (select 1 from activity_attempts where id = pg_temp.fixture(9)), 'Archiving deleted student work');
do $$
begin
  begin
    perform manage_curriculum_module(pg_temp.fixture(3), pg_temp.fixture(5), 1, 'delete');
    raise exception 'Student deleted a module';
  exception when insufficient_privilege then null;
  end;
end $$;

select set_config('request.jwt.claim.sub', pg_temp.fixture(1)::text, true);
select pg_temp.assert(publish_curriculum(
  jsonb_build_object('id', pg_temp.fixture(3), 'title', 'Shared course', 'description', '', 'level', 'beginner'),
  pg_temp.fixture(5), 1,
  jsonb_build_array(jsonb_build_object('id', pg_temp.fixture(5), 'position', 1, 'title', 'Target module', 'concept', 'Test', 'published', true)),
  '[]', '[]', '{}', '{}') = 2, 'Restoring the archived module failed');
select pg_temp.assert((select archived_at is null and published from modules where id = pg_temp.fixture(5)), 'Publishing did not clear the archive state');
do $$
begin
  begin
    perform manage_curriculum_module(pg_temp.fixture(3), pg_temp.fixture(5), 1, 'delete');
    raise exception 'Stale deletion succeeded';
  exception when raise_exception then
    if sqlerrm not like 'This course changed%' then raise; end if;
  end;
  begin
    perform manage_curriculum_module(pg_temp.fixture(4), pg_temp.fixture(5), 0, 'delete');
    raise exception 'Deletion crossed course boundaries';
  exception when raise_exception then
    if sqlerrm not like 'The selected module does not belong%' then raise; end if;
  end;
end $$;
select pg_temp.assert(manage_curriculum_module(pg_temp.fixture(3), pg_temp.fixture(5), 2, 'delete') = 3, 'Delete did not commit');
reset role;
select pg_temp.assert(not exists (select 1 from modules where id = pg_temp.fixture(5)), 'Module row survived deletion');
select pg_temp.assert(not exists (select 1 from lessons where id = pg_temp.fixture(7)), 'Lesson row survived deletion');
select pg_temp.assert(not exists (select 1 from activities where id = pg_temp.fixture(8)), 'Activity row survived deletion');
select pg_temp.assert(not exists (select 1 from activity_attempts where id = pg_temp.fixture(9)), 'Attempt row survived deletion');
select pg_temp.assert((select position = 1 from modules where id = pg_temp.fixture(6)), 'Remaining module order was not compacted');
rollback;
