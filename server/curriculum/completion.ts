import type { GenerationStage, ReportProgress } from '../../src/shared/curriculum/progress.ts'

export const draftTimeoutMs = 280_000
const completionTimeoutMs = 265_000
const openRouterUrl = 'https://openrouter.ai/api/v1'

const routes = {
  codingLab: { model: 'openai/gpt-6.1-sol', endpoint: 'azure/us', maxTokens: 10_000, promptPrice: 2.2, completionPrice: 11 },
  standard: { model: 'openai/gpt-6.1-terra', endpoint: 'azure/us', maxTokens: 13_000, promptPrice: 1.1, completionPrice: 5.5 },
  high: { model: 'anthropic/claude-opus-5.5', endpoint: 'google-vertex/global', maxTokens: 16_000, promptPrice: 4, completionPrice: 20 },
}

export class DraftError extends Error {
  readonly status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

type Completion = {
  model?: string
  usage?: { cost?: number }
  choices?: { finish_reason?: string; message?: { content?: string } }[]
}

export async function verifyEndpoint(route: { model: string; endpoint: string }, signal: AbortSignal) {
  const catalog = await fetch(openRouterUrl + '/endpoints/zdr', {
    cache: 'no-store', signal: AbortSignal.any([signal, AbortSignal.timeout(8_000)]),
  }).then(response => response.ok ? response.json() : null).catch(() => null) as {
    data?: { model_id?: string; tag?: string; safety_retention?: boolean }[]
  } | null
  signal.throwIfAborted()
  if (!Array.isArray(catalog?.data) || !catalog.data.some(endpoint => endpoint?.model_id === route.model
    && endpoint.tag === route.endpoint && endpoint.safety_retention === false)) {
    throw new DraftError('The selected model is unavailable under the curriculum privacy settings. Try again later.', 503)
  }
}

type MessagePart = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }

export async function completeDraft({ quality, key, signal, guideVersion, instructions, source, schema, report, stage, limits }: {
  quality: keyof typeof routes; key: string; signal: AbortSignal; guideVersion: string | undefined
  instructions: string; source: string | MessagePart[]; schema: object; report?: ReportProgress
  stage?: GenerationStage; limits?: { timeoutMs: number; maxTokens?: number; effort?: 'medium' | 'high' }
}) {
  const route = routes[quality]
  const completionSignal = AbortSignal.any([signal, AbortSignal.timeout(limits?.timeoutMs ?? completionTimeoutMs)])
  await verifyEndpoint(route, completionSignal)
  report?.(stage ?? 'model')
  const started = Date.now()
  const response = await fetch(openRouterUrl + '/chat/completions', {
    method: 'POST', signal: completionSignal,
    headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: route.model,
      max_tokens: limits?.maxTokens ?? route.maxTokens,
      reasoning: { effort: limits?.effort ?? 'high', exclude: true },
      provider: {
        only: [route.endpoint], allow_fallbacks: false, require_parameters: true, zdr: true, data_collection: 'deny',
        max_price: { prompt: route.promptPrice, completion: route.completionPrice },
      },
      response_format: { type: 'json_schema', json_schema: { name: 'curriculum_draft', strict: true, schema } },
      messages: [
        { role: 'system', content: instructions },
        { role: 'user', content: source },
      ],
    }),
  })
  if (response.status === 408 || response.status === 504) {
    throw new DraftError('Drafting took too long. Try a shorter source.', 504)
  }
  if (!response.ok) throw new DraftError('The selected model could not generate a draft. Try again later.', 502)
  const completion = await response.json().catch(() => null) as Completion | null
  completionSignal.throwIfAborted()
  console.info('curriculum draft', { model: completion?.model || route.model, guide: guideVersion, cost: completion?.usage?.cost, latencyMs: Date.now() - started })
  if (!stage) report?.('validating')
  const choice = completion?.choices?.[0]
  if (choice?.finish_reason === 'length') {
    throw new DraftError('The draft exceeded the model’s output limit. Try splitting the source into smaller modules.', 502)
  }
  return choice?.message?.content
}
