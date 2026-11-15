// Owner: Shivraj. Builds a module's warm-up (pretest) and final check (posttest) from its own
// curriculum, as two parallel forms, so learning gain compares like with like.
// The database (1014, generate_module_assessment) validates, stores answers in activity_keys,
// and falls back to the module's own knowledge checks when this returns nothing.
import { completeDraft } from './completion.ts'

type Row = { type: string; concept: string; content: Record<string, unknown> }

export const assessmentGuide = 'assessment-v1'
const maxSource = 40_000

/** Plain-text view of a module for the model. Answers are never in content (1002). */
export function moduleSource(title: string, lessons: { title: string; activities: Row[] }[]): string {
  const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  const parts = [`Module: ${title}`]
  for (const lesson of lessons) {
    parts.push(`\n## Lesson: ${lesson.title}`)
    for (const a of lesson.activities) {
      const c = a.content
      if (a.type === 'pretest' || a.type === 'posttest') continue
      const choices = Array.isArray(c.choices) ? (c.choices as { label?: string }[]).map(x => `- ${text(x.label)}`).join('\n') : ''
      const fields = Array.isArray(c.fields) ? (c.fields as { prompt?: string }[]).map(f => `- ${text(f.prompt)}`).join('\n') : ''
      const body = [text(c.title), text(c.markdown), text(c.instructions), text(c.caption), text(c.prompt), choices, fields]
        .filter(Boolean).join('\n')
      if (body) parts.push(`\n[${a.type} · concept: ${a.concept}]\n${body}`)
    }
  }
  return parts.join('\n').slice(0, maxSource)
}

const question = {
  type: 'object', additionalProperties: false, required: ['concept', 'prompt', 'choices', 'answer'],
  properties: {
    concept: { type: 'string' },
    prompt: { type: 'string' },
    choices: { type: 'array', items: { type: 'string' } },
    answer: { type: 'integer' },
  },
}
const schema = {
  type: 'object', additionalProperties: false, required: ['pretest', 'posttest'],
  properties: { pretest: { type: 'array', items: question }, posttest: { type: 'array', items: question } },
}

const instructions = `You write the warm-up (pretest) and final check (posttest) for one module of a free coding course for high school students (ages 14-18) in Phoenix, Arizona. Teachers do not write these. The two scores are subtracted to measure learning gain, so the tests must be fair, parallel and focused on what this module teaches.

Read the module and do this:
1. Pick the 3 to 5 most important concepts the module teaches (skills a student should have after it, not trivia). Use short lowercase labels, e.g. "html headings", "for loops".
2. Write two parallel forms with the SAME concepts, in the SAME order, with the SAME number of questions per concept (1 or 2) and the same difficulty. Each form has 4 to 8 questions.
3. The forms must not share a question. Change the scenario, the code or the values, not just the wording. Do not copy the module's own quick questions.
4. Mix question kinds across concepts: understanding (what does this mean), application (which code does X, what does this code show or print), and debugging (what is wrong). Prefer application over pure recall.
5. Each question has 3 or 4 choices and exactly one correct answer. Wrong choices are plausible mistakes a beginner really makes. No "all of the above", "none of the above" or trick wording. Vary the position of the correct choice.
6. Keep prompts short and plain (under 40 words). Put tiny code inline in backticks, one line only. Choices under 15 words.
7. Use only what this module teaches. A student who completed the module should pass the final check; a student who did not should find the warm-up hard but fair.
"answer" is the zero-based index of the correct choice.`

export async function generateAssessment(source: string, key: string, signal: AbortSignal): Promise<unknown> {
  const content = await completeDraft({
    quality: 'standard', key, signal, guideVersion: assessmentGuide, instructions, source, schema,
    limits: { timeoutMs: 150_000, maxTokens: 8_000, effort: 'medium' },
  })
  return content ? JSON.parse(content) : null
}
