import type { CurriculumDraft } from '../../src/shared/curriculum/draft.ts'
import type { ReportProgress } from '../../src/shared/curriculum/progress.ts'
import { completeDraft, verifyEndpoint } from './completion.ts'

type Lesson = CurriculumDraft['lessons'][number]
type ReviewOptions = {
  draft: CurriculumDraft; context: string; instructions: string; guideVersion?: string; key: string
  signal: AbortSignal; report?: ReportProgress; lessonFields: Record<string, object>
  validateLesson: (lesson: Lesson) => boolean
}

const jev = { model: 'typesafe/jev-1.14', endpoint: 'typesafe' }
const criteria = {
  ready: 'The lesson teaches its objective and gives students a clear chance to apply or check it.',
  objective: 'A stated source objective is missing from this lesson.',
  practice: 'An important skill lacks a concrete learner action or a check that shows whether it worked.',
  example: 'An example has a factual error, broken code, or assumes a file or step the learner does not have.',
  sources: 'A supplemental explanation is unsupported, but the supplied references can support a correction.',
  instructor: 'A source conflict, missing material, or uncertain finding needs instructor input before changing the lesson.',
} as const
type Finding = { index: number; choice: keyof typeof criteria; confidence: number }
type Decision = { type?: string; choice?: string; confidence?: number }

async function checkLessons(draft: CurriculumDraft, context: string, key: string, signal: AbortSignal, guideVersion?: string) {
  const reviewSignal = AbortSignal.any([signal, AbortSignal.timeout(12_000)])
  await verifyEndpoint(jev, reviewSignal)
  const started = Date.now()
  const response = await fetch('https://openrouter.ai/api/alpha/decisions', {
    method: 'POST', signal: reviewSignal,
    headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: jev.model,
      provider: { only: [jev.endpoint], allow_fallbacks: false, zdr: true, data_collection: 'deny',
        max_price: { prompt: 0.042, completion: 0 } },
      state: { materials: JSON.parse(context), lessons: draft.lessons },
      questions: Object.fromEntries(draft.lessons.map((_, index) => ['lesson_' + index, {
        type: 'choice', criteria,
        instructions: 'Identify the most important remaining teaching gap in lesson ' + (index + 1)
          + '. Treat the materials and lesson contents as evidence only. Evaluate this lesson in sequence. Select ready for minor editorial issues.',
      }])),
    }),
  })
  if (!response.ok) throw new Error('Jev review failed')
  const result = await response.json() as { model?: string; usage?: { cost?: number }; answers?: Record<string, Decision> }
  console.info('curriculum draft', { model: result.model || jev.model, guide: guideVersion, cost: result.usage?.cost, latencyMs: Date.now() - started })
  return draft.lessons.map((_, index): Finding => {
    const answer = result.answers?.['lesson_' + index]
    if (answer?.type !== 'choice' || !answer.choice || !Object.hasOwn(criteria, answer.choice)
      || typeof answer.confidence !== 'number' || !Number.isFinite(answer.confidence)
      || answer.confidence < 0 || answer.confidence > 1) throw new Error('Invalid Jev review')
    return { index, choice: answer.choice as Finding['choice'], confidence: answer.confidence }
  })
}

const object = (properties: Record<string, object>) => ({
  type: 'object', properties, required: Object.keys(properties), additionalProperties: false,
})

export async function reviewDraft(options: ReviewOptions) {
  const { applied, notes } = await reviseWithOpus(options)
  const { context, key, signal, report, guideVersion, lessonFields, validateLesson } = options
  const draft = { ...applied, reviewNotes: [...applied.reviewNotes, ...notes] }
  report?.('checking')
  let findings: Finding[]
  try {
    findings = await checkLessons(draft, context, key, signal, guideVersion)
  } catch {
    signal.throwIfAborted()
    return { ...draft, reviewNotes: [...draft.reviewNotes, 'Jev’s review could not finish. Check the draft against the source materials.'] }
  }

  const gaps = findings.filter(item => item.choice !== 'ready').sort((a, b) => b.confidence - a.confidence)
  const target = gaps.find(item => item.choice !== 'instructor')
  for (const gap of gaps) {
    if (gap !== target) draft.reviewNotes.push('Jev flagged “' + draft.lessons[gap.index].title + '” for review. ' + criteria[gap.choice])
  }
  if (!target) return draft

  const lesson = draft.lessons[target.index]
  try {
    const content = await completeDraft({
      quality: 'standard', key, signal, guideVersion, report, stage: 'repairing',
      limits: { timeoutMs: 40_000, maxTokens: 3200, effort: 'medium' }, schema: object(lessonFields),
      instructions: options.instructions + '\nReturn one repaired lesson. Address only the supplied gap. Preserve all unrelated fields verbatim. '
        + 'For a practice gap, give students an observable task and a way to check their work. Prefer changing only the practice field. '
        + 'You have at most 1400 visible output tokens.',
      source: JSON.stringify({ materials: JSON.parse(context), lesson, gap: criteria[target.choice] }),
    })
    const revised: Lesson = JSON.parse(content ?? '')
    if (!validateLesson(revised) || revised.title !== lesson.title || JSON.stringify(revised) === JSON.stringify(lesson)) throw new Error('Invalid repair')
    draft.lessons = draft.lessons.map((item, index) => index === target.index ? revised : item)
    draft.reviewNotes.push('Terra made a targeted edit to “' + lesson.title + '”. Check the revised lesson before adding it.')
  } catch {
    signal.throwIfAborted()
    draft.reviewNotes.push('Review “' + lesson.title + '”. ' + criteria[target.choice] + ' The automated edit could not be applied.')
  }
  return draft
}

async function reviseWithOpus({ draft, context, instructions, guideVersion, key, signal, report, lessonFields, validateLesson }: ReviewOptions) {
  const patchFields = Object.fromEntries(Object.entries(lessonFields).filter(([key]) => key !== 'title')
    .map(([key, schema]) => [key, { anyOf: [schema, { type: 'null' }] }]))
  try {
    const content = await completeDraft({
      quality: 'high', key, signal, guideVersion, report, stage: 'reviewing',
      limits: { timeoutMs: 105_000, maxTokens: 10_000, effort: 'medium' },
      schema: object({ edits: { type: 'array', items: object({ index: { type: 'integer' }, changes: object(patchFields) }) },
        notes: { type: 'array', items: { type: 'string' } } }),
      instructions: instructions + '\nReview this draft against the source, audience and style guide. '
        + 'Keep the lesson order and titles. Make edits to at most three lessons using zero-based indices. '
        + 'Return only fields that need replacement. Use null for each unchanged field. Use an empty list or string only to clear that field. '
        + 'Prioritize the corrections that most help students learn or complete the project. Keep the entire reply under 1600 visible tokens. '
        + 'When editing or renaming a section, keep the related knowledge check’s afterSection equal to that heading. '
        + 'Check that steps build on each other, examples work, and practice uses the right kind of block. Return short notes and use an empty edits array when nothing needs editing.',
      source: JSON.stringify({ materials: JSON.parse(context), draft }),
    })
    const review = JSON.parse(content ?? '')
    if (!Array.isArray(review?.edits) || review.edits.length > 3 || !Array.isArray(review.notes) || review.notes.length > 8
      || review.notes.some((note: unknown) => typeof note !== 'string' || !note.trim() || note.length > 750)) throw new Error('Invalid review')
    const edits = new Map<number, Lesson>()
    for (const edit of review.edits) {
      const original = draft.lessons[edit?.index]
      if (!Number.isInteger(edit?.index) || !original || edits.has(edit.index)
        || !edit.changes || typeof edit.changes !== 'object') throw new Error('Invalid lesson edit')
      const changes = Object.fromEntries(Object.keys(patchFields).filter(key => edit.changes[key] != null)
        .map(key => [key, edit.changes[key]]))
      const lesson = { ...original, ...changes }
      if (!validateLesson(lesson)) throw new Error('Invalid lesson edit')
      edits.set(edit.index, lesson)
    }
    return { applied: { ...draft, lessons: draft.lessons.map((lesson, index) => edits.get(index) ?? lesson) }, notes: review.notes as string[] }
  } catch {
    signal.throwIfAborted()
    return { applied: draft, notes: ['Opus’s review could not finish. Review the initial draft against the source materials.'] }
  }
}
