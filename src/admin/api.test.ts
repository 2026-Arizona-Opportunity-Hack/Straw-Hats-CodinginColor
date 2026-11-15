import { expect, it, vi } from 'vitest'
import { loadOrgData } from './api.ts'

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
