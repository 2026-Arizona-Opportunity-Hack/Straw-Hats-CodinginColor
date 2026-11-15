import { createClient } from '@supabase/supabase-js'
import { DraftError, draftTimeoutMs } from '../../server/curriculum/completion.ts'
import { draftFailure, draftJson as reply } from '../../server/curriculum/response.ts'
import { generateFromRequest } from '../../server/curriculum/request.ts'

export async function POST(request: Request) {
  const key = process.env.OPENROUTER_CURRICULUM_API_KEY
  const url = process.env.VITE_SUPABASE_URL
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY
  const token = /^Bearer (\S+)$/i.exec(request.headers.get('Authorization') ?? '')?.[1]
  if (!token) return reply(401, { error: 'Sign in as an instructor to generate a draft.' })
  if (!key || !url || !anonKey) return reply(503, { error: 'Curriculum conversion is unavailable in this environment.' })

  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(draftTimeoutMs)])
  try {
    const client = createClient(url, anonKey, { global: { headers: { Authorization: 'Bearer ' + token }, fetch: (input, init) => fetch(input, { ...init, signal }) },
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } })
    const { data: { user } } = await client.auth.getUser(token)
    signal.throwIfAborted()
    if (!user) return reply(401, { error: 'Your session expired. Sign in and try again.' })
    const { data: profile } = await client.from('profiles').select('role').eq('id', user.id).maybeSingle()
    signal.throwIfAborted()
    if (profile?.role !== 'instructor' && profile?.role !== 'admin') return reply(403, { error: 'Only instructors and admins can generate drafts.' })

    return generateFromRequest(request, key, signal, {
      owner: user.id,
      async reserve(id, expiresAt) {
        const { data, error } = await client.rpc('reserve_curriculum_image', {
          p_draft_id: id, p_expires_at: new Date(expiresAt).toISOString(),
        })
        if (error) throw new DraftError('The image quota service is unavailable.', 503)
        return typeof data === 'number' ? data : null
      },
    })
  } catch (error) {
    const failure = draftFailure(error, signal)
    return reply(failure.status, { error: failure.error })
  }
}
