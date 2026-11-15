-- Verify archive and restore with unchanged authenticated request claims.
begin;

insert into auth.users (id) values
  ('82000000-0000-0000-0000-000000000001'),
  ('82000000-0000-0000-0000-000000000002'),
  ('82000000-0000-0000-0000-000000000003'),
  ('82000000-0000-0000-0000-000000000004');
insert into profiles (id, role, display_name) values
  ('82000000-0000-0000-0000-000000000001', 'admin', 'Test admin'),
  ('82000000-0000-0000-0000-000000000002', 'instructor', 'Test instructor'),
  ('82000000-0000-0000-0000-000000000003', 'reviewer', 'Test reviewer'),
  ('82000000-0000-0000-0000-000000000004', 'student', 'Test student')
on conflict (id) do update set role = excluded.role;

insert into courses (id, title, owner_id, is_library, published) values
  ('82000000-0000-0000-0000-000000000011', 'Test library', '82000000-0000-0000-0000-000000000001', true, true),
  ('82000000-0000-0000-0000-000000000012', 'Test class course', '82000000-0000-0000-0000-000000000002', false, true);
insert into modules (id, course_id, position, title, concept, published) values
  ('82000000-0000-0000-0000-000000000021', '82000000-0000-0000-0000-000000000011', 1, 'Test module', 'Test', true);
insert into classes (id, name, school, course_id, join_code, created_by) values
  ('82000000-0000-0000-0000-000000000031', 'Test class', 'Test school', '82000000-0000-0000-0000-000000000012', 'ARCH-QA', '82000000-0000-0000-0000-000000000002');
insert into enrollments (student_id, class_id) values
  ('82000000-0000-0000-0000-000000000004', '82000000-0000-0000-0000-000000000031');

do $$
declare
  actor record;
  archived boolean;
  written integer;
  fixture_class_id uuid := '82000000-0000-0000-0000-000000000031';
  library_id uuid := '82000000-0000-0000-0000-000000000011';
begin
  for actor in select id, role from profiles where display_name in ('Test admin', 'Test instructor', 'Test reviewer', 'Test student') loop
    perform set_config('request.jwt.claim.sub', actor.id::text, true);
    foreach archived in array array[false, true, false] loop
      -- The actor's token/claims do not change when someone archives or restores them.
      update profiles set archived_at = case when archived then now() end where id = actor.id;
      set local role authenticated;
      if current_role_is(actor.role) = archived
         or exists (select 1 from profiles where id = actor.id) = archived
         or exists (select 1 from modules where course_id = library_id)
              <> (not archived and actor.role <> 'student')
         or exists (select 1 from catalog_modules() where course_id = library_id) = archived then
        raise exception 'Archive visibility mismatch for % (archived: %)', actor.role, archived;
      end if;
      if can_manage_class(fixture_class_id) <> (not archived and actor.role in ('instructor', 'admin'))
         or exists (select from my_courses() c where c.class_id = fixture_class_id)
              <> (not archived and actor.role = 'student') then
        raise exception 'Archive helper mismatch for % (archived: %)', actor.role, archived;
      end if;
      if archived and (exists (select 1 from classes) or exists (select 1 from activity_attempts)) then
        raise exception 'Account retains archived class or attempt reads';
      end if;
      if actor.role = 'instructor' then
        update classes set name = name where id = fixture_class_id;
        get diagnostics written = row_count;
        if written <> (case when archived then 0 else 1 end) then
          raise exception 'Archive class-write mismatch (archived: %)', archived;
        end if;
      end if;
      reset role;
    end loop;
  end loop;
end;
$$;
rollback;
