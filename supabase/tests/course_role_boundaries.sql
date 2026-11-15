-- Run with psql -v ON_ERROR_STOP=1 -f this_file on a disposable migrated DB.
-- Exercises actual RLS as authenticated/anon, never as the table owner.
begin;

create function pg_temp.fixture_id(kind int, n int) returns uuid
language sql immutable as $$
  select (kind::text || '0000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid
$$;

insert into auth.users (id)
select pg_temp.fixture_id(1, n) from generate_series(1, 5) n;
insert into profiles (id, role, display_name)
select pg_temp.fixture_id(1, n),
  (array['student','reviewer','instructor','instructor','admin'])[n]::user_role,
  'Role boundary fixture ' || n from generate_series(1, 5) n
on conflict (id) do update set role = excluded.role;
insert into courses (id, title, owner_id, published)
select pg_temp.fixture_id(2, n), 'Role boundary course', pg_temp.fixture_id(1, n), true
from generate_series(1, 5) n;
insert into modules (id, course_id, position, title, concept, published)
select pg_temp.fixture_id(3, n), pg_temp.fixture_id(2, n), 1, 'Module', 'QA', true
from generate_series(1, 5) n;
insert into lessons (id, module_id, position, title)
select pg_temp.fixture_id(4, n), pg_temp.fixture_id(3, n), 1, 'Lesson'
from generate_series(1, 5) n;
insert into activities (id, lesson_id, position, type, concept, content)
select pg_temp.fixture_id(5, n), pg_temp.fixture_id(4, n), 1, 'check', 'QA', '{"answer":"a"}'
from generate_series(1, 5) n;
insert into activities (id, lesson_id, position, type, concept)
select pg_temp.fixture_id(6, n), pg_temp.fixture_id(4, n), 2, 'check', 'QA'
from generate_series(1, 5) n;
insert into course_enrollments (student_id, course_id)
select pg_temp.fixture_id(1, n), pg_temp.fixture_id(2, n) from generate_series(1, 5) n;

-- Each successful mutation rolls back independently, keeping the same fixtures
-- for insert/update/delete, ownership transfers, and role-transition checks.
create function pg_temp.expect_rows(q text, expected bigint) returns void
language plpgsql security invoker as $$
declare actual bigint;
begin
  begin
    execute q;
    get diagnostics actual = row_count;
    if actual <> expected then
      raise exception 'Expected % rows, got %: %', expected, actual, q;
    end if;
    raise exception sqlstate 'Z0001';
  exception when sqlstate 'Z0001' then null;
  end;
end $$;
create function pg_temp.expect_denied(q text) returns void
language plpgsql security invoker as $$
begin
  begin
    execute q;
    raise exception 'Expected RLS denial: %', q;
  exception when insufficient_privilege then null;
    when raise_exception then
      if sqlerrm <> 'COURSE_SCOPE_ADMIN_ONLY' then raise; end if;
  end;
end $$;

create function pg_temp.check_writes(actor int, own_allowed boolean, admin_allowed boolean)
returns void language plpgsql security invoker as $$
declare
  target int;
  allowed boolean;
  q text;
  row record;
begin
  foreach target in array array[actor, 4] loop
    allowed := admin_allowed or (own_allowed and target = actor);
    foreach q in array array[
      format('insert into courses(title,owner_id,published,is_library) values(''New'',%L,true,false) on conflict (id) do update set title=excluded.title', pg_temp.fixture_id(1, target)),
      format('insert into courses(title,owner_id,published,is_library) values(''New'',%L,true,false) returning id', pg_temp.fixture_id(1, target)),
      format('insert into modules(course_id,position,title,concept) values(%L,77,''New'',''QA'') returning id', pg_temp.fixture_id(2, target)),
      format('insert into lessons(module_id,position,title) values(%L,77,''New'') returning id', pg_temp.fixture_id(3, target)),
      format('insert into activities(lesson_id,position,type,concept,content) values(%L,77,''check'',''QA'',''{"answer":"b"}'') returning id', pg_temp.fixture_id(4, target)),
      format('insert into activity_keys(activity_id,key) values(%L,''{"answer":"b"}'') returning activity_id', pg_temp.fixture_id(6, target))
    ] loop
      if allowed then perform pg_temp.expect_rows(q, 1);
      else perform pg_temp.expect_denied(q); end if;
    end loop;
    -- Both helpers must honor the current role even for an existing owner.
    if can_edit_course(pg_temp.fixture_id(2, target)) is distinct from allowed
       or can_edit_activity(pg_temp.fixture_id(5, target)) is distinct from allowed then
      raise exception 'Wrong edit authorization for actor %, target %', actor, target;
    end if;
    for row in select * from (values
      ('courses', 'id', 2, 'title = ''Changed'''),
      ('modules', 'id', 3, 'title = ''Changed'''),
      ('lessons', 'id', 4, 'title = ''Changed'''),
      ('activities', 'id', 5, 'content = ''{"answer":"b"}'''),
      ('activity_keys', 'activity_id', 5, 'key = ''{"answer":"b"}''')
    ) as t(tbl, pk, kind, assignment) loop
      perform pg_temp.expect_rows(format('update %I set %s where %I = %L',
        row.tbl, row.assignment, row.pk, pg_temp.fixture_id(row.kind, target)), allowed::int);
      perform pg_temp.expect_rows(format('delete from %I where %I = %L',
        row.tbl, row.pk, pg_temp.fixture_id(row.kind, target)), allowed::int);
    end loop;
  end loop;
  -- Migration 2011 reserves global library creation for admins.
  q := format('insert into courses(title,owner_id,is_library) values(''Global'',%L,true) on conflict (id) do update set title=excluded.title returning id', pg_temp.fixture_id(1, actor));
  if admin_allowed then perform pg_temp.expect_rows(q, 1);
  else perform pg_temp.expect_denied(q); end if;
  -- WITH CHECK must reject moving owned content into another owner's tree.
  foreach q in array array[
    format('update courses set owner_id = %L where id = %L', pg_temp.fixture_id(1,4), pg_temp.fixture_id(2,actor)),
    format('update modules set course_id = %L, position = 77 where id = %L', pg_temp.fixture_id(2,4), pg_temp.fixture_id(3,actor)),
    format('update lessons set module_id = %L, position = 77 where id = %L', pg_temp.fixture_id(3,4), pg_temp.fixture_id(4,actor)),
    format('update activities set lesson_id = %L, position = 77 where id = %L', pg_temp.fixture_id(4,4), pg_temp.fixture_id(5,actor)),
    format('update activity_keys set activity_id = %L where activity_id = %L', pg_temp.fixture_id(6,4), pg_temp.fixture_id(5,actor))
  ] loop
    if own_allowed and not admin_allowed then perform pg_temp.expect_denied(q);
    else perform pg_temp.expect_rows(q, admin_allowed::int); end if;
  end loop;
end $$;

set local role authenticated;
do $$
declare actor int;
begin
  foreach actor in array array[1, 2, 3, 5] loop
    perform set_config('request.jwt.claim.sub', pg_temp.fixture_id(1, actor)::text, true);
    perform pg_temp.check_writes(actor, actor in (3,5), actor = 5);
    -- Published enrolled student content and reviewer previews remain readable.
    perform pg_temp.expect_rows(format('select * from courses where id = %L', pg_temp.fixture_id(2,actor)), 1);
    perform pg_temp.expect_rows(format('select * from modules where id = %L', pg_temp.fixture_id(3,actor)), 1);
    perform pg_temp.expect_rows(format('select * from lessons where id = %L', pg_temp.fixture_id(4,actor)), 1);
    perform pg_temp.expect_rows(format('select * from activities where id = %L', pg_temp.fixture_id(5,actor)), 1);
    perform pg_temp.expect_rows(format('select * from activity_keys where activity_id = %L', pg_temp.fixture_id(5,actor)), (actor <> 1)::int);
  end loop;
end $$;

-- Demotion applies immediately, without changing ownership or refreshing JWTs.
reset role;
update profiles set role = 'reviewer' where id = pg_temp.fixture_id(1,3);
set local role authenticated;
select set_config('request.jwt.claim.sub', pg_temp.fixture_id(1,3)::text, true);
select pg_temp.check_writes(3, false, false);
reset role;
update profiles set role = 'student' where id = pg_temp.fixture_id(1,3);
set local role authenticated;
select pg_temp.check_writes(3, false, false);
select pg_temp.expect_rows(format('select * from activity_keys where activity_id = %L', pg_temp.fixture_id(5,3)), 0);
reset role;
update profiles set role = 'instructor' where id = pg_temp.fixture_id(1,3);
set local role authenticated;
select pg_temp.check_writes(3, true, false);

-- A missing identity and the signed-out role never inherit ownership access.
select set_config('request.jwt.claim.sub', '', true);
select pg_temp.check_writes(3, false, false);
reset role;
set local role anon;
select pg_temp.check_writes(3, false, false);
reset role;
rollback;
