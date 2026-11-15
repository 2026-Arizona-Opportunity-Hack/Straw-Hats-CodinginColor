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
