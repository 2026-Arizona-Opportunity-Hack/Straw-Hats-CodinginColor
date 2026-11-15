import { afterEach, expect, test, vi } from 'vitest'

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('../../shared/supabase.ts', () => ({ supabase: { rpc } }))

afterEach(() => {
  rpc.mockReset()
  vi.unstubAllEnvs()
  vi.resetModules()
})

test('uses the student RPCs without a client grade or class override', async () => {
  vi.stubEnv('VITE_LIVE_STUDENT_CURRICULUM', 'true')
  rpc.mockResolvedValue({ data: { score: 1, is_correct: true }, error: null })
  const student = await import('./index.ts')

  const score = await student.recordAttempt({
    activity_id: 'check-1', class_id: 'ignored', response: { choice_id: 'a' }, client_score: 0, time_on_task_ms: 100,
  })
  expect(rpc).toHaveBeenCalledWith('submit_attempt', {
    p_activity_id: 'check-1', p_response: { choice_id: 'a' }, p_time_on_task_ms: 100,
  })
  expect(score).toEqual({ score: 1, is_correct: true })

  rpc.mockResolvedValueOnce({ data: null, error: null })
  await expect(student.getModule('locked-module')).resolves.toBeNull()
  expect(rpc).toHaveBeenLastCalledWith('my_module_content', { p_module_id: 'locked-module' })
})

test('keeps the existing demo before the live curriculum is enabled', async () => {
  vi.stubEnv('VITE_LIVE_STUDENT_CURRICULUM', '')
  const student = await import('./index.ts')
  expect(await student.listMyCourses()).not.toHaveLength(0)
  expect(rpc).not.toHaveBeenCalled()
})

test('lets a demo student pick a self-paced course', async () => {
  vi.stubEnv('VITE_LIVE_STUDENT_CURRICULUM', '')
  const student = await import('./index.ts')
  expect((await student.listAvailableCourses()).map(c => c.id)).toEqual(['course-ai-academy'])
  expect((await student.listMyCourses()).map(c => c.id)).not.toContain('course-ai-academy')

  await student.enrollInCourse('course-ai-academy')
  expect((await student.listMyCourses()).map(c => c.id)).toContain('course-ai-academy')
  expect(await student.listAvailableCourses()).toEqual([])
  expect((await student.listModuleStatus('course-ai-academy'))[0]).toMatchObject({ module_id: 'mod-ai-what', state: 'available' })

  await expect(student.enrollInCourse('course-ai-basics')).rejects.toThrow('COURSE_NOT_AVAILABLE')
  expect(rpc).not.toHaveBeenCalled()
})

test('enrolls through the RPC and explains its errors in plain words', async () => {
  vi.stubEnv('VITE_LIVE_STUDENT_CURRICULUM', 'true')
  const student = await import('./index.ts')
  rpc.mockResolvedValueOnce({ data: null, error: { message: 'ALREADY_IN_CLASS' } })
  const error = await student.enrollInCourse('course-1').catch((e: unknown) => e)
  expect(rpc).toHaveBeenCalledWith('enroll_in_course', { p_course_id: 'course-1' })
  expect(student.enrollErrorMessage(error)).toBe('You already take this course with your class. Find it under My courses.')
  expect(student.enrollErrorMessage(new Error('COURSE_NOT_AVAILABLE'))).toBe('This course is not open for enrollment right now.')
  expect(student.enrollErrorMessage(new Error('STUDENTS_ONLY'))).toBe('Only student accounts can enroll in courses.')
  expect(student.enrollErrorMessage(new Error('Failed to fetch'))).toMatch(/try again/)
})
