export const maxDraftRequest = 3 * 1024 * 1024
export const maxSourceText = 80_000

export type LessonDraftSource = { kind: 'lesson_plan'; text: string; audience: string }
export type DraftReference = { id: string; title: string; url: string }
export type CurriculumDraft = {
  moduleTitle: string
  lessons: {
    title: string
    article: string
    practice: string[]
    exitPrompt: string
    citationIds: string[]
  }[]
  reviewNotes: string[]
}
export type DraftResponse = CurriculumDraft & { references: DraftReference[] }
