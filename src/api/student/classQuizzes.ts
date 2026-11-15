import type { Block, QuizQuestion } from '../../instructor/assignments/model.ts'
import { supabase } from '../../shared/supabase.ts'

export type ClassQuizSummary = { id: string; title: string; class_name: string; submitted: boolean; graded: boolean }
export type LearnerQuestion = Pick<QuizQuestion, 'kind' | 'prompt' | 'choices' | 'points'>
export type LearnerQuizBlock =
  | Pick<Extract<Block, { type: 'text' }>, 'id' | 'type' | 'text'>
  | Pick<Extract<Block, { type: 'link' }>, 'id' | 'type' | 'url' | 'caption'>
  | Pick<Extract<Block, { type: 'html' }>, 'id' | 'type' | 'html'>
  | Pick<Extract<Block, { type: 'completion' }>, 'id' | 'type' | 'title'>
  | { id: string; type: 'question'; question: LearnerQuestion }
  | { id: string; type: 'written' | 'code' | 'file'; prompt: string; starter?: string }

export type QuizResponses = Record<string, number[] | string>
export type ClassQuiz = {
  id: string
  title: string
  className: string
  instructions: string
  dueAt: string | null
  maxAttempts: number | null
  attemptCount: number
  submittedAt: string | null
  gradedAt: string | null
  revision: string
  score: { earned: number; possible: number } | null
  submissionProblem: string | null
  responses: QuizResponses
  feedback: string | null
  canSubmit: boolean
  blocks: LearnerQuizBlock[]
}

export async function listClassQuizzes(): Promise<ClassQuizSummary[]> {
  if (!supabase) return []
  const { data, error } = await supabase.rpc('my_class_quizzes')
  if (error) throw error
  return data as ClassQuizSummary[]
}

export async function getClassQuiz(id: string): Promise<ClassQuiz | null> {
  if (!supabase) return null
  const { data, error } = await supabase.rpc('my_class_quiz', { p_quiz_id: id })
  if (error) throw error
  return data as ClassQuiz | null
}

export async function submitClassQuiz(id: string, responses: QuizResponses, expectedAttemptCount: number, revision: string) {
  if (!supabase) throw new Error('This quiz is unavailable.')
  const { error } = await supabase.rpc('submit_class_quiz', {
    p_quiz_id: id, p_responses: responses, p_expected_attempt_count: expectedAttemptCount, p_revision: revision,
  })
  if (!error) return
  if (error.message === 'QUIZ_CHANGED') throw new Error('Your teacher changed this quiz. Reload before submitting.')
  if (error.message === 'QUIZ_UNSUPPORTED') throw new Error('This quiz uses settings that prevent submission. Ask your teacher.')
  if (error.message === 'QUIZ_UNAVAILABLE') throw new Error('This quiz is no longer available.')
  if (error.message === 'QUIZ_SUBMISSION_CLOSED') throw new Error('This submission changed or the quiz is closed. Reload to see your saved answers.')
  throw new Error('Could not submit this quiz. Check your answers and try again.')
}
