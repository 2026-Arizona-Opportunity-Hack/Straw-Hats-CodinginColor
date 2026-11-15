import assert from 'node:assert/strict'
import { test } from 'vitest'
import { copyBlock, publishModule } from '../src/instructor/model.ts'

const block = { id: 'original', title: 'Quiz', type: 'check', markdown: '', url: '', questions: [{ prompt: 'Pick one', choices: ['A', 'B'], answer: 0, concept: '' }] }

test('saved blocks and duplicates are independent', () => {
  const first = copyBlock(block)
  const second = copyBlock(first)
  second.questions[0].choices[0] = 'Updated'
  assert.notEqual(first.id, second.id)
  assert.equal(first.questions[0].choices[0], 'A')
})

test('publishing keeps block IDs and other module snapshots', () => {
  const current = { id: 'course', title: 'Course', description: '', level: 'Beginner', modules: [
    { id: 'module-a', title: 'Old A', published: true, lessons: [] },
    { id: 'module-b', title: 'Old B', published: true, lessons: [] },
  ] }
  const draft = structuredClone(current)
  draft.modules[1].title = 'Private edits'
  draft.modules[0].lessons = [{ id: 'lesson', title: 'Lesson', activities: [structuredClone(block)] }]
  const released = publishModule(current, draft, draft.modules[0], 'module-a')
  draft.modules[0].lessons[0].activities[0].title = 'Another edit'
  assert.equal(released.modules[0].lessons[0].activities[0].title, 'Quiz')
  assert.equal(released.modules[0].lessons[0].activities[0].id, 'original')
  assert.equal(released.modules[0].revision, 2)
  assert.equal(released.modules[1].title, 'Old B')
  assert.equal(publishModule(released, draft, null, 'module-a').modules[0].published, false)
})
