# Ken's handoff: curriculum builder

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

The Cat Photo App lab previews HTML and CSS in the scriptless frame.
Migration 1005 and the `cat-photo-check` Edge Function record completion only when all three checks pass.
Run `supabase/demo/cat_photo_lab.sql` to add the optional lab to the hosted Cat Photo App.
The provided `cat.jpg` matches the photo in the freeCodeCamp Cat Photo App project.

## Supabase student curriculum

Migration 1004 restricts module, lesson, and activity reads using the existing enrollment and unlock rules.
After applying it, enable `VITE_LIVE_STUDENT_CURRICULUM=true` to use the database for the signed-in student's course list, module content, and attempts.
Source changes ship before hosted activation.
Published snapshots, My blocks, and executable labs remain browser-local.
Run `supabase/tests/student_curriculum_access.sql` against a migrated development database to check both access and grading.

## Anonymous class notes

Migration 1006 scopes opt-in worksheet notes to a class and reveals up to 15 after the student's own submission.
Instructors can review and hide notes for classes they manage.
The Cat Photo App demo activation script opts in Maryvale without sharing prior submissions.

## Log

- 2026-11-15, Ken: added anonymous classmate notes and teacher moderation.

- 2026-11-14, Ken: added the verified Cat Photo App lab and its local demo.

- 2026-11-14, Ken: added the Read & check template for new courses and empty lessons.

- 2026-11-14, Ken: connected the draft preview to the student lesson renderer and added practice-only feedback.

- 2026-11-14, Ken: added private live drafts and atomic module publishing.

- 2026-11-14, Ken: connected the authenticated student curriculum flow to the existing server grading and unlock rules.

- 2026-11-14, Ken: added the framed coding labs, seeded lesson, and mock student entry point in PR #15.

- 2026-11-14, Ken: added the isolated HTML editor and active-frame completion checks in PR #12.

- 2026-11-14, Ken: added visual editing, reusable blocks, and local module snapshots in PR #11.

- 2026-11-14, Codex: documented the Cat Photo App style and conversion rules for lesson generation.
