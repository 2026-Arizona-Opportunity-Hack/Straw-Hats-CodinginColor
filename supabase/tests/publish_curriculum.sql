-- Run on a disposable migrated database. Test rows roll back.
begin;

insert into auth.users (id) values
  ('91000000-0000-0000-0000-000000000001'), ('91000000-0000-0000-0000-000000000002');
insert into profiles (id, role, display_name) values
  ('91000000-0000-0000-0000-000000000001', 'instructor', 'Test author'),
  ('91000000-0000-0000-0000-000000000002', 'student', 'Test student')
on conflict (id) do update set role = excluded.role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '91000000-0000-0000-0000-000000000001', true);
select publish_curriculum(
  '{"id":"92000000-0000-0000-0000-000000000001","title":"QA course","description":"","level":"beginner"}',
  '93000000-0000-0000-0000-000000000001', null,
  '[{"id":"93000000-0000-0000-0000-000000000001","position":1,"title":"Initial module","concept":"QA","published":true}]',
  '[{"id":"94000000-0000-0000-0000-000000000001","module_id":"93000000-0000-0000-0000-000000000001","position":1,"title":"Test lesson"}]',
  '[{"id":"95000000-0000-0000-0000-000000000001","lesson_id":"94000000-0000-0000-0000-000000000001","position":1,"type":"check","concept":"QA","points":1,"content":{"prompt":"Test","answer":"a"}}]',
  '{}', '{}'
);
reset role;
insert into course_enrollments (course_id, student_id) values
  ('92000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000002');

set local role authenticated;
select set_config('request.jwt.claim.sub', '91000000-0000-0000-0000-000000000001', true);
do $$
declare
  course_doc constant jsonb := '{"id":"92000000-0000-0000-0000-000000000001","title":"Revised course","description":"","level":"beginner"}';
  module_id constant uuid := '93000000-0000-0000-0000-000000000001';
begin
  begin
    perform publish_curriculum(course_doc, module_id, 0, '[]', '[]', '[]', '{}', '{}');
    raise exception 'A stale publish should fail';
  exception when raise_exception then
    if sqlerrm not like 'This course changed%' then raise; end if;
  end;
  begin
    perform publish_curriculum(course_doc, module_id, 1, '[]', '[]',
      '[{"id":"95000000-0000-0000-0000-000000000002","lesson_id":"94000000-0000-0000-0000-000000000001","position":2,"type":"content","concept":"QA","points":-1,"content":{}}]',
      '{}', '{}');
    raise exception 'A broken activity should fail';
  exception when check_violation then null;
  end;
  if (select title from courses where id = (course_doc ->> 'id')::uuid) is distinct from 'QA course' then
    raise exception 'A failed publish changed the live course';
  end if;
  if publish_curriculum(course_doc, module_id, 1, '[]', '[]',
    '[{"id":"95000000-0000-0000-0000-000000000001","lesson_id":"94000000-0000-0000-0000-000000000001","position":1,"type":"check","concept":"QA","points":1,"content":{"prompt":"Updated","answer":"b"}}]',
    '{}', '{}') <> 2 then
    raise exception 'A retry with the valid revision must publish';
  end if;
end $$;

select set_config('request.jwt.claim.sub', '91000000-0000-0000-0000-000000000002', true);
do $$
declare
  module_doc jsonb := my_module_content('93000000-0000-0000-0000-000000000001');
begin
  if module_doc #>> '{lessons,0,activities,0,content,prompt}' is distinct from 'Updated'
     or module_doc #> '{lessons,0,activities,0,content,answer}' is not null then
    raise exception 'Updated lesson was unavailable or exposed its answer key';
  end if;
  begin
    perform publish_curriculum('{}', gen_random_uuid(), null, '[]', '[]', '[]', '{}', '{}');
    raise exception 'A student should not publish';
  exception when raise_exception then
    if sqlerrm not like 'Only instructors%' then raise; end if;
  end;
end $$;
rollback;
