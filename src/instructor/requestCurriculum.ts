import { draftStreamType, generationStages, type GenerationStage, type ReportProgress } from '../shared/curriculum/progress'
import { supabase } from '../shared/supabase'

export async function requestCurriculum<T>(request: object, signal: AbortSignal, report: ReportProgress): Promise<T> {
  if (!supabase) throw new Error('Curriculum generation requires an instructor session.')
  const { data } = await supabase.auth.getSession()
  if (!data.session) throw new Error('Sign in as an instructor to generate a draft.')
  const response = await fetch('/api/curriculum/draft', {
    method: 'POST', headers: { Authorization: 'Bearer ' + data.session.access_token, 'Content-Type': 'application/json', Accept: draftStreamType },
    body: JSON.stringify(request), signal,
  })
  if (!response.ok || !response.body || !response.headers.get('Content-Type')?.startsWith(draftStreamType)) {
    const body = await response.json().catch(() => null)
    if (!response.ok || !body) throw new Error(body?.error || 'Curriculum conversion is unavailable. Try again later.')
    return body as T
  }

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
  let pending = ''
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) throw new Error('The generation connection ended before the result arrived. Try again.')
      const lines = (pending + value).split('\n')
      pending = lines.pop() ?? ''
      for (const line of lines) {
        const event = JSON.parse(line)
        if (event.type === 'progress' && Object.hasOwn(generationStages, event.stage)) report(event.stage as GenerationStage)
        if (event.type === 'error') throw new Error(event.error)
        if (event.type === 'result') return event.data as T
      }
    }
  } finally { await reader.cancel().catch(() => {}) }
}
