# Ruthvik's handoff: Supabase database, auth and how to change it

Reference for teammates and AI agents working on the backend.
Current state and open work live in [`Handoffs/ruthvik-handoff.md`](ruthvik-handoff.md).

## The project

- Hosted project: **CIC Curriculum & Student Progress Platform**, ref `aeatfaxavfppeauncbts`, region us-east-2.
- The app reads `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from `.env` (see [`.env.example`](../.env.example)).
  Get them from the Supabase dashboard under Project Settings, API.
- The anon (publishable) key is safe in the browser; Row Level Security protects the data.
- The service role (secret) key bypasses RLS.
  Keep it server-side only, never prefix it with `VITE_`, never paste it in Slack or a PR.
- Leave the two `VITE_` values empty to run the app on mock data.

The database currently holds **demo data** for building and the demo video.
It will be reset before real student data goes in.

## Demo accounts

All use the password `cic-learn-demo` (public in `supabase/seed.sql`, so treat them as throwaway).

| Email | Role | Sees |
|---|---|---|
| `admin@cic.demo` | CIC admin | Everything |
| `teacher@cic.demo` | Instructor | Maryvale Period 3 |
| `ana.lopez@cic.demo` | Instructor | Desert Edge Period 5, Carl Hayden After School |
| `reviewer@cic.demo` | External reviewer | Published curriculum, read-only |

The seed also creates 16 students (with logins and generated progress), 1 library course "Intro to Python" with 4 modules and 28 activities, and 3 classes.

## Changing the schema

Use the Supabase CLI (a dev dependency, so `npx supabase` works after `npm install`).

```bash
npx supabase login                                    # once per machine, opens the browser
npx supabase link --project-ref aeatfaxavfppeauncbts  # once per clone
npx supabase migration list --linked                  # what is applied remotely
npx supabase db push --linked                         # apply new files in supabase/migrations/
npx supabase db push --linked --include-seed          # also run supabase/seed.sql
npx supabase db query --remote --read-only "select count(*) from classes"
```

Rules:

- Migrations are **append-only**.
  Never edit a file that has been pushed; add a new one.
- Numbering: `0001` is the shared core, `1xxx` student side (Shivraj), `2xxx` instructor side (Ruthvik).
- Run `db push` only after the migration is reviewed; it changes the shared hosted database for everyone.
- AI agents: the CLI refuses hosted writes in agent mode until you pass `--yes`.
  Ask the human first, every time.
  Read-only queries need `--read-only`.
- Keep `src/shared/types/db.ts` and `src/instructor/liveStore.ts` in sync with any table change.

## Tables

From `0001_core_schema.sql` (core contract):

| Table | What |
|---|---|
| `profiles` | One per login: `role` (student, instructor, admin, reviewer), `display_name`, `school`. No email (minors). |
| `courses` | `level`, `delivery_mode` (self_paced, instructor_led), `is_library`, `copied_from`, `owner_id`, `published` |
| `modules`, `lessons`, `activities` | Curriculum tree; `activities.content` is jsonb in the shared contract shape (`src/shared/types/activities.ts`) |
| `classes` | `name`, `school`, `course_id`, unique `join_code`, `created_by` |
| `class_instructors` | Who teaches which class |
| `enrollments` | Students with logins in a class |
| `class_modules` | Modules assigned to a class |
| `activity_attempts` | Student work on curriculum activities: score 0..1, time on task, attempt number |
| `api_keys` | Hashed keys for the read API (service role only) |

## Migration 3005: aggregate read API (database applied; endpoint rebuild pending)

`api/progress.ts` serves GET-only organization-wide aggregates using admin-issued `api_keys` and a server-only `SUPABASE_SERVICE_ROLE_KEY`.
`read_api_progress(text)` is executable only by `service_role`, rechecks revocation, and uses `_course_state` for canonical module completion and paired pre/post gains.
The response contains cohort/course metadata and counts, never student identities or individual work.
See the [README API contract](../README.md#aggregate-read-api) for configuration, scoring definitions, and local tests.
Migration 3005 was applied to hosted on 2026-11-15. The production-only sensitive Vercel server credential is configured; a rebuild with the new setting is still blocked by the Vercel account owner’s identity-verification prompt. The public endpoint still returns 503 for a well-formed key until that rebuild is completed and checked.

Shivraj's student-side migrations (`1001`, `1002`) are documented in [`Handoffs/shivraj-handoff.md`](shivraj-handoff.md): answer keys in `activity_keys`, `submit_attempt`, unlock rules, self-chosen courses.
All of 0001, 1001, 1002, 2001, 2002 and 2003 are applied to the hosted project (checked with `migration list` on Nov 14, 7 PM).

From `2001_instructor_workspace.sql`:

| Table / change | What |
|---|---|
| `class_students` | Class roster: `display_name`, 6-digit `passcode` (unique per class), optional `profile_id` once the student has a login. A trigger adds a row for every `enrollments` insert. |
| `assignments` | Class assignments: `kind` (starting template), `title`, `instructions`, `points`, `due_at`, `max_attempts`, `time_limit_minutes`, `module_id`, `published`, `content` jsonb `{ blocks, shuffle, showAnswers }` (see `src/instructor/assignments/model.ts`). 512 KB cap. |
| `activity_type` | Gains `slides` |
| Position uniqueness | `modules`, `lessons`, `activities` position constraints are `deferrable initially deferred`, so reordering in one upsert does not fail. |
| Triggers | An instructor who creates a class is added to `class_instructors`. `assignments.updated_at` is maintained. |

From `2002_assignment_submissions.sql`:

| Table | What |
|---|---|
| `assignment_submissions` | One row per student per assignment: `responses` (answer per block id), `manual_scores` (instructor points per block id, overriding auto scores), `feedback`, `submitted_at`, `graded_at`, `graded_by`. `class_id` is set from the assignment by a trigger. |

From `2003_rubrics_and_file_uploads.sql`:

| Change | What |
|---|---|
| `assignments.kind` | Allows `file` |
| `assignment_submissions.rubric_scores` | Rubric rating chosen per block, then per criterion |
| Storage bucket `submission-files` | Private, 25 MB per file. Path: `<class_id>/<assignment_id>/<class_student_id>/<file>` |
| `try_uuid(text)` | Safe cast used by the storage policy |

Demo data outside the seed: `supabase/demo/grading_demo.sql` adds two Maryvale assignments and nine fictional submissions (applied to the hosted project on Nov 14).
Run it with `npx supabase db query --remote --file supabase/demo/grading_demo.sql`; fixed ids make re-runs a no-op.
`supabase/demo/rubric_demo.sql` adds a file-upload assignment with a rubric and three submissions; the header comment has the `storage cp` commands that upload `supabase/demo/sample-write-up.pdf` first.
`supabase/demo/assignment_modules_demo.sql` links every assignment without a module to the module of its class's course named in its title or instructions, so the Dashboard's module drop-downs list work.
It never changes an assignment that already has a module, so re-running is a no-op.
Not applied to the hosted project yet; run it after migration 2006 with `npx supabase db query --remote --file supabase/demo/assignment_modules_demo.sql`.

## Row Level Security

RLS is enabled on every table.
Policies today (minimal, a full permissions pass is still open):

- `profiles`: read your own row; admins manage all.
- `courses`: 2011 scopes local reads to their instructor owner, class staff/students and admins; published global courses remain readable. Local edits require an instructor owner/co-teacher or admin; only admins edit global templates.
- `modules`, `lessons`, `activities`: reads follow course scope plus publication/unlock rules; writes follow `can_edit_course` and retain the staff-role boundary.
- `activity_keys`: writes follow `can_edit_activity`; staff/reviewers can read keys only for content they can access.
- `classes`: read if you teach it, created it, are enrolled, or are admin; insert by instructors and admins; update and delete if `can_manage_class` (teacher, creator, or admin).
- `class_modules`, `class_students`, `assignments`: full access if `can_manage_class`; after 3009, this also requires an active instructor/admin profile.
- `activity_attempts`: students insert their own; read by the student, their teacher, or admin.
- `assignment_submissions`: read and update (grade) if `can_manage_class`. No insert or delete policy yet: instructors never create or delete student work, and student inserts wait for student sign-in.
  RLS hides rows instead of erroring, so `liveStore.ts` treats an update that matched no rows as a permission error.
- `storage.objects` in `submission-files`: authenticated users can read a file only if `can_manage_class` on the class id in its path. No insert policy yet (students upload once sign-in exists).
  Verified: anonymous and another class's instructor get "Object not found"; the class's instructor gets a signed URL.
- `api_keys`: no policies (service role only).

Known gaps for the permissions pass:

- Students cannot read assignments yet (no student policy).
- Instructors cannot edit library courses owned by the admin; they import their own copy instead (migration 2004 below).

## Migrations 2010, 2013 and 3009: staff role boundaries (applied to hosted)

Ownership alone no longer authorizes curriculum or answer-key writes.
Students and reviewers cannot create courses or edit legacy courses they own; demoting an instructor removes write access immediately.
Migration 2011 supersedes 2010's owner policy/helpers with local owner/co-teacher editing and admin-only global edits; see the [curriculum isolation audit](curriculum-isolation-audit-2026-11-15.md).
2010 detects the newer local-course registry and does nothing when applied late, preserving 2011's rules rather than restoring the earlier owner-only helpers.
`supabase/tests/course_role_boundaries.sql` checks actual RLS, parent moves, role changes and published reads on a disposable migrated database.
Run with `psql -v ON_ERROR_STOP=1 -f supabase/tests/course_role_boundaries.sql`; fixtures roll back.
`supabase/tests/course_role_migration_compatibility.sql` replays 2010 after 2011 and asserts that the newer helpers and policies remain unchanged.
Migration 2013 evaluates the existing admin/instructor-owner read predicates directly on new course rows, so the app's upsert and `INSERT ... RETURNING` work before the new row is visible to 2011's lookup helper.
The scoped helper still handles co-teachers, enrolled students and global reads; write policies and scope-protection triggers are unchanged.
Migration 3009 also requires an active staff profile in `teaches_class` and `can_manage_class`, so old class assignments/creator IDs cannot expose roster passcodes after demotion or instructor archiving.
`supabase/tests/class_role_boundaries.sql` verifies roster and student-attempt access after those transitions, plus legitimate assigned teachers, creators and admins.

## Migration 2004: copy a library course (applied)

`supabase/migrations/2004_copy_library_course.sql` adds `copy_library_course(p_course_id uuid) returns uuid`.
It is `security definer` and only instructors and admins may call it (`INSTRUCTORS_ONLY` otherwise).
The source must be `is_library and published` (`NOT_A_LIBRARY_COURSE` otherwise).
It creates a course owned by the caller (`is_library false`, `copied_from` = source, `published true`) and copies every module (keeping its published flag), lesson, activity and `activity_keys` row with new ids.
Execute is granted to `authenticated` only.
Checked against a throwaway local Postgres with migrations 0001 to 2004: student refused, non-library course refused, copy and keys correct, library rows unchanged.
Applied to the hosted project on 2026-11-14 with `npx supabase db push --linked --include-all` (2004 sorts before 3001-3004, so `--include-all` is needed).

## Migration 2006: program settings and module rules (applied)

`supabase/migrations/2006_program_settings_and_rules.sql` moves every threshold the dashboards use into the database.

| Object | What |
|---|---|
| `program_settings` | One row (`id = true`): `inactive_days` (3), `low_score_pct` (60), `default_pass_mark` (0.70), `default_max_posttest_tries` (3), `updated_at`. Signed-in users read it; only admins update it. No insert or delete policy. |
| `program_default_pass_mark()`, `program_default_max_tries()` | The two defaults as functions. `module_rules` column defaults now call them. |
| `class_module_settings` view | `security_invoker`. One row per class and module of the class's course (assigned or not): `class_id`, `module_id`, `pass_mark` (0..1), `max_posttest_tries`, with `module_rules` overrides and `program_settings` defaults resolved. |
| Policy "class managers read module rules" | `can_manage_class` may read `module_rules`, so a class creator who no longer teaches it still sees its overrides in the view. |
| `_course_state`, `submit_attempt` | Replaced with identical bodies except the fallback: `program_default_pass_mark()` and `program_default_max_tries()` instead of `0.70` and `3`. |

The app needs this migration: the instructor workspace and the admin Analytics page refuse to load without the view and the settings row, and the error names what is missing.
The instructor side reads it in `src/instructor/liveStore.ts` (each class gets `rules`, the data gets `settings`); the admin side in `src/admin/api.ts`.
Checked on a throwaway local Postgres with all migrations, the seed and the demo files: `supabase/tests/program_settings_and_rules.sql` passes (and fails when the creator policy is dropped), and `supabase/tests/student_curriculum_access.sql` still passes.
Applied to the hosted project on 2026-11-15 with `npx supabase db push --linked --include-all` (2006 sorts before the applied 3001-3004).
It was first numbered 2005, but Ken's `2005_publish_curriculum` already held that version on hosted, so the CLI would have skipped it; check `npx supabase migration list --linked` before numbering a migration.
After applying: `program_settings` has its row and `class_module_settings` returned 29 rows.

## Migration 3008: canonical staff progress (applied to hosted)

`staff_progress_snapshot()` returns `{ modules: [...] }` from `_course_state` for report consumers.
Active instructors see only classes they manage; active admins also see all classes and self-enrollments.
Students, reviewers, archived profiles and anonymous callers are denied.
Rows contain authorized student/course/class/module IDs, state, test-out flag, required/done counts and canonical pre/post scores; they contain no answers or keys.
This is the database prerequisite for the separate completion-reporting UI PR.
Validate with `supabase/tests/staff_progress_snapshot.sql` on a migrated disposable database.
Migration 3008 was applied to hosted on 2026-11-15; real student-token checks and the live instructor dashboard agree with its canonical states.

## Migration 3014: roster Auth metadata timing (not applied)

Live card-login verification exposed a Supabase Auth ordering issue: `admin.createUser` inserts `auth.users` before applying its trusted `app_metadata` in the same transaction ([Auth source](https://github.com/supabase/auth/blob/master/internal/api/admin.go)). Migration 3014 retains the immediate email guard and permits only an existing roster's exact `@students.cic.invalid` address to await a deferred final-row check. That check still requires the server-owned roster marker; client metadata never authorizes an identity. Personal email signup and student email changes remain immediately rejected. This matters because [Auth signup](https://github.com/supabase/auth/blob/master/internal/api/signup.go) can send confirmation mail before transaction commit.

Run `supabase/tests/roster_auth_metadata_timing.sql` plus the existing privacy suites against a disposable migrated database. They use the actual Auth worker session and force deferred validation before changing roles. Migration 3014 requires review and hosted application before the live card-login retry; this commit does not change hosted data.

## Hosted review verification — 2026-11-15

- Applied reviewed migrations `2010`, `2013`, `3005`–`3009`, and `3012` together in one transaction, with exact source recorded in the migration ledger. No seed/reset scripts were run.
- Observed `3010`, `3011`, and `3013` being applied concurrently by separate work; the guarded follow-up batch stopped before changing anything. Those versions were then confirmed in hosted history.
- Deployed `roster-login` from the reviewed source with legacy JWT verification off, as required by its own card validation. Its first live test found that Auth inserts a user before assigning trusted app metadata.
- [PR #86](https://github.com/2026-Arizona-Opportunity-Hack/Straw-Hats-CodinginColor/pull/86) fixes that timing without deferring personal-email rejection. Applied `3014` after merge and verified the hosted source hash. First/repeat card login, real sessions, own-profile reads, enrollment and browser classroom access all passed. Invalid cards, anonymous privileged RPCs and spoofed signup were rejected.
- Live username sign-in passed for three temporary fictional learners. Actual student tokens could not call the staff report or aggregate-report RPC. Students could not create courses or modify a legacy course they owned; an instructor could create a course and receive its row.
- Hosted report checks passed in a rollback-only rehearsal, then a temporary persistent fixture. The live instructor dashboard/gradebook showed 2/3 complete, paired pre/post 0%→50% with two students and +50 points, loops mastery 100% and decisions 0%. Pretest placement and exhausted final attempts counted as complete; later practice stayed excluded.
- Live activity details displayed the saved worksheet text/choice and distinguished latest practice answers from the counted score. A fresh student module visit opened introductory reading; a reachable activity’s Review link opened its selected step and restored answers. Existing prerequisite navigation limits remain in force.
- Live image editing created a box using only keyboard controls, from (25%,25%) to (75%,75%), then undid it. No AI generation or publication was used.
- Verification used temporary fictional accounts/classes, which were removed afterward; no existing learner work or profile roles were changed. The temporary browser draft/bookmark was removed. One non-identifying failed-login throttle hash remains eligible for the normal one-day cleanup.
- Local verification of the final database fix: 19 SQL suites, 202 application tests, build/typecheck and lint pass (two pre-existing lint warnings).

**Vercel follow-up:** production was READY at `214b343`, which includes the reviewed frontend fixes. This project uses manual deployments, with no Git integration. `SUPABASE_SERVICE_ROLE_KEY` was added as production-only and sensitive after that deployment. Rebuilding with the latest settings requires the account owner to complete Vercel’s identity verification or deploy current main from their authenticated CLI. No new deployment was created by the blocked rebuild attempt. After rebuilding, verify `/api/progress` with missing, invalid, active and revoked temporary keys, its aggregate-only response and `Cache-Control: no-store`, then remove the temporary key. Do not mark the public read API verified until those checks pass.

## Gotchas we already hit

- Supabase keeps `pgcrypto` in the `extensions` schema: call `extensions.crypt(...)` and `extensions.gen_salt(...)`, not the bare names.
- `INSERT ... RETURNING` on `classes` needs a select policy that matches before triggers run, hence the "creator reads class" policy.
- `npx supabase storage cp` needs `--experimental` and `--remote`; destination looks like `ss:///submission-files/<path>`.
- In a `union all` insert, string literals are typed as text; cast ids with `::uuid`.
- `due_at` is stored as a UTC timestamp; the app converts it to and from the browser's local time for the `datetime-local` input (`isoToLocal`, `localToIso` in `liveStore.ts`).

## Resetting before real data

Plan, not done yet.
Delete demo auth users and rows (or create a fresh project), apply migrations without `--include-seed`, then create the real CIC admin account in Authentication and a matching `profiles` row with `role = 'admin'`.

## Log

- 2026-11-15, Codex: applied the reviewed hosted migrations and 3014, deployed roster login, and verified live card/username access, teacher reporting, saved answers, activity navigation and keyboard annotations. See the hosted verification section above; the reporting API still awaits a Vercel identity-verified rebuild.

- 2026-11-15, Codex: added the canonical staff progress RPC and authorization/state regression tests as the database prerequisite for accurate teacher/admin completion reports; no hosted changes.

- 2026-11-15 8:55 AM, Ruthvik: migration 2006 is applied on hosted (renumbered from 2005); every migration through 2008 is applied. `supabase/demo/assignment_modules_demo.sql` is still not run on hosted.

- 2026-11-15 1:15 AM, Ruthvik: added migration 2006 (program settings, `class_module_settings`), its SQL test and `supabase/demo/assignment_modules_demo.sql`. Neither is applied to the hosted project yet.

- 2026-11-15, Codex: added migration 3005 and the key-authenticated aggregate read endpoint, with HTTP authorization tests and rollback-only SQL tests on a disposable local database; hosted activation remains pending.

- 2026-11-15 12:45 AM, Ruthvik: set `is_library = true` on the hosted "Web Development Foundations" course (owner Dana Whitfield, no classes) so it shows in the CIC library. Data-only change, not in a migration or seed.
- 2026-11-14 9:00 PM, Ruthvik: added and applied migration 2004 `copy_library_course`. Also loaded `supabase/curriculum/ai-academy.sql` (AI Academy library courses).

- 2026-11-15, Codex: added migrations 2010 and 3009 with local RLS regressions for course/content/answer-key writes and class access after staff demotion or archiving; not applied to hosted.
- 2026-11-15, Codex: reconciled 2010 with 2011 isolation and added 2013 for legitimate course creation; fresh/late migration-order tests preserve co-teacher/private scope and cover upsert/RETURNING under actual RLS.

- 2026-11-15, Codex: added 3014 to accommodate the supported Auth create-user transaction without allowing unmarked synthetic identities or delaying personal-email rejection. Added two-stage privacy regressions; hosted application and successful live card retry remain pending.
