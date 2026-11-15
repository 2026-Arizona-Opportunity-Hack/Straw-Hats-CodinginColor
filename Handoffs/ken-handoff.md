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
Without scripts (live data), previews embed the page right away instead; the Run step is only for the local demo, where authored scripts execute.
Frames size themselves to the page (no inner scrollbar): `isolatedHtml` injects one platform height script, and with authored scripts off the CSP allows only that script by its sha256, so authored scripts and inline handlers stay blocked. The sandbox is `allow-scripts` without `allow-same-origin`, so the frame keeps an opaque origin.
Authored scripts run only in the loopback mock demo, in a frame with an opaque origin.
Keep real student data out of the demo while outbound navigation is under review.
Use the [CIC Learn lesson style guide](../docs/lesson-style-guide.md) as model instructions for future lesson-plan or slide-deck conversion.

## Curriculum converter

Draft from materials calls the Vercel draft endpoint for signed-in instructors and admins.
Generated articles use the Cat Photo App presentation in preview and the student player.
Generation opens the first lesson in the interactive student preview.
The student preview shows topic checks in reading order and keeps references in the lesson.
The optional coding lab remains available from the preview.
**Generate image** sends the instructor’s scene description to Seedream 5.0 Flash.
The browser runs MediaPipe DeepLab after downloading the model and suggests editable masks and their bounding boxes for recognized objects.
Instructors can move points, change labels, remove annotations, or draw their own before approving or rejecting the image from the side panel.
Approved figures and their editable annotations stay in the module draft. Each generated module has five attempts, including rejected images.
Apply migration 2008 before enabling the hosted image route. Local Vite enforces its quota independently.
Local QA buttons open preview, image review, and the image-limit state without paid AI requests. The sample photo uses the same browser annotation path.
Adding a module starts it unpublished.
PPTX extraction runs in the browser, and only selected image previews go to the selected model.
The default runs Terra, then Opus, then Jev, with at most one targeted Terra edit.
Opus returns changes only for the lesson fields it revises.
An actionable Jev flag triggers one Terra repair, and its other findings stay in instructor notes. Single-pass Terra and Opus remain available.
The models share the five-minute function runtime and a dedicated capped OpenRouter key.
The review dialog shows drafting, revision, gap checking, and any targeted edit as they happen.
Audience suggestions are editable, and additional instructions remain independent.
The guide calls for short knowledge checks, hands-on practice, and written responses for big ideas and discussion.
Requests for W3Schools prioritize matching approved tutorials using reviewed summaries and canonical links.
**Add a coding lab** gives Sol the source text and article draft for an optional HTML/CSS practice block.
The reference solution and review notes stay in the draft review. Adding the module keeps only the starter and checks.
Local Vite can opt in to the real converter while keeping demo course data and browser drafts. Sample imports are labeled in the form.
See the [README](../README.md#draft-curriculum-from-materials) for preview configuration.

## Student preview

Lesson and module previews reuse the student player’s lesson layout and spacing.
Keep editor element styles outside the student lesson so code and quiz options render consistently.
Preview answers run only in the open preview.
Selecting a multiple-choice knowledge check answer gives feedback in both the student player and teacher preview.
Hosted previews use the live response types, safe Markdown and slides support.
The local preview can also run demo HTML activities and coding labs.

## Read & check

Choose **Read & check** when creating a course, or apply the template to any empty lesson.
Each use creates independent article and quiz blocks with an editable HTML heading example.
Reading blocks require no student submission.
Apply migration 1007 before deploying this change so published reading blocks do not block progression.

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
HTML/CSS practice labs reuse the scriptless preview and run declarative checks in the browser.
Students can mark these practice blocks done. The checks do not record a grade.

## Supabase student curriculum

Migration 1004 restricts module, lesson, and activity reads using the existing enrollment and unlock rules.
After applying it, enable `VITE_LIVE_STUDENT_CURRICULUM=true` to use the database for the signed-in student's course list, module content, and attempts.
Source changes ship before hosted activation.
Mock snapshots and My blocks remain browser-local. Runnable Python labs use the local runner.
Run `supabase/tests/student_curriculum_access.sql` against a migrated development database to check both access and grading.

## Anonymous class notes

Migration 1006 scopes opt-in worksheet notes to a class and reveals up to 15 after the student's own submission.
Instructors can review and hide notes for classes they manage.
The Cat Photo App demo activation script opts in Maryvale without sharing prior submissions.

## Maryvale Cat Photo App assignment

Migration 2007 links selected curriculum activities to separate completion entries in Assignment grades.
Run `supabase/demo/maryvale_cat_photo_assignment.sql` on the hosted CIC demo after 2007 and the Cat Photo App lab and reflection are in place.
It publishes the existing draft and counts prior submissions for current Maryvale students.
The lab is worth one point after server verification and the reflection is worth one point after a written response.
Maryvale students open it under Class assignments. Teachers open its grade cell to see both checkpoints.
The existing class course and Python assignments stay in place.

## Roster entry

Class setup and existing classes share the same CSV and manual-entry controls.
Both require confirmation before saving validated names.
Class setup and existing-class imports show success after the roster write completes.
Failed saves keep the roster draft available for retry with the same student IDs.
The roster mapping endpoint checks the signed-in Supabase profile and calls Jev through OpenRouter when `OPENROUTER_API_KEY` is set. Otherwise it uses Vercel AI Gateway.
Only reviewed header labels and column positions go to the mapping endpoint. Use fictional rosters for demo and preview verification.

## Log

- 2026-11-15, Codex: added automatic browser image annotations and verified adjusting, approving, and rejecting them through local image QA.

- 2026-11-15, Codex: added optional Seedream images with editable annotations, instructor approval, and a five-attempt quota.

- 2026-11-15, Codex: placed generated checks after their topics and removed the long instructor notes from preview.

- 2026-11-15, Codex: opened generated drafts directly in the student lesson preview.

- 2026-11-15, Codex: limited Opus to changed fields and replayed the Project 2 HTTPS gap through the local repair path.

- 2026-11-15, Codex: added reviewed curriculum generation, native knowledge checks, and audience suggestions.

- 2026-11-15, Codex: enabled optional AI curriculum generation in the local instructor preview.

- 2026-11-15, Codex: clarified the learner field and added instructor directions with optional W3Schools references.

- 2026-11-15, Codex: added optional Sol coding lab generation and preview to curriculum draft review.

- 2026-11-15, Codex: added reusable HTML/CSS practice checks and kept them in saved coding lab blocks.

- 2026-11-15, Codex: streamed curriculum generation stages to instructor draft review.
- 2026-11-15, Codex: fixed early roster success and verified both flows with a delayed demo save, a failed save retry, and an immediate reload after success.

- 2026-11-15, Ken: linked the verified Cat Photo App lab and reflection to the Maryvale assignment.

- 2026-11-15, Ken: matched builder previews to the published student lesson layout.

- 2026-11-15, Ken: refreshed immediate knowledge check feedback against the current student player.

- 2026-11-15, Ken: added anonymous classmate notes and teacher moderation.

- 2026-11-15, Ken: removed reading submissions and excluded reading from curriculum completion totals.

- 2026-11-14, Ken: added the verified Cat Photo App lab and its local demo.

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

- 2026-11-14, Codex: added reviewed proposal conversion with approved references and editable article blocks.

- 2026-11-14, Codex: added PowerPoint text, speaker notes, and opt-in image analysis to the converter.
