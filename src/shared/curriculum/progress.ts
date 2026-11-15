export const draftStreamType = 'application/x-ndjson'

export const generationStages = {
  preparing: 'Checking your request…',
  references: 'Looking up curriculum references…',
  model: 'Waiting for the model to finish…',
  drafting: 'Building the lessons with Terra…',
  reviewing: 'Revising the draft with Opus…',
  checking: 'Checking for gaps with Jev…',
  repairing: 'Making a targeted edit with Terra…',
  illustrating: 'Generating the base image with Seedream…',
  validating: 'Validating the result…',
} as const

export type GenerationStage = keyof typeof generationStages
export type ReportProgress = (stage: GenerationStage) => void
