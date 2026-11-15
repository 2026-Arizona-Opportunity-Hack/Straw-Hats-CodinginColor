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
    activity_id: 'check-1', response: { choice_id: 'a' }, client_score: 0, time_on_task_ms: 100,
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
