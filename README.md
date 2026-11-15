# Straw Hats — Coding in Color

Built at [ASU Fall Hackathon 2026 | Phoenix Hackathon for Nonprofits: Nov 14-15](https://www.ohack.dev/hack/fall-2026) for the public good (MIT license).

> **⚠️ This is your team's ONE repository — all code goes here.** Please don't create
> another repo (personal or org). Judges, the Team Dashboard's code-activity card,
> the public project page and the nonprofit all read **this** repo; work pushed
> anywhere else is invisible to them and won't count. Everyone on the team should be
> a collaborator here — ask an organizer in Slack if someone can't push.

| | |
|---|---|
| **Nonprofit** | [Coding in Color](https://www.ohack.dev/nonprofit/YIXYdYCoxIZC08uQ5DL3) |
| **Problem statement** | [Curriculum & Student Progress Platform (CIC Problem 1)](https://www.ohack.dev/project/d09466fadf1b11f18e63deadc507a848) |
| **Team page** | [Straw Hats](https://www.ohack.dev/hack/fall-2026/team/c7e4c72ee05711f1ae58deadb145c312) · [Team Dashboard](https://www.ohack.dev/hack/fall-2026/manageteam) (story, demo video, submit) |
| **Slack** | team: [#the-1000-sunny](https://opportunity-hack.slack.com/app_redirect?channel=the-1000-sunny) · nonprofit: [#npo-coding-in-color](https://opportunity-hack.slack.com/app_redirect?channel=npo-coding-in-color) · help: [#ask-a-mentor](https://opportunity-hack.slack.com/archives/C01E5CGDQ74) |
| **Created by** | Greg V [Staff/Mentor] |

## Final day

Start recording your demo video by **Sun Nov 15, 12:00 PM MST** — hacking ends at **Sun Nov 15, 2:00 PM MST**, and a demo you recorded with time to spare beats a feature you finished at 1:59.

- Sun Nov 15, 11:00 AM MST — Presentation Feedback Hour
- **Sun Nov 15, 12:00 PM MST — Start recording your demo video**
- Sun Nov 15, 12:30 PM MST — Judges Arrive
- **Sun Nov 15, 2:00 PM MST — 🛑 Submission Deadline: Hacking ends**
- Sun Nov 15, 2:05 PM MST — Judging Round 1
- Sun Nov 15, 3:40 PM MST — Judging Final Round
- Sun Nov 15, 4:30 PM MST — Closing Ceremony: Winners Announced

## Before hacking ends — the submission checklist

Everything is submitted from your [Team Dashboard](https://www.ohack.dev/hack/fall-2026/manageteam); judges read the dashboard, this README and your demo video.

- [ ] **Code pushed** to this repo, in small PRs (see `AGENTS.md`) — judges and future recruiters read the history
- [ ] **Project story** written on the dashboard (`#project`): the problem, who it helps, what you built, what's next
- [ ] **Demo video** (4 minutes or less) on YouTube, Vimeo, Loom or Google Drive, linked on the dashboard (`#demo`) — show it working, not slides
- [ ] **Submit** on the dashboard (you can keep editing until the close)
- [ ] This README filled in below: team, tech stack, how to run it, live link if you have one
- Optional: a [DevPost entry](https://opportunity-hack-2026-arizona.devpost.com/) — the dashboard is the submission of record.

Judges score **Scope, Documentation, Polish and Security**, plus a separate **Accessibility** prize — the rubric is at [ohack.dev/hackathon-judging-criteria](https://www.ohack.dev/hackathon-judging-criteria). Document your work as GitHub Issues as you go: that's how you get public credit for it.

## Team

<!-- Replace with real people; link GitHub profiles so this repo works as your portfolio -->
- [Name](https://github.com/username) — role
- [Name](https://github.com/username) — role

## What we built

<!-- Two or three sentences: the problem, who it helps, what the nonprofit can do now that they couldn't before -->

## Tech stack

- Frontend: React 19, Vite, TypeScript, Tailwind CSS 4, React Router, TanStack Query
- Backend: Supabase (Auth, Row Level Security, Edge Functions, Storage)
- Database: Postgres (Supabase), schema in `supabase/migrations/`
- APIs / services: Pyodide (in-browser Python), OHack AI gateway (server-side only)

## Run it locally

```bash
git clone https://github.com/2026-Arizona-Opportunity-Hack/Straw Hats-CodinginColor.git
cd Straw Hats-CodinginColor
cp .env.example .env   # fill in your own values — never commit .env
npm install
npm run dev            # http://localhost:5173
```

With the Supabase values in `.env` left empty, the app runs on **mock data**. Students get a demo button; staff sign in with `admin`, `teacher` or `reviewer` and password `cic-learn-demo`. With Supabase, staff use their email, or just the part before `@` if it ends in `VITE_STAFF_EMAIL_DOMAIN`.
Fill them in to use a real Supabase project, then apply the migrations and demo data with the Supabase CLI:

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push --include-seed   # runs supabase/migrations/ in order, then supabase/seed.sql
```

With Supabase configured, the instructor workspace reads and writes live data (classes, rosters, assigned modules, assignments, course content); Row Level Security limits each instructor to their own classes.

For the live student curriculum, apply migration `1004_student_curriculum_access.sql` before setting `VITE_LIVE_STUDENT_CURRICULUM=true` and rebuilding. Students can then open published, unlocked modules in their enrolled courses and save attempts to Supabase. Live HTML is scriptless. The full Coding Lab runner is available in the local demo.

Migration `2004_module_assignment_progress.sql` lets opted-in assignments show required lesson steps completed under **Grades → Assignment grades**. For the hosted Maryvale demo, the [Cat Photo App activation script](supabase/demo/maryvale_cat_photo_assignment.sql) publishes the existing draft and adds prior progress. Students open the lesson from **My courses**.

Before opening a PR: `npm run build && npm run lint`.

### Instructor workspace

Instructors and reviewers use the workspace in `src/instructor/` inside the main app, under the shared sidebar: `/instructor#/classes`, `/instructor#/curriculum`, `/instructor#/review`, and `/reviewer` for external reviewers.
`src/instructor/InstructorRoute.tsx` mounts it and passes the signed-in role.
Its page styles live in `src/instructor/styles.css` (`ic-*` classes); reuse them when connecting data so the layout stays consistent.
Inside a class, tabs are Dashboard, Curriculum, Assignments, Grades and Roster (`#/classes/<id>/<tab>`).
Assignments (`src/instructor/assignments/`) are built from blocks in any order: text, links and videos, interactive HTML pages, questions (multiple choice, select all, true/false, short answer, number), written responses and code exercises, so a video can be followed by questions about it.
Instructors can create, edit, duplicate, publish, delete, export to a `.json` file, and import from that file, from another class, or from pasted quiz text in the Aiken format (`A.` choices plus an `ANSWER: B` line).
It still uses fictional data saved in the browser; connecting it to `src/api/instructor/` and Supabase is the next step.

`npm run dev:instructor` (port 5176) still runs it standalone with its own sidebar and profile picker.

## Code layout and owners

Everyone works in their own folder so PRs don't collide.
Frontend code calls only the functions in `src/api/`; each one returns mock data until its owner swaps in the real Supabase call behind the same signature.

| Path | What | Owner |
|---|---|---|
| `src/shared/` | Types (the data contract), Supabase client, auth, route guards, UI kit | Aryan |
| `src/routes.tsx`, `src/main.tsx` | Routing and app setup | Aryan |
| `src/api/student/` | Student data functions | Shivraj |
| `src/api/instructor/` | Instructor, admin and reviewer data functions | Ruthvik |
| `src/student/` | Student pages: courses, module player | Jacky |
| `src/instructor/` | Instructor workspace and reviewer view | Ken |
| `src/admin/` | Admin pages | Aryan |
| `supabase/migrations/` | `0001` is the shared contract; `1xxx` Shivraj, `2xxx` Ruthvik (append-only) | Shivraj + Ruthvik |

### Admin pages

CIC staff run the program from `/admin`. In mock mode, sign in as staff with username `admin` and password `cic-learn-demo`.

| Page | What CIC staff can do |
|---|---|
| Overview | Headline numbers, issues raised by instructors (reply or resolve), and hiring (applications by stage, recent hires) |
| Schools & classes | Search classes, see completion and learning gain per class, create a class, assign or remove instructors, archive classes (automatic when their term ends) |
| People & roles | See everyone and filter by role. **Add person** creates an instructor, student or admin with an email and temporary password (migrations `3002`, `3003`); copy or email the sign-in, and they change it from **Change password** in the sidebar. Add existing students to any class (`3004`). Change roles (not for reviewers; admins can't remove their own access); archive and restore people |
| Impact & learning | Donor-ready report: overall progress, reach by school, before/after growth per module, instructors and their courses, student progress, CSV export |
| Settings & API | Create API keys for the read API (shown once, stored as SHA-256 hashes) and revoke them |

Metric definitions live in `src/admin/metrics.ts` and on the Impact page. Learning gain is a student's best post-test % minus their first pretest %, per module.

**Database needs.** On a real Supabase project the admin pages need admin policies that `0001` doesn't have yet: read `class_instructors`, `enrollments` and `class_modules`; manage `class_instructors` and `api_keys`; update `classes`. Archiving needs an `archived_at` column on `classes` and `profiles`, and the Overview cards need `instructor_issues` and `job_applications` tables. Until they exist, the pages say what's missing instead of showing zeros.

**Demo data.** `supabase/seed.sql` adds 3 schools, 3 classes, 2 instructors and 16 students with realistic progress. Logins use password `cic-learn-demo`: `admin@cic.demo`, `teacher@cic.demo`, `ana.lopez@cic.demo`, `reviewer@cic.demo`.

### Interactive HTML activities

Instructors can paste or upload their own HTML page (for example one generated by an AI assistant) as an `interactive_html` activity.
It runs in a sandboxed iframe (`src/shared/ui/InteractiveHtmlFrame.tsx`) that cannot read the app's session, cookies or storage.
To report a score, the page calls:

```js
parent.postMessage({ type: 'cic:complete', score: 0.8 }, '*') // score is 0..1
```

## Links

- Live demo: https://cic-learn.vercel.app (Vercel Hobby, deployed with `npx vercel --prod` until the org approves Vercel's GitHub app)
- Demo video:
- Design / docs:

## After the hackathon

Winning teams finish the project with the nonprofit — the [Definition of Done](https://www.ohack.dev/about/completion) (deployed, nonprofit sign-off, docs, open source) is tracked on your team page. Keep the repo public and the README honest; recruiters do read these.

Need a hand this weekend? [#ask-a-mentor](https://opportunity-hack.slack.com/archives/C01E5CGDQ74) on Slack, or ask in [#the-1000-sunny](https://opportunity-hack.slack.com/app_redirect?channel=the-1000-sunny) and a mentor will drop in.

### Curriculum builder demo

1. Run `npm ci`, then `VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= npm run dev` for mock mode. In another terminal, run `npm run dev:runner`. The Python runner listens only on loopback at port 5178 and serves the pinned runtime from installed dependencies.
2. At [localhost:5173](http://localhost:5173), choose **Instructor**, open **Curriculum**, and open **Try the curriculum builder**. Use `+` or `/` to insert a reusable block, a Custom HTML activity, or a Python or HTML/CSS Coding Lab. Under **Module details**, use **Add HTML lesson** for a full-width HTML canvas.
3. **Save draft** (also saves after a short pause) and **Publish module** or **Publish update** are separate actions. Choose **Student** after signing out and open the module under **Instructor-published demos** in the same browser. Each new publication starts a separate demo attempt. Course drafts, reusable blocks, edits, and submissions are kept locally.
4. Use `npm test`, `npm run build`, `npm run build:instructor`, and `npm run lint` to verify the change.

Custom HTML permits inline styles and runs local scripts in an opaque-origin frame on loopback in mock mode. External scripts and fetches, form submission, and top-level navigation are blocked. Use self-contained files with embedded assets. Live use needs a separate review of navigation within the frame and resource limits. The HTML activity uses manual completion or a `cic:complete` message with an optional practice score. Python labs compare stdout with expected output. The Python runner uses a different loopback hostname from the app to keep app cookies off runner requests. Web labs check declared HTML elements and text. Practice results are local and independent of official assessments.
