import assert from 'node:assert/strict'
import { test } from 'vitest'
import { createHash } from 'node:crypto'
import { heightScript, heightScriptHash, isolatedHtml, readCompletion, readFrameCompletion, readFrameHeight } from '../src/shared/ui/isolatedHtml.ts'

test('the restrictive policy comes before authored source and removes document navigation markup', () => {
  const doc = isolatedHtml('<html lang="en"><head><title>Lab</title><base href="https://example.invalid"><meta http-equiv="refresh" content="1"></head><body><h1>Try it</h1><a href="https://example.invalid">Label</a><script>console.log("demo")</script></body></html>', true)
  assert.ok(doc.indexOf('Content-Security-Policy') < doc.indexOf('<script>'))
  assert.match(doc, /connect-src 'none'/)
  assert.match(doc, /<html lang="en">/)
  assert.match(doc, /<a>Label<\/a>/)
  assert.doesNotMatch(doc, /<base|http-equiv="refresh"/)
})

test('scriptless previews remove authored scripts and allow only the platform height script', () => {
  const doc = isolatedHtml('<h1 onclick="alert(1)">Example</h1><script>console.log("demo")</script>', false, 'h1 { color: green; }')
  assert.match(doc, new RegExp("script-src '" + heightScriptHash.replace(/[+/=]/g, '\\$&') + "'"))
  assert.doesNotMatch(doc, /script-src 'unsafe-inline'/)
  assert.match(doc, /<style>h1/)
  assert.doesNotMatch(doc, /console\.log/)
  assert.equal(doc.split('<script>').length - 1, 1)
})

test('the allowed hash is exactly the platform height script', () => {
  assert.equal(heightScriptHash, 'sha256-' + createHash('sha256').update(heightScript).digest('base64'))
})

test('only the active opaque frame can resize itself, within limits', () => {
  const frame = {}
  const event = { source: frame, origin: 'null', data: { type: 'cic:height', height: 812.4 } }
  assert.equal(readFrameHeight(event, frame), 813)
  assert.equal(readFrameHeight({ ...event, data: { type: 'cic:height', height: 99999 } }, frame), 6000)
  assert.equal(readFrameHeight({ ...event, data: { type: 'cic:height', height: '900' } }, frame), null)
  assert.equal(readFrameHeight(event, {}), null)
  assert.equal(readFrameHeight({ ...event, origin: 'http://127.0.0.1:5173' }, frame), null)
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
