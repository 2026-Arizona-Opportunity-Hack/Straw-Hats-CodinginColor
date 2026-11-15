// Owner: Shivraj. POST { moduleId } → generates the module's warm-up and final check.
// The AI writes two parallel forms from the module's curriculum; if it is unavailable or its
// output is invalid, the database builds them from the module's own knowledge checks (1014).
import { createClient } from '@supabase/supabase-js'
import { generateAssessment, moduleSource } from '../../server/curriculum/assessment.ts'
import { draftJson as reply } from '../../server/curriculum/response.ts'

type Lesson = { title: string; position: number; activities: { type: string; concept: string; position: number; content: Record<string, unknown> }[] }

export async function POST(request: Request) {
  const key = process.env.OPENROUTER_CURRICULUM_API_KEY
  const url = process.env.VITE_SUPABASE_URL
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY
  const token = /^Bearer (\S+)$/i.exec(request.headers.get('Authorization') ?? '')?.[1]
  if (!token) return reply(401, { error: 'Sign in as an instructor to generate tests.' })
  if (!url || !anonKey) return reply(503, { error: 'Test generation is unavailable in this environment.' })
  const body = await request.json().catch(() => null) as { moduleId?: unknown } | null
  const moduleId = typeof body?.moduleId === 'string' && /^[0-9a-f-]{36}$/i.test(body.moduleId) ? body.moduleId : null
  if (!moduleId) return reply(400, { error: 'Choose a module.' })

  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(170_000)])
  // Runs as the signed-in instructor: RLS and generate_module_assessment check they may edit it.
  const client = createClient(url, anonKey, {
    global: { headers: { Authorization: 'Bearer ' + token } },
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  })
  const { data: { user } } = await client.auth.getUser(token)
  if (!user) return reply(401, { error: 'Your session expired. Sign in and try again.' })

  const { data: mod } = await client.from('modules')
    .select('title, lessons(title, position, activities(type, concept, position, content))')
    .eq('id', moduleId).maybeSingle() as { data: { title: string; lessons: Lesson[] } | null }
  if (!mod) return reply(404, { error: 'Module not found, or you cannot edit it.' })

  let ai: unknown = null
  if (key) {
    const lessons = [...mod.lessons].sort((a, b) => a.position - b.position)
      .map(l => ({ title: l.title, activities: [...l.activities].sort((a, b) => a.position - b.position) }))
    try {
      ai = await generateAssessment(moduleSource(mod.title, lessons), key, signal)
    } catch (error) {
      console.warn('assessment AI failed, using checks', { errorType: error instanceof Error ? error.name : 'unknown' })
    }
  }

  const { data, error } = await client.rpc('generate_module_assessment', { p_module_id: moduleId, p_ai: ai })
  if (error) {
    const status = /NOT_ALLOWED/.test(error.message) ? 403 : /MODULE_NOT_FOUND/.test(error.message) ? 404 : 500
    return reply(status, { error: status === 403 ? 'Only the course owner or an admin can generate tests.' : 'Could not save the tests. Try again.' })
  }
  return reply(200, data)
}
