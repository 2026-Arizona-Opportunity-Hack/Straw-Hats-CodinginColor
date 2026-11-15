import { draftStreamType, type ReportProgress } from '../../src/shared/curriculum/progress.ts'
import { DraftError } from './completion.ts'

export const draftJson = (status: number, data: unknown) =>
  Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } })

export function draftFailure(error: unknown, signal: AbortSignal) {
  if (error instanceof DraftError) return { status: error.status, error: error.message }
  if (signal.aborted || (error instanceof Error && error.name === 'TimeoutError')) {
    return { status: 504, error: 'Generation took too long. Try a shorter source.' }
  }
  console.error('Curriculum draft failed', { errorType: error instanceof Error ? error.name : 'unknown' })
  return { status: 502, error: 'Could not generate a draft. Try again.' }
}

export async function draftResponse(request: Request, signal: AbortSignal, generate: (signal: AbortSignal, report?: ReportProgress) => Promise<unknown>) {
  if (!request.headers.get('Accept')?.includes(draftStreamType)) {
    try { return draftJson(200, await generate(signal)) } catch (error) {
      const failure = draftFailure(error, signal)
      return draftJson(failure.status, { error: failure.error })
    }
  }

  const cancelled = new AbortController()
  const workSignal = AbortSignal.any([signal, cancelled.signal])
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const emit = (event: object) => {
        if (!cancelled.signal.aborted) controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'))
      }
      emit({ type: 'progress', stage: 'preparing' })
      const heartbeat = setInterval(() => emit({ type: 'heartbeat' }), 10_000)
      void generate(workSignal, stage => emit({ type: 'progress', stage })).then(data => emit({ type: 'result', data }), error => {
        if (!cancelled.signal.aborted) emit({ type: 'error', ...draftFailure(error, workSignal) })
      }).finally(() => {
        clearInterval(heartbeat)
        if (!cancelled.signal.aborted) controller.close()
      })
    },
    cancel() { cancelled.abort() },
  })
  return new Response(stream, { headers: { 'Content-Type': draftStreamType + '; charset=utf-8', 'Cache-Control': 'no-store' } })
}
