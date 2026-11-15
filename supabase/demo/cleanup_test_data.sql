-- One-time cleanup (Nov 15 2026): remove test/QA data so instructor and admin stats only count
-- real classes and students. Owner: Shivraj. Not a migration. Run once, by hand:
--   npx supabase db query --linked -f supabase/demo/cleanup_test_data.sql
--
-- Removes:
--   * 22 fictional roster names (no login) in "Maryvale P3" (code B7D5F9); the class stays.
--   * Test/QA classes by join code, with their enrollments, roster rows, assignments,
--     submissions, module settings and the activity attempts made inside them.
--   * QA courses ("HTML Publish QA ...", "Demo Isolation Template ...") and teacher copies that
--     no class uses any more.
-- Keeps: staff, student accounts, library courses, the seeded cohorts (Maryvale Period 3,
-- Desert Edge Period 5, Carl Hayden After School) and "Maryvale P3".

begin;

create temp table test_classes on commit drop as
  select id from public.classes
  where join_code in ('57CC33', '414C71', 'C274AE', 'CHCH-67', '07BF11', '3F0BB2', 'MC1-430', '64DF20', '65CBED', 'B5EECF');

-- Fictional roster names that never got a login.
delete from public.class_students s using public.classes c
where c.id = s.class_id and c.join_code = 'B7D5F9' and s.profile_id is null;

-- Test classes; children (enrollments, roster, assignments, attempts, ...) cascade.
delete from public.classes where id in (select id from test_classes);

-- QA courses, then teacher copies left without a class. Library originals are never copies.
delete from public.courses
where title like 'HTML Publish QA %' or title like 'Demo Isolation Template %';
delete from public.courses c
where c.copied_from is not null
  and not exists (select 1 from public.classes k where k.course_id = c.id);

-- What is left.
select
  (select count(*) from public.classes) as classes,
  (select string_agg(name, ', ' order by name) from public.classes) as class_names,
  (select count(*) from public.class_students where profile_id is null) as roster_without_login,
  (select count(*) from public.courses) as courses,
  (select count(*) from public.courses where copied_from is not null) as course_copies,
  (select count(*) from public.activity_attempts) as attempts,
  (select count(*) from public.enrollments) as enrollments;

commit;
