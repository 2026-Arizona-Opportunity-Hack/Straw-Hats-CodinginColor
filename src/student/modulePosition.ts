import type { ModuleWithContent } from '../api/student/index.ts'

type Position = { revision: string; activityId: string }
const key = (studentId: string, moduleId: string) => `cic-module-position:v1:${studentId}:${moduleId}`

/** The student payload has no publication revision. Fingerprint its content so
 * edits and reordered steps invalidate a bookmark without storing lesson text. */
export function moduleRevision(mod: ModuleWithContent): string {
  const text = JSON.stringify(mod.lessons)
  let hash = 2166136261
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619)
  return `${text.length}:${hash >>> 0}`
}

export function readPosition(studentId: string | undefined, moduleId: string, revision: string): string | null {
  if (!studentId) return null
  try {
    const saved: Position | null = JSON.parse(localStorage.getItem(key(studentId, moduleId)) ?? 'null')
    return saved?.revision === revision && typeof saved.activityId === 'string' ? saved.activityId : null
  } catch {
    return null
  }
}

export function savePosition(studentId: string | undefined, moduleId: string, revision: string, activityId: string) {
  if (!studentId) return
  try {
    localStorage.setItem(key(studentId, moduleId), JSON.stringify({ revision, activityId } satisfies Position))
  } catch {
    // Browser storage may be blocked/full. URL navigation still works.
  }
}

/** Navigation is independent of submission completion. New visits start at
 * the first card; explicit links and bookmarks still obey the unlock boundary. */
export function openingStep(stepParam: string | null, savedId: string | null, activityIds: string[], reachable: number): number {
  const asked = Number(stepParam) - 1
  const saved = savedId ? activityIds.indexOf(savedId) : -1
  const wanted = Number.isInteger(asked) && asked >= 0 ? asked : Math.max(saved, 0)
  return Math.max(0, Math.min(wanted, reachable, activityIds.length - 1))
}
