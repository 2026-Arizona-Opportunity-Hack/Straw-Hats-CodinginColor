# CIC Learn

CIC Learn brings Coding in Color's slide decks and worksheets into lessons students can work through at their own pace. A student who misses class can return to their next lesson. Instructors can see who needs help, and CIC can measure what students learned using paired warm-up and final checks.

Built by [Straw Hats](https://www.ohack.dev/hack/fall-2026/team/c7e4c72ee05711f1ae58deadb145c312) for [Coding in Color](https://www.ohack.dev/nonprofit/YIXYdYCoxIZC08uQ5DL3) at [ASU Opportunity Hack, November 14–15, 2026](https://www.ohack.dev/hack/fall-2026). [Problem 1 · Curriculum & Student Progress](https://www.ohack.dev/project/d09466fadf1b11f18e63deadc507a848).

**[Open CIC Learn](https://cic-learn.vercel.app)** · **[Watch the hackathon demo](https://www.youtube.com/watch?v=rHjQmchF_AE)** · **[Demo walkthrough](docs/demo.md)** · **[Set up and deploy](docs/maintainer-guide.md#set-up-a-connected-environment)**

## What you can do

| Who | What to try |
| --- | --- |
| Student | Join with a class code and a username. Work through reading, checks, worksheets and code exercises. See which module opens next. |
| Instructor | Create a class from CIC curriculum, import a CSV roster and share a class code. Publish lesson edits, review student responses and see who needs attention in the class dashboard. |
| CIC admin | Manage schools, classes and roles. Review class and program learning gain, export aggregate results for partners, or create a key for the dashboard API. |
| External educator | Sign in as a reviewer to browse published shared curriculum with read-only access. |

Instructors can turn a teaching proposal or PowerPoint deck into an editable module with **Draft from materials**, preview it as a student, and publish it from the builder. The class dashboard also groups assessed results by concept so instructors can see where to spend more practice time.

## Run it locally

Use Node.js 22 LTS (22.12 or later) or Node.js 24 LTS with npm. This demo uses fictional data and runs without Supabase credentials or a paid AI key.

```bash
git clone https://github.com/2026-Arizona-Opportunity-Hack/Straw-Hats-CodinginColor.git
cd Straw-Hats-CodinginColor
npm ci
npm run dev -- --strictPort
```

Open [localhost:5173/login](http://localhost:5173/login). Choose **Continue as a demo student**, or select **Educator or staff** and enter one of these mock accounts.

| Role | Username | Mock password |
| --- | --- | --- |
| Instructor | `teacher` | `cic-learn-demo` |
| CIC admin | `admin` | `cic-learn-demo` |
| Reviewer | `reviewer` | `cic-learn-demo` |

If the checkout already has Supabase settings, start mock mode with `VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= npm run dev`. Use the same browser for both roles so the student can open the module published by the instructor. See the [demo walkthrough](docs/demo.md#local-demo) for the steps and the Python runner.

## Student privacy

New student accounts use usernames without personal email. Supabase row-level policies enforce access to class records and student work, and the read API returns aggregate counts and scores for CIC's authorized dashboard. The [maintainer guide](docs/maintainer-guide.md#student-data-minimization) covers the account rules and tests.

## Aggregate read API

CIC's dashboard can call `GET /api/progress` with a read key issued by a CIC admin. The [API contract](docs/maintainer-guide.md#aggregate-read-api) covers authentication, learning-gain calculations, response fields and tests.

## Code map

| Path | Responsibilities |
| --- | --- |
| [`src/student/`](src/student/) and [`src/api/student/`](src/api/student/) | Student accounts, course player, assessments and saved work |
| [`src/instructor/`](src/instructor/) | Classes, rosters, curriculum authoring, assignments, grades and reviewer view |
| [`src/admin/`](src/admin/) | Organization reports, people, schools and API keys |
| [`src/shared/`](src/shared/) | Session, roles, shared types and UI |
| [`api/`](api/) and [`server/`](server/) | Vercel routes for aggregate reporting, curriculum drafts and roster suggestions |
| [`supabase/`](supabase/) | PostgreSQL migrations, row-level access rules, Edge Functions and demo seed |
| [`curriculum/`](curriculum/) | AI Academy source and teacher guide |

The frontend uses React, TypeScript, Vite and Tailwind CSS. The local Python Coding Lab runs Pyodide in a browser worker. See the [maintainer guide](docs/maintainer-guide.md) for the connected environment, role rules and feature configuration.

Run `npm test`, `npm run build` and `npm run lint` before opening a pull request. [Working agreements](AGENTS.md) · [Team handoffs](Handoffs/) · [MIT License](LICENSE).

## Team

- Jacky — student experience
- Kennett Ho — instructor workspace and curriculum builder
- Ruthvik — instructor backend, curriculum and reporting
- Shivraj — student backend, assessment and progression
- Aryan - complete app UI/UX designer

Aryan contributed app integration, authentication and the CIC admin workspace. Greg V from Opportunity Hack created the repository scaffold. [Repository contributors](https://github.com/2026-Arizona-Opportunity-Hack/Straw-Hats-CodinginColor/graphs/contributors)
