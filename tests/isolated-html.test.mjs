import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isolatedHtml, readCompletion, readFrameCompletion } from '../src/shared/ui/isolatedHtml.ts'

test('the restrictive policy comes before authored source and removes document navigation markup', () => {
  const doc = isolatedHtml('<html lang="en"><head><title>Lab</title><base href="https://example.invalid"><meta http-equiv="refresh" content="1"></head><body><h1>Try it</h1><a href="https://example.invalid">Label</a><script>console.log("demo")</script></body></html>', true)
  assert.ok(doc.indexOf('Content-Security-Policy') < doc.indexOf('<script>'))
  assert.match(doc, /connect-src 'none'/)
  assert.match(doc, /<html lang="en">/)
  assert.match(doc, /<a>Label<\/a>/)
  assert.doesNotMatch(doc, /<base|http-equiv="refresh"/)
})

test('scriptless previews remove script elements and restrict inline handlers', () => {
  const doc = isolatedHtml('<h1>Example</h1><script>console.log("demo")</script>', false, 'h1 { color: green; }')
  assert.match(doc, /script-src 'none'/)
  assert.match(doc, /<style>h1/)
  assert.doesNotMatch(doc, /<script>/)
})

test('completion requires a known message and a finite practice score when supplied', () => {
  assert.deepEqual(readCompletion({ type: 'cic:complete' }), {})
  assert.deepEqual(readCompletion({ type: 'cic:complete', score: 0 }), { score: 0 })
  for (const score of [-1, Infinity, NaN, 2, '1', null]) assert.equal(readCompletion({ type: 'cic:complete', score }), null)
  assert.equal(readCompletion({ type: 'unknown', score: 1 }), null)
})

test('only the active opaque frame can report completion', () => {
  const frame = {}
  const other = {}
  const event = { source: frame, origin: 'null', data: { type: 'cic:complete', score: 1 } }
  assert.deepEqual(readFrameCompletion(event, frame), { score: 1 })
  assert.equal(readFrameCompletion(event, other), null)
  assert.equal(readFrameCompletion({ ...event, origin: 'http://127.0.0.1:5173' }, frame), null)
  assert.equal(readFrameCompletion(event, undefined), null)
})
