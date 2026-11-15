# Ken's handoff: curriculum builder

## Drafts and publication

PR #11 adds visual lesson authoring with the shared CIC layout.
In mock mode, drafts and My blocks belong to the author in the current browser.
Publishing replaces the selected module's snapshot.
The curriculum catalog and reviewer read published content.
The live instructor workspace keeps its existing Supabase save flow.

## Custom HTML

PR #12 adds inline HTML blocks and an HTML-first lesson canvas.
Use the explicit preview to run self-contained HTML.
Authored scripts run only in the loopback mock demo, in a frame with an opaque origin.
Keep real student data out of the demo while outbound navigation is under review.

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

## Module completion in the assignment gradebook

Migration 2004 adds opt-in gradebook tracking for a published module linked to a class assignment.
It records the fraction of required steps with a submitted attempt for each enrolled student.
It accepts that student's self-paced attempts and attempts from the target class.
Teachers keep their manual scores and feedback.
After 2004 is approved and applied, `supabase/demo/maryvale_cat_photo_assignment.sql` publishes the existing Maryvale Cat Photo App draft and picks up prior lesson progress.
Students still open the lesson from My Courses.
Use `supabase/tests/module_assignment_progress.sql` to check the student-to-instructor flow in a local database.

## Log

- 2026-11-14, Ken: added opt-in module completion for the Maryvale assignment gradebook.

- 2026-11-14, Ken: connected the authenticated student curriculum flow to the existing server grading and unlock rules.

- 2026-11-14, Ken: added the framed coding labs, seeded lesson, and mock student entry point in PR #15.

- 2026-11-14, Ken: added the isolated HTML editor and active-frame completion checks in PR #12.

- 2026-11-14, Ken: added visual editing, reusable blocks, and local module snapshots in PR #11.
