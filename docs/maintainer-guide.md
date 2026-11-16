# CIC Learn maintainer guide

For the quickest review, start with the [local demo](demo.md). Use this guide to set up a CIC-owned environment and connect the dashboard.

## Set up a connected environment

CIC Learn uses Vercel for the React app and server routes, with Supabase for authentication, PostgreSQL, storage and Edge Functions. Start with a Supabase project for the intended environment. Replace `your-project-ref` below with that project's reference.

```bash
npm ci
npx supabase login
npx supabase link 'your-project-ref'
npx supabase db push --remote --dry-run
npx supabase db push --remote
npx supabase functions deploy roster-login
```

Use `--include-seed` on the database push only on a disposable demo project. [The seed](../supabase/seed.sql) creates fictional accounts and classes with public fixture passwords. For a real program, create the first CIC admin in Supabase Auth and set the matching `public.profiles.role` to `admin` through the trusted database console. Provision other staff in **People & roles**. [Supabase CLI reference](https://supabase.com/docs/reference/cli/supabase-db-push) · [Database handoff and migration history](../Handoffs/ruthvik-handoff-supabase.md)

Keep password sign-in and Auth signups enabled. Username accounts use internal identifiers, and educator signup needs Google enabled with the app's origin configured in Auth. See the [Supabase Google sign-in guide](https://supabase.com/docs/guides/auth/social-sign-in/auth-google).

Import this repository into Vercel as a Vite project, or link a checkout to the existing team project with `npx vercel link`. Use the dependencies in `package-lock.json`, build with `npm run build`, and serve `dist`. Set environment variables before deploying. For manual deployment, run `npx vercel` to create a preview and `npx vercel --prod` after checking it.

| Variable | Where | Purpose |
| --- | --- | --- |
| `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` | App build | Project URL and public API key. Supabase policies authorize each data request. |
| `VITE_LIVE_STUDENT_CURRICULUM=true` | App build | Reads published student content and saves attempts in Supabase. Apply all migrations first, including `1004`. |
| `VITE_STAFF_EMAIL_DOMAIN` | App build, optional | Domain appended to staff usernames. Staff can also enter their full email. |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel server | Required for the aggregate read API. |
| `OPENROUTER_CURRICULUM_API_KEY` | Vercel server, optional | Dedicated capped key for curriculum drafting. Use a zero-data-retention workspace per the converter requirements below. |
| `OPENROUTER_API_KEY` or `AI_GATEWAY_API_KEY` | Vercel server, optional | Suggests CSV header matches. Vercel runtime OIDC can also authorize the gateway. |

See [`.env.example`](../.env.example) for variable names. Keep service credentials out of `VITE_*` variables, source control and frontend bundles. For the local database and Edge Functions, follow the [Supabase local development guide](https://supabase.com/docs/guides/local-development/overview) and the [checked-in config](../supabase/config.toml). Use `vercel dev` for the Vercel routes. Plain Vite is sufficient for the no-account demo.

After deployment, use fictional data to verify that a student joins by class code, completes required work, and sees the next assigned module. Confirm that authorized staff see the student's progress and that a reviewer can browse only shared curriculum. If the dashboard integration is in scope, exercise the read API with an active key, then revoke the key and verify it is rejected.

## Previously issued student login cards

Apply migration `3007_roster_student_login.sql` and deploy the `roster-login` Supabase Edge Function before using imported learners' login cards.
Students enter their class code and individual six-digit passcode; their existing roster row is linked to an Auth identity and enrollment on first login.
New identities use an opaque internal address, with no personal email or email delivery.
Existing linked students keep their accounts and progress. Username account creation and sign-in remain available, with email access for older accounts.
The function uses Supabase's built-in server credentials; never add its service key to frontend environment variables.
The database limits login attempts to 10 per card and 120 per class per 15 minutes, including failures. A throttled class can retry after that window.
Verify with `supabase/tests/roster_login.sql` against a local migrated database and `npm test -- tests/roster-login.test.ts`.

## Aggregate read API

`GET /api/progress` lets the organization's dashboard read cohort progress and assessment gains.
Apply `supabase/migrations/3005_aggregate_read_api.sql` after the earlier migrations and set `SUPABASE_SERVICE_ROLE_KEY` in the Vercel server environment alongside `VITE_SUPABASE_URL`.
Keep the service key server-only. Give consumers a read key created in **Admin → Settings & API**, shown once at creation.
Run the route on Vercel or with `vercel dev`.

```bash
curl --fail-with-body "$CIC_BASE_URL/api/progress" -H "Authorization: Bearer $CIC_READ_KEY"
```

Keys grant organization-wide aggregate read access only. They are checked against their stored SHA-256 hash on every request and rechecked during aggregation.
Revoking a key in Settings rejects subsequent requests. Responses use `Cache-Control: no-store`.
The endpoint returns cohort-level data. Keep keys in the consumer's server environment.

The JSON envelope is `{ "version": 1, "generated_at": "<ISO timestamp>", "cohorts": [...] }`.
Each cohort has `course_id`, `course_title`, `class_id`, `class_name`, and these numeric fields.

| Field | Meaning |
|---|---|
| `enrolled_students` | Distinct students with a login enrolled in this course context. Unlinked roster entries are excluded. |
| `module_opportunities`, `completed_modules`, `tested_out_modules` | Student/module counts from canonical `_course_state`, including release, unlock, required-work and test-out rules. |
| `completion_pct` | Completed modules / module opportunities × 100. |
| `assessment_pairs` | Student/module pairs with both a first pretest score and a counted post-test score. |
| `paired_pretest_pct`, `paired_posttest_pct` | Means across those same pairs, on a 0–100 scale. |
| `learning_gain_points` | Mean of each pair's post-test minus pretest, in percentage points. |

Class post-tests count the best allowed try; self-paced post-tests count the best try overall.
`class_id` and `class_name` are null for self-enrollment. Duplicate enrollments use the student's canonical class (earliest class enrollment for that course), matching the student player.
Archived enrollment history remains included. Cohorts without enrollments are omitted; an empty installation returns `cohorts: []`.
Percentages/gains are null when their denominator is zero. This report is for authorized internal use and includes small cohorts.
Only GET is accepted, with no query parameters. Errors are `400` for query parameters, `401` for missing/invalid/revoked keys, `405` for other methods, and `503` for unavailable configuration/database.
Tests: `npm test -- tests/progress-api.test.ts` and `psql "$LOCAL_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/aggregate_read_api.sql` against a migrated disposable local database.

On November 15, 2026, the hosted route rejected an unauthenticated request with `401`. Verify the authenticated response with a dashboard read key after deploying.

## Student data minimization

Students can use a teacher-issued login card or create a username account without a personal email.
People & roles can create student usernames, or instructor, admin and reviewer accounts with staff email.
Legacy email accounts retain their access and saved work; Google sign-in remains available to educators on the staff side.

Apply migrations `3006_student_data_minimization.sql`, `3007_roster_student_login.sql` and `3012_username_privacy_compatibility.sql`, and deploy the roster-login function before using cards.
The database rejects direct personal-email student signup and student email changes, even if someone bypasses the app.
Only the internal username helper can stamp a matching synthetic username identity; clients cannot authorize themselves with user metadata.
Keep general Auth signup enabled for new educator Google accounts and email authentication enabled for password sign-in.
The database guard restricts direct email creation; do not globally disable signup, which would block new educators.
Regression checks: run `supabase/tests/student_data_minimization.sql`, `supabase/tests/username_privacy_compatibility.sql` and `supabase/tests/roster_login.sql` on a disposable migrated database.

## Instructor workspace

Instructors and reviewers use the workspace in `src/instructor/` inside the main app, under the shared sidebar: `/instructor#/classes`, `/instructor#/curriculum`, `/instructor#/review`, and `/reviewer` for external reviewers.
`src/instructor/InstructorRoute.tsx` mounts it and passes the signed-in role.
Its page styles live in `src/instructor/styles.css` (`ic-*` classes); reuse them when connecting data so the layout stays consistent.
Inside a class, tabs are Dashboard, Curriculum, Assignments, Grades and Roster (`#/classes/<id>/<tab>`).
Create a class and assign curriculum, then use **Share class code**. New students enter the code on `/signup` and appear on the class roster. Returning students can join from **My classroom**.
The **Roster** tab supports CSV import and manual entry. Review the column previews and confirm the names before importing. During manual entry, Enter advances to the next name field or inserts a new row below.
Apply migration `3021_roster_name_matches.sql` before using **Roster → Review name matches**. Confirm only pairs you recognize as the same student. Confirmation keeps the linked account and its saved work. Ambiguous names and imported rows with work are excluded.
With Supabase staff sign-in and a Jev provider configured, **Suggest matches** sends only reviewed CSV header labels to Jev. The file and sample values stay in the browser during mapping. Column selection and manual entry also work without Jev. Set a server-side `OPENROUTER_API_KEY` to use OpenRouter. The Vercel AI Gateway path uses a server-side `AI_GATEWAY_API_KEY` or Vercel's runtime OIDC token.
Assignments (`src/instructor/assignments/`) are built from blocks in any order: text, links and videos, interactive HTML pages, questions (multiple choice, select all, true/false, short answer, number), written responses and code exercises, so a video can be followed by questions about it.
Instructors can create, edit, duplicate, publish, delete, export to a `.json` file, and import from that file, from another class, or from pasted quiz text in the Aiken format (`A.` choices plus an `ANSWER: B` line).
The Grades tab is a gradebook with needs-grading, missing, late and not-due states, rubrics, file uploads and CSV export.
Apply migration `3020_student_quiz_submissions.sql` before deploying the student quiz page.
Enrolled students open published quizzes from **Class assignments** on Home or My classroom, submit answers, and can reopen their work, final score, and teacher feedback.
The gradebook auto-scores quiz questions and lets teachers score written responses and add feedback.
Quizzes with submitted work can be unpublished or duplicated. Their assessed blocks are locked to preserve the original grades.
Run `supabase/tests/student_quiz_submissions.sql` against a disposable migrated database to check publication, permissions, submission retries, and grade visibility.
Student activity details show saved worksheet answers, question choices, exit reflections and code. The latest response and counted score identify their attempts when they differ; concept mastery follows the counted assessment, excluding later practice tries.
The hosted instructor workspace uses `src/instructor/liveStore.ts`.

**Curriculum.** Instructors and admins can browse global courses and the classes they can access. Courses open in view mode.
**Save draft** stores edits in the signed-in author's current browser. **Publish module** sends the selected module and course details to Supabase in one transaction, using migration `2005`. Other modules stay in the draft.
Staff can comment on individual published blocks. Comments on a class course stay in that class's staff thread.
Instructors and admins can edit published global courses and their class's own copy. For a class still using a shared template, choose **Edit for this class** to create a class copy.
In the course builder, **Archive module** hides the module and keeps its lessons and student work. Publish it again to restore access. **Delete module** permanently removes the module, its lessons, and the student work attached to those lessons. Unassign a module from its classes before archiving or deleting it.
In **CIC Library**, choose **New course**, **Edit curriculum**, or **Add existing course**. Adding an existing course lists the same global course, and a new course joins the shared library when its first module is published. Reviewer access and class templates have their own settings.
To add a slide deck, select **Include in CIC Library** on a Slides block in a global course and publish its module.
In **Create a class**, picking a global course template makes an independent copy with its own content IDs.
Apply curriculum migrations `2011`, `2012`, `3018`, and `3019` before deploying this workspace. The [curriculum isolation audit](../Handoffs/curriculum-isolation-audit-2026-11-15.md) covers the original isolation change and legacy classes still using shared courses directly.

**Class Dashboard.** Shows learning gain with the pretest and post-test averages behind it, average assignment score, work to grade and missing work.
**Needs attention** lists each student who needs help and opens to the exact reasons (stuck, inactive, below mastery, missing or low work, post-test drop).
**Module completion** opens each module to its assignments, due dates and turn-in counts.
Thresholds (inactive days, low score, pass mark, post-test tries) come from the database: apply `2006_program_settings_and_rules.sql`, and change them in `program_settings` or per module in `module_rules`.

**Preloaded curriculum.** `curriculum/` holds the AI Academy course built from CIC's Week 1 deck, as a self-paced and a classroom library course with interactive HTML-and-CSS pages.
Run `npm run curriculum` to rebuild `supabase/curriculum/ai-academy.sql`, then run that file on the database.
See [`curriculum/README.md`](../curriculum/README.md) and the teacher guide in `curriculum/ai-academy/teacher-guide.md`.

`npm run dev:instructor` (port 5176) still runs it standalone with its own sidebar and profile picker.

## Admin pages

CIC staff run the program from `/admin`. In mock mode, sign in as staff with username `admin` and password `cic-learn-demo`.

| Page | What CIC staff can do |
|---|---|
| Overview | Headline numbers, issues raised by instructors (reply or resolve), and hiring (applications by stage, recent hires) |
| Schools & classes | Search classes, see completion and learning gain per class, create a class, assign or remove instructors, archive classes (automatic when their term ends) |
| People & roles | See everyone and filter by role. **Add person** creates a student username without email, or an instructor, reviewer or admin with staff email and a temporary password (migrations `1013`, `3006`, `3012`); copy the student sign-in or copy/email staff details, and they change it from **Change password** in the sidebar. Add existing students to a class (`3004`), remove them from one class while retaining past work (`3015`), and assign instructors to teach a class. The class dropdowns show **Class, School**. Change roles (not for reviewers; admins can't remove their own access); archive and restore people |
| Impact & learning | Internal progress and learning gain by class, school, or module, with a named student CSV for staff and a separate aggregate CSV for donors and partners |
| Settings & API | Create API keys for the read API (shown once, stored as SHA-256 hashes) and revoke them |

Metric definitions live in `src/admin/metrics.ts` and on the Impact page. Learning gain is a student's best post-test % minus their first pretest %, per module.

Live teacher and admin reports require migration `3008_staff_progress_snapshot.sql` before deploying the reporting UI.
They read the same module state as the student player, including test-out, allowed tries, release/unlock rules and required activities.
Teacher module completion shows the share of enrolled learners who completed the module; required-activity submission counts are separate.
Reload a report to refresh its database snapshot. Missing or denied snapshots show an error instead of estimated completion.
Mock fixtures keep their local reporting behavior. The staff snapshot is private to active authorized staff and is separate from the organization's aggregate read API.

## Draft curriculum from materials

In an instructor's course builder, choose **Draft from materials**, paste a proposal or upload a text, Markdown, or PowerPoint file, then try the first lesson in the student preview. Switch lessons or open the coding lab before adding it. The module starts unpublished. Hands-on instructions appear in the article. Each knowledge check has its own block after the topic it tests, and written prompts support reflection or discussion. The [lesson style guide](lesson-style-guide.md) is included in the server prompt. Verified references are selected from the approved catalog in `server/curriculum/references.ts`.

PowerPoint import extracts visible slide text and speaker notes in presentation order in the browser. Select up to six PNG or JPEG previews to ask for teaching suggestions about those images. Unselected images stay in the browser. Charts, slide shapes, and unsupported assets are flagged for instructor review. Export Google Slides to `.pptx` to use this flow.

**Reviewed draft** is the default. GPT-6.1 Terra drafts, Claude Opus 5.5 returns changes for specific lesson fields, and Jev checks each lesson for the most important remaining gap. One clear gap can trigger a targeted Terra edit before instructor review. The form shows progress for each step. If a review step fails or leaves a gap, the best validated draft includes a note for the instructor. The two single-pass choices are available for faster drafts. All paths stay within the 300-second function limit.

For a preview, configure the existing Supabase project variables and a dedicated, capped `OPENROUTER_CURRICULUM_API_KEY` in the Vercel server environment. Use a workspace with **ZDR only** and Safety Retention excluded. The API checks eligibility before sending lesson materials. Use `vercel dev` to run the API locally alongside the app. Local Vite defaults to sample mode. To use the real converter with local demo data, set the capped `OPENROUTER_CURRICULUM_API_KEY` in your ignored `.env.local` and run `CIC_LOCAL_CURRICULUM=1 npm run dev -- --host 127.0.0.1`. Local generation uses the same converter and verified references. The opt-in serves requests from the local app.

**Who is this for?** offers editable audience suggestions, including high school students new to programming. **Additional instructions** can ask for a focus, practice activity, or resource such as W3Schools. A W3Schools request prioritizes relevant approved tutorials, with reviewed summaries and links in the verified references.

In draft review, choose a lesson and select **Add a coding lab** to ask GPT-6.1 Sol for an HTML/CSS practice block. Try the starter and the reference solution with **Check your work**. **Add as draft** keeps the starter and checks in the module for editing. The lab uses the same capped key and shows server stages with elapsed time. Sample mode offers a local example lab.

In draft preview, choose **Generate image** to describe a scene for Seedream 5.0 Flash. CIC Learn uses a browser-based model to suggest boxes and masks for recognized objects. Choose **Adjust an annotation** to move points, change the label, or remove a suggestion. You can also draw your own shapes. Add an image description before approving. Approved images appear after the selected lesson block. A module has five image generation attempts. Apply migration 2008 before enabling image generation on the hosted app.

To create annotations without a pointer, expand **Add points with the keyboard** and enter percentages from the image's left and top. Add two opposite corners for a box, or at least three points followed by **Finish mask**. For example, points at `(10%, 20%)` and `(80%, 75%)` create a box even when the image has no suggested annotations.

On localhost, **Draft from materials** includes **Local QA** buttons for the lesson preview, image review, and the exhausted image limit. **Test image review** opens the sample photo or a PNG or JPEG chosen under **Test image (optional)**. It runs the same browser annotations, including a crop retry when a wide or tall image yields no suggestions. The overlay stays on the full image. The model downloads on first use. The QA buttons make no paid AI requests.

## Interactive HTML activities

Instructors can paste or upload their own HTML page (for example one generated by an AI assistant) as an `interactive_html` activity.
It runs in a sandboxed iframe (`src/shared/ui/InteractiveHtmlFrame.tsx`) that cannot read the app's session, cookies or storage.
To report a score, the page calls:

```js
parent.postMessage({ type: 'cic:complete', score: 0.8 }, '*') // score is 0..1
```

## Cat Photo App and interactive lessons

- For the verified hosted Cat Photo App lab, apply migration `1005`, deploy `cat-photo-check`, and apply `supabase/demo/cat_photo_lab.sql` to the sample curriculum. The three checks must pass before completion is recorded. The bundled photo comes from the [freeCodeCamp Cat Photo App project](https://www.freecodecamp.org/learn/2022/responsive-web-design/learn-html-by-building-a-cat-photo-app/).
- Migration `1006` enables optional anonymous notes on written worksheets. Eligible students can see up to 15 classmate notes after submitting, and instructors can moderate them. The sample activation is `supabase/demo/cat_photo_discussion.sql`.
- The sample Maryvale class assignment requires migration `2007` and the Cat Photo App lab and reflection. `supabase/demo/maryvale_cat_photo_assignment.sql` publishes that assignment and counts prior submissions for current Maryvale learners. Review the script and target class before running it.
- Live curriculum serves authored HTML without authored scripts. On loopback in mock mode, self-contained pages can run inline scripts in an opaque-origin frame. Python checks compare stdout with expected output. HTML/CSS practice checks use declared elements and text. The demo saves practice in the browser.
