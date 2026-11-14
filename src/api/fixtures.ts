// Mock curriculum shared by student and instructor mocks.
// Replace with real seed data in supabase/seed.sql; keep shapes in sync with src/shared/types.
import type { Activity, Course, Lesson, Module } from '../shared/types/db.ts'

export const LOOP_DEMO_HTML = `<!doctype html>
<html><body style="font-family:system-ui;padding:16px">
<h2>How many times does it print?</h2>
<pre>for i in range(3):\n    print("hi")</pre>
<button id="a">2</button> <button id="b">3</button> <button id="c">4</button>
<p id="out" role="status"></p>
<script>
  function pick(right) {
    document.getElementById('out').textContent = right ? 'Correct!' : 'Not quite. Try again.';
    if (right) parent.postMessage({ type: 'cic:complete', score: 1 }, '*');
  }
  document.getElementById('a').onclick = () => pick(false);
  document.getElementById('b').onclick = () => pick(true);
  document.getElementById('c').onclick = () => pick(false);
</script>
</body></html>`

export const MOCK_COURSES: Course[] = [
  {
    id: 'course-intro-python',
    title: 'Intro to Python',
    description: 'Variables, conditionals and loops. Self-paced, like a code.org lesson.',
    level: 'beginner',
    delivery_mode: 'self_paced',
    is_library: true,
    copied_from: null,
    owner_id: null,
    published: true,
  },
  {
    id: 'course-ai-basics',
    title: 'AI Basics',
    description: 'What AI is, how it learns, and how to use it responsibly. Instructor-led.',
    level: 'beginner',
    delivery_mode: 'instructor_led',
    is_library: true,
    copied_from: null,
    owner_id: null,
    published: true,
  },
]

export const MOCK_MODULES: Module[] = [
  { id: 'mod-variables', course_id: 'course-intro-python', position: 1, title: 'Variables', concept: 'variables', published: true },
  { id: 'mod-loops', course_id: 'course-intro-python', position: 2, title: 'Loops', concept: 'loops', published: true },
]

export const MOCK_LESSONS: Lesson[] = [
  { id: 'lesson-variables-1', module_id: 'mod-variables', position: 1, title: 'Storing values', is_checkpoint: true },
  { id: 'lesson-loops-1', module_id: 'mod-loops', position: 1, title: 'Repeating with for', is_checkpoint: true },
]

export const MOCK_ACTIVITIES: Activity[] = [
  {
    id: 'act-var-text',
    lesson_id: 'lesson-variables-1',
    position: 1,
    type: 'content',
    concept: 'variables',
    points: 0,
    counts_toward_unlock: false,
    content: { markdown: '## Variables\nA variable is a name that stores a value: `age = 15`.' },
  },
  {
    id: 'act-var-check',
    lesson_id: 'lesson-variables-1',
    position: 2,
    type: 'check',
    concept: 'variables',
    points: 1,
    counts_toward_unlock: true,
    content: {
      prompt: 'After `x = 5` then `x = x + 2`, what is x?',
      choices: [
        { id: 'a', label: '5' },
        { id: 'b', label: '7' },
        { id: 'c', label: '2' },
      ],
    },
  },
  {
    id: 'act-loops-interactive',
    lesson_id: 'lesson-loops-1',
    position: 1,
    type: 'interactive_html',
    concept: 'loops',
    points: 1,
    counts_toward_unlock: true,
    content: { html: LOOP_DEMO_HTML, instructions: 'Answer the question in the page.', reports_score: true },
  },
  {
    id: 'act-loops-code',
    lesson_id: 'lesson-loops-1',
    position: 2,
    type: 'code',
    concept: 'loops',
    points: 2,
    counts_toward_unlock: true,
    content: {
      prompt: 'Print the numbers 1 to 5, one per line.',
      starter_code: 'for i in range(___):\n    print(i)\n',
      tests: [{ name: 'prints 1..5', assertion: "assert _stdout.split() == ['1','2','3','4','5']" }],
    },
  },
]

/** Small delay so loading states are visible while building UI on mocks. */
export function mockDelay<T>(value: T, ms = 200): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(structuredClone(value)), ms))
}
