import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { maxDraftImages, maxImagePrompt, type ImageDraftResult } from '../../src/shared/curriculum/figure.ts'
import type { ReportProgress } from '../../src/shared/curriculum/progress.ts'
import { DraftError, verifyEndpoint } from './completion.ts'

export type ImageQuota = { owner: string; reserve: (id: string, expiresAt: number) => Promise<number | null> }
const lifetimeMs = 8 * 60 * 60 * 1000
const route = { model: 'bytedance-seed/seedream-5-0-flash', endpoint: 'seed' }
const imagePrice = 0.018

function signature(token: string, owner: string, key: string) {
  return createHmac('sha256', key).update('cic-draft-image:' + owner + ':' + token).digest()
}

export function issueImageTicket(owner: string, key: string) {
  const token = randomUUID() + '.' + (Date.now() + lifetimeMs)
  return token + '.' + signature(token, owner, key).toString('base64url')
}

export function checkImageTicket(value: unknown, owner: string, key: string) {
  if (typeof value !== 'string') return null
  const match = /^([0-9a-f-]{36})\.(\d{13})\.([A-Za-z0-9_-]{43})$/.exec(value)
  if (!match) return null
  const [, id, expiry, mac] = match
  const expiresAt = Number(expiry)
  if (expiresAt <= Date.now() || !timingSafeEqual(signature(id + '.' + expiry, owner, key), Buffer.from(mac, 'base64url'))) return null
  return { id, expiresAt }
}

/** The loopback demo uses a single process. Hosted requests share a database quota. */
export function localImageQuota(): ImageQuota {
  const counts = new Map<string, { used: number; expiresAt: number }>()
  return {
    owner: 'local-instructor:' + randomUUID(),
    async reserve(id, expiresAt) {
      for (const [draft, entry] of counts) if (entry.expiresAt <= Date.now()) counts.delete(draft)
      const used = counts.get(id)?.used ?? 0
      if (used >= maxDraftImages) return null
      counts.set(id, { used: used + 1, expiresAt })
      return maxDraftImages - used - 1
    },
  }
}

export function parseImagePrompt(value: unknown) {
  return typeof value === 'string' && value.trim() && value.length <= maxImagePrompt ? value.trim() : null
}

export async function generateDraftImage(prompt: string, ticket: { id: string; expiresAt: number }, quota: ImageQuota,
  key: string, signal: AbortSignal, report?: ReportProgress): Promise<ImageDraftResult> {
  const imageSignal = AbortSignal.any([signal, AbortSignal.timeout(85_000)])
  await verifyEndpoint(route, imageSignal)
  const remaining = await quota.reserve(ticket.id, ticket.expiresAt)
  if (remaining === null) throw new DraftError('This draft has reached its five-image limit.', 429)
  report?.('illustrating')
  const started = Date.now()
  try {
    const response = await fetch('https://openrouter.ai/api/v1/images', {
      method: 'POST', signal: imageSignal,
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: route.model, n: 1, resolution: '1K', aspect_ratio: '16:9',
        prompt: 'Make a clear classroom illustration of the scene below. Draw the base scene only, with no text, labels, boxes, masks, or annotation overlays.\n\nScene: ' + prompt,
        provider: { only: [route.endpoint], allow_fallbacks: false, zdr: true, data_collection: 'deny', max_price: { image: imagePrice } },
      }),
    })
    if (!response.ok) throw new Error('Image provider failed')
    const data = await response.json() as { data?: { b64_json?: string }[]; usage?: { cost?: number } }
    console.info('curriculum image', { model: route.model, cost: data.usage?.cost, latencyMs: Date.now() - started })
    const b64 = data.data?.[0]?.b64_json
    if (!b64 || b64.length > 3_000_000 || !/^[a-z0-9+/]+={0,2}$/i.test(b64)) throw new Error('Invalid image')
    const header = Buffer.from(b64.slice(0, 16), 'base64').toString('hex')
    const format = header.startsWith('ffd8ff') ? 'jpeg' : header.startsWith('89504e470d0a1a0a') ? 'png' : null
    if (!format) throw new Error('Unsupported image')
    return { remaining, src: 'data:image/' + format + ';base64,' + b64, cost: data.usage?.cost }
  } catch {
    signal.throwIfAborted()
    return { remaining, error: 'Image generation could not finish. You can try again if this draft has attempts left.' }
  }
}
