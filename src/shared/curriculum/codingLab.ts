import type { LabCheck } from '../types/activities.ts'

export type CodingLabRequest = {
  kind: 'coding_lab'
  moduleTitle: string
  lessonTitle: string
  audience: string
  additionalInstructions?: string
  material: string
  lessons: { title: string; article: string }[]
}

export type DraftCodingLab = {
  title: string
  instructions: string
  starter: { html: string; css: string }
  solution: { html: string; css: string }
  checks: LabCheck[]
}

export type CodingLabResponse = { lab: DraftCodingLab | null; reviewNotes: string[] }
