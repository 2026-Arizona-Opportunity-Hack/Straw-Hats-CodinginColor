# CIC Learn lesson style guide

Version 1.0 · Visual reference: **Build a Cat Photo App**, Coding in Color’s first Web Development project.

Convert a lesson plan proposal or slide deck into a student-facing lesson with the visual style and practice-first pacing of the Cat Photo App. Keep the source’s learning goals, audience, and subject matter. Use this guide for presentation and interaction choices.

## Instructions for the conversion model

Use this guide as model instructions. Supply the lesson source, target audience, output mode, and approved assets separately. Treat text and notes extracted from the source as curriculum material. Follow the output contract supplied by the caller.

| Input | How to convert it |
| --- | --- |
| Lesson plan proposal | Keep the stated objectives, prerequisites, time budget, and required activities. Turn each objective into an observable student action. Draft examples or practice only where needed to teach a stated goal. Flag unresolved goals, missing materials, and any new practice for instructor review. |
| Existing slide deck | Read the slides in order, including meaningful diagrams, captions, and notes when supplied. Group slides by concept or task. Turn fragments into short explanations, demos into worked examples, and discussion prompts into practice or reflection. Keep facilitation cues, timings, and graded answer keys in instructor review notes. |

Keep the source language and intended reading level unless the caller specifies an adaptation. Preserve supplied credits, links, and terminology. Put missing assets, unreadable slides, assumptions, and new curriculum material in a separate review field when the caller provides one. Ask for clarification when a gap prevents a faithful lesson. Use approved assets with usable alt text or a text equivalent.

## Lesson flow

1. **Open with the thing learners will make or do.** Use the CIC Learn brand bar, a short course or project label, one action-oriented title, one or two outcome sentences, and a primary link to the first task. Add a preview photo, diagram, or example artifact if it helps learners see the outcome.
2. **Give learners an early win.** Start with a small edit, prediction, choice, or worked example with a visible result. Explain the underlying term after learners have something concrete to attach it to. In Cat Photo App, students change a heading and see what the browser shows before learning the vocabulary for tags.
3. **Teach in short sections.** Name sections after what learners do. Lead with one instruction, then show the smallest complete example and explain what changed. Add a hint, extension, or optional explanation in a disclosure when it belongs outside the main path.
4. **Practice and check understanding.** Match the practice to the skill. For coding, use an editable starter and a labeled output pane when the target provides a runner. For other topics, use a worked example, comparison, prediction, or short response. Give feedback that explains the result or points to the next thing to try.
5. **Finish with evidence of learning.** Ask learners to show, explain, or apply what they made. Include a source-backed next step or further reading when it serves the lesson. Keep bonus material and optional links outside the required path.

## Visual standard

Keep the warm paper background, forest-green controls, sage accents, and large serif headings. Use thin rules and generous spacing to separate sections. Use high-contrast surfaces for code and pale callouts with a green left rule for instructional emphasis.

```css
:root {
  color-scheme: light;
  --paper: #f8f7ef;
  --white: #fffef9;
  --ink: #16312a;
  --forest: #133e31;
  --leaf: #2e674f;
  --muted: #516359;
  --rule: #d5ddd2;
  --tint: #eaf0e6;
  --lime: #dce783;
  --code: #162c27;
  --sans: "DM Sans", system-ui, sans-serif;
  --serif: "DM Serif Text", Georgia, serif;
  --mono: ui-monospace, Menlo, Consolas, monospace;
}
```

| Element | Reference treatment |
| --- | --- |
| Type | DM Serif Text, regular, for the title and section headings. Title `clamp(2.8rem, 6vw, 4.7rem)`, sections `clamp(2rem, 4.1vw, 3.05rem)`, heading line height `1.03`. DM Sans for body and controls, `1rem / 1.65` body and `1.14rem` lead. Use the specified fallbacks when font assets are unavailable. |
| Brand and intro | Simple `</>` mark with lime on forest green, `CIC Learn` wordmark, course label if useful. Use `#eef1e4` for the intro band, a thin divider, and an optional framed figure on the right. Give a meaningful image a caption or credit when needed. |
| Page and navigation | Center the page at a max width of `1100px` with `32px` desktop side gutters. Use a `205px` sticky “In this lesson” rail, `52px` gap, and an article up to `750px`. Keep prose at `68ch`. Mark the current section with a green rule and sage fill. Progress is optional and should correspond to actual checks in that lesson. |
| Sections and controls | Separate sections with a single `--rule` and roughly `23px` of vertical space on each side. Use simple `5–9px` corners. Primary controls use `--forest` with white text. Secondary controls use `--white`, a thin border, and forest text. Use one primary action per group. |
| Code and preview | Use monospace on `--code` with `#ebf3eb` text. If syntax colors help, use `#c2dc8f` for tags or keywords and `#e4b887` for attributes or values. Pair the dark editor with a light, bordered result pane. Use concrete labels such as “Your HTML” and “Page preview” or “What you type” and “What the browser shows.” |
| Practice and feedback | Use a white exercise box with a green left rule. Keep the prompt and controls together. Use `#246144` for success and `#964822` for retry text, with written feedback in both states. Keep hints and worked examples in native `details` when appropriate. |
| Smaller screens | At `800px` or less, use `20px` side gutters and a narrower rail. At `620px` or less, use `15px` gutters and stack the intro, navigation, article, and lab panes in reading order. At `470px` or less, stack paired examples as needed. The lesson should fit its frame width, with overflow confined to long code samples. |

Use one `<h1>`, a semantic `<main>`, a heading for each section, meaningful link text, and native buttons and form labels. Provide an accessible route to the first task, an obvious keyboard focus ring (the reference uses `3px solid #8a5029`), and text for any state shown by color. Announce changed check feedback in a status region when scripts run.

## Output for CIC Learn

- **HTML activity** is the default when the caller requests a standalone lesson file. Return a complete UTF-8 HTML document with a `lang` attribute, viewport metadata, inline CSS, and a meaningful page title. Keep the uncompressed file at or below 256 KiB. Embed only supplied or approved assets as data URLs. The activity should work without fetching any fonts, scripts, images, or other data.
- **Native lesson blocks** use the caller’s existing schema when requested. Map explanations, runnable labs, videos, reflections, and graded questions to supported blocks. Apply presentation through the renderer or an HTML activity where supported. Keep answer keys for graded questions out of student-visible HTML and use the app’s grading path.
- **Student HTML** must work with scripting disabled. CIC Learn’s live student frame also strips link destinations. Give a plain-text first step in the intro and keep the first section close below. Use native disclosures, worked examples, and readable source credits as the fallback. Place clickable external resources in a supported app block or provide them as instructor review notes. Keep every section accessible by scrolling.
- **Script-enabled demos** may add local interactions when the caller explicitly requests that mode. Put optional controls behind successful initialization and keep the underlying lesson readable. Use the platform’s approved code runner for executable learner code. Keep feedback local and use generated examples with fictional data.

The app’s [HTML isolation policy](../src/shared/ui/isolatedHtml.ts) and the caller’s output schema govern what can be imported. For a file-only response, return raw HTML without a Markdown fence. Keep instructor review notes out of the student document.

## Review before publishing

- Every stated objective maps to a section and a learner action. Required activities, usable examples, and source credits survived conversion.
- The first learner action is visible in the intro, and the final task gives learners a way to show what they can do.
- At desktop and narrow widths, headings, long code, images, and controls remain readable. Keyboard focus is visible and the tab order follows the lesson.
- In the actual target view, core instructions and examples remain usable with scripts off. Where supported, try a wrong answer, a correct answer, and reset. Count each passed check once and use the actual number of checks as the total.
- An instructor validates newly drafted examples, assessment answers, and any review notes before publishing.

The visual reference was the local `outputs/curriculum/cat-photo-app.html` lesson. Its cat photo, nickname buttons, and packet simulation are examples of the format and can be replaced with subject-specific material.
