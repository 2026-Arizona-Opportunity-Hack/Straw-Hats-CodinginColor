import { expect, it, vi } from 'vitest'
import { includeDraftLab } from './draftLab'
import { newLesson, newActivity } from './model'

vi.mock('../shared/supabase', () => ({ supabase: null }))

it('adds the starter and checks to the chosen lesson without persisting the solution or modifying the original draft', () => {
  const first = newLesson('Review')
  const second = newLesson('Build')
  second.activities = [newActivity('content'), newActivity('worksheet'), newActivity('exit')]
  const module = { id: 'module', title: 'Cafe Menu', published: false, lessons: [first, second] }
  const selected = { lessonId: second.id, reviewNotes: ['Private note'], lab: {
    title: 'Style your menu', instructions: 'Add padding.',
    starter: { html: '<main>Menu</main>', css: 'main {}' },
    solution: { html: '<main>Reference solution</main>', css: 'main { padding: 20px }' },
    checks: [{ name: 'Spacing', selector: 'main', expected: '20px' }],
  } }
  expect(includeDraftLab(module, null)).toBe(module)
  const next = includeDraftLab(module, selected)
  expect(next.published).toBe(false)
  expect(next.lessons[0]).toBe(first)
  expect(next.lessons[1].activities.map(activity => activity.type)).toEqual(['content', 'code', 'worksheet', 'exit'])
  expect(next.lessons[1].activities[1].code?.starter).toBe(selected.lab.starter.html)
  expect(JSON.stringify(next)).not.toContain('Reference solution')
  expect(JSON.stringify(next)).not.toContain('Private note')
  expect(module.lessons[1].activities).toHaveLength(3)
})
