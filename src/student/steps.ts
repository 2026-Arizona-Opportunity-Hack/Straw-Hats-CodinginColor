// Owner: Shivraj. Friendly names for each activity type, shared by the module player and the sidebar.
import type { ActivityType } from '../shared/types/activities.ts'
import type { Activity } from '../shared/types/db.ts'

export const STEP_LABEL: Record<ActivityType, string> = {
  pretest: 'Warm-up',
  video: 'Video',
  content: 'Reading',
  slides: 'Slides',
  check: 'Quick question',
  worksheet: 'Worksheet',
  code: 'Coding',
  interactive_html: 'Activity',
  exit: 'Exit ticket',
  posttest: 'Final check',
}

/** The author's title for a step, else its type name. */
export function stepTitle(activity: Activity): string {
  const title = (activity.content as { title?: unknown }).title
  return typeof title === 'string' && title.trim() ? title : STEP_LABEL[activity.type] ?? 'Step'
}

/** Readings need no submission, so they count as done as soon as they are shown. */
export const needsSubmission = (activity: Activity) => activity.type !== 'content'
