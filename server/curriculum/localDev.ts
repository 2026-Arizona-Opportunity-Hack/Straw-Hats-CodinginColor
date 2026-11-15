import type { IncomingMessage, ServerResponse } from 'node:http'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { Plugin } from 'vite'
import { maxDraftRequest } from '../../src/shared/curriculum/draft.ts'
import { draftTimeoutMs } from './completion.ts'
import { generateFromRequest } from './request.ts'

const localHosts = ['127.0.0.1', 'localhost', '::1']
const loopbackAddresses = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])
const localHostHeader = /^(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/i

function reject(response: ServerResponse, status: number, error: string) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  response.end(JSON.stringify({ error }))
}

async function handleLocalDraft(request: IncomingMessage, response: ServerResponse, key: string) {
  if (request.method !== 'POST') return reject(response, 405, 'Send a POST request to generate a draft.')
  const { host, origin } = request.headers
  if (!loopbackAddresses.has(request.socket.remoteAddress ?? '') || !host || !localHostHeader.test(host)
    || origin !== 'http://' + host || request.headers['x-cic-local-curriculum'] !== '1') {
    return reject(response, 403, 'Local curriculum generation requires the local instructor preview.')
  }
  if (request.headers['content-type']?.split(';')[0] !== 'application/json') {
    return reject(response, 415, 'Send lesson materials as JSON.')
  }

  const closed = new AbortController()
  response.once('close', () => {
    if (!response.writableFinished) closed.abort()
  })
  const signal = AbortSignal.any([closed.signal, AbortSignal.timeout(draftTimeoutMs)])
  try {
    const chunks: Buffer[] = []
    let size = 0
    for await (const chunk of request.iterator({ destroyOnReturn: false })) {
      size += chunk.length
      if (size > maxDraftRequest) {
        request.resume()
        return reject(response, 413, 'Use a smaller lesson source.')
      }
      chunks.push(chunk)
    }
    const draftRequest = new Request(origin + '/api/curriculum/draft', {
      method: 'POST', body: new Uint8Array(Buffer.concat(chunks)),
      headers: { Accept: request.headers.accept ?? '' }, signal,
    })
    const draft = await generateFromRequest(draftRequest, key, signal)
    if (response.destroyed) {
      await draft.body?.cancel()
      return
    }
    response.writeHead(draft.status, Object.fromEntries(draft.headers))
    if (draft.body) await pipeline(Readable.fromWeb(draft.body), response)
    else response.end()
  } catch (error) {
    if (response.destroyed) return
    if (response.headersSent) response.destroy()
    else reject(response, signal.aborted ? 504 : 502, 'The local converter could not finish the draft.')
    if (!signal.aborted) console.error('Local curriculum request failed', { errorType: error instanceof Error ? error.name : 'unknown' })
  }
}

export function localCurriculum(key: string): Plugin {
  return {
    name: 'cic-local-curriculum',
    apply: 'serve',
    configureServer(server) {
      const bind = server.config.server.host ?? 'localhost'
      if (typeof bind !== 'string' || !localHosts.includes(bind)) {
        throw new Error('Local curriculum generation requires a loopback host such as 127.0.0.1.')
      }
      server.middlewares.use((request, response, next) => {
        if (request.url !== '/api/curriculum/draft') return next()
        void handleLocalDraft(request, response, key)
      })
    },
  }
}
