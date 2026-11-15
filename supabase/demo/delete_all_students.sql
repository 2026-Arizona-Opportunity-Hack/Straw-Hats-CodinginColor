-- One-time cleanup (Nov 15 2026): remove every student account and all student work before
-- switching students to usernames (1013). Owner: Shivraj. Not a migration: run it once,
-- by hand, on the hosted database:
--   npx supabase db query --linked -f supabase/demo/delete_all_students.sql
--
-- Staff (admins, instructors, reviewers), courses, classes, assignments and curriculum stay.
-- Deleting the auth user cascades to the profile and from there to every table that holds
-- student data: enrollments, course_enrollments, activity_attempts, module_unlocks,
-- placement_results, discussion_notes. Roster rows (class_students) are removed
-- explicitly, which also removes their assignment_submissions.

begin;

create temp table gone on commit drop as select id from profiles where role = 'student';

-- unlocked_by has no cascade; clear unlocks a student triggered for themselves.
delete from module_unlocks where student_id in (select id from gone) or unlocked_by in (select id from gone);
-- Every roster row (all demo names) and its assignment submissions.
delete from class_students;
-- Auth users -> profiles -> all student rows above (on delete cascade).
delete from auth.users where id in (select id from gone);

-- Report what is left: students, roster_rows, enrollments and placement_results should be 0
-- (attempts and unlocks can stay above 0 only from staff test runs).
select
  (select count(*) from profiles where role = 'student') as students,
  (select count(*) from class_students) as roster_rows,
  (select count(*) from enrollments) as enrollments,
  (select count(*) from course_enrollments) as self_enrollments,
  (select count(*) from activity_attempts) as attempts,
  (select count(*) from assignment_submissions) as submissions,
  (select count(*) from placement_results) as placement_results,
  (select count(*) from curriculum_private.discussion_notes) as discussion_notes,
  (select count(*) from module_unlocks) as unlocks;

commit;
