# Shivraj's handoff: student-side backend

Read this first if you are a teammate or an AI coding agent working on student progress, grading or unlocking.
It says what exists, where it lives, what is half done, and what to watch out for.
Update it in the same branch as your change (see "How to update this file" at the bottom).
Format follows Ruthvik's handoff (`docs/ruthvik-handoff.md` on `ruthvik/class-tabs`).

Last updated: Sat Nov 14 2026, by Shivraj (with Claude Code).

## The student backend in one paragraph

Students submit all work through one database function, `submit_attempt`, which grades it and saves it.
Answer keys live in a staff-only table, `activity_keys`; students can never read them.
The database decides which modules are open for each student.
On a course the student chose themselves, finishing a module opens the next.
In a class, students see only the modules assigned to the class; the next one opens when the previous one is finished and the post-test pass mark is met or the tries are used up.
A first pretest try at or above the pass mark tests the student out of that module, which is how late joiners catch up.

## Where things stand

### Branches and migrations

| Item | State | Notes |
|---|---|---|
| `Shivraj` branch | Up to date with `main` (includes 2001) | Has 1001 committed; 1002 to commit |
| `1001_student_progress.sql` | Written, tested locally | **Not applied to the hosted DB** |
| `1002_answer_keys_and_assigned_modules.sql` | Written, tested locally | **Not applied to the hosted DB** |

Tests: 45 checks in a local Postgres (PGlite) with `0001`, `1001`, `1002` and `2001`, passing in both orders.
The hosted DB applies `0001, 2001, 1001, 1002`; a fresh setup applies `0001, 1001, 1002, 2001`.
Applying needs `npx supabase db push --linked --include-all` (1xxx sorts before the already-applied 2001).

### What works (once 1001 and 1002 are applied)

- `activity_keys`: answer keys. Read by instructor, admin, reviewer. Written by the course owner or admin.
- A trigger on `activities` moves any answers saved inside `content` into `activity_keys` and strips them from `content`.
  Blank or missing answers never erase stored ones.
- `course_enrollments`: courses a student picked on their own (self-paced and published only; blocked if the course is already their class's course).
  `activity_attempts.class_id` is now nullable: null means a self-chosen course.
- `module_rules`: per class and module, `pass_mark` (default 0.70) and `max_posttest_tries` (default 3). No row means defaults.
- `module_unlocks`: an instructor opens a module for one student.
- Students can no longer insert into `activity_attempts` directly. The `"student writes own attempts"` policy from 0001 is dropped.
- New policy: students read their own `enrollments` rows (0001 had no select policy, so students could not see their class).

### Functions the app calls (`supabase.rpc`)

| Function | Returns |
|---|---|
| `my_courses()` | Courses the student is in, each with `source` = `class` or `self` |
| `enroll_in_course(course_id)` | Picks a self-paced course. Errors: `ALREADY_IN_CLASS`, `COURSE_NOT_AVAILABLE`, `STUDENTS_ONLY` |
| `my_course_progress(course_id)` | One row per visible module: `state` (locked, available, completed), `locked_reason`, `tested_out`, pretest score, counted post-test best, tries, pass mark |
| `my_module_activities(module_id)` | One row per activity: submitted, best score, tries |
| `my_next_activity(course_id)` | `{module_id, activity_id}` to continue, or null |
| `submit_attempt(activity_id, response, time_on_task_ms, client_score)` | `{attempt_id, attempt_no, score, is_correct, counts}`. Errors: `MODULE_LOCKED`, `NOT_ENROLLED`, `BAD_RESPONSE` |

`response` shapes are documented above `submit_attempt` in `1001_student_progress.sql`.
The reply never contains the right answer.

### Scoring rules other code must match

- Pretest: only try #1 counts.
- Post-test in a class: best of the first `max_posttest_tries` tries counts. In a self-chosen course: best try.
- Later tries are saved as practice (`counts = false` in the reply) and never change unlocking or learning gain.
- Learning gain = counted post-test score minus pretest try #1.
  Pre/post tests also save a per-concept score in `activity_attempts.response.concept_scores`.
- Code and interactive HTML are graded in the browser (`client_score`, 0..1); everything else is graded in the database.

### Not done yet (pick these up)

1. **Swap `src/api/student/index.ts` from mocks to the RPCs above** (Shivraj, next).
2. **Placement quiz**: tables, item bank, scoring (Shivraj).
3. **Student sign-in with class code + passcode** against `class_students` (Shivraj; Ruthvik's handoff proposes an Edge Function).
4. **Ruthvik:** the course builder now loads activities without answers.
   Select `activity_keys (key)` with each activity and put answers back: `content.answer = key.answer`, `items[i].answer = key.answers[items[i].id]`, `questions[i].answer = key.question_answers[i]`, `solution = key.solution`.
   Saving needs no change.
5. **Ruthvik:** learning-gain and dashboard queries should follow the scoring rules above so numbers match.
6. **Aryan:** seed pre/post tests use `questions: []` with no items, so they cannot be graded and the demo shows no learning gain.
   Use `items` with ids, concepts, choices and an `answer` per item (the trigger moves the answers).
7. **Aryan:** remove `answer` and `solution` from `src/shared/types/activities.ts`; they live in `activity_keys` now.

## How the code is organized

| Path | What | Owner |
|---|---|---|
| `supabase/migrations/1xxx_*.sql` | Student-side schema, policies, functions | Shivraj |
| `src/api/student/` | Typed functions the student UI calls | Shivraj |
| `Handoffs/` | Handoff files, one per person | Everyone |

Internal helpers start with `_` (`_course_state`, `_class_for`, `_is_enrolled`) and cannot be called from the app.

## Team agreements that bite

- Never put answers anywhere a student can read.
  If you add a new answer-like field to activity content, add it to the trigger in a new migration.
- Never write `activity_attempts` from the client; call `submit_attempt`.
- Migrations are append-only; to change a function, `create or replace` it in a new file.
- Run `db push` only after telling the team; it changes the shared hosted database.

## How to update this file

When you finish a change, update the sections above that it affects and add one line to the log below.
Keep it short; link to code instead of copying it.
Put each sentence on its own line.

## Log

- 2026-11-14, Shivraj: created. Migrations 1001 (grading, unlock rules, self-chosen courses) and 1002 (answer mover trigger, assigned modules only), both tested locally, not yet applied.
