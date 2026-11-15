export const maxDraftRequest = 3 * 1024 * 1024
export const maxSourceText = 80_000

export const draftQualities = {
  standard: 'Standard · GPT-6.1 Terra',
  high: 'High quality · Claude Opus 5.5',
} as const
export type DraftQuality = keyof typeof draftQualities
export const defaultDraftQuality: DraftQuality = 'standard'
export function isDraftQuality(value: unknown): value is DraftQuality {
  return typeof value === 'string' && Object.hasOwn(draftQualities, value)
}

export type LessonDraftSource = { kind: 'lesson_plan'; text: string; audience: string; quality?: DraftQuality }
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

export const maxSlides = 60
export const maxSelectedImages = 6
export const maxSlideImageBytes = 340 * 1024

export type SlideImage = { id: string; slideNumber: number; dataUrl: string }
export type DraftSlide = { number: number; text: string; notes: string; reviewFlags: string[] }
export type SlideDraftSource = { kind: 'slide_deck'; audience: string; slides: DraftSlide[]; images: SlideImage[]; quality?: DraftQuality }
export type DraftSource = LessonDraftSource | SlideDraftSource
