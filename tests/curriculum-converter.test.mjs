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
const opusEdit = (index, changes) => ({ index, changes: {
  article: null, practice: null, exitPrompt: null, citationIds: null, knowledgeChecks: null, ...changes,
} })
const completion = draft => Response.json({ choices: [{ message: { content: JSON.stringify(draft) } }] })

it('requires a session before attempting paid inference', async () => {
  const result = await POST(new Request('https://example.org/api/curriculum/draft', { method: 'POST' }))
  expect(result.status).toBe(401)
})

const endpointsUrl = 'https://openrouter.ai/api/v1/endpoints/zdr'
const catalog = (opusRetains = false) => Response.json({ data: [
  { model_id: 'openai/gpt-6.1-sol', tag: 'azure/us', safety_retention: false },
  { model_id: 'openai/gpt-6.1-terra', tag: 'azure/us', safety_retention: false },
  { model_id: 'typesafe/jev-1.14', tag: 'typesafe', safety_retention: false },
  { model_id: 'anthropic/claude-opus-5.5', tag: 'google-vertex/global', safety_retention: opusRetains },
] })
const mdn = () => new Response('<main><h1>Headings</h1><p>Headings structure a webpage.</p></main>')

it('supports a single Terra pass and validates approved citations', async () => {
  const calls = []
  const timeout = vi.spyOn(AbortSignal, 'timeout')
  vi.stubGlobal('fetch', async (url, init) => {
    if (url.startsWith('https://developer.mozilla.org')) return mdn()
    if (url === endpointsUrl) return catalog()
    calls.push(JSON.parse(init.body))
    return completion(example)
  })
  const response = await generateDraft({ ...proposal, quality: 'standard' }, '# Guide\n\nVersion 1.0', 'test', new AbortController().signal)
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
  const response = await generateDraft({ ...proposal, quality: 'standard' }, '# Guide', 'test', new AbortController().signal)
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
  expect(parseSource({ ...deck, quality: 'high' })).toEqual({ ...deck, quality: 'high' })
  expect(parseSource({ ...deck, slides: [...slides].reverse() })).toBeNull()
  expect(parseSource({ ...deck, images: [{ ...deck.images[0], dataUrl: 'https://example.org/picture.png' }] })).toBeNull()
})

it('sends only selected images to the chosen model and preserves slide order', async () => {
  const calls = []
  vi.stubGlobal('fetch', async (url, init) => {
    if (url.startsWith('https://developer.mozilla.org')) return mdn()
    if (url === endpointsUrl) return catalog()
    calls.push(JSON.parse(init.body))
    return completion(example)
  })
  const deck = { kind: 'slide_deck', audience: '', slides, images: [] }
  const signal = new AbortController().signal
  await generateDraft({ ...deck, quality: 'standard' }, '# Guide', 'test', signal)
  const selectedDeck = { ...deck, images: [{ id: 'slide-1-image-1', slideNumber: 1, dataUrl: png }] }
  await generateDraft({ ...selectedDeck, quality: 'standard' }, '# Guide', 'test', signal)
  const response = await generateDraft({ ...selectedDeck, quality: 'high' }, '# Guide', 'test', signal)
  expect(calls.map(call => call.model)).toEqual(['openai/gpt-6.1-terra', 'openai/gpt-6.1-terra', 'anthropic/claude-opus-5.5'])
  expect(JSON.parse(calls[0].messages[1].content).source.slides).toEqual(slides)
  for (const call of calls.slice(1)) {
    expect(call.messages[1].content.filter(part => part.type === 'image_url')).toEqual([{ type: 'image_url', image_url: { url: png } }])
  }
  expect(response.reviewNotes).toContain('Slide 1: Review the diagram.')
  expect(JSON.stringify(response)).not.toContain(png)
})

it('rejects authenticated students and accepts an instructor without saving the result', async () => {
  vi.stubEnv('OPENROUTER_CURRICULUM_API_KEY', 'unit-test-key')
  vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co')
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'unit-test-anon')
  try {
    let role = 'student'
    let modelCalls = 0
    vi.stubGlobal('fetch', async input => {
      const url = String(input)
      if (url.includes('/auth/v1/user')) return Response.json({ id: 'local-test-user' })
      if (url.includes('/rest/v1/profiles')) return Response.json([{ role }])
      if (url.startsWith('https://developer.mozilla.org')) return mdn()
      if (url === endpointsUrl) return catalog()
      modelCalls++
      return completion(example)
    })
    const request = () => new Request('https://example.org/api/curriculum/draft', {
      method: 'POST', headers: { Authorization: 'Bearer unit-test-session' }, body: JSON.stringify({ ...proposal, quality: 'standard' }),
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

it('reports actual generation stages before returning the validated draft', async () => {
  configureApi()
  const { promise, resolve } = Promise.withResolvers()
  vi.stubGlobal('fetch', async url => {
    const auth = instructorResponse(url)
    if (auth) return auth
    if (url.startsWith('https://developer.mozilla.org')) return mdn()
    if (url === endpointsUrl) return catalog()
    return promise
  })
  const request = signedInRequest({ ...proposal, quality: 'standard' })
  request.headers.set('Accept', 'application/x-ndjson')
  const response = await POST(request)
  expect(response.headers.get('Content-Type')).toContain('application/x-ndjson')
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
  try {
    for (const stage of ['preparing', 'references', 'model']) {
      expect(JSON.parse((await reader.read()).value)).toEqual({ type: 'progress', stage })
    }
    resolve(completion(example))
    expect(JSON.parse((await reader.read()).value)).toEqual({ type: 'progress', stage: 'validating' })
    expect(JSON.parse((await reader.read()).value)).toMatchObject({ type: 'result', data: { moduleTitle: example.moduleTitle } })
    expect((await reader.read()).done).toBe(true)
  } finally {
    resolve(completion(example))
    await reader.cancel()
  }
})

it('uses the authenticated, retention-checked Sol route for a lab and rejects active HTML', async () => {
  configureApi()
  const starter = { html: '<main><h1>Menu</h1><span aria-hidden="true">•</span></main>', css: 'main { background: #ddd }' }
  const solution = { html: '<head><link rel="stylesheet" href="styles.css"></head>' + starter.html, css: 'main { padding: 20px }' }
  const lab = { title: 'Build a menu', instructions: 'Link the CSS and add padding.', starter, solution,
    checks: [
      { kind: 'stylesheet', name: 'Link the style', hint: 'Use styles.css.' },
      { kind: 'padding', name: 'Add space', selector: 'main', expected: '20px', hint: 'Pad the main element.' },
    ],
  }
  const input = { kind: 'coding_lab', moduleTitle: example.moduleTitle, lessonTitle: example.lessons[0].title,
    audience: 'Beginners', additionalInstructions: 'Start with a small visible edit.', material: 'Create an HTML menu with a CSS file.', lessons: example.lessons }
  let returned = lab
  const calls = []
  vi.stubGlobal('fetch', async (url, init) => {
    const auth = instructorResponse(url)
    if (auth) return auth
    if (url === endpointsUrl) return catalog()
    calls.push(JSON.parse(init.body))
    return completion({ lab: returned, reviewNotes: ['Confirm the lab timing.'] })
  })
  const request = signedInRequest(input)
  request.headers.set('Accept', 'application/x-ndjson')
  const response = await POST(request)
  expect(response.status).toBe(200)
  const events = (await response.text()).trim().split('\n').map(JSON.parse)
  expect(events.map(event => event.stage ?? event.type)).toEqual(['preparing', 'model', 'validating', 'result'])
  expect(events.at(-1).data).toMatchObject({ lab: { starter, solution } })
  expect(calls[0]).toMatchObject({
    model: 'openai/gpt-6.1-sol',
    provider: { only: ['azure/us'], zdr: true, data_collection: 'deny', require_parameters: true },
  })
  expect(JSON.parse(calls[0].messages[1].content)).toEqual({ ...input, lessons: [{ title: input.lessonTitle, article: example.lessons[0].article }] })
  returned = { ...lab, starter: { ...starter, html: starter.html + '<script>console.log("active")</script>' } }
  expect((await POST(signedInRequest(input))).status).toBe(502)
})

it('supplies relevant official W3Schools references when requested in additional instructions', async () => {
  const instructions = 'Use w3schools.org for CSS selectors and add a short prediction task. Also consider https://example.org/lesson.'
  const source = { ...proposal, text: 'Teach CSS selectors', additionalInstructions: instructions }
  const calls = []
  vi.stubGlobal('fetch', async (url, init) => {
    calls.push(url)
    if (url === endpointsUrl) return catalog()
    if (url.startsWith('https://developer.mozilla.org')) return mdn()
    const input = JSON.parse(JSON.parse(init.body).messages[1].content)
    expect(input.source).toEqual({ kind: source.kind, text: source.text, audience: source.audience })
    expect(input.additionalInstructions).toBe(instructions)
    expect(input.references[0]).toMatchObject({
      id: 'w3schools-selectors', url: 'https://www.w3schools.com/css/css_selectors.asp',
      excerpt: expect.stringContaining('class selector'),
    })
    return completion({ ...example, lessons: [{ ...example.lessons[0], citationIds: ['w3schools-selectors'] }] })
  })
  const result = await generateDraft({ ...source, quality: 'standard' }, '# Guide', 'test', new AbortController().signal)
  expect(calls).not.toContain('https://example.org/lesson')
  expect(result.references).toEqual([{
    id: 'w3schools-selectors', title: 'W3Schools · CSS Selectors', url: 'https://www.w3schools.com/css/css_selectors.asp',
  }])
})

it('flags unavailable W3Schools topics and respects an instruction to avoid W3Schools', async () => {
  const { lookupReferences } = await import('../server/curriculum/references.ts')
  const signal = new AbortController().signal
  vi.stubGlobal('fetch', async () => mdn())
  const unmatched = await lookupReferences('Binary search trees', signal, 'Use W3Schools.')
  expect(unmatched.notes).toContain('No approved W3Schools page matched this topic.')
  const excluded = await lookupReferences('Teach CSS selectors', signal, 'Do not use W3Schools.')
  expect(excluded.sources.map(ref => ref.id)).toEqual(['mdn-css'])
})

it('validates additional instructions for proposals and slide decks', async () => {
  const { parseSource } = await import('../server/curriculum/source.ts')
  const pptx = { kind: 'slide_deck', audience: '', slides, images: [] }
  for (const source of [proposal, pptx]) {
    expect(parseSource({ ...source, additionalInstructions: '  Add a prediction.  ' })?.additionalInstructions).toBe('Add a prediction.')
    expect(parseSource({ ...source, additionalInstructions: 'x'.repeat(2001) })).toBeNull()
    expect(parseSource({ ...source, additionalInstructions: 123 })).toBeNull()
  }
})

it.each(['ready', 'practice', 'instructor', 'invalid_repair'])('routes the reviewed draft through Opus and Jev (%s)', async decision => {
  const quiz = { prompt: 'Which tag makes the largest heading by default?', choices: ['h1', 'p'], answer: 0 }
  const checkedLesson = { ...example.lessons[0], knowledgeChecks: [quiz], practice: [], exitPrompt: '' }
  const unrelated = { ...checkedLesson, title: 'Read a heading' }
  const revisedLesson = { ...checkedLesson, article: '## Predict\n\nChange the text inside h1 and open the file.' }
  const repairedLesson = { ...revisedLesson, practice: ['Refresh the page and point to the changed heading.'] }
  const routeRepair = decision === 'practice' || decision === 'invalid_repair'
  const calls = []
  const stages = []
  vi.stubGlobal('fetch', async (url, init) => {
    if (url === endpointsUrl) return catalog()
    if (url.startsWith('https://developer.mozilla.org')) return mdn()
    const input = JSON.parse(init.body)
    calls.push(input.model)
    if (input.model === 'anthropic/claude-opus-5.5') {
      expect(input.messages[0].content).toContain('Review this draft against the source')
      return completion({ edits: [opusEdit(0, { article: revisedLesson.article })], notes: [] })
    }
    if (input.model === 'typesafe/jev-1.14') {
      expect(input.provider).toMatchObject({ only: ['typesafe'], allow_fallbacks: false, zdr: true, data_collection: 'deny' })
      expect(input.state.lessons).toEqual([revisedLesson, unrelated])
      return Response.json({ answers: {
        lesson_0: { type: 'choice', choice: routeRepair ? 'practice' : decision, confidence: 0.62 },
        lesson_1: { type: 'choice', choice: routeRepair ? 'practice' : 'ready', confidence: 0.43 },
      } })
    }
    if (calls.length === 1) return completion({ ...example, lessons: [checkedLesson, unrelated] })
    expect(JSON.parse(input.messages[1].content).lesson).toEqual(revisedLesson)
    return completion(decision === 'invalid_repair' ? { ...repairedLesson, citationIds: ['invented'] } : repairedLesson)
  })
  const result = await generateDraft(proposal, '# Guide', 'test', new AbortController().signal, stage => stages.push(stage))
  expect(calls).toEqual(['openai/gpt-6.1-terra', 'anthropic/claude-opus-5.5', 'typesafe/jev-1.14', ...(routeRepair ? ['openai/gpt-6.1-terra'] : [])])
  expect(stages).toEqual(['references', 'drafting', 'reviewing', 'checking', ...(routeRepair ? ['repairing'] : []), 'validating'])
  expect(result.lessons).toEqual([decision === 'practice' ? repairedLesson : revisedLesson, unrelated])
  if (routeRepair) expect(result.reviewNotes.join(' ')).toContain('Read a heading')
  if (decision === 'instructor') expect(result.reviewNotes.join(' ')).toContain('needs instructor input')
  if (decision === 'invalid_repair') expect(result.reviewNotes.join(' ')).toContain('could not be applied')
})

it('rejects knowledge checks whose answer does not match a choice', async () => {
  vi.stubGlobal('fetch', async url => {
    if (url === endpointsUrl) return catalog()
    if (url.startsWith('https://developer.mozilla.org')) return mdn()
    return completion({ ...example, lessons: [{ ...example.lessons[0],
      knowledgeChecks: [{ prompt: 'Which tag makes a heading?', choices: ['h1', 'p'], answer: 2 }],
    }] })
  })
  await expect(generateDraft(proposal, '# Guide', 'test', new AbortController().signal)).rejects.toMatchObject({ status: 502 })
})

it('preserves the Opus revision when Jev is unavailable under the privacy settings', async () => {
  const revised = { ...example.lessons[0], article: '## Build a heading\n\nChange its text and refresh the page.' }
  const models = []
  vi.stubGlobal('fetch', async (url, init) => {
    if (url.startsWith('https://developer.mozilla.org')) return mdn()
    if (url === endpointsUrl) {
      const { data } = await catalog().json()
      return Response.json({ data: data.filter(endpoint => endpoint.tag !== 'typesafe') })
    }
    const { model } = JSON.parse(init.body)
    models.push(model)
    return completion(model === 'anthropic/claude-opus-5.5'
      ? { edits: [opusEdit(0, { article: revised.article })], notes: [] } : example)
  })
  const result = await generateDraft(proposal, '# Guide', 'test', new AbortController().signal)
  expect(models).toEqual(['openai/gpt-6.1-terra', 'anthropic/claude-opus-5.5'])
  expect(result.lessons[0].article).toBe(revised.article)
  expect(result.reviewNotes.join(' ')).toContain('Jev’s review could not finish')
})

it('adds each knowledge check as its own block and saves written prompts for discussion', async () => {
  vi.stubGlobal('window', { location: { hostname: 'localhost' } })
  const { materialDraft } = await import('../src/instructor/materialsDraft.ts')
  const lesson = {
    ...example.lessons[0],
    practice: ['Change the heading and refresh the page.'],
    exitPrompt: 'How did a good heading help you find what you needed?',
    knowledgeChecks: [
      { prompt: 'Which tag makes a main heading?', choices: ['p', 'h1'], answer: 1 },
      { prompt: 'Which file contains your heading text?', choices: ['index.html', 'styles.css'], answer: 0 },
    ],
  }
  const result = materialDraft({ ...example, lessons: [lesson], references: [] })
  const { activities } = result.lessons[0]
  expect(result.published).toBe(false)
  expect(activities.map(item => item.type)).toEqual(['content', 'check', 'check', 'exit'])
  expect(activities[0].markdown).toContain('## Try it yourself\n\n- Change the heading and refresh the page.')
  expect(activities.slice(1, 3).map(item => item.questions[0].answer)).toEqual([1, 0])
  expect(activities[3].questions[0].prompt).toBe(lesson.exitPrompt)
})

it('still checks and repairs the draft after Opus reaches its output limit', async () => {
  const repaired = { ...example.lessons[0], practice: ['Change the heading and refresh. Check the new text.'] }
  const calls = []
  vi.stubGlobal('fetch', async (url, init) => {
    if (url === endpointsUrl) return catalog()
    if (url.startsWith('https://developer.mozilla.org')) return mdn()
    const input = JSON.parse(init.body)
    calls.push(input.model)
    if (input.model === 'anthropic/claude-opus-5.5') {
      return Response.json({ choices: [{ finish_reason: 'length', message: { content: '{"edits":' } }] })
    }
    if (input.model === 'typesafe/jev-1.14') {
      expect(input.state.lessons).toEqual(example.lessons)
      return Response.json({ answers: { lesson_0: { type: 'choice', choice: 'practice', confidence: 0.3 } } })
    }
    return completion(calls.length === 1 ? example : repaired)
  })
  const result = await generateDraft(proposal, '# Guide', 'test', new AbortController().signal)
  expect(calls).toEqual(['openai/gpt-6.1-terra', 'anthropic/claude-opus-5.5', 'typesafe/jev-1.14', 'openai/gpt-6.1-terra'])
  expect(result.lessons).toEqual([repaired])
  expect(result.reviewNotes.join(' ')).toContain('Opus’s review could not finish')
  expect(result.reviewNotes.join(' ')).toContain('Terra made a targeted edit')
})

it('places checks after their topic in article order and keeps fenced headings in code', async () => {
  vi.stubGlobal('window', { location: { hostname: 'localhost' } })
  const { materialDraft } = await import('../src/instructor/materialsDraft.ts')
  const source = [
    '## Link your stylesheet', '', 'Create a separate stylesheet.',
    '', '```text', '## Example code', '```', '',
    '## Choose colors', '', 'Set the text color in CSS.',
  ].join('\n')
  const questions = [
    { prompt: 'Which property changes text color?', choices: ['color', 'margin'], answer: 0, afterSection: 'Choose colors' },
    { prompt: 'Where do you write CSS?', choices: ['styles.css', 'index.html'], answer: 0, afterSection: 'Link your stylesheet' },
    { prompt: 'What does the browser read?', choices: ['Both files', 'One file'], answer: 0, afterSection: 'Example code' },
  ]
  const lesson = { ...example.lessons[0], article: source, knowledgeChecks: questions }
  const draft = materialDraft({
    ...example, lessons: [lesson], references: [{ id: 'mdn-html', title: 'HTML', url: 'https://example.org/html' }],
  })
  const { activities } = draft.lessons[0]
  expect(activities.map(item => item.type)).toEqual(['content', 'check', 'content', 'check', 'content', 'check', 'exit'])
  expect(activities[0].markdown).toContain('```text\n## Example code\n```')
  expect(activities[1].questions[0].prompt).toBe(questions[1].prompt)
  expect(activities[2]).toMatchObject({ title: 'Choose colors', markdown: 'Set the text color in CSS.' })
  expect(activities[3].questions[0].prompt).toBe(questions[0].prompt)
  expect(activities[4]).toMatchObject({ title: 'Try it yourself', markdown: expect.stringContaining('## References\n\n- [HTML](https://example.org/html)') })
  expect(activities[5].questions[0].prompt).toBe(questions[2].prompt)
})
