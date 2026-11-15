import { readFile } from 'node:fs/promises'
import { createClient } from '@supabase/supabase-js'
import { isDraftQuality, maxDraftRequest, maxSourceText } from '../../src/shared/curriculum/draft.ts'
import { DraftError, draftTimeoutMs } from '../../server/curriculum/completion.ts'
import { generateDraft } from '../../server/curriculum/generate.ts'

export async function POST(request: Request) {
  const reply = (status: number, data: unknown) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } })
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

    const bytes = await request.arrayBuffer()
    if (bytes.byteLength > maxDraftRequest) return reply(413, { error: 'Use a smaller lesson source.' })
    let body
    try { body = JSON.parse(new TextDecoder().decode(bytes)) } catch { return reply(400, { error: 'Send a valid lesson proposal.' }) }
    if (body?.quality !== undefined && !isDraftQuality(body.quality)) return reply(400, { error: 'Choose a valid draft quality.' })
    if (body?.kind !== 'lesson_plan' || typeof body.text !== 'string' || !body.text.trim() || body.text.length > maxSourceText
      || typeof body.audience !== 'string' || body.audience.length > 180) return reply(400, { error: 'Provide a lesson proposal of up to 80,000 characters.' })
    const guide = await readFile(new URL('../../docs/lesson-style-guide.md', import.meta.url), 'utf8')
    const draft = await generateDraft({ kind: 'lesson_plan', text: body.text, audience: body.audience, quality: body.quality }, guide, key, signal)
    return reply(200, draft)
  } catch (error) {
    if (error instanceof DraftError) return reply(error.status, { error: error.message })
    if (signal.aborted || (error instanceof Error && error.name === 'TimeoutError')) {
      return reply(504, { error: 'Drafting took too long. Try a shorter source.' })
    }
    console.error('Curriculum draft failed', { errorType: error instanceof Error ? error.name : 'unknown' })
    return reply(502, { error: 'Could not generate a draft. Try again.' })
  }
}
