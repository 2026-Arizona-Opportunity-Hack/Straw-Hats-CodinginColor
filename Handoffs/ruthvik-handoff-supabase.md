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

## Migration 3005: aggregate read API (not applied)

`api/progress.ts` serves GET-only organization-wide aggregates using admin-issued `api_keys` and a server-only `SUPABASE_SERVICE_ROLE_KEY`.
`read_api_progress(text)` is executable only by `service_role`, rechecks revocation, and uses `_course_state` for canonical module completion and paired pre/post gains.
The response contains cohort/course metadata and counts, never student identities or individual work.
See the [README API contract](../README.md#aggregate-read-api) for configuration, scoring definitions, and local tests.
Migration 3005 is committed for review; no hosted database or deployment changes were made.

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
- `courses`: read if published, owned by you, or you are admin; write if owner or admin.
- `modules`, `lessons`, `activities`: read all; write if you can edit the parent course (`can_edit_course`: owner or admin).
- `classes`: read if you teach it, created it, are enrolled, or are admin; insert by instructors and admins; update and delete if `can_manage_class` (teacher, creator, or admin).
- `class_modules`, `class_students`, `assignments`: full access if `can_manage_class`.
- `activity_attempts`: students insert their own; read by the student, their teacher, or admin.
- `assignment_submissions`: read and update (grade) if `can_manage_class`. No insert or delete policy yet: instructors never create or delete student work, and student inserts wait for student sign-in.
  RLS hides rows instead of erroring, so `liveStore.ts` treats an update that matched no rows as a permission error.
- `storage.objects` in `submission-files`: authenticated users can read a file only if `can_manage_class` on the class id in its path. No insert policy yet (students upload once sign-in exists).
  Verified: anonymous and another class's instructor get "Object not found"; the class's instructor gets a signed URL.
- `api_keys`: no policies (service role only).

Known gaps for the permissions pass:

- Students cannot read assignments yet (no student policy).
- Instructors cannot edit library courses owned by the admin; they import their own copy instead (migration 2004 below).

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

- 2026-11-15 8:55 AM, Ruthvik: migration 2006 is applied on hosted (renumbered from 2005); every migration through 2008 is applied. `supabase/demo/assignment_modules_demo.sql` is still not run on hosted.

- 2026-11-15 1:15 AM, Ruthvik: added migration 2006 (program settings, `class_module_settings`), its SQL test and `supabase/demo/assignment_modules_demo.sql`. Neither is applied to the hosted project yet.

- 2026-11-15, Codex: added migration 3005 and the key-authenticated aggregate read endpoint, with HTTP authorization tests and rollback-only SQL tests on a disposable local database; hosted activation remains pending.

- 2026-11-15 12:45 AM, Ruthvik: set `is_library = true` on the hosted "Web Development Foundations" course (owner Dana Whitfield, no classes) so it shows in the CIC library. Data-only change, not in a migration or seed.
- 2026-11-14 9:00 PM, Ruthvik: added and applied migration 2004 `copy_library_course`. Also loaded `supabase/curriculum/ai-academy.sql` (AI Academy library courses).
