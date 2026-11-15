import { afterEach, expect, it, vi } from 'vitest'
import { generateFromRequest } from '../server/curriculum/request.ts'
import { issueImageTicket, localImageQuota } from '../server/curriculum/images.ts'
import { outlinesFromMask } from '../src/instructor/figureSuggestions.ts'
import { validLessonFigure } from '../src/shared/curriculum/figure.ts'

afterEach(() => vi.unstubAllGlobals())

it('limits concurrent image requests to five for the same draft and validates the ticket before inference', async () => {
  const quota = localImageQuota()
  const key = 'test-key'
  const ticket = issueImageTicket(quota.owner, key)
  const paid = vi.fn(async (_url, init) => {
    expect(JSON.parse(init.body)).toMatchObject({
      model: 'bytedance-seed/seedream-5-0-flash', n: 1,
      provider: { only: ['seed'], allow_fallbacks: false, zdr: true, data_collection: 'deny', max_price: { image: 0.018 } },
    })
    return Response.json({ data: [{ b64_json: '/9j/AA==' }], usage: { cost: 0.018 } })
  })
  vi.stubGlobal('fetch', async (url, init) => url.endsWith('/endpoints/zdr')
    ? Response.json({ data: [{ model_id: 'bytedance-seed/seedream-5-0-flash', tag: 'seed', safety_retention: false }] })
    : paid(url, init))
  function run(token, prompt = 'A dog next to a bicycle') {
    const request = new Request('http://localhost/api/curriculum/draft', {
      method: 'POST', body: JSON.stringify({ kind: 'generate_image', ticket: token, prompt }),
    })
    return generateFromRequest(request, key, request.signal, quota)
  }
  expect((await run(issueImageTicket('another-instructor', key))).status).toBe(400)
  expect((await run(ticket, '')).status).toBe(400)
  expect(paid).not.toHaveBeenCalled()
  const results = await Promise.all(Array.from({ length: 6 }, () => run(ticket)))
  expect(results.map(r => r.status).sort()).toEqual([200, 200, 200, 200, 200, 429])
  const available = await Promise.all(results.filter(r => r.ok).map(r => r.json()))
  expect(available.map(r => r.remaining).sort()).toEqual([0, 1, 2, 3, 4])
  expect(paid).toHaveBeenCalledTimes(5)
  expect((await run(issueImageTicket(quota.owner, key))).status).toBe(200)
})

it('accepts bounded figure annotations and rejects remote sources and invalid coordinates', () => {
  const figure = { src: 'data:image/jpeg;base64,/9j/AA==', alt: 'Dog on a path', caption: '', marks: [
    { kind: 'box', from: { x: 3, y: 4 }, to: { x: 100, y: 200 }, label: 'Dog' },
    { kind: 'mask', points: [{ x: 3, y: 4 }, { x: 12, y: 7 }, { x: 35, y: 40 }], label: 'Silhouette' },
  ] }
  expect(validLessonFigure(figure)).toBe(true)
  expect(validLessonFigure({ ...figure, src: 'https://example.com/dog.jpg' })).toBe(false)
  expect(validLessonFigure({ ...figure, marks: [{ ...figure.marks[0], to: { x: 1100, y: 200 } }] })).toBe(false)
})

it('outlines disconnected objects separately and ignores stray pixels', () => {
  const width = 30
  const height = 20
  const pixels = new Uint8Array(width * height)
  for (let y = 3; y < 13; y++) {
    pixels.fill(1, y * width + 4, y * width + 11)
    pixels.fill(1, y * width + 20, y * width + 25)
  }
  pixels[10] = 1
  const marks = outlinesFromMask(pixels, width, height, ['background', 'cat'])
  expect(marks.map(mark => mark.kind)).toEqual(['mask', 'box', 'mask', 'box'])
  expect(marks.every(mark => mark.label === 'Cat')).toBe(true)
  expect(marks[1]).toMatchObject({ from: { x: 133, y: 150 }, to: { x: 367, y: 650 } })
  expect(marks[3]).toMatchObject({ from: { x: 667, y: 150 }, to: { x: 833, y: 650 } })
  expect(validLessonFigure({ src: 'data:image/jpeg;base64,/9j/AA==', alt: 'Two cats', caption: '', marks })).toBe(true)
})
