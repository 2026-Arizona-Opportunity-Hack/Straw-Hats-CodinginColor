-- Rollback-only: a school template belongs to the school, and a class archive
-- retains the published curriculum even after another teacher publishes.
begin;

insert into auth.users (id, email) values
  ('37000000-0000-0000-0000-000000000001', 'admin-school@test.invalid'),
  ('37000000-0000-0000-0000-000000000002', 'teacher-one@test.invalid'),
  ('37000000-0000-0000-0000-000000000003', 'teacher-two@test.invalid'),
  ('37000000-0000-0000-0000-000000000004', 'teacher-unrelated@test.invalid'),
  ('37000000-0000-0000-0000-000000000005', 'student-school@test.invalid');
insert into public.profiles (id, role, display_name) values
  ('37000000-0000-0000-0000-000000000001', 'admin', 'School admin'),
  ('37000000-0000-0000-0000-000000000002', 'instructor', 'Original teacher'),
  ('37000000-0000-0000-0000-000000000003', 'instructor', 'Next teacher'),
  ('37000000-0000-0000-0000-000000000004', 'instructor', 'Unrelated teacher'),
  ('37000000-0000-0000-0000-000000000005', 'student', 'Test student')
on conflict (id) do update set role = excluded.role, display_name = excluded.display_name;
insert into public.courses (id, title, is_library, published, owner_id) values
  ('37000000-0000-0000-0000-000000000010', 'Global original', true, true, null),
  ('37000000-0000-0000-0000-000000000011', 'School adaptation', false, true, '37000000-0000-0000-0000-000000000002');
insert into public.modules (id, course_id, position, title, concept, published) values
  ('37000000-0000-0000-0000-000000000012', '37000000-0000-0000-0000-000000000010', 1, 'Original module', 'AI', true),
  ('37000000-0000-0000-0000-000000000013', '37000000-0000-0000-0000-000000000011', 1, 'Adapted module', 'AI', true),
  ('37000000-0000-0000-0000-000000000014', '37000000-0000-0000-0000-000000000011', 2, 'Second module', 'AI', true),
  ('37000000-0000-0000-0000-000000000015', '37000000-0000-0000-0000-000000000011', 3, 'Unpublished module', 'AI', false);
insert into public.lessons (id, module_id, position, title) values
  ('37000000-0000-0000-0000-000000000016', '37000000-0000-0000-0000-000000000013', 1, 'Adapted lesson');
insert into public.activities (lesson_id, position, type, concept, content) values
  ('37000000-0000-0000-0000-000000000016', 1, 'check', 'AI', '{"prompt":"Test","answer":"b"}');
insert into public.classes (id, name, school, course_id, join_code, created_by) values
  ('37000000-0000-0000-0000-000000000017', 'Previous class', 'School A', '37000000-0000-0000-0000-000000000011',
    'SCHOOL-A', '37000000-0000-0000-0000-000000000002');

set local role authenticated;
select set_config('request.jwt.claim.sub', '37000000-0000-0000-0000-000000000001', true);
insert into public.schools (id, name) values
  ('37000000-0000-0000-0000-000000000020', 'School A'),
  ('37000000-0000-0000-0000-000000000021', 'School B');
insert into public.school_instructors (school_id, instructor_id) values
  ('37000000-0000-0000-0000-000000000020', '37000000-0000-0000-0000-000000000002'),
  ('37000000-0000-0000-0000-000000000020', '37000000-0000-0000-0000-000000000003'),
  ('37000000-0000-0000-0000-000000000021', '37000000-0000-0000-0000-000000000004');
select set_config('test.school_course', public.seed_school_curriculum(
  '37000000-0000-0000-0000-000000000020', '37000000-0000-0000-0000-000000000017', '37000000-0000-0000-0000-000000000010'
)::text, true);
insert into public.class_modules (class_id, module_id) values
  ('37000000-0000-0000-0000-000000000017', '37000000-0000-0000-0000-000000000013');
update public.classes set archived_at = '2026-05-20T18:00:00Z' where id = '37000000-0000-0000-0000-000000000017';
update public.modules set title = 'Edited class module' where id = '37000000-0000-0000-0000-000000000013';

-- A replacement teacher can edit the template and read archived curriculum,
-- but receives no access to the original teacher's class or student records.
select set_config('request.jwt.claim.sub', '37000000-0000-0000-0000-000000000003', true);
do $$
declare
  template uuid := current_setting('test.school_course')::uuid;
  target public.modules%rowtype;
  created jsonb;
  overridden jsonb;
  copy uuid;
begin
  assert exists (select 1 from public.schools where name = 'School A');
  assert not exists (select 1 from public.classes where id = '37000000-0000-0000-0000-000000000017');
  assert public.can_edit_course(template);
  select * into strict target from public.modules where course_id = template and position = 1;
  assert (select count(*) from public.modules where course_id = template) = 2, 'clone only published modules';
  assert (select model.curriculum #>> '{modules,0,title}' from public.class_curriculum_snapshots model) = 'Adapted module';
  assert (select model.module_count from public.class_curriculum_snapshots model) = 1, 'capture the class assignment';
  perform public.publish_curriculum('{"title":"School adaptation","description":"","level":"beginner"}'::jsonb || jsonb_build_object('id', template),
    target.id, 0, jsonb_build_array(to_jsonb(target) || '{"title":"Latest school module"}'::jsonb), '[]', '[]', '{}', '{}');
  begin
    perform public.create_school_class('37000000-0000-0000-0000-000000000030', '37000000-0000-0000-0000-000000000020',
      'Next year', 'SCHOOL-NEXT', template, 0, array[target.id]);
    raise exception 'Accepted a stale template.';
  exception when raise_exception then
    if sqlerrm not like 'The template was updated.%' then raise; end if;
  end;
  created := public.create_school_class('37000000-0000-0000-0000-000000000030', '37000000-0000-0000-0000-000000000020',
    'Next year', 'SCHOOL-NEXT', template, 1, array[target.id]);
  copy := (created->>'course_id')::uuid;
  assert copy <> template;
  assert (select title from public.modules where id = (created #>> '{module_ids,0}')::uuid) = 'Latest school module';
  assert (select key->>'answer' from public.activity_keys k join public.activities a on a.id=k.activity_id
    join public.lessons l on l.id=a.lesson_id join public.modules m on m.id=l.module_id where m.course_id=copy) = 'b';
  assert (select school from public.classes where id = '37000000-0000-0000-0000-000000000030') = 'School A';
  assert created = public.create_school_class('37000000-0000-0000-0000-000000000030', '37000000-0000-0000-0000-000000000020',
    'Next year', 'SCHOOL-NEXT', template, 1, array[target.id]), 'retry should return the same copy';
  overridden := public.create_school_class('37000000-0000-0000-0000-000000000031', '37000000-0000-0000-0000-000000000020',
    'Use the original', null, '37000000-0000-0000-0000-000000000010', 0,
    array['37000000-0000-0000-0000-000000000012'::uuid]);
  assert (select title from public.modules where id = (overridden #>> '{module_ids,0}')::uuid) = 'Original module';
  assert (select model.curriculum #>> '{modules,0,title}' from public.class_curriculum_snapshots model) = 'Adapted module';
end
$$;

-- A matching display label confers no access.
select set_config('request.jwt.claim.sub', '37000000-0000-0000-0000-000000000004', true);
insert into public.classes (id, name, school, course_id, join_code, created_by) values
  ('37000000-0000-0000-0000-000000000041', 'Unverified school label', 'School A', '37000000-0000-0000-0000-000000000010',
    'UNVERIFIED', '37000000-0000-0000-0000-000000000004');
do $$
declare
  template uuid := current_setting('test.school_course')::uuid;
begin
  assert (select name from public.schools) = 'School B';
  assert not exists (select 1 from public.school_curricula);
  assert not exists (select 1 from public.courses where id = template);
  assert not exists (select 1 from public.class_curriculum_snapshots);
  assert not public.can_edit_course(template);
  begin
    update public.classes set school_id = '37000000-0000-0000-0000-000000000020' where id = '37000000-0000-0000-0000-000000000041';
    raise exception 'An unrelated teacher joined the school.';
  exception when raise_exception then
    if sqlerrm <> 'Only admins can change the school of an existing class.' then raise; end if;
  end;
  begin
    perform public.create_school_class('37000000-0000-0000-0000-000000000042', '37000000-0000-0000-0000-000000000020',
      'Unauthorized', null, template, 1, array[template]);
    raise exception 'An unrelated teacher copied a school template.';
  exception when raise_exception then
    if sqlerrm <> 'You do not have access to this school.' then raise; end if;
  end;
  begin
    perform public.create_school_class('37000000-0000-0000-0000-000000000042', '37000000-0000-0000-0000-000000000021',
      'Unauthorized', null, template, 1, array[template]);
    raise exception 'An unrelated teacher copied another school’s template.';
  exception when raise_exception then
    if sqlerrm <> 'This template is unavailable for this school.' then raise; end if;
  end;
end
$$;

select set_config('request.jwt.claim.sub', '37000000-0000-0000-0000-000000000005', true);
do $$
begin
  assert not exists (select 1 from public.courses where id = current_setting('test.school_course')::uuid);
  assert not exists (select 1 from public.class_curriculum_snapshots);
end
$$;
rollback;
