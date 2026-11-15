// Starter quiz: questions, scoring and the saved recommendation. Owner: Shivraj.
// Database side: supabase/migrations/1008_starter_quiz.sql. Scoring runs there, so the
// browser never sees the answer keys. Off (returns null / no-ops) without the live backend.
import { supabase } from '../../shared/supabase.ts'
import type { CourseLevel, DeliveryMode } from '../../shared/types/db.ts'

const backend = import.meta.env.VITE_LIVE_STUDENT_CURRICULUM === 'true' ? supabase : null
export const placementAvailable = backend !== null

export type Subject = 'python' | 'web' | 'ai'

export interface PlacementItem {
  id: string
  position: number
  kind: 'rating' | 'single' | 'multi' | 'knowledge'
  prompt: string
  code: string | null
  choices: { id: string; label: string }[]
  subject: Subject | null
}

/** One answer, with every selection change and the time it took (ms since the question appeared). */
export interface PlacementAnswer {
  value?: string | string[] | Record<string, number>
  events: { choice: string; t: number }[]
  time_ms: number
  not_yet?: boolean
}

export interface RecommendedCourse {
  id: string
  title: string
  description: string
  level: CourseLevel
  delivery_mode: DeliveryMode
}

export interface PlacementResult {
  level: CourseLevel
  knowledge: number
  ability: Record<Subject, number>
  interest: Record<Subject, number>
  pace: 'quick_and_sure' | 'careful' | 'second_guessing' | 'rushing' | 'steady'
  commitment: 'light' | 'steady' | 'committed'
  subject: Subject | null
  course: RecommendedCourse | null
  reasons: string[]
  skip_tip: boolean
  alternatives: { subject: Subject; course: RecommendedCourse | null }[]
}

export interface MyPlacement {
  skipped: boolean
  result: PlacementResult | null
  taken_at: string
  /** The student chose "Don't show again" on the home card (1015). */
  card_hidden?: boolean
}

export async function listPlacementItems(): Promise<PlacementItem[]> {
  if (!backend) return []
  const { data, error } = await backend
    .from('placement_items')
    .select('id, position, kind, prompt, code, choices, subject')
    .order('position')
  if (error) throw new Error(error.message)
  return data as PlacementItem[]
}

export async function submitPlacement(answers: Record<string, PlacementAnswer>): Promise<PlacementResult> {
  if (!backend) throw new Error('The starter quiz needs the live backend.')
  const { data, error } = await backend.rpc('submit_placement', { p_answers: answers })
  if (error) throw new Error(error.message)
  return data as PlacementResult
}

/** Latest quiz outcome, or null if the student never took or skipped it. */
export async function getMyPlacement(): Promise<MyPlacement | null> {
  if (!backend) return null
  const { data, error } = await backend.rpc('my_placement')
  if (error) throw new Error(error.message)
  return (data as MyPlacement | null) ?? null
}

/** Hides the starter-quiz card on Home until the student retakes the quiz (1015). */
export async function hidePlacementCard(): Promise<void> {
  if (!backend) return
  const { error } = await backend.rpc('hide_placement_card')
  if (error) throw new Error(error.message)
}

export async function skipPlacement(): Promise<void> {
  if (!backend) return
  const { error } = await backend.rpc('skip_placement')
  if (error) throw new Error(error.message)
}
