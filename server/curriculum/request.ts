import { readFile } from 'node:fs/promises'
import { isDraftQuality, maxDraftRequest } from '../../src/shared/curriculum/draft.ts'
import { generateCodingLab, parseCodingLabRequest } from './codingLab.ts'
import { generateDraft } from './generate.ts'
import { draftFailure, draftJson as reply, draftResponse } from './response.ts'
import { parseSource } from './source.ts'

export async function generateFromRequest(request: Request, key: string, signal: AbortSignal) {
  try {
    const bytes = await request.arrayBuffer()
    if (bytes.byteLength > maxDraftRequest) return reply(413, { error: 'Use a smaller lesson source.' })
    let body
    try { body = JSON.parse(new TextDecoder().decode(bytes)) } catch { return reply(400, { error: 'Send valid lesson materials.' }) }
    const guideFile = new URL('../../docs/lesson-style-guide.md', import.meta.url)
    if (body?.kind === 'coding_lab') {
      const lab = parseCodingLabRequest(body)
      if (!lab) return reply(400, { error: 'Provide valid lesson material for the coding lab.' })
      const guide = await readFile(guideFile, 'utf8')
      return draftResponse(request, signal, (workSignal, report) => generateCodingLab(lab, guide, key, workSignal, report))
    }
    if (body?.quality !== undefined && !isDraftQuality(body.quality)) return reply(400, { error: 'Choose a valid draft quality.' })
    const source = parseSource(body)
    if (!source) return reply(400, { error: 'Check the materials. Use up to 80,000 characters, 60 slides, and six embedded images.' })
    const guide = await readFile(guideFile, 'utf8')
    return draftResponse(request, signal, (workSignal, report) => generateDraft(source, guide, key, workSignal, report))
  } catch (error) {
    const failure = draftFailure(error, signal)
    return reply(failure.status, { error: failure.error })
  }
}
