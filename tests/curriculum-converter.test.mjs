import { afterEach, expect, it, vi } from 'vitest'
import { POST } from '../api/curriculum/draft.ts'
import { generateDraft } from '../server/curriculum/generate.ts'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

const proposal = { kind: 'lesson_plan', text: 'Teach HTML headings', audience: 'Beginners' }
const example = {
  moduleTitle: 'Build your first page',
  lessons: [{ title: 'Write a heading', article: '## Make the first edit\n\nChange the text in the heading.', practice: ['Try a new title.'], exitPrompt: 'What changed on screen?', citationIds: ['mdn-html'] }],
  reviewNotes: ['Review the practice prompt.'],
}
const completion = draft => Response.json({ choices: [{ message: { content: JSON.stringify(draft) } }] })

it('requires a session before attempting paid inference', async () => {
  const result = await POST(new Request('https://example.org/api/curriculum/draft', { method: 'POST' }))
  expect(result.status).toBe(401)
})

const endpointsUrl = 'https://openrouter.ai/api/v1/endpoints/zdr'
const catalog = (opusRetains = false) => Response.json({ data: [
  { model_id: 'openai/gpt-6.1-terra', tag: 'azure/us', safety_retention: false },
  { model_id: 'anthropic/claude-opus-5.5', tag: 'google-vertex/global', safety_retention: opusRetains },
] })
const mdn = () => new Response('<main><h1>Headings</h1><p>Headings structure a webpage.</p></main>')

it('defaults a proposal to Terra and validates approved citations', async () => {
  const calls = []
  const timeout = vi.spyOn(AbortSignal, 'timeout')
  vi.stubGlobal('fetch', async (url, init) => {
    if (url.startsWith('https://developer.mozilla.org')) return mdn()
    if (url === endpointsUrl) return catalog()
    calls.push(JSON.parse(init.body))
    return completion(example)
  })
  const response = await generateDraft(proposal, '# Guide\n\nVersion 1.0', 'test', new AbortController().signal)
  expect(calls).toHaveLength(1)
  expect(calls[0]).toMatchObject({
    model: 'openai/gpt-6.1-terra', max_tokens: 13_000, reasoning: { effort: 'high', exclude: true },
    provider: { only: ['azure/us'], allow_fallbacks: false, zdr: true, data_collection: 'deny', require_parameters: true },
  })
  expect(timeout).toHaveBeenCalledWith(265_000)
  expect(calls[0].messages[0].content).toContain('# Guide')
  expect(JSON.parse(calls[0].messages[1].content).source).toEqual(proposal)
  expect(response.references).toEqual([{ id: 'mdn-html', title: 'MDN · Structuring content with HTML',
    url: 'https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Structuring_content' }])
})

it('uses Opus for high quality and rejects invented citations in a single attempt', async () => {
  const calls = []
  vi.stubGlobal('fetch', async (url, init) => {
    if (url.startsWith('https://developer.mozilla.org')) return mdn()
    if (url === endpointsUrl) return catalog()
    calls.push(JSON.parse(init.body))
    return completion({ ...example, lessons: [{ ...example.lessons[0], citationIds: ['invented'] }] })
  })
  await expect(generateDraft({ ...proposal, quality: 'high' }, '# Guide', 'test', new AbortController().signal))
    .rejects.toMatchObject({ status: 502, message: expect.stringContaining('validation') })
  expect(calls).toHaveLength(1)
  expect(calls[0]).toMatchObject({
    model: 'anthropic/claude-opus-5.5', max_tokens: 16_000,
    provider: { only: ['google-vertex/global'], allow_fallbacks: false, zdr: true },
  })
  expect(JSON.parse(calls[0].messages[1].content).source).toEqual(proposal)
})

it('checks current privacy eligibility before sending the material', async () => {
  const fetcher = vi.fn(async url => url === endpointsUrl ? catalog(true) : mdn())
  vi.stubGlobal('fetch', fetcher)
  await expect(generateDraft({ ...proposal, quality: 'high' }, '# Guide', 'test', new AbortController().signal))
    .rejects.toMatchObject({ status: 503 })
  expect(fetcher.mock.calls.every(([, init]) => init?.method !== 'POST')).toBe(true)
})

function signedInRequest(source) {
  return new Request('https://example.org/api/curriculum/draft', {
    method: 'POST', headers: { Authorization: 'Bearer instructor-token' }, body: JSON.stringify(source),
  })
}

function configureApi() {
  vi.stubEnv('OPENROUTER_CURRICULUM_API_KEY', 'curriculum-key')
  vi.stubEnv('VITE_SUPABASE_URL', 'https://fake.supabase.co')
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'public-key')
}

function instructorResponse(url) {
  if (url.endsWith('/auth/v1/user')) return Response.json({ id: 'teacher' })
  if (url.startsWith('https://fake.supabase.co/rest/v1/profiles')) return Response.json({ role: 'instructor' })
}

it('requires its own capped key and rejects invalid quality values before inference', async () => {
  configureApi()
  vi.stubEnv('OPENROUTER_API_KEY', 'roster-key')
  vi.stubEnv('OPENROUTER_CURRICULUM_API_KEY', '')
  const fetcher = vi.fn(async url => instructorResponse(url))
  vi.stubGlobal('fetch', fetcher)
  expect((await POST(signedInRequest(proposal))).status).toBe(503)
  expect(fetcher).not.toHaveBeenCalled()
  vi.stubEnv('OPENROUTER_CURRICULUM_API_KEY', 'curriculum-key')
  const invalid = await POST(signedInRequest({ ...proposal, quality: 'invalid' }))
  expect(invalid.status).toBe(400)
  expect(fetcher.mock.calls.every(([url]) => url.startsWith('https://fake.supabase.co/'))).toBe(true)
})

it('returns a timeout from the draft API within the Vercel runtime', async () => {
  configureApi()
  const timeout = vi.spyOn(AbortSignal, 'timeout')
  vi.stubGlobal('fetch', async url => {
    const auth = instructorResponse(url)
    if (auth) return auth
    if (url.startsWith('https://developer.mozilla.org')) return mdn()
    if (url === endpointsUrl) return catalog()
    throw new DOMException('Model exceeded its time limit', 'TimeoutError')
  })
  const result = await POST(signedInRequest({ ...proposal, quality: 'high' }))
  expect(result.status).toBe(504)
  expect(timeout).toHaveBeenCalledWith(280_000)
  expect(timeout).toHaveBeenCalledWith(265_000)
})

it('keeps missing source evidence in review notes', async () => {
  vi.stubGlobal('fetch', async url => {
    if (url === endpointsUrl) return catalog()
    return url.startsWith('https://developer.mozilla.org') ? new Response(null, { status: 503 })
      : completion({ ...example, lessons: [{ ...example.lessons[0], citationIds: [] }] })
  })
  const response = await generateDraft(proposal, '# Guide', 'test', new AbortController().signal)
  expect(response.references).toEqual([])
  expect(response.reviewNotes.join(' ')).toContain('Could not verify MDN')
})
