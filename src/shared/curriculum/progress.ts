export const draftStreamType = 'application/x-ndjson'

export const generationStages = {
  preparing: 'Checking your request…',
  references: 'Looking up curriculum references…',
  model: 'Waiting for the model to finish…',
  validating: 'Validating the result…',
} as const

export type GenerationStage = keyof typeof generationStages
export type ReportProgress = (stage: GenerationStage) => void
