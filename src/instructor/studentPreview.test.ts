import { expect, it } from 'vitest'
import { curriculumUrl } from '../shared/ui/curriculumUrl'
import { newActivity } from './model'
import { practiceAttempt, previewActivity } from './studentPreview'

it('uses the published quiz choice IDs and grades practice answers in memory', async () => {
  const activity = previewActivity({
    ...newActivity('check'),
    questions: [{ prompt: 'What makes a headline?', concept: 'Headings', choices: ['', 'h1', 'img'], answer: 1 }],
  }, 'lesson', 0)
  const submit = (choice_id: string) => practiceAttempt(activity, { activity_id: activity.id, response: { choice_id }, time_on_task_ms: 0 })
  await expect(submit('a')).resolves.toEqual({ score: 1, is_correct: true })
  await expect(submit('b')).resolves.toEqual({ score: 0, is_correct: false })
})

it('allows uploaded raster images only in the image source', () => {
  const png = 'data:image/png;base64,AAAA'
  expect(curriculumUrl(png, 'src')).toBe(png)
  expect(curriculumUrl(png, 'href')).toBe('')
  expect(curriculumUrl('data:image/svg+xml;base64,AAAA', 'src')).toBe('')
})
