import type { DraftReference, DraftResponse, DraftSource } from '../shared/curriculum/draft'
import { supabase } from '../shared/supabase'
import { blankQuestion, id, newActivity, newLesson, type Module } from './model'

export type MaterialDraft = { module: Module; reviewNotes: string[]; references: DraftReference[] }

export async function requestMaterialsDraft(source: DraftSource, signal: AbortSignal): Promise<MaterialDraft> {
  if (!supabase) {
    const text = source.kind === 'lesson_plan' ? source.text : source.slides.filter(slide => slide.text.trim())
      .map(slide => '## Slide ' + slide.number + '\n\n' + slide.text).join('\n\n')
    if (!text) throw new Error('The local preview needs visible text in your materials.')
    const flags = source.kind === 'slide_deck' ? source.slides.flatMap(slide => slide.reviewFlags.map(flag => `Slide ${slide.number}: ${flag}`)) : []
    const titleSource = source.kind === 'slide_deck' ? source.slides.find(slide => slide.text.trim())?.text || text : text
    const title = titleSource.split('\n').find(line => line.trim())?.replace(/^#+\s*/, '').trim().slice(0, 100) || 'Imported lesson'
    return materialDraft({
      moduleTitle: title, references: [], reviewNotes: ['Local preview. Connect the converter to generate a lesson from this material.', ...flags],
      lessons: [{ title, article: text, citationIds: [],
        practice: ['Try one example from the reading. What did you change?'], exitPrompt: 'What did you learn, and what would you try next?' }],
    })
  }
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Sign in as an instructor to generate a draft.')
  const response = await fetch('/api/curriculum/draft', {
    method: 'POST', headers: { Authorization: 'Bearer ' + session.access_token, 'Content-Type': 'application/json' },
    body: JSON.stringify(source), signal,
  })
  const body = await response.json().catch(() => null)
  if (!response.ok || !body?.lessons) throw new Error(body?.error || 'Curriculum conversion is unavailable. Try again later.')
  return materialDraft(body)
}

export function materialDraft(draft: DraftResponse): MaterialDraft {
  const references = new Map(draft.references.map(item => [item.id, item]))
  const lessons = draft.lessons.map(item => {
    const lesson = newLesson(item.title)
    const links = [...new Set(item.citationIds)].flatMap(key => {
      const ref = references.get(key)
      return ref ? [`- [${ref.title}](${ref.url})`] : []
    })
    const markdown = item.article.trim() + (links.length ? '\n\n## References\n\n' + links.join('\n') : '')
    lesson.activities = [
      { ...newActivity('content'), title: item.title, markdown, presentation: 'cic-article' },
      { ...newActivity('worksheet'), title: 'Try it yourself', format: 'open-ended',
        questions: item.practice.map(prompt => ({ ...blankQuestion(), prompt })) },
      { ...newActivity('exit'), title: 'Show what you learned', format: 'open-ended',
        questions: [{ ...blankQuestion(), prompt: item.exitPrompt }] },
    ]
    return lesson
  })
  return { module: { id: id(), title: draft.moduleTitle, lessons, published: false },
    references: draft.references, reviewNotes: draft.reviewNotes }
}
