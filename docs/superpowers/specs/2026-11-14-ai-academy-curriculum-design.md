# AI Academy preloaded curriculum

## Intent

Coding in Color teaches AI Academy from slide decks.
Instructors should not rebuild that content by hand, and students who learn on their own need a version they can finish alone.
The first deck, `1 - Intro to Computers & AI.pptx`, becomes Module 1.

## Goals

- One source file produces two library courses: a self-paced course and a classroom course.
- A student can pick the self-paced course and enroll themselves.
- An instructor can import the classroom course into a class as their own copy, then use it as is or edit it.
- Module 1 has interactive HTML pages that replace the deck's group activities for self-paced learners.

## Non-goals

- Turning on authored scripts for students on live data (Ken's decision stands).
- A teacher-only field on activities (the teacher guide is a separate article in the classroom version).
- Content for modules 2-6 beyond unpublished stubs.

## Anti-goals

- Copying the deck's known factual error on slide 21 (the Difference Engine claims); use the facilitator notes' corrected facts.
- Any personal data about students in content or seed files.

## Approaches

- **Interactive pages, HTML and CSS only (picked).** Works on live today with `script-src 'none'`; no drag-and-drop and no reported score, so students tap "Mark as done".
- **Scripts allowed for CIC library content.** Richer widgets, but needs Ken's sign-off and breaks down once an instructor edits an imported copy.
- **Seed SQL written by hand.** Rejected: hard for the nonprofit to extend; a JSON source plus a generator is easier to read and rerun.

## Design

- Source: `curriculum/ai-academy/course.json`, with widget pages in `curriculum/ai-academy/widgets/*.html`.
  Each activity can be tagged with the versions it belongs to (`self_paced`, `classroom`; default both).
- Generator: `scripts/build-curriculum.mjs` writes `supabase/curriculum/ai-academy.sql`.
  Ids are stable (derived from keys), and the SQL upserts, so reruns update in place.
  It is applied to the hosted project with the Supabase CLI, only after a person approves.
- Student course list with an Enroll button calls the existing `enroll_in_course` rules.
- Instructor import deep-copies the classroom library course into an instructor-owned course (`copied_from` set), and the class uses the copy.

## Delivery

Three small PRs: curriculum source and generator; student course list and enroll; instructor import as a copy.
