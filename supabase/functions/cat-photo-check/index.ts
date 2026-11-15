import { createClient } from 'npm:@supabase/supabase-js@2.119.0'
import { parse } from 'npm:parse5@8.1.1'
import { catPhotoChecks } from './checks.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: cors })
const url = Deno.env.get('SUPABASE_URL')!
const anon = Deno.env.get('SUPABASE_ANON_KEY')!
const server = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

async function smallBody(request: Request): Promise<unknown> {
  const reader = request.body?.getReader()
  const decoder = new TextDecoder()
  let bytes = 0
  let body = ''
  if (!reader) return null
  for (;;) {
    const { value, done } = await reader.read()
    if (done) return JSON.parse(body + decoder.decode())
    bytes += value.byteLength
    if (bytes > 100_000) {
      await reader.cancel()
      return null
    }
    body += decoder.decode(value, { stream: true })
  }
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response(null, { headers: cors })
  if (request.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405)
  const jwt = request.headers.get('Authorization')?.match(/^Bearer (\S+)$/i)?.[1]
  if (!jwt) return json({ error: 'SIGN_IN_REQUIRED' }, 401)
  const student = createClient(url, anon, {
    auth: { persistSession: false },
    global: { headers: { Authorization: 'Bearer ' + jwt } },
  })
  const { data: user, error: authError } = await student.auth.getUser(jwt)
  if (authError || !user.user) return json({ error: 'SIGN_IN_REQUIRED' }, 401)

  const body = await smallBody(request).catch(() => null) as { activityId?: unknown; source?: unknown } | null
  if (typeof body?.activityId !== 'string' || !/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(body.activityId) ||
      typeof body.source !== 'string' || new TextEncoder().encode(body.source).length > 48_000) {
    return json({ error: 'INVALID_LAB_SOURCE' }, 400)
  }
  const { data: activity, error: activityError } = await student.from('activities')
    .select('id').eq('id', body.activityId).eq('type', 'code').eq('content->lab->>verifier', 'cat-photo-v1').maybeSingle()
  if (activityError || !activity) return json({ error: 'LAB_UNAVAILABLE' }, 404)

  const checks = catPhotoChecks(parse(body.source))
  if (checks.some(check => !check.passed)) return json({ checks, completed: false })

  const { error } = await server.rpc('record_cat_photo_pass', {
    p_student_id: user.user.id, p_activity_id: body.activityId, p_source: body.source,
  })
  if (error) return json({ error: 'COULD_NOT_RECORD_COMPLETION' }, 409)
  return json({ checks, completed: true })
})
