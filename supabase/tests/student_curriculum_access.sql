-- Run against a local database with all migrations applied. All fixtures roll back.
begin;

insert into auth.users (id) values
  ('71000000-0000-0000-0000-000000000001'), ('71000000-0000-0000-0000-000000000002'),
  ('71000000-0000-0000-0000-000000000003'), ('71000000-0000-0000-0000-000000000004');
insert into profiles (id, role, display_name) values
  ('71000000-0000-0000-0000-000000000001', 'instructor', 'Test teacher'),
  ('71000000-0000-0000-0000-000000000002', 'student', 'Test student'),
  ('71000000-0000-0000-0000-000000000003', 'student', 'Unenrolled student'),
  ('71000000-0000-0000-0000-000000000004', 'reviewer', 'Test reviewer')
on conflict (id) do update set role = excluded.role;

insert into courses (id, title, owner_id, published) values
  ('72000000-0000-0000-0000-000000000001', 'Curriculum access QA', '71000000-0000-0000-0000-000000000001', true);
insert into modules (id, course_id, position, title, concept, published)
select ('73000000-0000-0000-0000-00000000000' || n)::uuid,
       '72000000-0000-0000-0000-000000000001', n, 'Test module ' || n, 'Variables', n <> 3
from generate_series(1, 5) as n;
insert into lessons (id, module_id, position, title)
select ('74000000-0000-0000-0000-00000000000' || n)::uuid,
       ('73000000-0000-0000-0000-00000000000' || n)::uuid, 1, 'Variables'
from generate_series(1, 5) as n;
insert into activities (id, lesson_id, position, type, concept, content)
select ('75000000-0000-0000-0000-00000000000' || n)::uuid,
       ('74000000-0000-0000-0000-00000000000' || n)::uuid, 1, 'check', 'Variables',
       '{"prompt":"Pick A","choices":[{"id":"a","label":"A"},{"id":"b","label":"B"}],"answer":"a"}'
from generate_series(1, 5) as n;

insert into activities (id, lesson_id, position, type, concept, content)
values ('75000000-0000-0000-0000-000000000006',
        '74000000-0000-0000-0000-000000000001', 2, 'content', 'Reading',
        '{"markdown":"Read about variables."}');

insert into classes (id, name, school, course_id, join_code, created_by) values
  ('76000000-0000-0000-0000-000000000001', 'Test class', 'Test school', '72000000-0000-0000-0000-000000000001', 'QA-CURRICULUM', '71000000-0000-0000-0000-000000000001');
insert into enrollments (class_id, student_id) values
  ('76000000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-000000000002');
insert into class_modules (class_id, module_id, released_at)
select '76000000-0000-0000-0000-000000000001', id,
       case when position = 5 then now() + interval '1 day' else now() end
from modules where course_id = '72000000-0000-0000-0000-000000000001' and position <> 4;

set local role authenticated;
select set_config('request.jwt.claim.sub', '71000000-0000-0000-0000-000000000002', true);
do $$
declare
  module_doc jsonb := my_module_content('73000000-0000-0000-0000-000000000001');
begin
  if module_doc #>> '{lessons,0,activities,0,content,prompt}' is distinct from 'Pick A' then
    raise exception 'The enrolled student cannot read the released module';
  end if;
  if module_doc #>> '{lessons,0,activities,1,counts_toward_unlock}' is distinct from 'false' then
    raise exception 'New reading blocks must be visible without requiring a submission';
  end if;
  if module_doc #> '{lessons,0,activities,0,content,answer}' is not null
     or exists (select 1 from activity_keys where activity_id = '75000000-0000-0000-0000-000000000001') then
    raise exception 'The student can see an answer key';
  end if;
  for i in 2..5 loop
    if my_module_content(('73000000-0000-0000-0000-00000000000' || i)::uuid) is not null
       or exists (select 1 from lessons where id = ('74000000-0000-0000-0000-00000000000' || i)::uuid)
       or exists (select 1 from activities where id = ('75000000-0000-0000-0000-00000000000' || i)::uuid) then
      raise exception 'Student can read unavailable module %', i;
    end if;
  end loop;
  if (submit_attempt('75000000-0000-0000-0000-000000000001', '{"choice_id":"a"}', 400) ->> 'score')::numeric is distinct from 1 then
    raise exception 'The database did not save and grade the answer';
  end if;
  if my_module_content('73000000-0000-0000-0000-000000000002') is null then
    raise exception 'Completion did not expose the next assigned module';
  end if;
end
$$;

select set_config('request.jwt.claim.sub', '71000000-0000-0000-0000-000000000003', true);
do $$ begin
  if my_module_content('73000000-0000-0000-0000-000000000001') is not null
     or exists (select 1 from activities where id = '75000000-0000-0000-0000-000000000001') then
    raise exception 'Unenrolled student can read class content';
  end if;
end $$;

select set_config('request.jwt.claim.sub', '71000000-0000-0000-0000-000000000004', true);
do $$ begin
  if not exists (select 1 from activities where id = '75000000-0000-0000-0000-000000000001')
     or exists (select 1 from activities where id = '75000000-0000-0000-0000-000000000003') then
    raise exception 'Reviewer visibility does not match publication';
  end if;
end $$;

select set_config('request.jwt.claim.sub', '71000000-0000-0000-0000-000000000001', true);
do $$ begin
  if not exists (select 1 from activities where id = '75000000-0000-0000-0000-000000000003')
     or not exists (select 1 from activity_attempts where activity_id = '75000000-0000-0000-0000-000000000001' and score = 1) then
    raise exception 'Teacher cannot read own draft or student progress';
  end if;
end $$;

rollback;
