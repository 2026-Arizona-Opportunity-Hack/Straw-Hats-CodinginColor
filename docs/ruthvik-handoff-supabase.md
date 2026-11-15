# Ruthvik's handoff: Supabase database, auth and how to change it

Reference for teammates and AI agents working on the backend.
Current state and open work live in [`ruthvik-handoff.md`](ruthvik-handoff.md).

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

From `2001_instructor_workspace.sql`:

| Table / change | What |
|---|---|
| `class_students` | Class roster: `display_name`, 6-digit `passcode` (unique per class), optional `profile_id` once the student has a login. A trigger adds a row for every `enrollments` insert. |
| `assignments` | Class assignments: `kind` (starting template), `title`, `instructions`, `points`, `due_at`, `max_attempts`, `time_limit_minutes`, `module_id`, `published`, `content` jsonb `{ blocks, shuffle, showAnswers }` (see `src/instructor/assignments/model.ts`). 512 KB cap. |
| `activity_type` | Gains `slides` |
| Position uniqueness | `modules`, `lessons`, `activities` position constraints are `deferrable initially deferred`, so reordering in one upsert does not fail. |
| Triggers | An instructor who creates a class is added to `class_instructors`. `assignments.updated_at` is maintained. |

## Row Level Security

RLS is enabled on every table.
Policies today (minimal, a full permissions pass is still open):

- `profiles`: read your own row; admins manage all.
- `courses`: read if published, owned by you, or you are admin; write if owner or admin.
- `modules`, `lessons`, `activities`: read all; write if you can edit the parent course (`can_edit_course`: owner or admin).
- `classes`: read if you teach it, created it, are enrolled, or are admin; insert by instructors and admins; update and delete if `can_manage_class` (teacher, creator, or admin).
- `class_modules`, `class_students`, `assignments`: full access if `can_manage_class`.
- `activity_attempts`: students insert their own; read by the student, their teacher, or admin.
- `api_keys`: no policies (service role only).

Known gaps for the permissions pass:

- Any signed-in user can read every activity, including answer keys and code solutions.
- Students cannot read assignments yet (no student policy).
- Instructors cannot edit library courses owned by the admin.

## Gotchas we already hit

- Supabase keeps `pgcrypto` in the `extensions` schema: call `extensions.crypt(...)` and `extensions.gen_salt(...)`, not the bare names.
- `INSERT ... RETURNING` on `classes` needs a select policy that matches before triggers run, hence the "creator reads class" policy.
- `due_at` is stored as a UTC timestamp; the app converts it to and from the browser's local time for the `datetime-local` input (`isoToLocal`, `localToIso` in `liveStore.ts`).

## Resetting before real data

Plan, not done yet.
Delete demo auth users and rows (or create a fresh project), apply migrations without `--include-seed`, then create the real CIC admin account in Authentication and a matching `profiles` row with `role = 'admin'`.
