import type { Activity } from './model'

export function labPayload(activity: Activity) {
  return {
    prompt: activity.markdown,
    starter_code: activity.code?.starter ?? '',
    tests: [],
    lab: activity.code?.lab ?? { language: 'python' as const, checks: [] },
  }
}
