# Preloaded curriculum

This folder holds the curriculum that Coding in Color ships with the platform.
Right now that is **AI Academy**, built from CIC's Week 1 deck (`1 - Intro to Computers & AI.pptx`, grades 6-12).

One source file produces two library courses:

- **AI Academy (Self-paced)** (`self_paced`): students enroll themselves and work alone.
  Reading pages replace teacher talk, and interactive pages replace group work.
- **AI Academy (Classroom)** (`instructor_led`): teachers import it into a class.
  Group activities are worksheets.
  Timings and answer guidance are in [`ai-academy/teacher-guide.md`](ai-academy/teacher-guide.md), outside the lessons, because students can open every lesson activity.

Both courses share the same checks, pretest, project worksheet, exit question and posttest.
Both are library courses (`is_library = true`, no owner), published, level beginner.

## Files

- `ai-academy/course.json`: the source. Edit this.
- `ai-academy/widgets/*.html`: interactive pages for the self-paced course (HTML and CSS only, no scripts).
- `../scripts/build-curriculum.mjs`: the generator.
- `../supabase/curriculum/ai-academy.sql`: the generated SQL. Do not edit it by hand.
- `../tests/build-curriculum.test.mjs`: checks the source and the generated SQL.

## The source format

```jsonc
{
  "courses": [
    { "key": "self-paced", "title": "...", "description": "...", "level": "beginner",
      "deliveryMode": "self_paced", "version": "self_paced" }
  ],
  "modules": [
    { "key": "m1-intro", "title": "...", "concept": "...", "published": true,
      "lessons": [
        { "key": "welcome", "title": "...", "isCheckpoint": false,
          "activities": [
            { "key": "check-norms", "type": "check", "concept": "class norms", "points": 1,
              "countsTowardUnlock": true, "versions": ["self_paced", "classroom"],
              "title": "...", "content": { "prompt": "...", "choices": [], "answer": "b" } },
            { "key": "build-the-machine", "type": "interactive_html", "concept": "computer parts", "points": 1,
              "versions": ["self_paced"], "htmlFile": "widgets/build-the-machine.html", "instructions": "..." }
          ] }
      ] }
  ]
}
```

- **courses**: one entry per library course. `version` is the tag that activities use in `versions`.
  `deliveryMode` is `self_paced` or `instructor_led`. `level` is `beginner`, `intermediate`, `advanced` or `expert`.
- **modules**: shared by every course. Each course gets its own copy of each module in the database.
  Set `published: false` to hide a module from students.
- **versions** (optional, on a module, lesson or activity): `self_paced`, `classroom` or both.
  Leave it out to include the item in both courses.
  A lesson with no activities left for a course is skipped for that course.
- **key**: lowercase letters, digits and dashes.
  Keys make the database ids, so **renaming a key creates a new row and deletes the old one, including student attempts on it**.
  Change titles and text freely; change keys only on purpose.
- **type** and **content**: the payload must match `src/shared/types/activities.ts`.
  The generator checks the required fields for each type.
- **markdown** in a `content` activity can be one string or a list of lines (joined with line breaks), which is easier to edit.
  Markdown tables do not render in the student player, so use lists.
- **answer** (checks) and `items[].answer` (pretest, posttest): put the right choice id here.
  A database trigger moves answers into `activity_keys` so students never see them.
- **title** (optional): the label the course builder shows. The player does not show it, so content pages repeat it as a heading.
- **htmlFile** and **instructions** (interactive pages only): the page's HTML goes into `content.html`.
  `reports_score` is `false`, so students tap "Mark as done".
- **points**: whole number, 0 or more. **countsTowardUnlock** defaults to `true`; optional pages set it to `false`.

Students are minors: never put personal data about real students in the source, and never ask for last names, addresses or photos in worksheets.

## Regenerate the SQL

```sh
npm run curriculum
```

If some widget pages are still being written, this fails and names the missing file.
To build anyway and skip the activities whose page is missing:

```sh
npm run curriculum -- --allow-missing
```

Then run the tests, which validate every activity and parse the generated SQL:

```sh
npm test
```

## Apply it to Supabase

This is a **write to the hosted database**.
Get approval from the team (and CIC for content changes) before running it.

```sh
npx supabase db query --linked -f supabase/curriculum/ai-academy.sql
```

What the SQL does, in one transaction:

1. Deletes modules, lessons and activities of these two courses that are no longer in the source (with their student attempts).
2. Upserts the two courses, then every module, lesson and activity (`insert ... on conflict (id) do update`).

Ids are stable (sha1 of `ai-academy:<course key>:<module/lesson/activity key path>`), so running it again updates rows in place and keeps student progress.
Removing a whole course from `courses` does not delete it from the database; delete it by hand.
Instructor copies made by "import" are separate courses and are never touched.

## TODO

- Video links coming from CIC.
  The deck has four videos without verified links, so they are left out for now (the teacher guide says to play them from the deck):
  - "What is a computer?" (slide 12)
  - "Inside a computer" (slide 15)
  - "Early computer" (slide 22)
  - "Coin sorter" (slide 24)
- The only verified video is Code.org "What is Machine Learning?" (https://www.youtube.com/watch?v=OeU5m6vRyCk), used in the What is AI? lesson.
- Modules 2-6 are unpublished stubs with one "Coming soon" page each, until CIC shares those decks.
- The teacher guide is a Markdown file, not in the app, until activities get a teacher-only field.
- The deck's Pre Assessment form (slide 7) is replaced by the in-app pretest. The Pre Survey link (slide 6) stays in the classroom course only.
