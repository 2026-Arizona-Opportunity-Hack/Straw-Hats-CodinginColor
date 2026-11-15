# Ruthvik's handoff: current state of CIC Learn

Read this first if you are a teammate or an AI coding agent picking up work.
It says what exists, where it lives, what is half done, and what to watch out for.
Update it in the same branch as your change (see "How to update this file" at the bottom).
Each teammate keeps their own `Handoffs/<name>-handoff.md` in the same format; read them all.

Last updated: Sat Nov 14 2026, 7:30 PM MST, by Ruthvik (with Claude Code).

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
| `main` | Has everything through PR #14 (tabs, assignments, live data), Shivraj's #16 and #17 (migrations 1001, 1002) | Source of truth |
| `ruthvik/class-tabs` | PR #20 into `main`, open | Review fixes (stale course saves, 1000-row cap, totals, tests). |
| `jacky/student-join-and-player` | Pushed, no PR | Student module player with a renderer per activity type (`src/student/activities.tsx`). |
| `Shivraj` | 2 commits ahead of `main` | Supabase CLI config (`supabase/config.toml`). Already merged into `ruthvik/class-tabs`. |
| `Aryan`, `Ken`, `Jacky` | Nothing new beyond `main` | |

macOS note: the remote has both `Jacky` and `jacky/student-join-and-player`.
On a case-insensitive disk `git fetch` fails with "cannot lock ref".
Fetch it under another name: `git fetch origin refs/heads/jacky/student-join-and-player:refs/remotes/origin-jacky/student-join-and-player`.
Renaming one of the two branches on GitHub fixes it for everyone.

### Fixed (data loss), merged in PR #18

The live save in `main` deletes every assignment, roster student, module, lesson or activity that the saving browser does not know about.
A browser opened before a teammate added something deletes it on its next save; on Nov 14 this removed two demo assignments and their submissions.
`ruthvik/class-tabs` now deletes only rows the user removed in that browser (`deleteRemoved` in `src/instructor/liveStore.ts`).
Course saves now also write only changed modules, lessons and activities, so a stale browser cannot put back deleted items or overwrite a teammate's edits.

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
- Rubrics: written, code and file upload blocks can carry Canvas-style rubrics (criteria with named ratings and points).
  Students see the rubric; while grading, clicking a rating per criterion sums the score, and typed points still override.
- File upload blocks: allowed types, file count, size limit (up to 25 MB). Files live in the private `submission-files` bucket; instructors open them through 10-minute signed URLs.
- Course builder on live data reads answer keys from `activity_keys` (Shivraj's 1002 moves them out of content) and writes them back through his trigger; verified round trip.
- Progress on live data follows Shivraj's scoring rules: pretest try #1, post-test best of the first `module_rules.max_posttest_tries` (default 3), otherwise best try.
- Admin pages (Aryan, `src/admin/`) still read from `src/admin/mocks.ts`, not Supabase.

### Students pick self-paced courses (`ruthvik/student-course-enroll`)

- My courses has a "Browse courses" section: published self-paced courses the student is not in yet, each with an Enroll button.
- `listAvailableCourses()` reads `courses` (RLS "read published courses"); `enrollInCourse()` calls Shivraj's `enroll_in_course`; `enrollErrorMessage()` turns `COURSE_NOT_AVAILABLE`, `ALREADY_IN_CLASS` and `STUDENTS_ONLY` into plain words.
- After enrolling, the course appears under My courses with module 1 open, a status line announces it, and focus moves to the new course heading.
- No migration needed: in a local PGlite run of 0001, 1001, 1002 and 1004, a self-enrolled student reads module 1, submits with `class_id` null (nullable since 1001, confirmed on the hosted DB), and module 2 opens after.
- Module counts are not shown: 1004 hides modules of courses the student is not in, so counting them would need a new RPC.
- Mock mode adds an "AI Academy (Self-paced)" fixture course; picks are kept in `localStorage` (`cic.mockCourseEnrollments`).

### Not done yet (pick these up)

1. **Student sign-in with class code + passcode.**
   Roster rows have passcodes, but nothing checks them.
   Plan: an Edge Function that verifies `classes.join_code` + `class_students.passcode` and signs the student in (creates or reuses an auth user, sets `class_students.profile_id`).
2. **Students submitting assignments.**
   The `assignment_submissions` table exists (migration 2002) and instructors can grade, but students cannot submit yet.
   Needs student sign-in (item 1) plus an insert policy for the student's own row, and a storage insert policy so students can upload into their own folder.
   The Assignments list's Submitted and Avg columns still read curriculum attempts; switch them to submissions.
3. **Progress for roster-only students.**
   `activity_attempts.student_id` points at `profiles`, so students without a login have no progress.
   Either give every student a login (item 1) or add `class_student_id` to attempts.
4. **Permissions pass.**
   RLS is on for every table, but policies are minimal (see [`ruthvik-handoff-supabase.md`](ruthvik-handoff-supabase.md)).
   Library courses: instructors now import their own copy (see "Import from library" below); admins can still edit library courses in place.
5. **Grades for curriculum activities** (module checks, pre/post tests) live in a separate "Curriculum progress" view; they are not in the assignment gradebook.
6. **Code runner (Pyodide)** is a placeholder in assignment code blocks and the module player.
7. **Admin pages on live data** (`src/admin/api.ts` still returns mocks).
8. **PR hygiene:** `ruthvik/class-tabs` is far over the 400-line guideline.
   Consider splitting before merging to `main`.

### Import from library (branch `ruthvik/import-library-course`)

An instructor imports a preloaded library course (`courses.is_library`, for example "AI Academy (Classroom)") as their own editable copy.
The "Import from library" list is in Create a class (step 3) and at the bottom of Curriculum (`src/instructor/LibraryImport.tsx`).
Live: it calls `copy_library_course` (migration 2004, applied to the hosted project), which deep-copies modules, lessons, activities and answer keys with new ids.
Mock mode: `copyCourse` in `model.ts` copies the course in the browser; `demoData.ts` has a short `LibraryDemo` course.
Library courses are never opened in the builder or saved: `saveLiveData` skips them, and Create a class lists only non-library courses (`assignableCourses`).

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

## Tests

`npm test` runs Vitest: `src/instructor/assignments/grading.test.ts` (scores, rubrics, late, not-due, CSV) and `src/instructor/liveStore.test.ts` (saves never delete unloaded rows, only changed rows are written, attempts load past 1000 rows).
Each liveStore test was checked to fail against the old code it guards.

## Running it

```bash
npm install
npm run dev            # http://localhost:5173, live data if .env has Supabase keys
VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= npm run dev -- --port 5181   # force mock mode
npm run build && npm run lint && npm test   # run before every PR
```

Demo logins (password `cic-learn-demo`): `admin@cic.demo`, `teacher@cic.demo` (Maryvale), `ana.lopez@cic.demo` (Desert Edge, Carl Hayden), `reviewer@cic.demo`.

Supabase details, migrations and gotchas: [`Handoffs/ruthvik-handoff-supabase.md`](ruthvik-handoff-supabase.md).

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

- 2026-11-14 9:00 PM, Ruthvik: AI Academy preloaded curriculum from CIC's Week 1 deck (`curriculum/`, see its README). One source builds a self-paced and a classroom library course; Module 1 is full with 5 HTML-and-CSS interactive pages (no scripts, so they run on live); modules 2-6 are stubs. `npm run curriculum` writes `supabase/curriculum/ai-academy.sql`. Teacher notes are in `curriculum/ai-academy/teacher-guide.md`, not in lessons, since students can open every activity. Vitest and oxlint now skip `.claude/` agent worktrees.
- 2026-11-14 9:00 PM, Ruthvik: students browse and enroll in self-paced courses from My courses (`ruthvik/student-course-enroll`); verified the server flow needs no migration.

- 2026-11-14 9:00 PM, Ruthvik: import a library course as the instructor's own copy (Create a class and Curriculum), migration 2004 `copy_library_course` (applied 9:10 PM), library courses never written back by `saveLiveData`, tests.
- 2026-11-14 8:30 PM, Ruthvik: fixes from a code review (ponytail-review checklist). Course saves write only changed rows; attempts load in pages past Supabase's 1000-row cap; first tests (Vitest, 12); gradebook shows "Not due yet" and leaves not-due and ungraded work out of totals; warning when a saved score no longer matches an edited rubric; pages load per section (main bundle is now framework only); gradebook total column stays visible.
- 2026-11-14 7:30 PM, Ruthvik: merged `main` (Shivraj's 1001, 1002). Did Shivraj's items 4 (answer keys in the builder) and 5 (scoring rules). Found and fixed the stale-save data loss above. Moved handoffs from `docs/` to `Handoffs/`. Restored the two demo assignments by re-running `supabase/demo/*.sql`; opened PR #18.
- 2026-11-14 6:45 PM, Ruthvik: rubrics and file uploads. Migration 2003 (rubric scores, private `submission-files` bucket, `file` assignment type) and `supabase/demo/rubric_demo.sql` plus three sample PDFs applied to the hosted project. Checked that another class's instructor and anonymous users cannot read the files.
- 2026-11-14 6:00 PM, Ruthvik: grading. Migration 2002 (`assignment_submissions`) and `supabase/demo/grading_demo.sql` applied to the hosted project; gradebook and grading dialog in the Grades tab, live and mock.
- 2026-11-14 5:35 PM, Ruthvik: deleted stale `ruthvik/instructor-in-app` (PR #9 had merged into it; nothing unique on it). Opened #13 (schema) and #14 (UI) into `main`.
- 2026-11-14 5:25 PM, Ruthvik: pushed `ruthvik/schema-2001` (migration 2001 + seed fixes only) so teammates can get the schema without the UI work.
- 2026-11-14 5:15 PM, Ruthvik: renamed to `ruthvik-handoff.md` and `ruthvik-handoff-supabase.md`.
- 2026-11-14 5:05 PM, Ruthvik: created this file.
  Live Supabase data for the instructor workspace, migration 2001 and demo seed applied to the hosted project, block-based assignments, CIC logo.
  PR #9 merged into the wrong base; `main` still needs `ruthvik/class-tabs`.
