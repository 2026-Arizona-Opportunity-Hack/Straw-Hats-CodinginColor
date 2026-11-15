import { afterEach, expect, it, vi } from 'vitest'
import { POST } from '../api/curriculum/draft.ts'
import { generateDraft } from '../server/curriculum/generate.ts'

afterEach(() => vi.unstubAllGlobals())

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

it('validates references, retries on an unknown citation and limits provider routing', async () => {
  const calls = []
  vi.stubGlobal('fetch', async (url, init) => {
    if (url.startsWith('https://developer.mozilla.org')) return new Response('<main><h1>Headings</h1><p>Headings structure a webpage.</p></main>')
    calls.push(JSON.parse(init.body))
    return completion(calls.length === 1 ? { ...example, lessons: [{ ...example.lessons[0], citationIds: ['invented'] }] } : example)
  })
  const response = await generateDraft(proposal, '# Guide\n\nVersion 1.0', 'test', new AbortController().signal)
  expect(calls).toHaveLength(2)
  expect(calls[0].model).toBe('google/gemini-3.1-flash-lite')
  expect(calls[1].model).toBe('google/gemini-3.6-flash')
  expect(calls[0].provider).toMatchObject({ zdr: true, data_collection: 'deny', require_parameters: true })
  expect(calls[0].messages[0].content).toContain('# Guide')
  expect(JSON.parse(calls[0].messages[1].content).source).toEqual(proposal)
  expect(response.references).toEqual([{ id: 'mdn-html', title: 'MDN · Structuring content with HTML',
    url: 'https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Structuring_content' }])
})

it('keeps missing source evidence in review notes', async () => {
  vi.stubGlobal('fetch', async url => url.startsWith('https://developer.mozilla.org')
    ? new Response(null, { status: 503 }) : completion({ ...example, lessons: [{ ...example.lessons[0], citationIds: [] }] }))
  const response = await generateDraft(proposal, '# Guide', 'test', new AbortController().signal)
  expect(response.references).toEqual([])
  expect(response.reviewNotes.join(' ')).toContain('Could not verify MDN')
})

const slides = [
  { number: 1, text: 'HTML headings first', notes: 'Explain the opening activity.', reviewFlags: ['Review the diagram.'] },
  { number: 2, text: 'Then add the section heading', notes: 'Ask what changed.', reviewFlags: [] },
]
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aPwAAAABJRU5ErkJggg=='

it('accepts ordered deck text and embedded images and rejects external image URLs', async () => {
  const { parseSource } = await import('../server/curriculum/source.ts')
  const deck = { kind: 'slide_deck', audience: '', slides, images: [{ id: 'slide-1-image-1', slideNumber: 1, dataUrl: png }] }
  expect(parseSource(deck)).toEqual(deck)
  expect(parseSource({ ...deck, slides: [...slides].reverse() })).toBeNull()
  expect(parseSource({ ...deck, images: [{ ...deck.images[0], dataUrl: 'https://example.org/picture.png' }] })).toBeNull()
})

it('uses the text route by default and sends only selected images to the vision model', async () => {
  const calls = []
  vi.stubGlobal('fetch', async (url, init) => {
    if (url.startsWith('https://developer.mozilla.org')) return new Response('<main>Headings structure a webpage.</main>')
    calls.push(JSON.parse(init.body))
    return completion(example)
  })
  const deck = { kind: 'slide_deck', audience: '', slides, images: [] }
  const signal = new AbortController().signal
  await generateDraft(deck, '# Guide', 'test', signal)
  const response = await generateDraft({ ...deck, images: [{ id: 'slide-1-image-1', slideNumber: 1, dataUrl: png }] }, '# Guide', 'test', signal)
  expect(calls[0].model).toBe('google/gemini-3.1-flash-lite')
  expect(JSON.parse(calls[0].messages[1].content).source.slides).toEqual(slides)
  expect(calls[1].model).toBe('google/gemini-3.6-flash')
  expect(calls[1].messages[1].content.filter(part => part.type === 'image_url')).toEqual([{ type: 'image_url', image_url: { url: png } }])
  expect(response.reviewNotes).toContain('Slide 1: Review the diagram.')
  expect(JSON.stringify(response)).not.toContain(png)
})

it('rejects authenticated students and accepts an instructor without saving the result', async () => {
  vi.stubEnv('OPENROUTER_API_KEY', 'unit-test-key')
  vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co')
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'unit-test-anon')
  try {
    let role = 'student'
    let modelCalls = 0
    vi.stubGlobal('fetch', async input => {
      const url = String(input)
      if (url.includes('/auth/v1/user')) return Response.json({ id: 'local-test-user' })
      if (url.includes('/rest/v1/profiles')) return Response.json([{ role }])
      if (url.startsWith('https://developer.mozilla.org')) return new Response('<main>Headings structure a webpage.</main>')
      modelCalls++
      return completion(example)
    })
    const request = () => new Request('https://example.org/api/curriculum/draft', {
      method: 'POST', headers: { Authorization: 'Bearer unit-test-session' }, body: JSON.stringify(proposal),
    })
    expect((await POST(request())).status).toBe(403)
    expect(modelCalls).toBe(0)
    role = 'instructor'
    const result = await POST(request())
    expect(result.status).toBe(200)
    expect((await result.json()).moduleTitle).toBe(example.moduleTitle)
    expect(modelCalls).toBe(1)
  } finally {
    vi.unstubAllEnvs()
  }
})
