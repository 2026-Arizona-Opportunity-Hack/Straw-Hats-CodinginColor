# Straw Hats: build plan for CIC Problem 1

**Product name (working):** CIC Learn, a code.org-style learning platform for Coding in Color.
**Goal:** First place. A teacher with no CS background shares a link and the platform teaches. CIC gets learning-gain numbers it can put in a grant report.

All times below are **MST**. Demo recording starts **Sun 12:00 PM**. Submission closes **Sun 2:00 PM**.

---

## 1. What we are building (one paragraph)

A student opens a class link on a Chromebook and logs in with a class code and a passcode. No email is needed. They take a short **placement quiz**. The quiz also records *how* they answer: time per answer, answer changes and confidence. An algorithm estimates their level per concept. It then **recommends** a course (Beginner, Intermediate, Advanced, and Expert as a stretch goal). The student can still choose any course. Each course is a sequence of interactive **modules**. A module contains a video or slides, a check question, a worksheet or coding exercise, and an exit question. Coding exercises run in an in-browser Python editor (Pyodide). The next module unlocks automatically. Progress is saved at **checkpoints**, so a student can resume from any checkpoint. A late joiner is placed at the right module. Instructors build and edit curriculum in an authoring UI. They can import blog-style content, embed videos and add images. They also import a roster CSV and see who is stuck. Admins see every class and a **stats page for funders**, which shows learning gain per student, class and cohort. External reviewers get read-only access to the curriculum. A key-authenticated read API serves the same numbers to CIC's org dashboard.

## 2. Requirement coverage (judges check this)

| Brief requirement | Where we cover it | Owner |
|---|---|---|
| P0 Authoring UI, no code deploy | Instructor course builder: blocks, markdown/blog import, embeds, images | Ken + Ruthvik |
| P0 Four roles + RBAC | Supabase Auth + `profiles.role` + Row Level Security | Ruthvik (policies), Aryan (route guards) |
| P0 Module → lesson → activity, unlock in sequence | Content schema + unlock logic | Shivraj + Jacky |
| P0 Digital worksheets | `worksheet` activity type (form fields, submit) | Shivraj + Jacky |
| P0 Pre/post test, learning gain per student and class | Placement quiz = pretest. Post-test at module end. Learning-gain SQL views | Shivraj (pre), Ruthvik (views) |
| P0 Progress: completion, score, time on task, late joiner start point | `activity_attempts` + `next_activity_for(student)` | Shivraj |
| P0 Instructor dashboard: roster, progress, stuck, not-started | Instructor class view | Ken + Ruthvik |
| P0 Roster CSV import | CSV upload, generate student logins, printable login cards | Ruthvik + Ken |
| P0 Read API with key | Edge function `api-v1` with hashed API keys | Ruthvik |
| P1 Pyodide runner + auto-grading | Code activity with test cases, run in a Web Worker | Shivraj + Jacky |
| P1 Concept mastery view ("80% stuck on loops") | Per-concept heatmap per class | Ruthvik + Ken |
| P1 Socratic AI hints (stretch) | Hint edge function that never gives the answer, logs struggles | Shivraj |
| Beyond scope pick | **Worksheet/slides-to-module converter** (AI drafts the module, instructor edits) | Ruthvik + Ken |
| Shared: Lighthouse a11y ≥ 95, keyboard nav | Shared UI kit, a11y pass Sunday morning | Aryan (audit), all |
| Shared: minors' data minimized | Students store only name, school and class. No email | All |
| Shared: README so CIC can run it | README + API docs | Aryan |

## 3. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | **React + Vite + TypeScript + Tailwind**, React Router, TanStack Query | Fast to build. One codebase for all roles |
| Backend | **Supabase**: Postgres, Auth, Row Level Security, Storage, Edge Functions | The brief says "build on Postgres/Supabase". RLS gives security with little code. Free tier |
| Code runner | **Pyodide** in a Web Worker | No server, no account, works on locked-down lab machines |
| Editor | CodeMirror 6 | Light, accessible, works on mobile |
| Markdown/blog content | `react-markdown` + sanitize | Safe rendering of imported content |
| AI (hints, converter) | OHack AI gateway (OpenAI-compatible), called **only** from Edge Functions | The key never reaches the browser |
| Charts | Recharts | Stats pages |
| Hosting | Vercel (frontend) + Supabase free tier | $0/month, well inside the $20 envelope |

We assume "superwise" in the kickoff notes meant **Supabase**.

## 4. Repository layout: who owns which files

The goal is that nobody edits another person's folder. Shared files have a single owner, and everyone else sends changes through that owner.

```
/
├── supabase/
│   ├── migrations/
│   │   ├── 0001_core_schema.sql          # CONTRACT. Shivraj + Ruthvik, frozen by 2:30 PM Sat
│   │   ├── 1xxx_student_*.sql            # Shivraj only
│   │   └── 2xxx_instructor_*.sql         # Ruthvik only (RLS policies, views, API keys)
│   ├── functions/
│   │   ├── placement-score/              # Shivraj
│   │   ├── hint/                         # Shivraj (stretch)
│   │   ├── roster-import/                # Ruthvik
│   │   ├── module-converter/             # Ruthvik
│   │   └── api-v1/                       # Ruthvik (read API)
│   └── seed.sql                          # Aryan (demo data: courses, classes, students)
├── src/
│   ├── shared/                           # Aryan owns: types, supabase client, auth context,
│   │   ├── types/db.ts                   #   route guards, layout, UI kit (Button, Card, ...)
│   │   ├── ui/
│   │   └── auth/
│   ├── api/
│   │   ├── student/                      # Shivraj: typed data functions + mocks
│   │   └── instructor/                   # Ruthvik: typed data functions + mocks
│   ├── student/                          # Jacky: student pages and components
│   ├── instructor/                       # Ken: instructor + reviewer pages
│   ├── admin/                            # Aryan: admin stats, role management
│   └── App.tsx, routes.tsx               # Aryan
└── docs/
    ├── API.md                            # Ruthvik writes, Aryan edits
    └── placement-algorithm.md            # Shivraj
```

### How frontend avoids waiting for backend (the most important rule)

1. Before 2:30 PM Saturday, each backend owner writes **function signatures** in `src/api/<side>/index.ts`, for example `getModule(id): Promise<Module>`.
2. Each function first returns **mock data** from `src/api/<side>/mocks.ts`. Frontend builds against these signatures right away.
3. Backend swaps each mock for the real Supabase call **behind the same signature**. Frontend code does not change.
4. A signature change is a Slack message in #the-1000-sunny **and** a heads-up to Aryan. Nobody renames a shared type without asking.

## 5. Data model (contract, draft for `0001_core_schema.sql`)

```
profiles          id (auth.users), role [student|instructor|admin|reviewer], display_name, school
courses           id, title, description, level [beginner|intermediate|advanced|expert], published
modules           id, course_id, position, title, concept, published
lessons           id, module_id, position, title, is_checkpoint
activities        id, lesson_id, position, type [content|video|check|worksheet|code|exit|pretest|posttest],
                  concept, points, content jsonb   -- per-type payload, see below
classes           id, name, school, course_id, join_code, created_by
class_instructors class_id, instructor_id            -- instructors see only their classes
enrollments       class_id, student_id, joined_at
class_modules     class_id, module_id, assigned_at, due_at
activity_attempts id, student_id, activity_id, class_id, response jsonb, score, is_correct,
                  started_at, submitted_at, time_on_task_ms, attempt_no
placement_items   id, concept, difficulty 1..4, prompt, choices jsonb, answer
placement_events  id, session_id, item_id, kind [shown|select|change|submit], choice, confidence, t_ms
placement_results session_id, student_id, per_concept jsonb, level, recommended_course_id, explanation
hint_logs         id, student_id, activity_id, concept, student_code, hint, created_at
api_keys          id, label, key_hash, created_by, revoked_at
```

`activities.content` shapes are defined in `src/shared/types/activities.ts`:
- `video`: url, caption, transcript
- `content`: markdown (blog-style, images from Supabase Storage)
- `check`: prompt, choices, answer, explanation
- `worksheet`: list of fields (short answer, long answer, multiple choice, fill in the blank)
- `code`: starter code, blanks, tests, solution (the solution is hidden from students by RLS)
- `exit`: prompt, choices or free text
- `pretest` / `posttest`: list of items tagged by concept

Views written by Ruthvik: `v_student_progress`, `v_learning_gain_student`, `v_learning_gain_class`, `v_concept_mastery_class`, `v_cohort_stats`.

## 6. The placement algorithm (Shivraj, documented in `docs/placement-algorithm.md`)

The quiz is **adaptive and short**: 12–15 items across 4–5 concepts (variables, conditionals, loops, functions, data structures).

**Signals collected per item:**
- correct / incorrect
- item difficulty (1–4)
- response time, normalized against that item's median time
- answer changes: wrong → right counts as partial understanding; right → wrong counts as low confidence
- self-rated confidence (1–3 tap, optional)
- skipped ("I haven't learned this yet" is a valid answer and is not penalized)

**Scoring (simple and explainable, no black box):**
1. Run an Elo/Rasch-style ability estimate θ per concept. Start at medium difficulty. Correct answers step difficulty up, wrong answers step it down.
2. Apply a fluency adjustment. Fast and correct on a hard item raises θ. Slow, correct after several changes slightly lowers confidence in θ.
3. Map overall θ to a level, and recommend the matching course.
4. Show the student the result in plain words: "You're solid on variables, still learning loops, so we recommend **Intermediate**." Highlight the recommendation, and let the student pick any course.

**Also used as the pretest.** Concept scores from placement become the pretest baseline. The module post-test gives post − pre = **learning gain per concept**. This is the headline metric for funders.

## 7. Work by person

### Shivraj: Backend, student side
- [ ] Core schema contract with Ruthvik (`0001`), finished by 2:30 PM Sat
- [ ] `src/api/student/` signatures + mocks, finished by 2:30 PM Sat
- [ ] Student auth: class code + passcode login, no email (with Ruthvik's roster import)
- [ ] Placement quiz: item bank seed, event logging, `placement-score` function, recommendation
- [ ] Progress engine: record attempts, time on task, unlock rules, checkpoints, `next_activity_for` (late joiner)
- [ ] Grading: check/exit/worksheet auto-score, code test results stored
- [ ] Pre/post test scoring → feeds learning-gain views
- [ ] XP/streak/badge counters (cheap, makes it fun)
- [ ] Stretch: Socratic `hint` function (never returns code that solves the task; logs `hint_logs`)

### Jacky: Frontend, student side
- [ ] Student wireframes (home, quiz, course picker, module player), finished by 2:30 PM Sat
- [ ] Join/login page (class code + passcode, large tap targets)
- [ ] Placement quiz UI: one question per screen, timing capture, change tracking, confidence tap
- [ ] Results + course picker: recommended course highlighted, all courses selectable
- [ ] Module player: renders each activity type, progress bar, "Continue" flow like code.org
- [ ] Code activity: CodeMirror + Pyodide worker, fill-in-the-blank, Run/Submit, test results
- [ ] Checkpoint map: milestones, resume from any completed checkpoint, locked modules shown
- [ ] Student "My progress" page: XP, badges, streak
- [ ] Mobile layout + keyboard navigation for every student screen

### Ruthvik: Backend, instructor side
- [ ] Core schema contract with Shivraj (`0001`), finished by 2:30 PM Sat
- [ ] `src/api/instructor/` signatures + mocks, finished by 2:30 PM Sat
- [ ] **RLS policies for all 4 roles** (security is scored)
- [ ] Curriculum CRUD: course/module/lesson/activity, reorder, publish/unpublish, image upload to Storage
- [ ] Markdown/blog import → content activities; video embed URL validation (YouTube/Vimeo/Drive)
- [ ] Classes: create, join code, assign modules, due dates
- [ ] `roster-import`: parse CSV, validate, create student logins, return printable cards
- [ ] Views: progress, stuck (no progress in N days or failed ≥3 attempts), not-started, learning gain, concept mastery
- [ ] `api-v1` read API: hashed keys, `GET /cohorts`, `/classes/:id/progress`, `/learning-gain`, `/concept-mastery`; `docs/API.md`
- [ ] Beyond scope: `module-converter` (paste text or upload a doc/slides → AI drafts module JSON → instructor edits)

### Ken: Frontend, instructor side
- [ ] Instructor wireframes (class list, class dashboard, course builder), finished by 2:30 PM Sat
- [ ] Course builder: outline tree (module → lesson → activity), drag to reorder, per-type editors, live student preview
- [ ] Import flow: paste markdown/blog, embed video, upload images
- [ ] Converter UI: upload/paste → AI draft → edit → publish
- [ ] Class setup wizard: name → upload roster CSV → pick course/modules → print login cards (**< 10 min, we time it**)
- [ ] Class dashboard: roster table, per-student progress, Stuck and Not started lists, concept mastery heatmap
- [ ] Student detail drawer: attempts, time on task, code submissions, hint log
- [ ] External reviewer view: read-only browse of all curriculum

### Aryan: Communicator, integrator, admin side
- [ ] **Hour 0 scaffold** (by 1:30 PM Sat): Vite app, Tailwind, router, Supabase project, `.env.example`, shared UI kit, auth context, role-based route guards, Vercel deploy from `main`
- [ ] Owns `src/shared/`, `routes.tsx`, `seed.sql`; reviews and merges PRs; runs integration checkpoints
- [ ] Nonprofit liaison in #npo-coding-in-color. Ask early: sample worksheet/deck, real module topics, CIC color palette/logo, roster CSV format they use
- [ ] Admin pages: **Funder stats** (learning gain by concept/class/cohort, completion, students reached, CSV export), all classes list, role management, API key management
- [ ] Seed data: 2–3 real-looking CIC courses (Intro Python, AI basics), 2 classes (Maryvale, Desert Edge), 15 students with varied progress so dashboards look alive
- [ ] GitHub Issues for every task in this plan; README; demo script; demo video; Team Dashboard submission
- [ ] Sunday a11y audit (Lighthouse ≥ 95 on every main page)

## 8. Timeline (MST)

| When | Phase | Done means |
|---|---|---|
| Sat 12:45 – 2:30 PM | **Contract** | Scaffold deployed; `0001` schema merged; API signatures + mocks merged; wireframes agreed |
| Sat 2:30 – 7:00 PM | **Vertical slice on mocks + real tables** | Student can log in → quiz → open module → submit check; instructor can create a course + class |
| Sat 7:00 PM | **Integration checkpoint 1** | Mocks swapped for real calls on the main flow; deployed |
| Sat 7:00 PM – 1:00 AM | **P0 complete** | Roster import, unlocks, pre/post + learning gain, dashboards, read API, Pyodide runner |
| Sun 1:00 AM | **Integration checkpoint 2** | All P0 works end to end on the deployed site |
| Sun 1:00 – 8:00 AM | **P1 + beyond scope** (sleep in shifts, at least 3 h each) | Concept mastery, converter, hints, gamification |
| Sun 9:00 AM | **Feature freeze** | No new features after this. Bug fixes only |
| Sun 9:00 – 11:00 AM | **Polish** | a11y pass, seed data, empty states, error messages, README, API docs |
| Sun 11:00 AM | Presentation Feedback Hour | Run the demo for mentors |
| Sun 12:00 PM | **Record demo** (≤ 4 min) | Uploaded and linked |
| Sun 1:30 PM | **Submit** on Team Dashboard | Don't wait until 1:59 |

## 9. Demo story (4 minutes, written early so we build toward it)

1. **Teacher (45 s):** creates "Maryvale Period 3", uploads roster CSV, assigns Intro Python, prints login cards. On-screen timer shows under 10 minutes.
2. **Student (90 s):** logs in on a phone-sized screen, takes the placement quiz, gets "Intermediate recommended" with a reason, plays a module (video → check → fill-in-the-blank Python → exit), and the next module unlocks.
3. **Late joiner (15 s):** a new student is dropped at the right module.
4. **Instructor dashboard (30 s):** shows Stuck list and "70% struggling on loops".
5. **Authoring (30 s):** pastes a worksheet, AI drafts the module, teacher edits and publishes.
6. **Admin/funder (30 s):** "Students gained 32 points on loops", export, then the same numbers via `curl` on the read API.

## 10. Working rules

- **Branches:** `<name>/<short-task>`, for example `shivraj/placement-scoring`. Never push straight to `main`. Never force-push a shared branch.
- **PRs:** one change per PR, under 400 lines, imperative title, use the template, link the issue (`Closes #12`). Aryan merges after a quick check. The other person on your side reviews if Aryan is busy.
- **Pull `main` at least every 2 hours.** Small PRs merged often beat one big merge at 3 AM.
- **Migrations are append-only.** Never edit a merged migration. Add a new numbered file in your range (1xxx Shivraj, 2xxx Ruthvik).
- **Secrets:** real keys live in `.env` and Supabase secrets only. The pre-commit guard blocks keys. Don't bypass it.
- **Students are minors:** collect name, school and class only. No email, no birthday, no photos.
- **Accessibility from the start:** labels on every input, visible focus rings, color is never the only signal, everything keyboard reachable.
- **Stuck for more than 30 minutes?** Post in #the-1000-sunny, then #ask-a-mentor.

## 11. Cut list (drop in this order if we fall behind)

1. Expert level
2. Socratic AI hints
3. XP/badges/streaks
4. Module converter (keep plain markdown import)
5. Concept mastery heatmap (keep the stuck list)

Never cut: roles + RLS, module flow + unlock, pre/post learning gain, roster import, instructor dashboard, read API, README.
