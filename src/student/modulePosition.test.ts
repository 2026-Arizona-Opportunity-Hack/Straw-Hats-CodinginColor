import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ModuleWithContent } from '../api/student/index.ts'
import { moduleRevision, openingStep, readPosition, savePosition } from './modulePosition.ts'

const mod: ModuleWithContent = {
  id: 'module', course_id: 'course', position: 1, title: 'Read & check', concept: 'HTML', published: true,
  lessons: [{ id: 'lesson', module_id: 'module', position: 1, title: 'Start', is_checkpoint: false, activities: [
    { id: 'reading', lesson_id: 'lesson', position: 1, type: 'content', concept: 'HTML', points: 0,
      counts_toward_unlock: false, content: { markdown: 'Read this before answering.' } },
    { id: 'question', lesson_id: 'lesson', position: 2, type: 'check', concept: 'HTML', points: 1,
      counts_toward_unlock: true, content: { prompt: 'What did you learn?', choices: [] } },
  ] }],
}
const ids = ['reading', 'question', 'next-reading', 'next-question']

describe('module navigation independent of submission completion', () => {
  it('opens the first reading rather than the first unfinished question', () => {
    expect(openingStep(null, null, ids, 1)).toBe(0)
  })
  it('starts completed and reading-only modules at their first card too', () => {
    expect(openingStep(null, null, ids, 3)).toBe(0)
    expect(openingStep(null, null, ['reading', 'another-reading'], 1)).toBe(0)
    expect(openingStep(null, null, [], -1)).toBe(0)
  })
  it('resumes the last visited activity, even after its answer was submitted', () => {
    expect(openingStep(null, 'question', ids, 3)).toBe(1)
    expect(openingStep(null, 'next-reading', ids, 3)).toBe(2)
  })
  it('honors explicit reachable step links ahead of the bookmark', () => {
    expect(openingStep('1', 'question', ids, 3)).toBe(0)
    expect(openingStep('3', 'reading', ids, 3)).toBe(2)
  })
  it('never lets a deep link or old bookmark bypass an unfinished required step', () => {
    expect(openingStep('4', null, ids, 1)).toBe(1)
    expect(openingStep(null, 'next-reading', ids, 1)).toBe(1)
  })
  it('handles invalid parameters and deleted bookmark activities', () => {
    for (const value of ['bogus', '-1', '0', '1.5', 'Infinity']) {
      expect(openingStep(value, 'question', ids, 3)).toBe(1)
    }
    expect(openingStep(null, 'removed', ids, 3)).toBe(0)
  })
})

describe('browser-local position bookmarks', () => {
  beforeEach(() => {
    const values = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('keeps each student and module separate without recording an answer', () => {
    savePosition('student-a', 'module', 'v1', 'question')
    expect(readPosition('student-a', 'module', 'v1')).toBe('question')
    expect(readPosition('student-b', 'module', 'v1')).toBeNull()
    expect(readPosition('student-a', 'other-module', 'v1')).toBeNull()
    expect(readPosition(undefined, 'module', 'v1')).toBeNull()
  })
  it('invalidates the saved position when lesson content or ordering changes', () => {
    const revision = moduleRevision(mod)
    savePosition('student-a', mod.id, revision, 'question')
    const changed = structuredClone(mod)
    changed.lessons[0].activities[0].content = { markdown: 'A newly revised explanation.' }
    expect(readPosition('student-a', mod.id, moduleRevision(changed))).toBeNull()
    const reordered = structuredClone(mod)
    reordered.lessons[0].activities.reverse()
    expect(readPosition('student-a', mod.id, moduleRevision(reordered))).toBeNull()
    expect(moduleRevision(structuredClone(mod))).toBe(revision)
  })
  it('ignores malformed bookmarks and works when storage is blocked', () => {
    vi.stubGlobal('localStorage', { getItem: () => 'bad json' })
    expect(readPosition('student-a', 'module', 'v1')).toBeNull()
    vi.stubGlobal('localStorage', { getItem: () => '{"revision":"v1","activityId":7}' })
    expect(readPosition('student-a', 'module', 'v1')).toBeNull()
    vi.stubGlobal('localStorage', { getItem: () => { throw Error('blocked') }, setItem: () => { throw Error('blocked') } })
    expect(readPosition('student-a', 'module', 'v1')).toBeNull()
    expect(() => savePosition('student-a', 'module', 'v1', 'reading')).not.toThrow()
  })
})
