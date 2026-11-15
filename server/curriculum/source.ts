import { isDraftQuality, maxSelectedImages, maxSlideImageBytes, maxSlides, maxSourceText, type DraftSource } from '../../src/shared/curriculum/draft.ts'

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

export function parseSource(input: unknown): DraftSource | null {
  if (!record(input) || typeof input.audience !== 'string' || input.audience.length > 180) return null
  const audience = input.audience.trim()
  const quality = isDraftQuality(input.quality) ? { quality: input.quality } : {}
  if (input.kind === 'lesson_plan') {
    if (typeof input.text !== 'string' || !input.text.trim() || input.text.length > maxSourceText) return null
    return { kind: 'lesson_plan', text: input.text.trim(), audience, ...quality }
  }
  if (input.kind !== 'slide_deck' || !Array.isArray(input.slides) || !input.slides.length || input.slides.length > maxSlides
    || !Array.isArray(input.images) || input.images.length > maxSelectedImages) return null

  const slides = []
  let previous = 0
  let textSize = 0
  for (const slide of input.slides) {
    if (!record(slide) || typeof slide.number !== 'number' || !Number.isInteger(slide.number) || slide.number <= previous
      || slide.number > maxSlides || typeof slide.text !== 'string' || typeof slide.notes !== 'string'
      || !Array.isArray(slide.reviewFlags) || slide.reviewFlags.length > 8
      || slide.reviewFlags.some(flag => typeof flag !== 'string' || flag.length > 240)) return null
    previous = slide.number
    textSize += slide.text.length + slide.notes.length
    if (textSize > maxSourceText) return null
    slides.push({ number: slide.number, text: slide.text, notes: slide.notes, reviewFlags: slide.reviewFlags as string[] })
  }

  const images = []
  const seen = new Set<string>()
  for (const image of input.images) {
    if (!record(image) || typeof image.id !== 'string' || !/^[a-z0-9-]{1,40}$/.test(image.id) || seen.has(image.id)
      || typeof image.slideNumber !== 'number' || !slides.some(slide => slide.number === image.slideNumber)
      || typeof image.dataUrl !== 'string' || !validImage(image.dataUrl)) return null
    seen.add(image.id)
    images.push({ id: image.id, slideNumber: image.slideNumber, dataUrl: image.dataUrl })
  }
  if (!images.length && !slides.some(slide => slide.text.trim() || slide.notes.trim())) return null
  return { kind: 'slide_deck', audience, slides, images, ...quality }
}

function validImage(dataUrl: string) {
  const match = /^data:image\/(png|jpeg);base64,([a-z0-9+/]+={0,2})$/i.exec(dataUrl)
  if (!match || match[2].length > Math.ceil(maxSlideImageBytes / 3) * 4 || match[2].length % 4 !== 0) return false
  const bytes = Buffer.from(match[2], 'base64')
  const signature = match[1].toLowerCase() === 'png' ? '89504e470d0a1a0a' : 'ffd8ff'
  return bytes.length <= maxSlideImageBytes && bytes.toString('hex', 0, signature.length / 2) === signature
}
