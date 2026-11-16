import { expect, it, vi } from 'vitest'
import { enrollStudent, loadOrgData } from './api.ts'

const { request } = vi.hoisted(() => ({ request: vi.fn() }))

vi.mock('../shared/supabase.ts', async () => {
  const { createClient } = await import('@supabase/supabase-js')
  return { supabase: createClient('http://127.0.0.1:54349', 'test-key', { global: { fetch: request }, auth: { persistSession: false } }) }
})

it.each([
  ['class-a', 'staff_class_progress'],
  ['unknown', undefined],
  [undefined, 'staff_progress_snapshot'],
])('selects the correct progress endpoint for %s', async (classId, endpoint) => {
  request.mockReset().mockImplementation(async (input, init) => {
    const path = new URL(String(input)).pathname
    if (endpoint && path.endsWith('/rpc/' + endpoint)) {
      if (classId) expect(JSON.parse(init.body)).toEqual({ p_class_id: classId })
      return Response.json({ modules: [] })
    }
    if (path.endsWith('/classes')) return Response.json([{ id: 'class-a' }])
    if (path.endsWith('/program_settings')) return Response.json([{ inactive_days: 7 }])
    return Response.json([])
  })
  expect((await loadOrgData(classId)).progress).toEqual([])
  const rpcCalls = request.mock.calls.map(([url]) => new URL(String(url)).pathname).filter(path => path.includes('/rpc/'))
  expect(rpcCalls).toEqual(endpoint ? ['/rest/v1/rpc/' + endpoint] : [])
})

function mockEnrollment(enrolled: boolean, onRoster: boolean) {
  request.mockReset()
    .mockResolvedValueOnce(new Response(null, { status: 204 }))
    .mockResolvedValueOnce(Response.json(enrolled ? [{ student_id: 'student-1' }] : []))
    .mockResolvedValueOnce(Response.json(onRoster ? [{ profile_id: 'student-1' }] : []))
}

it('confirms the membership and the active roster entry for the selected class', async () => {
  mockEnrollment(true, true)

  await expect(enrollStudent('student-1', 'class-1')).resolves.toBeUndefined()

  const [rpc, enrollment, roster] = request.mock.calls.map(([input]) => new URL(String(input)))
  expect(request).toHaveBeenCalledTimes(3)
  expect(rpc.pathname).toBe('/rest/v1/rpc/admin_enroll_student')
  expect(JSON.parse(request.mock.calls[0][1].body)).toEqual({ p_student: 'student-1', p_class: 'class-1' })
  expect(enrollment.pathname).toBe('/rest/v1/enrollments')
  expect(Object.fromEntries(enrollment.searchParams)).toMatchObject({ class_id: 'eq.class-1', student_id: 'eq.student-1' })
  expect(roster.pathname).toBe('/rest/v1/class_students')
  expect(Object.fromEntries(roster.searchParams)).toMatchObject({
    class_id: 'eq.class-1', profile_id: 'eq.student-1', passcode: 'not.is.null',
  })
})

it.each([[false, true], [true, false]])(
  'rejects a successful RPC response unless both rows exist (%s, %s)',
  async (enrolled, onRoster) => {
    mockEnrollment(enrolled, onRoster)
    await expect(enrollStudent('student-1', 'class-1')).rejects.toThrow('Could not confirm the enrollment.')
  },
)

it('keeps the existing error when the database rejects enrollment', async () => {
  request.mockReset().mockResolvedValueOnce(Response.json({ message: 'ALREADY_IN_CLASS' }, { status: 400 }))

  await expect(enrollStudent('student-1', 'class-1')).rejects.toThrow('They are already in that class.')
  expect(request).toHaveBeenCalledTimes(1)
})
