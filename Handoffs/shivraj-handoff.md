# Shivraj's handoff: student-side backend

Read this first if you are a teammate or an AI coding agent working on student progress, grading or unlocking.
It says what exists, where it lives, what is half done, and what to watch out for.
Update it in the same branch as your change (see "How to update this file" at the bottom).
Format follows Ruthvik's handoff (`Handoffs/ruthvik-handoff.md`).

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
| `1001_student_progress.sql` | Merged (#16) | Applied to the hosted DB |
| `1002_answer_keys_and_assigned_modules.sql` | Merged (#17) | Applied to the hosted DB |
| `1003_student_sign_up.sql` | Merged (#19) | Applied to the hosted DB |
| `1008_starter_quiz.sql` | Merged (#54) | Applied to the hosted DB |
| `1009_unlock_and_duplicate_fixes.sql` | Merged (#58) | Applied to the hosted DB |
| `1010_intro_python_demo_content.sql` | Merged (#59) | Applied to the hosted DB |
| `1011_check_feedback.sql` | Merged (#62) | Applied to the hosted DB |
| `1012_catalog_modules.sql` | Branch `shivraj-polish` | Applied to the hosted DB |
| `1013_student_usernames.sql` | Branch `shivraj-polish`, tested (15 checks) | Not applied yet |
| `1014_module_assessments.sql` | Branch `shivraj-polish`, tested (14 checks) | Not applied yet |
| `2009_course_state_merge.sql` | Merged (#62). In Ruthvik's range on purpose | Applied to the hosted DB |

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

### Student sign-up and sign-in (1003)

- Login page has a Student / Teacher-or-staff switch. Students use login cards or generated usernames (1013); Google sign-in is for educators. Legacy email/password accounts still work.
- `student_sign_up(email, password, display_name, school, class_code)` is internal only after 3006. It creates a confirmed account and optional enrollment for the trusted username/staff RPCs.
- The 1013 Auth trigger assigns Google accounts the reviewer role; other new accounts start as students. Admins provision other staff roles.
- `join_class(code)` joins later. Progress from a self-chosen copy of the same course moves into the class.
- Google needs setup in Google Cloud and the Supabase dashboard (redirect URI `https://aeatfaxavfppeauncbts.supabase.co/auth/v1/callback`). The client secret goes in the dashboard only.

### Starter quiz (1008)

- New students land on `/student/start` the first time they open home (`src/student/placement/PlacementCard.tsx` redirects when `my_placement()` is null). "Skip for now" calls `skip_placement()` and stops the redirect.
- 12 questions in `placement_items` (interest, motivation, 7 graded knowledge items). Keys in `placement_keys` (no policies). The app sends every answer with `time_ms` and each selection change; `submit_placement(answers)` scores it and saves to `placement_results`.
- Result: `level`, per-subject `ability` and `interest`, `pace`, `commitment`, the recommended original self-paced `course`, plain-language `reasons`, `skip_tip`, `alternatives`.
- Edit questions with SQL (`placement_items` + `placement_keys`); the scoring adapts to any number of knowledge items. Subjects come from course titles (`course_subject()`), like `src/student/languages.ts`.
- Explore (`listCatalog`) now lists original courses only (`copied_from is null`).
- Off unless `VITE_LIVE_STUDENT_CURRICULUM=true`.

### Fixes in 1009

- An **unscorable final check** (no items or no key) counts as passed once submitted, so it no longer blocks the next class module.
- A class with **no assigned modules** shows the whole course; assigning modules limits it again.
- **Course families**: `course_family(id)` = the original's id for a copy. `enroll_in_course` refuses any family member the student's class already uses (`ALREADY_IN_CLASS`); `_join_class` drops self-added copies of the class course. Existing duplicates were deleted.
- `my_activity_response(activity)` returns the student's latest saved answer; the module player shows it on locked cards (`previousResponse` prop on `ActivityBlock`).

### Check feedback (1011) and the _course_state merge (2009)

- After a student answers a knowledge check (answer once), the card shows the instructor's `explanation` ("Why: ...") and, after a wrong answer, the right choice ("Right answer: ...", and a ✓ on that option).
- `my_check_answer(activity)` returns the right choice id only for `check`/`exit` cards the caller has already answered. Warm-up and final check keys stay hidden.
- **Ruthvik:** 1009 and 2006 both replaced `_course_state`; live had 1009's version (no program defaults), a fresh DB would keep 2006's (no 1009 fixes). `2009_course_state_merge.sql` holds both and runs after both. Change `_course_state` only in a newer migration that starts from that copy.

### Student usernames (1013)

- Students have **no email**. Sign-up: first name, last name, password, optional class code. They get a username like `jsmith1` (first initial + last name + lowest free number, accents folded) and see it once before signing in. Sign-in: username + password.
- Auth still needs an email, so each student uses a hidden, undeliverable `<username>@students.cic-learn.invalid` (`studentAuthEmail` in `src/api/student/auth.ts` must match `_create_student`).
- `student_create_account(first, last, password, class_code)` (anon) and `admin_create_student(first, last, password, class_id)` (admins; People & roles uses it for students). Public email sign-up (`student_sign_up`) is revoked.
- **Google sign-in = K-12 educators**: new Google accounts get the `reviewer` role. The button sits under the staff sign-in.
- Sidebar and People & roles show `@username`.
- One-time cleanup: `supabase/demo/delete_all_students.sql` deletes every student account, roster row and all student work (staff and curriculum stay).

### Generated warm-ups and final checks (1014)

- Every module gets a warm-up and final check as **parallel forms**: same concepts, same count, different questions where possible, so gain compares like with like.
- `POST /api/curriculum/assessment { moduleId }` (instructor/admin): the AI reads the module and writes both forms; `generate_module_assessment(module, ai)` validates and stores them (answers into `activity_keys`). Invalid or missing AI output falls back to the module's own keyed checks. Publishing a module calls it in the background (`requestModuleAssessment` in `liveStore.ts`).
- Hand-written tests are never replaced (only empty ones or ones with `content.generated`). 1014 backfills all published modules.
- They are normal pretest/posttest activities, so the instructor gain columns, admin analytics and per-concept scores work unchanged.
- **Final check lock**: while an unsubmitted final check is open, every way out is blocked (`useBlocker`) and a popup shakes on each try.

### Module player and student sidebar

- `/student/module/:id` shows **one card at a time** (`ModulePlayer.tsx`). `?step=N` (1-based) opens a card. Next unlocks once a card is done; non-required cards offer "Skip for now". A segment bar shows progress without showing questions. Correct answers trigger a short confetti burst (`stepper.css`, none under reduced motion).
- A new module visit starts at its first card, including reading, instead of skipping to the first required question.
  Returning visits resume the last viewed activity saved in this browser for that student and module; a fingerprint of the published lesson content invalidates the bookmark after edits or reordering.
  Explicit step links take precedence and remain limited by unfinished required work.
  Bookmarks are navigation only: reading still creates no submission, score or server completion record.
- `ActivityBlock` (`LessonContent.tsx`) new optional props: `onResult` (each attempt result), `hideTitle` (caller shows the title), `answerOnce` (lock after first submission, except `posttest`). Video activities now embed via `embedUrl`, like the instructor preview.
- Student sidebar: Home (`/student`), My courses (`/student/courses`), My classroom (`/student/classroom`). Inside a course, `StudentCourseNav.tsx` lists modules as dropdowns of their steps; locked modules show a lock and don't expand.
- **Finish module** lands on the course page with `state.finishedModule`; `ModuleFinished.tsx` shows a banner there: confetti and the final-check score, then *Start the next module*, *Find your next course* (all done), or, when the pass mark is missed, the score needed, the tries left and *Retake the final check*. `Celebration.tsx` holds the shared confetti. `ModuleStatus` now carries `pass_mark`.
- **Explore** (`StudentExplore.tsx`, `explore.css`): course cards with description, level and module count, subject chips and search. A card opens a `<dialog>` preview with the module list (`catalog_modules()`, 1012) and *Add course* (self-paced), a class-code form (with a class), *Open course* (already added) or *Coming soon*.
- Course page back link goes to My courses once the course is added, else to Explore.
- Shared step names: `src/student/steps.ts`. Shared course progress hook: `src/student/useMyCourseProgress.ts`.

### Functions the app calls (`supabase.rpc`)

| Function | Returns |
|---|---|
| `my_courses()` | Courses the student is in, each with `source` = `class` or `self` |
| `enroll_in_course(course_id)` | Picks a self-paced course. Errors: `ALREADY_IN_CLASS`, `COURSE_NOT_AVAILABLE`, `STUDENTS_ONLY` |
| `my_course_progress(course_id)` | One row per visible module: `state` (locked, available, completed), `locked_reason`, `tested_out`, pretest score, counted post-test best, tries, pass mark |
| `my_module_activities(module_id)` | One row per activity: submitted, best score, tries |
| `my_next_activity(course_id)` | `{module_id, activity_id}` to continue, or null |
| `my_activity_response(activity_id)` | The student's latest saved response, or null |
| `my_check_answer(activity_id)` | Right choice id of a check/exit the student already answered, else null |
| `catalog_modules()` | Module titles of published modules in published original courses (Explore preview) |
| `student_create_account(first, last, password, class_code)` | `{user_id, username, class}`; callable signed out |
| `generate_module_assessment(module_id, ai)` | `{source: 'ai'|'checks'|null, written, pretest, posttest}` (instructor/admin) |
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
2. ~~Placement quiz~~: done in 1008. Next: CIC reviews the 12 questions.
3. **Roster passcodes** now use the `roster-login` Edge Function and migration `3007_roster_student_login.sql`.
   Provisioning uses the Auth admin API and a marked synthetic identity, then links the existing roster before enrollment; no direct Auth table writes.
   Both RPCs are service-only, the binder rechecks the card under a row lock, and direct client identity relinking is blocked.
   Login cards sit alongside username signup/sign-in from 1013; educator Google stays on the staff side.
   Apply the migration and deploy the function before enabling login cards on hosted; local SQL and handler tests cover access, retries, throttling and existing accounts.
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

- 2026-11-15, Codex: reconciled the reading-position fix with the new final-check navigation lock; the keyed module player retains the lock and submission behavior.
- 2026-11-15, Codex: preserved initial reading order and added per-student/module browser bookmarks; verified first entry, return visits and clamped step links in the local demo, with navigation/storage regression tests.
- 2026-11-15, Shivraj: student usernames + educator Google sign-in (1013), final-check lock, generated parallel warm-ups/final checks with an AI endpoint and checks fallback (1014). Touches Aryan's People & roles and Ken's `liveStore.ts` publish.
- 2026-11-15, Shivraj: rebuilt Explore as course cards with a module preview and Add course (1012); course page back link goes to My courses. Touches Jacky's `StudentExplore.tsx` and `StudentCourse.tsx`.
- 2026-11-15, Shivraj: added the module-complete banner on the course page (touches Jacky's `StudentCourse.tsx`).
- 2026-11-15, Shivraj: added check explanations and right-answer reveal (1011) and merged the 1009 and 2006 versions of `_course_state` (2009).
- 2026-11-14 7:30 PM, Ruthvik: confirmed with `migration list` that 1001 and 1002 are applied to the hosted DB. Items 4 (builder reads `activity_keys`) and 5 (scoring rules in instructor progress) are done on `ruthvik/class-tabs`.
- 2026-11-15, Codex: connected imported login cards to student Auth sessions and their original roster rows; hosted activation remains pending.
- 2026-11-14, Shivraj: created. Migrations 1001 (grading, unlock rules, self-chosen courses) and 1002 (answer mover trigger, assigned modules only), both tested locally, not yet applied.

- 2026-11-15, Codex: reconciled login cards with PR #75; preserved generated username accounts, legacy email access and staff Google sign-in.

- 2026-11-15, Codex: preserved 1013 username and educator Google onboarding while blocking direct personal-email student signup and email changes.
  Append-only 3012 reconciles the 3006 guard using server-owned username markers; People & roles retains email-free student creation.
  Tested anonymous PostgREST and Auth worker sessions separately from trusted SQL fixtures; hosted activation remains pending.
  Local browser fixtures confirmed card/username/signup modes, educator Google visibility and email-free admin student provisioning.
