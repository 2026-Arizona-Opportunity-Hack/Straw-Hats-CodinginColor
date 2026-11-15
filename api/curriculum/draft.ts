import { readFile } from 'node:fs/promises'
import { createClient } from '@supabase/supabase-js'
import { isDraftQuality, maxDraftRequest } from '../../src/shared/curriculum/draft.ts'
import { draftTimeoutMs } from '../../server/curriculum/completion.ts'
import { parseSource } from '../../server/curriculum/source.ts'
import { draftFailure, draftJson as reply, draftResponse } from '../../server/curriculum/response.ts'
import { generateCodingLab, parseCodingLabRequest } from '../../server/curriculum/codingLab.ts'
import { generateDraft } from '../../server/curriculum/generate.ts'

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

    const bytes = await request.arrayBuffer()
    if (bytes.byteLength > maxDraftRequest) return reply(413, { error: 'Use a smaller lesson source.' })
    let body
    try { body = JSON.parse(new TextDecoder().decode(bytes)) } catch { return reply(400, { error: 'Send valid lesson materials.' }) }
    if (body?.kind === 'coding_lab') {
      const lab = parseCodingLabRequest(body)
      if (!lab) return reply(400, { error: 'Provide valid lesson material for the coding lab.' })
      const guide = await readFile(new URL('../../docs/lesson-style-guide.md', import.meta.url), 'utf8')
      return draftResponse(request, signal, (workSignal, report) => generateCodingLab(lab, guide, key, workSignal, report))
    }
    if (body?.quality !== undefined && !isDraftQuality(body.quality)) return reply(400, { error: 'Choose a valid draft quality.' })
    const source = parseSource(body)
    if (!source) return reply(400, { error: 'Check the materials. Use up to 80,000 characters, 60 slides, and six embedded images.' })
    const guide = await readFile(new URL('../../docs/lesson-style-guide.md', import.meta.url), 'utf8')
    return draftResponse(request, signal, (workSignal, report) => generateDraft(source, guide, key, workSignal, report))
  } catch (error) {
    const failure = draftFailure(error, signal)
    return reply(failure.status, { error: failure.error })
  }
}
