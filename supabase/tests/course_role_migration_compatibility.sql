-- Run after all migrations on a disposable DB. Replaying an older migration
-- must preserve 2011's co-teacher/private-course rules and scoped policies.
begin;
create temp view current_course_access as
  select 'can_edit_course' as object_name, pg_get_functiondef('public.can_edit_course(uuid)'::regprocedure) as definition
  union all
  select 'can_edit_activity', pg_get_functiondef('public.can_edit_activity(uuid)'::regprocedure)
  union all
  select policyname, row_to_json(p)::text from pg_policies p
  where schemaname = 'public' and tablename = 'courses';
create temp table expected_course_access as table current_course_access;

\ir ../migrations/2010_course_role_boundaries.sql

do $$
begin
  if to_regclass('public.local_curricula') is null then
    raise exception 'Test requires migration 2011';
  end if;
  if exists (
    (table current_course_access except table expected_course_access)
    union all
    (table expected_course_access except table current_course_access)
  ) then
    raise exception 'Late migration 2010 changed the newer curriculum access rules';
  end if;
end $$;
rollback;
