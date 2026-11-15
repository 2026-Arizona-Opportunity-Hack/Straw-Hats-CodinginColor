-- Apply all migrations to a local database first. Fixtures roll back.
begin;

insert into auth.users (id) values
  ('79000000-0000-0000-0000-000000000001'),
  ('79000000-0000-0000-0000-000000000002'),
  ('79000000-0000-0000-0000-000000000003');
insert into profiles (id, role, display_name) values
  ('79000000-0000-0000-0000-000000000001', 'reviewer', 'Reviewer'),
  ('79000000-0000-0000-0000-000000000002', 'admin', 'Admin'),
  ('79000000-0000-0000-0000-000000000003', 'student', 'Student')
on conflict (id) do update set role = excluded.role;

insert into courses (id, title, owner_id, published, is_library, copied_from) values
  ('79100000-0000-0000-0000-000000000001', 'Published library', '79000000-0000-0000-0000-000000000002', true, true, null),
  ('79100000-0000-0000-0000-000000000003', 'Class copy', '79000000-0000-0000-0000-000000000001', true, false, '79100000-0000-0000-0000-000000000001'),
  ('79100000-0000-0000-0000-000000000004', 'Standalone course', null, true, false, null),
  ('79100000-0000-0000-0000-000000000005', 'Draft library', null, false, true, null),
  ('79100000-0000-0000-0000-000000000006', 'Former class copy without a source', null, true, false, null);

-- A local course remains private even after its source template goes away.
insert into local_curricula (course_id) values ('79100000-0000-0000-0000-000000000006');

insert into modules (id, course_id, position, title, concept, published)
select ('79200000-0000-0000-0000-00000000000' || n)::uuid,
       ('79100000-0000-0000-0000-00000000000' || case when n = 2 then 1 else n end)::uuid,
       n, 'Module ' || n, 'Variables', n <> 2
from generate_series(1, 6) as n;

insert into lessons (id, module_id, position, title)
select ('79300000-0000-0000-0000-00000000000' || n)::uuid,
       ('79200000-0000-0000-0000-00000000000' || n)::uuid, 1, 'Variables'
from generate_series(1, 6) as n;

insert into activities (id, lesson_id, position, type, concept, content)
select ('79400000-0000-0000-0000-00000000000' || n)::uuid,
       ('79300000-0000-0000-0000-00000000000' || n)::uuid, 1, 'check', 'Variables',
       '{"prompt":"Choose A","choices":[{"id":"a","label":"A"},{"id":"b","label":"B"}],"answer":"a"}'
from generate_series(1, 6) as n;

set local role authenticated;
select set_config('request.jwt.claim.sub', '79000000-0000-0000-0000-000000000001', true);
do $$ begin
  if not exists (select 1 from courses where id = '79100000-0000-0000-0000-000000000001')
     or not exists (select 1 from modules where id = '79200000-0000-0000-0000-000000000001')
     or not exists (select 1 from lessons where id = '79300000-0000-0000-0000-000000000001')
     or not exists (select 1 from activities where id = '79400000-0000-0000-0000-000000000001') then
    raise exception 'Reviewer cannot read published library curriculum';
  end if;
  if exists (select 1 from activity_keys where activity_id = '79400000-0000-0000-0000-000000000001')
     or exists (select 1 from activities where id = '79400000-0000-0000-0000-000000000001' and content ? 'answer') then
    raise exception 'Reviewer can read a library answer key';
  end if;
  for i in 2..6 loop
    if exists (select 1 from courses where id = ('79100000-0000-0000-0000-00000000000' || i)::uuid)
       or exists (select 1 from modules where id = ('79200000-0000-0000-0000-00000000000' || i)::uuid)
       or exists (select 1 from lessons where id = ('79300000-0000-0000-0000-00000000000' || i)::uuid)
       or exists (select 1 from activities where id = ('79400000-0000-0000-0000-00000000000' || i)::uuid) then
      raise exception 'Reviewer can read curriculum outside the published library';
    end if;
  end loop;
  if exists (select 1 from catalog_courses()) or exists (select 1 from catalog_modules()) then
    raise exception 'Reviewer can access the broader Explore catalog';
  end if;
end $$;

select set_config('request.jwt.claim.sub', '79000000-0000-0000-0000-000000000002', true);
do $$ begin
  if not exists (select 1 from activity_keys where activity_id = '79400000-0000-0000-0000-000000000001') then
    raise exception 'Admin cannot read a library answer key';
  end if;
end $$;

select set_config('request.jwt.claim.sub', '79000000-0000-0000-0000-000000000003', true);
do $$ begin
  if not exists (select 1 from catalog_courses() where id = '79100000-0000-0000-0000-000000000004')
     or not exists (select 1 from catalog_modules() where course_id = '79100000-0000-0000-0000-000000000004') then
    raise exception 'Student cannot preview a published standalone course in Explore';
  end if;
  if exists (select 1 from catalog_courses() where id in (
       '79100000-0000-0000-0000-000000000003', '79100000-0000-0000-0000-000000000006'))
     or exists (select 1 from catalog_modules() where course_id in (
       '79100000-0000-0000-0000-000000000003', '79100000-0000-0000-0000-000000000006')) then
    raise exception 'Explore can list a local course or its module title';
  end if;
end $$;

rollback;
