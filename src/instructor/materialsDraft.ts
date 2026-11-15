import { articleHeadings } from '../shared/curriculum/articleHeadings'
import type { DraftResponse, DraftSource } from '../shared/curriculum/draft'
import type { ReportProgress } from '../shared/curriculum/progress'
import { requestCurriculum, sampleCurriculum } from './requestCurriculum'
import { blankQuestion, id, newActivity, newLesson, type Activity, type Module } from './model'

export type DraftQaFixture = { scenario: 'preview' | 'image' | 'limit'; src: string; alt: string }
export type MaterialDraft = { module: Module; imageTicket?: string; fixture?: DraftQaFixture }

export async function requestMaterialsDraft(source: DraftSource, signal: AbortSignal, report: ReportProgress): Promise<MaterialDraft> {
  if (sampleCurriculum) {
    const text = source.kind === 'lesson_plan' ? source.text : source.slides.filter(slide => slide.text.trim())
      .map(slide => '## Slide ' + slide.number + '\n\n' + slide.text).join('\n\n')
    if (!text) throw new Error('The local preview needs visible text in your materials.')
    const titleSource = source.kind === 'slide_deck' ? source.slides.find(slide => slide.text.trim())?.text || text : text
    const title = titleSource.split('\n').find(line => line.trim())?.replace(/^#+\s*/, '').trim().slice(0, 100) || 'Imported lesson'
    return { module: materialDraft({
      moduleTitle: title, references: [],
      lessons: [{ title, article: text, citationIds: [],
        practice: ['Try one example from the reading. What did you change?'], exitPrompt: 'What did you learn, and what would you try next?' }],
    }) }
  }
  const body = await requestCurriculum<DraftResponse>(source, signal, report)
  if (!body?.lessons) throw new Error('Curriculum conversion is unavailable. Try again later.')
  return { module: materialDraft(body), imageTicket: body.imageTicket }
}

export function materialDraft(draft: Omit<DraftResponse, 'reviewNotes'>): Module {
  const references = new Map(draft.references.map(item => [item.id, item]))
  const lessons = draft.lessons.map(item => {
    const lesson = newLesson(item.title)
    const links = [...new Set(item.citationIds)].flatMap(key => {
      const ref = references.get(key)
      return ref ? [`- [${ref.title}](${ref.url})`] : []
    })
    const article = item.article.trim()
    const lines = article.split('\n')
    const headings = articleHeadings(article)
    const checksAt = new Map<number, Activity[]>()
    const unplaced: Activity[] = []
    for (const { prompt, choices, answer, afterSection } of item.knowledgeChecks ?? []) {
      const check = { ...newActivity('check'), title: 'Check your understanding',
        questions: [{ ...blankQuestion(), prompt, choices, answer }] }
      const matches = headings.filter(heading => heading.text === afterSection?.trim())
      if (matches.length !== 1) {
        unplaced.push(check)
        continue
      }
      const boundary = headings[headings.indexOf(matches[0]) + 1]?.line
      const end = boundary === undefined ? lines.length : boundary - 1
      checksAt.set(end, [...checksAt.get(end) ?? [], check])
    }

    const addReading = (markdown: string) => {
      const text = markdown.trim()
      if (!text) return
      const heading = lesson.activities.length ? articleHeadings(text)[0] : undefined
      const title = heading?.line === 1 ? heading.text : item.title
      const body = heading?.line === 1 ? text.slice(text.indexOf('\n') + 1).trim() : text
      lesson.activities.push({ ...newActivity('content'), title, markdown: body || text, presentation: 'cic-article' })
    }

    let start = 0
    for (const [end, checks] of [...checksAt].sort(([a], [b]) => a - b)) {
      addReading(lines.slice(start, end).join('\n'))
      lesson.activities.push(...checks)
      start = end
    }
    addReading([
      lines.slice(start).join('\n').trim(),
      item.practice.length ? '## Try it yourself\n\n' + item.practice.map(prompt => '- ' + prompt).join('\n') : '',
      links.length ? '## References\n\n' + links.join('\n') : '',
    ].filter(Boolean).join('\n\n'))
    lesson.activities.push(...unplaced)
    if (item.exitPrompt.trim()) lesson.activities.push({
      ...newActivity('exit'), title: 'Show what you learned', format: 'open-ended',
      questions: [{ ...blankQuestion(), prompt: item.exitPrompt }],
    })
    return lesson
  })
  return { id: id(), title: draft.moduleTitle, lessons, published: false }
}
