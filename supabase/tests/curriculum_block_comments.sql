-- Run on a disposable migrated database. All fixture changes roll back.
begin;
insert into auth.users (id) values
  ('aa100000-0000-0000-0000-000000000001'), ('aa100000-0000-0000-0000-000000000002'),
  ('aa100000-0000-0000-0000-000000000003'), ('aa100000-0000-0000-0000-000000000004'),
  ('aa100000-0000-0000-0000-000000000005');
insert into profiles (id, role, display_name) values
  ('aa100000-0000-0000-0000-000000000001', 'instructor', 'Teacher A'),
  ('aa100000-0000-0000-0000-000000000002', 'instructor', 'Teacher B'),
  ('aa100000-0000-0000-0000-000000000003', 'admin', 'Test admin'),
  ('aa100000-0000-0000-0000-000000000004', 'student', 'Class learner'),
  ('aa100000-0000-0000-0000-000000000005', 'reviewer', 'Test reviewer')
on conflict (id) do update set role = excluded.role, display_name = excluded.display_name;

insert into courses (id, title, is_library, copied_from, published) values
  ('aa200000-0000-0000-0000-000000000001', 'Global library', true, null, true),
  ('aa200000-0000-0000-0000-000000000002', 'Class copy', false, 'aa200000-0000-0000-0000-000000000001', true),
  ('aa200000-0000-0000-0000-000000000003', 'Unlinked global', false, null, true),
  ('aa200000-0000-0000-0000-000000000004', 'Former classroom course', false, null, true);
insert into modules (id, course_id, position, title, concept, published) values
  ('aa300000-0000-0000-0000-000000000001', 'aa200000-0000-0000-0000-000000000001', 1, 'Global', 'Global', true),
  ('aa300000-0000-0000-0000-000000000002', 'aa200000-0000-0000-0000-000000000002', 1, 'Copy', 'Copy', true),
  ('aa300000-0000-0000-0000-000000000003', 'aa200000-0000-0000-0000-000000000003', 1, 'Unlinked', 'Unlinked', true),
  ('aa300000-0000-0000-0000-000000000004', 'aa200000-0000-0000-0000-000000000004', 1, 'Former classroom', 'Former classroom', true);
insert into lessons (id, module_id, position, title) values
  ('aa400000-0000-0000-0000-000000000001', 'aa300000-0000-0000-0000-000000000001', 1, 'Global'),
  ('aa400000-0000-0000-0000-000000000002', 'aa300000-0000-0000-0000-000000000002', 1, 'Copy'),
  ('aa400000-0000-0000-0000-000000000003', 'aa300000-0000-0000-0000-000000000003', 1, 'Unlinked'),
  ('aa400000-0000-0000-0000-000000000004', 'aa300000-0000-0000-0000-000000000004', 1, 'Former classroom');
insert into activities (id, lesson_id, position, type, concept) values
  ('aa500000-0000-0000-0000-000000000001', 'aa400000-0000-0000-0000-000000000001', 1, 'content', 'Global'),
  ('aa500000-0000-0000-0000-000000000002', 'aa400000-0000-0000-0000-000000000002', 1, 'content', 'Copy'),
  ('aa500000-0000-0000-0000-000000000003', 'aa400000-0000-0000-0000-000000000003', 1, 'content', 'Unlinked'),
  ('aa500000-0000-0000-0000-000000000004', 'aa400000-0000-0000-0000-000000000004', 1, 'content', 'Former classroom');
insert into classes (id, name, school, course_id, join_code, created_by) values
  ('aa600000-0000-0000-0000-000000000001', 'Class A', 'School A', 'aa200000-0000-0000-0000-000000000002', 'QARQ01', 'aa100000-0000-0000-0000-000000000001'),
  ('aa600000-0000-0000-0000-000000000002', 'Class B', 'School B', 'aa200000-0000-0000-0000-000000000002', 'QARQ02', 'aa100000-0000-0000-0000-000000000002'),
  ('aa600000-0000-0000-0000-000000000003', 'Legacy class', 'School A', 'aa200000-0000-0000-0000-000000000001', 'QARQ03', 'aa100000-0000-0000-0000-000000000001'),
  ('aa600000-0000-0000-0000-000000000004', 'Former class', 'School A', 'aa200000-0000-0000-0000-000000000004', 'QARQ04', 'aa100000-0000-0000-0000-000000000001');
delete from classes where id = 'aa600000-0000-0000-0000-000000000004';
insert into enrollments (class_id, student_id) values
  ('aa600000-0000-0000-0000-000000000001', 'aa100000-0000-0000-0000-000000000004');
insert into class_modules (class_id, module_id) values
  ('aa600000-0000-0000-0000-000000000001', 'aa300000-0000-0000-0000-000000000002');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'aa100000-0000-0000-0000-000000000001', true);
insert into curriculum_block_comments (activity_id, class_id, body) values
  ('aa500000-0000-0000-0000-000000000001', null, 'Shared feedback'),
  ('aa500000-0000-0000-0000-000000000001', 'aa600000-0000-0000-0000-000000000003', 'Legacy class feedback'),
  ('aa500000-0000-0000-0000-000000000002', 'aa600000-0000-0000-0000-000000000001', 'Private Class A feedback');
do $$ begin
  if (select count(*) from curriculum_block_comments where author_name = 'Teacher A') <> 3 then
    raise exception 'Teacher A could not read the three attributed comments';
  end if;
  begin
    insert into curriculum_block_comments (activity_id, class_id, body)
    values ('aa500000-0000-0000-0000-000000000002', 'aa600000-0000-0000-0000-000000000002', 'Wrong class');
    raise exception 'Teacher A could comment in a class they do not manage';
  exception when insufficient_privilege then null; end;
  begin
    insert into curriculum_block_comments (activity_id, class_id, body)
    values ('aa500000-0000-0000-0000-000000000002', 'aa600000-0000-0000-0000-000000000003', 'Wrong course');
    raise exception 'Teacher A could comment on a block outside the selected class course';
  exception when insufficient_privilege then null; end;
  begin
    insert into curriculum_block_comments (activity_id, body, author_name)
    values ('aa500000-0000-0000-0000-000000000001', 'Fake attribution', 'Test admin');
    raise exception 'Teacher A could override server-controlled attribution';
  exception when insufficient_privilege then null; end;
end $$;

select set_config('request.jwt.claim.sub', 'aa100000-0000-0000-0000-000000000003', true);
insert into curriculum_block_comments (activity_id, body) values
  ('aa500000-0000-0000-0000-000000000003', 'Global admin feedback');
do $$ begin
  if (select count(*) from curriculum_block_comments) <> 4 then raise exception 'Admin scope incorrect'; end if;
  begin
    insert into curriculum_block_comments (activity_id, body)
    values ('aa500000-0000-0000-0000-000000000002', 'Copied course as global');
    raise exception 'Admin could mix the class copy into the global thread';
  exception when insufficient_privilege then null; end;
  begin
    insert into curriculum_block_comments (activity_id, body)
    values ('aa500000-0000-0000-0000-000000000004', 'Former class course as global');
    raise exception 'Dropping the class made its local curriculum eligible for global comments';
  exception when insufficient_privilege then null; end;
end $$;

select set_config('request.jwt.claim.sub', 'aa100000-0000-0000-0000-000000000002', true);
do $$ begin
  if (select array_agg(body) from curriculum_block_comments) is distinct from array['Shared feedback'] then
    raise exception 'Teacher B could see comments outside their scope';
  end if;
end $$;
insert into curriculum_block_comments (activity_id, class_id, body) values
  ('aa500000-0000-0000-0000-000000000002', 'aa600000-0000-0000-0000-000000000002', 'Private Class B feedback');

select set_config('request.jwt.claim.sub', 'aa100000-0000-0000-0000-000000000004', true);
do $$ begin
  if exists (select 1 from curriculum_block_comments) then raise exception 'Student could read staff comments'; end if;
  begin
    insert into curriculum_block_comments (activity_id, body)
    values ('aa500000-0000-0000-0000-000000000001', 'Student comment');
    raise exception 'Student could post a staff comment';
  exception when insufficient_privilege then null; end;
end $$;

select set_config('request.jwt.claim.sub', 'aa100000-0000-0000-0000-000000000005', true);
do $$ begin
  if exists (select 1 from curriculum_block_comments) then raise exception 'Reviewer could read staff comments'; end if;
  if has_table_privilege('anon', 'public.curriculum_block_comments', 'select') then
    raise exception 'Anonymous clients could access the comment table';
  end if;
end $$;
rollback;
