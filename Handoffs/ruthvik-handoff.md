# Ruthvik's handoff: current state of CIC Learn

Read this first if you are a teammate or an AI coding agent picking up work.
It says what exists, where it lives, what is half done, and what to watch out for.
Update it in the same branch as your change (see "How to update this file" at the bottom).
Each teammate keeps their own `Handoffs/<name>-handoff.md` in the same format; read them all.
Database details live in [`ruthvik-handoff-supabase.md`](ruthvik-handoff-supabase.md).

Last updated: Sun Nov 15 2026, 8:55 AM MST, by Ruthvik (with Claude Code).

## The product in one paragraph

CIC Learn is a learning platform for Coding in Color (CIC Problem 1).
Four roles: student, instructor, CIC admin, external reviewer.
Instructors run classes: dashboard, curriculum, assignments, grades, roster.
Admins see every class and funder-facing learning gain.
Students follow modules lesson by lesson.
The team plan is in [`plan.md`](../plan.md); the nonprofit brief is linked from [`AGENTS.md`](../AGENTS.md).

## What I built (all on `main`)

| PR | What |
|---|---|
| #2 | React + Vite + Supabase app scaffold and the shared data contract (`src/shared/types/`). |
| #3 | Core database schema with baseline RLS (`0001_core_schema.sql`). |
| #4 | Starter pages for each role on mock data. |
| #6, #8 | Instructor UI as the shared styling baseline; workspace mounted in the main app's sidebar layout (`src/instructor/InstructorRoute.tsx`). |
| #9 | Class page split into tabs: Dashboard, Curriculum, Assignments, Grades, Roster. |
| #10, #13 | Migration 2001: class rosters (`class_students`) and assignments. |
| #14 | Instructor workspace on live Supabase data (`src/instructor/liveStore.ts`). |
| #18 | Fixed live saves deleting teammates' rows; grading, rubrics and file uploads (migrations 2002, 2003). |
| #20 | Review fixes: stale course saves, Supabase 1000-row cap, gradebook totals, first Vitest tests. |
| #49 | CIC library, edit curriculum inside a class, Dashboard drill-downs, rules in the database (2004, 2006), AI Academy curriculum, interactive HTML activities, lesson reading view. 46 commits, merged Nov 15. |

#26, #27 and #28 are still open but superseded by #49: close them.
The #27 student "Browse courses" UI was dropped in favor of the Explore page already on `main`.

## How each feature works

### Instructor workspace

- Lives at `/instructor` inside the shared sidebar (Aryan's `AppLayout`).
  Hash routes: `#/classes`, `#/classes/<id>/<tab>`, `#/classes/<id>/curriculum/edit`, `#/curriculum`, `#/curriculum/<courseId>`, `#/review`.
- Live data: `src/instructor/liveStore.ts` loads classes, roster, assigned modules, assignments, submissions, courses and attempts, and saves only changed rows, one save at a time (`InstructorRoute.tsx` queue).
  It deletes only rows the user removed in that browser (`deleteRemoved`), so a stale tab never wipes a teammate's work.
  A failed save shows an error and reloads from the database.
- Attempts and rules load in pages, past the 1000-row cap (`selectAll`).

### CIC library and class curriculum

- The sidebar's **CIC library** (`#/curriculum`) lists CIC's ready-made courses (`courses.is_library`) with **Preview**.
  Admins also get **Edit**, to maintain library courses.
- **Create a class**, step 3, offers the library courses as cards.
  On Create, the course is copied for the class with `copy_library_course` (migration 2004): modules, lessons, activities and answer keys get new ids, and the library stays unchanged.
- Inside a class, the **Curriculum** tab has **Edit curriculum**, which opens the course builder in the class card (`#/classes/<id>/curriculum/edit`).
  A class still on a library course gets **Edit for this class**, which copies it first (with a warning if students have progress).
- Class edits use Ken's flow: drafts are kept in the author's browser, and **Publish module** goes through `publish_curriculum` (migration 2005).
- Instructors' old standalone courses are hidden from the list, not deleted.
- Code: `src/instructor/Curriculum.tsx` (`CurriculumList`, `LibraryList`, `CourseBuilder` with `inClass`, `CourseReviewer` with a collapsible lesson list), `ClassSetup.tsx`, `ClassTabs.tsx` (`CurriculumTab`), `InstructorWorkspace.tsx` (`importCourse`, `makeClassEditable`, `builderFor`).

### Class Dashboard

- `src/instructor/dashboard.ts` (pure, tested in `dashboard.test.ts`) and `DashboardTab` in `ClassTabs.tsx`.
- Top cards: average learning gain with the pretest and post-test averages behind it ("+N pts", not "pp"), average assignment score, work waiting to be graded, missing work.
- **Needs attention:** one row per student, opening to the exact reasons: stuck on an activity, inactive for N days, below mastery in a concept, missing or low-scored assignment, post-test lower than pretest.
- **Module completion:** each module opens to its linked assignments (`assignments.module_id`), due dates, turned-in, to-grade and missing counts, with overdue items marked.
- No thresholds are hardcoded on the frontend.
  Inactive days, low score, pass mark and post-test tries come from `program_settings` and the `class_module_settings` view (migration 2006); each class gets `rules` in `liveStore.ts`.
  Admin analytics (`src/admin/api.ts`, `metrics.ts`) read the same tables, every row, including self-enrolled students.
- The admin Impact page exports named student rows for internal use and a separate program-wide partner CSV for all active classes, independent of filters.
  The partner CSV omits results based on fewer than five distinct learners, including either side of the completion rate, and gives each learner with paired results equal weight in the average gain.

### Assignments and grading

- Assignments are ordered blocks: text, link or video, interactive HTML page, questions (multiple choice, select all, true/false, short answer, number), written response, code exercise, file upload (`src/instructor/assignments/`).
  Create, edit, duplicate, publish, delete, export and import JSON, import from another class or from Aiken quiz text.
- Grades tab (`Gradebook.tsx`): students by published assignments with needs-grading, missing, late and "Not due yet" states, totals and CSV export.
  Each cell opens the submission block by block; auto-graded questions can be overridden, feedback is saved.
- Rubrics on written, code and file blocks: click a rating per criterion to sum the score; typed points still override.
- File uploads go to the private `submission-files` bucket; instructors open them through 10-minute signed URLs.

### AI Academy curriculum (from CIC's Week 1 deck)

- Source: `curriculum/ai-academy/course.json` plus widget pages in `curriculum/ai-academy/widgets/`.
  `npm run curriculum` (`scripts/build-curriculum.mjs`) writes idempotent SQL to `supabase/curriculum/ai-academy.sql`, already loaded on hosted.
- One source builds two library courses: **AI Academy (Self-paced)** for students on their own and **AI Academy (Classroom)** for instructors to import and edit.
- Module 1 (Intro to Computers & AI) is complete with 7 lessons; modules 2-6 are stubs.
- 5 interactive pages (Build the machine, Binary name, Then vs now, AI or not, AI app investigation) are HTML and CSS only, no scripts, so they run on live; motion stops under reduced motion.
- Teacher notes are in `curriculum/ai-academy/teacher-guide.md`, not in lessons, because students can open every activity.
- "Web Development Foundations" was marked `is_library` on hosted so it appears in the library too.

### Interactive HTML and the reading view

- HTML activities run in a sandboxed iframe without `allow-same-origin` (`src/shared/ui/InteractiveHtmlFrame.tsx`).
  The frame grows to its content: only the platform's height script runs (allowed by its sha256 in the CSP, `src/shared/ui/isolatedHtml.ts`), so there is no inner scroll box.
- Lesson text renders through `src/shared/ui/LessonMarkdown.tsx` (tables via `remark-gfm`, callouts) and `ActivityCard.tsx`, styled by `lesson.css` (`cic-*`, every rule starts with `:root`).
  Callouts: start a blockquote with `**Key idea:**`, `**Did you know?**`, `**Try it:**`, `**Watch out:**`, `**Remember:**` or `**Think about it:**`.
- Used by the library preview, the builder's student preview and the student player's `LessonContent`.

## Migrations I own

All applied to the hosted project (checked with `npx supabase migration list --linked` on Nov 15).

| File | What |
|---|---|
| `0001_core_schema.sql` | Core schema and baseline RLS (shared contract). |
| `2001_instructor_workspace.sql` | `class_students` roster, `assignments`, deferrable position constraints. |
| `2002_assignment_submissions.sql` | `assignment_submissions` for grading. |
| `2003_rubrics_and_file_uploads.sql` | Rubric scores, `file` assignments, `submission-files` bucket. |
| `2004_copy_library_course.sql` | `copy_library_course(p_course_id)`. |
| `2006_program_settings_and_rules.sql` | `program_settings`, `class_module_settings` view, defaults from the database. |

Not run on hosted: `supabase/demo/assignment_modules_demo.sql`, which links demo assignments to modules so the Dashboard's module drop-downs show work.
It only fills `assignments.module_id` where it is empty and is safe to re-run.

## Not done yet (pick these up)

1. **Security fixes from a code review (Nov 14):**
   - The live admin login `admin` / `cic-learn-demo` is published in the README and `seed.sql`; rotate it before real use (hosted write).
   - `profiles.archived_at` is checked nowhere, so archived staff keep access; `current_role_is()` and `teaches_class()` should require `archived_at is null` (new migration).
2. **Correctness:**
   - Student `time_on_task_ms` is overcounted: the timer starts at page open, not at the last save.
   - `src/shared/labs/checks.ts` compares whole output, so a Python lab with 2+ checks never passes.
   - `isolatedHtml.ts` parses without `scriptingEnabled`, so `<noscript>` content is ignored.
3. **Remove mock mode.**
   Done once on a local branch (`ruthvik/remove-mock-mode`), but it conflicts with teammates' new features; redo it on top of current `main`.
4. **Students submitting assignments.**
   `assignment_submissions` exists and instructors can grade, but students have no insert policy or storage upload policy yet.
5. **Grades for curriculum activities** (checks, pre and post tests) are in Curriculum progress, not in the assignment gradebook.
6. **Tests to add:** answer shapes sent to `submit_attempt`, and students getting `ADMINS_ONLY` from admin RPCs.

## How the code is organized

| Path | What | Owner |
|---|---|---|
| `src/shared/` | Types (data contract), Supabase client, auth, layout, UI kit, lesson renderer (`ui/LessonMarkdown.tsx`, `ui/ActivityCard.tsx`) | Aryan, Ruthvik (lesson UI) |
| `src/admin/` | Admin pages; `api.ts` and `metrics.ts` read live rules | Aryan |
| `src/instructor/` | Instructor workspace (`ic-*` styles in `styles.css`) | Ken + Ruthvik |
| `src/instructor/assignments/` | Block assignments, gradebook, rubrics | Ruthvik |
| `src/instructor/liveStore.ts` | Supabase load and save for the workspace | Ruthvik |
| `src/instructor/dashboard.ts`, `progress.ts` | Dashboard and progress numbers | Ruthvik |
| `src/student/` | Student pages and module player | Jacky |
| `curriculum/`, `scripts/build-curriculum.mjs` | Preloaded curriculum source and SQL generator | Ruthvik |
| `supabase/migrations/` | `0001` core, `1xxx` student side, `2xxx` instructor side, `3xxx` admin. Append-only. | Shivraj, Ruthvik, Aryan |

The workspace uses its own nested types (`src/instructor/model.ts`); `liveStore.ts` converts them to and from database rows and the shared activity contract (`src/shared/types/activities.ts`).
Keep activity `content` in the shared contract shape plus `questions` and `title` for the builder.

## Tests

`npm test` runs Vitest: grading, liveStore saves (never delete unloaded rows, write only changed rows, page past 1000 rows), dashboard reasons and module work, lesson Markdown, the HTML frame height script and the curriculum generator.
SQL tests in `supabase/tests/` run against a throwaway Postgres (see the Supabase handoff).

## Running it

```bash
npm install
npm run dev                  # http://localhost:5173, live data when .env has Supabase keys
npm run curriculum           # rebuild supabase/curriculum/ai-academy.sql from curriculum/
npm run build && npm run lint && npm test   # before every PR
```

Demo logins (password `cic-learn-demo`): `admin@cic.demo`, `teacher@cic.demo` (Maryvale), `ana.lopez@cic.demo`, `reviewer@cic.demo`.

## Team agreements that bite

- Never commit `.env` or keys; a hook blocks it.
  Server-only keys never get a `VITE_` prefix.
- Students are minors: store name, school and class only.
- Migrations are append-only and numbers must not clash with hosted ones: check `npx supabase migration list --linked` first (2005 was taken, so ours became 2006).
- One change per PR, under 400 lines where possible.
- Instructor-authored HTML only renders inside `InteractiveHtmlFrame.tsx`; do not loosen its sandbox.
- macOS: the remote has `Jacky`/`jacky/...` and `Ken`/`ken/...` branches, so a full `git fetch` fails with "cannot lock ref"; fetch single branches (`git fetch origin main`).

## How to update this file

When you finish a change, update the sections above that it affects and add one line to the log below.
Keep it short; link to code instead of copying it.
Put each sentence on its own line.

## Log
- 2026-11-15 8:55 AM, Ruthvik: rewrote this handoff to cover everything I built (PR list, features, migrations, open work) now that #49 is on `main`. Updated the README instructor section and the Supabase handoff (2006 applied).
- 2026-11-15 1:20 AM, Ruthvik: opened one PR from `ruthvik/class-library-dashboard` that merges latest `main` with the CIC library, edit-in-class curriculum, class Dashboard drill-downs, DB-driven thresholds (migration 2006, already applied to hosted), the lesson reading view, AI Academy curriculum and embedded HTML activities.
  Merge choices: course edits for a class use Ken's browser drafts and `publish_curriculum`; the student player stays on main's `LessonContent` (now rendering Markdown with `LessonMarkdown`); the student enrollment UI from #27 is dropped for main's Explore page.
  Not included: removing mock mode (conflicts with teammates' new work; redo on top of `main` later) and the demo SQL `supabase/demo/assignment_modules_demo.sql` (not run on hosted).
- 2026-11-15, Codex: separated the named internal student CSV from the aggregate partner CSV in admin analytics.

- 2026-11-14 9:40 PM, Ruthvik: restyled the 5 AI Academy widget pages with one shared look (indigo header band, cyan accent) and CSS-only motion (answer pop and shake, packet flow, bit toggles, 3D flips, score and progress bars, confetti); all motion stops under reduced motion. Score and progress bars are inline, not sticky, because the frame now grows to full height. Content and logic unchanged; SQL regenerated, not applied.

- 2026-11-14 10:00 PM, Ruthvik: AI Academy Module 1 reading pages rewritten textbook style (hooks, subheads, tables, `> **Key idea:**`-style callouts for the new lesson renderer, no leading title heading). The 5 interactive pages are now in the classroom course too, next to its worksheets. Regenerated `supabase/curriculum/ai-academy.sql` (not applied to the hosted database).
- 2026-11-14 9:00 PM, Ruthvik: AI Academy preloaded curriculum from CIC's Week 1 deck (`curriculum/`, see its README). One source builds a self-paced and a classroom library course; Module 1 is full with 5 HTML-and-CSS interactive pages (no scripts, so they run on live); modules 2-6 are stubs. `npm run curriculum` writes `supabase/curriculum/ai-academy.sql`. Teacher notes are in `curriculum/ai-academy/teacher-guide.md`, not in lessons, since students can open every activity. Vitest and oxlint now skip `.claude/` agent worktrees.
- 2026-11-14 9:00 PM, Ruthvik: students browse and enroll in self-paced courses from My courses (`ruthvik/student-course-enroll`); verified the server flow needs no migration.

- 2026-11-15 1:15 AM, Ruthvik: class Dashboard rebuilt (`src/instructor/dashboard.ts`, tested). Top cards: learning gain with pretest/post-test averages ("pts" replaces "pp"), average assignment score, waiting to grade, missing work. Students needing attention open to show exact reasons (stuck activity, inactive days, concept below 70%, missing or low-scored assignments, post-test drop). Each module opens to its linked assignments with due dates and turn-in counts. Status donut removed.
- 2026-11-15 12:30 AM, Ruthvik: instructors edit curriculum inside the class card (Curriculum tab, Edit curriculum, `#/classes/<id>/curriculum/edit`); the top-level page is now "CIC library" (preview only; admins edit library courses). A class still on a library course gets its own copy via "Edit for this class". Create a class offers library courses only. Instructors' standalone courses are hidden, not deleted. Reviewer preview left the instructor sidebar (library Preview covers it).
- 2026-11-14 11:30 PM, Ruthvik: organized Curriculum into My courses and CIC library (Preview; admins also Edit). Library courses are picked directly in Create a class step 3 and imported when the class is created; `LibraryImport.tsx` is gone.
- 2026-11-14 9:00 PM, Ruthvik: import a library course as the instructor's own copy (Create a class and Curriculum), migration 2004 `copy_library_course` (applied 9:10 PM), library courses never written back by `saveLiveData`, tests.
- 2026-11-14 9:45 PM, Ruthvik: lesson reading view. Shared Markdown renderer with callouts and tables, typed step cards with step count and read time, framed HTML pages, 16:9 video, large answer options, module header with progress and a sticky outline; checked on live AI Academy (read-only) and mock student at 1280 and 390 px.
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
