# Ken's handoff: curriculum builder and roster entry

## Drafts and publication

PR #11 adds visual lesson authoring with the shared CIC layout.
In mock mode, drafts and My blocks belong to the author in the current browser.
Publishing replaces the selected module's snapshot.
The curriculum catalog and reviewer read published content.
The live builder saves drafts in the author's current browser.
Migration 2005 publishes the selected module and course details atomically.
The course revision prevents a stale draft from replacing a newer publication.

## Custom HTML

PR #12 adds inline HTML blocks and an HTML-first lesson canvas.
Use the explicit preview to run self-contained HTML.
Authored scripts run only in the loopback mock demo, in a frame with an opaque origin.
Keep real student data out of the demo while outbound navigation is under review.
Use the [CIC Learn lesson style guide](../docs/lesson-style-guide.md) as model instructions for future lesson-plan or slide-deck conversion.

## Student preview

Lesson and module previews reuse the renderer from the corresponding student player.
Preview answers run only in the open preview.
Hosted previews use the live response types, safe Markdown and slides support.
The local preview can also run demo HTML activities and coding labs.

## Read & check

Choose **Read & check** when creating a course, or apply the template to any empty lesson.
Each use creates independent article and quiz blocks with an editable HTML heading example.

## Coding labs and student demo

PR #15 adds instructor starter files and practice checks for Python and HTML/CSS.
Run the app in mock mode and the Python runner on loopback as described in the [README](../README.md#curriculum-builder-demo).
Publish a module and switch from Instructor to Student in the same browser.
The demo keeps student edits and submissions locally per published revision.
Practice results stay out of the live reporting pipeline.
The seeded course **Try the curriculum builder** includes both labs, a quiz, a written response, and an HTML widget.

## Supabase student curriculum

Migration 1004 restricts module, lesson, and activity reads using the existing enrollment and unlock rules.
After applying it, enable `VITE_LIVE_STUDENT_CURRICULUM=true` to use the database for the signed-in student's course list, module content, and attempts.
Source changes ship before hosted activation.
Published snapshots, My blocks, and executable labs remain browser-local.
Run `supabase/tests/student_curriculum_access.sql` against a migrated development database to check both access and grading.

## Roster entry

Class setup and existing classes share the same CSV and manual-entry controls.
Both require confirmation before passing validated names to the existing save flow.
The roster mapping endpoint checks the signed-in Supabase profile and calls Jev through OpenRouter when `OPENROUTER_API_KEY` is set. Otherwise it uses Vercel AI Gateway.
Only reviewed header labels and column positions go to the mapping endpoint. Use fictional rosters for demo and preview verification.

## Log

- 2026-11-14, Ken: added optional OpenRouter support to the Jev roster mapping endpoint.

- 2026-11-14, Ken: added CSV column previews and Jev suggestions, manual entry, and Enter-to-advance navigation.

- 2026-11-14, Ken: added the Read & check template for new courses and empty lessons.

- 2026-11-14, Ken: connected the draft preview to the student lesson renderer and added practice-only feedback.

- 2026-11-14, Ken: added private live drafts and atomic module publishing.

- 2026-11-14, Ken: connected the authenticated student curriculum flow to the existing server grading and unlock rules.

- 2026-11-14, Ken: added the framed coding labs, seeded lesson, and mock student entry point in PR #15.

- 2026-11-14, Ken: added the isolated HTML editor and active-frame completion checks in PR #12.

- 2026-11-14, Ken: added visual editing, reusable blocks, and local module snapshots in PR #11.

- 2026-11-14, Codex: documented the Cat Photo App style and conversion rules for lesson generation.
