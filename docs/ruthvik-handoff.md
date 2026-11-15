# Ruthvik's handoff: current state of CIC Learn

Read this first if you are a teammate or an AI coding agent picking up work.
It says what exists, where it lives, what is half done, and what to watch out for.
Update it in the same branch as your change (see "How to update this file" at the bottom).
Other teammates can keep their own `docs/<name>-handoff.md` in the same format.

Last updated: Sat Nov 14 2026, 5:05 PM MST, by Ruthvik (with Claude Code).

## The product in one paragraph

CIC Learn is a learning platform for Coding in Color (CIC Problem 1).
Four roles: student, instructor, CIC admin, external reviewer.
Instructors run classes: dashboard, curriculum, assignments, grades, roster.
Admins see every class and funder-facing learning gain.
Students follow modules like a code.org lesson.
The team plan is in [`plan.md`](../plan.md); the nonprofit brief is linked from [`AGENTS.md`](../AGENTS.md).

## Where things stand

### Branches and PRs

| Branch | State | Notes |
|---|---|---|
| `main` | Has scaffold, schema 0001, Aryan's admin pages, Ken's instructor UI mounted in the sidebar layout (PR #8) | Deployed source of truth |
| `ruthvik/class-tabs` | PR #14 into `main`, open | Class tabs, roster tab, block-based assignments, live Supabase data layer, CIC logo, these docs. About 2,600 lines. Merge after #13. |
| `ruthvik/schema-2001` | PR #13 into `main`, open | Only migration 2001 plus the seed fixes (145 lines). Merge first so `main` matches the hosted database. |
| `jacky/student-join-and-player` | Pushed, no PR | Student module player with a renderer per activity type (`src/student/activities.tsx`). |
| `Shivraj` | 2 commits ahead of `main` | Supabase CLI config (`supabase/config.toml`). Already merged into `ruthvik/class-tabs`. |
| `Aryan`, `Ken`, `Jacky` | Nothing new beyond `main` | |

macOS note: the remote has both `Jacky` and `jacky/student-join-and-player`.
On a case-insensitive disk `git fetch` fails with "cannot lock ref".
Fetch it under another name: `git fetch origin refs/heads/jacky/student-join-and-player:refs/remotes/origin-jacky/student-join-and-player`.
Renaming one of the two branches on GitHub fixes it for everyone.

### What works today (on `ruthvik/class-tabs`)

- Login: staff sign in with email and password (Supabase Auth).
  With no Supabase keys in `.env`, a mock role picker appears instead.
- Instructor workspace at `/instructor` inside the shared sidebar layout (Aryan's `AppLayout`).
  Hash routes: `#/classes`, `#/classes/<id>/<tab>`, `#/curriculum`, `#/curriculum/<courseId>`, `#/review`.
- Class page tabs: Dashboard, Curriculum, Assignments, Grades, Roster (`#/classes/<id>/<tab>`).
- Assignments are an ordered list of blocks: text, link or video, interactive HTML page, questions (multiple choice, select all, true/false, short answer, number), written response, code exercise.
  Create, edit, duplicate, publish, delete, export to JSON, import from JSON, from another class, or from pasted Aiken quiz text.
  Student preview grades the questions so instructors can test the answer key.
- Live data: with Supabase keys set, the instructor workspace loads and saves classes, roster, assigned modules, assignments and course content (`src/instructor/liveStore.ts`).
  Only changed rows are written, one save at a time.
  A failed save shows an error and reloads from the database.
- Grading (Grades tab, `src/instructor/assignments/Gradebook.tsx`): gradebook of students by published assignments with needs-grading, missing and late states, totals and CSV export.
  Each cell opens the submission block by block; questions are auto-graded and can be overridden, written and code answers take points, feedback is saved.
  Previous and next walk through the class.
- Admin pages (Aryan, `src/admin/`) still read from `src/admin/mocks.ts`, not Supabase.

### Not done yet (pick these up)

1. **Student sign-in with class code + passcode.**
   Roster rows have passcodes, but nothing checks them.
   Plan: an Edge Function that verifies `classes.join_code` + `class_students.passcode` and signs the student in (creates or reuses an auth user, sets `class_students.profile_id`).
2. **Students submitting assignments.**
   The `assignment_submissions` table exists (migration 2002) and instructors can grade, but students cannot submit yet.
   Needs student sign-in (item 1) plus an insert policy for the student's own row.
   The Assignments list's Submitted and Avg columns still read curriculum attempts; switch them to submissions.
3. **Progress for roster-only students.**
   `activity_attempts.student_id` points at `profiles`, so students without a login have no progress.
   Either give every student a login (item 1) or add `class_student_id` to attempts.
4. **Permissions pass.**
   RLS is on for every table, but policies are minimal (see [`ruthvik-handoff-supabase.md`](ruthvik-handoff-supabase.md)).
   Instructors cannot edit admin-owned library courses; decide whether they copy the course first.
5. **Grades for curriculum activities** (module checks, pre/post tests) live in a separate "Curriculum progress" view; they are not in the assignment gradebook.
6. **Code runner (Pyodide)** is a placeholder in assignment code blocks and the module player.
7. **Admin pages on live data** (`src/admin/api.ts` still returns mocks).
8. **PR hygiene:** `ruthvik/class-tabs` is far over the 400-line guideline.
   Consider splitting before merging to `main`.

## How the code is organized

| Path | What | Owner |
|---|---|---|
| `src/shared/` | Types (data contract), Supabase client, auth context, route guards, layout, UI kit | Aryan |
| `src/routes.tsx` | All routes | Aryan |
| `src/admin/` | Admin pages (overview, classes, people, impact, settings) | Aryan |
| `src/instructor/` | Instructor workspace (Ken's UI, `ic-*` styles in `styles.css`) | Ken + Ruthvik |
| `src/instructor/assignments/` | Block-based assignments: model, editor, preview, list | Ruthvik |
| `src/instructor/liveStore.ts` | Supabase load and save for the instructor workspace | Ruthvik |
| `src/instructor/store.ts` | Browser-storage store used in mock mode | Ken |
| `src/student/` | Student pages and module player | Jacky |
| `src/api/` | Typed data functions with mocks, from the first scaffold | Shivraj (student), Ruthvik (instructor) |
| `supabase/migrations/` | `0001` core schema, `1xxx` student side, `2xxx` instructor side. Append-only. | Shivraj + Ruthvik |
| `supabase/seed.sql` | Demo data | Aryan |

Two data models exist on purpose for now:
the instructor workspace uses its own nested types in `src/instructor/model.ts`,
and `liveStore.ts` converts them to and from the database rows and the shared activity contract in `src/shared/types/activities.ts`.
Activity `content` in the database always carries the shared contract fields (what the student app reads) plus a `questions` list and `title` for the course builder.
Keep that true if you touch either side.

## Running it

```bash
npm install
npm run dev            # http://localhost:5173, live data if .env has Supabase keys
VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= npm run dev -- --port 5181   # force mock mode
npm run build && npm run lint   # run before every PR
```

Demo logins (password `cic-learn-demo`): `admin@cic.demo`, `teacher@cic.demo` (Maryvale), `ana.lopez@cic.demo` (Desert Edge, Carl Hayden), `reviewer@cic.demo`.

Supabase details, migrations and gotchas: [`docs/ruthvik-handoff-supabase.md`](ruthvik-handoff-supabase.md).

## Team agreements that bite

- Never commit `.env` or keys; a hook blocks it.
  Server-only keys never get a `VITE_` prefix.
- Students are minors: store name, school and class only.
  No email.
- Migrations are append-only: add a new numbered file, never edit a merged one.
- One change per PR, under 400 lines where possible, imperative title, template order.
- Instructor-authored HTML only renders inside `src/shared/ui/InteractiveHtmlFrame.tsx` (sandbox without `allow-same-origin`).
  Do not loosen it.
- Ken's styles use the `ic-*` prefix and assume Tailwind's reset is active.
  Native dialogs need `margin: auto`; inputs are only styled inside a `<label>` or `.ic-choice-row`.

## How to update this file

Agents and teammates: when you finish a change, update the sections above that it affects (branches, what works, not done, ownership) and add one line to the log below.
Keep it short; link to code instead of copying it.
Put each sentence on its own line.

## Log

- 2026-11-14 6:00 PM, Ruthvik: grading. Migration 2002 (`assignment_submissions`) and `supabase/demo/grading_demo.sql` applied to the hosted project; gradebook and grading dialog in the Grades tab, live and mock.
- 2026-11-14 5:35 PM, Ruthvik: deleted stale `ruthvik/instructor-in-app` (PR #9 had merged into it; nothing unique on it). Opened #13 (schema) and #14 (UI) into `main`.
- 2026-11-14 5:25 PM, Ruthvik: pushed `ruthvik/schema-2001` (migration 2001 + seed fixes only) so teammates can get the schema without the UI work.
- 2026-11-14 5:15 PM, Ruthvik: renamed to `ruthvik-handoff.md` and `ruthvik-handoff-supabase.md`.
- 2026-11-14 5:05 PM, Ruthvik: created this file.
  Live Supabase data for the instructor workspace, migration 2001 and demo seed applied to the hosted project, block-based assignments, CIC logo.
  PR #9 merged into the wrong base; `main` still needs `ruthvik/class-tabs`.
