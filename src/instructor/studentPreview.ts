import type { Activity as StudentActivity, Lesson as StudentLesson } from '../shared/types/db'
import type { SubmitActivity } from '../student/LessonContent'
import { activityContent } from './liveStore'
import type { Activity, Lesson } from './model'

export function previewActivity(activity: Activity, lessonId: string, index: number): StudentActivity {
  return {
    id: activity.id, lesson_id: lessonId, position: index + 1, type: activity.type, concept: activity.title,
    points: 0, counts_toward_unlock: true, content: activityContent(activity) as unknown as StudentActivity['content'],
  }
}

export function previewLesson(lesson: Lesson, moduleId: string, index: number): StudentLesson & { activities: StudentActivity[] } {
  return {
    id: lesson.id, module_id: moduleId, position: index + 1, title: lesson.title, is_checkpoint: false,
    activities: lesson.activities.map((activity, i) => previewActivity(activity, lesson.id, i)),
  }
}

/** Use only the instructor's preview content. This never calls the student submission API. */
export async function practiceAttempt(activity: StudentActivity, { response }: Parameters<SubmitActivity>[0]): ReturnType<SubmitActivity> {
  const answers = response as { choice_id?: string; answers?: Record<string, string> }
  let score: number | null = null
  if (activity.type === 'check' || activity.type === 'exit') {
    const { answer } = activity.content as { answer?: string }
    if (answer) score = answer === answers.choice_id ? 1 : 0
  } else if (activity.type === 'pretest' || activity.type === 'posttest') {
    const { items } = (activity as StudentActivity<'pretest' | 'posttest'>).content
    const graded = items.filter(item => item.answer)
    if (graded.length) score = Math.round(1000 * graded.filter(item => item.answer === answers.answers?.[item.id]).length / graded.length) / 1000
  }
  return { score, is_correct: score === null ? null : score === 1 }
}
