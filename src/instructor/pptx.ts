import { BlobReader, ZipReader, type FileEntry } from '@zip.js/zip.js'
import { maxSlideImageBytes, maxSlides, maxSourceText, type DraftSlide, type SlideImage } from '../shared/curriculum/draft'

const xmlBytes = 512 * 1024
const archiveBytes = 32 * 1024 * 1024
const maxImagePreviews = 36
const archiveOrigin = 'https://pptx.invalid'

const nodes = (xml: Document | Element, name: string) => Array.from(xml.getElementsByTagNameNS('*', name))
const relationshipId = (element: Element, name: string) =>
  Array.from(element.attributes).find(attr => attr.localName === name && attr.namespaceURI?.endsWith('/relationships'))?.value

function relatedPath(part: string, target: string) {
  const url = new URL(target, archiveOrigin + '/' + part)
  if (url.origin !== archiveOrigin) return null
  const path = decodeURIComponent(url.pathname.slice(1))
  return path.startsWith('ppt/') && path.split('/').every(segment => !!segment && segment !== '..' && segment !== '.')
    ? path : null
}

function paragraphText(element: Document | Element) {
  return nodes(element, 'p').map(p => nodes(p, 't').map(run => run.textContent ?? '').join('').trim()).filter(Boolean).join('\n')
}

async function readPart(entry: FileEntry, limit: number, signal?: AbortSignal) {
  if (entry.encrypted || entry.uncompressedSize > limit) throw new Error('The PowerPoint contains a protected or oversized part.')
  const chunks: ArrayBuffer[] = []
  let length = 0
  await entry.getData(new WritableStream<Uint8Array>({
    write(chunk) {
      length += chunk.length
      if (length > limit) throw new Error('The PowerPoint contains an oversized part.')
      chunks.push(chunk.slice().buffer as ArrayBuffer)
    },
  }), { signal })
  return new Blob(chunks)
}

function dataUrl(blob: Blob, mime: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Could not decode an image.'))
    reader.onerror = () => reject(new Error('Could not decode an image.'))
    reader.readAsDataURL(new Blob([blob], { type: mime }))
  })
}

export async function readPptx(file: File, signal?: AbortSignal): Promise<{ slides: DraftSlide[]; images: SlideImage[] }> {
  if (file.size > archiveBytes) throw new Error('Choose a PowerPoint file under 32 MiB.')
  const zip = new ZipReader(new BlobReader(file))
  const entries = new Map<string, FileEntry>()
  try {
    for await (const entry of zip.getEntriesGenerator()) {
      signal?.throwIfAborted()
      if (entry.directory) continue
      if (entries.size >= 2500 || entries.has(entry.filename)) throw new Error('This PowerPoint has too many or duplicate parts.')
      entries.set(entry.filename, entry)
    }

    async function xml(part: string) {
      const entry = entries.get(part)
      if (!entry) throw new Error('This PowerPoint is missing part of its presentation data.')
      const source = await (await readPart(entry, xmlBytes, signal)).text()
      if (/<!DOCTYPE/i.test(source)) throw new Error('The PowerPoint contains an unsupported XML document.')
      const document = new DOMParser().parseFromString(source, 'application/xml')
      if (nodes(document, 'parsererror').length) throw new Error('A PowerPoint slide could not be read.')
      return document
    }

    async function relationships(part: string) {
      const path = part.replace(/([^/]+)$/, '_rels/$1.rels')
      if (!entries.has(path)) return []
      return nodes(await xml(path), 'Relationship').flatMap(element => {
        if (element.getAttribute('TargetMode')?.toLowerCase() === 'external') return []
        const target = element.getAttribute('Target')
        const destination = target && relatedPath(part, target)
        return destination ? [{ id: element.getAttribute('Id'), type: element.getAttribute('Type')?.split('/').pop(), path: destination }] : []
      })
    }

    const presentation = 'ppt/presentation.xml'
    const order = nodes(await xml(presentation), 'sldId')
    const presentationLinks = await relationships(presentation)
    if (!order.length || order.length > maxSlides) throw new Error('Choose a PowerPoint with 1 to 60 slides.')
    const slides: DraftSlide[] = []
    const images: SlideImage[] = []
    let textSize = 0
    for (const [index, item] of order.entries()) {
      const part = presentationLinks.find(link => link.type === 'slide' && link.id === relationshipId(item, 'id'))?.path
      if (!part) throw new Error('A PowerPoint slide is missing.')
      const slide = await xml(part)
      if (slide.documentElement.getAttribute('show') === '0') continue
      const links = await relationships(part)
      const notesPart = links.find(link => link.type === 'notesSlide')?.path
      const notes = notesPart ? nodes(await xml(notesPart), 'sp').filter(shape => {
        const placeholder = nodes(shape, 'ph')[0]
        return !placeholder || placeholder.getAttribute('type') === 'body'
      }).map(paragraphText).filter(Boolean).join('\n') : ''
      const number = index + 1
      const text = paragraphText(slide)
      textSize += text.length + notes.length
      if (textSize > maxSourceText) throw new Error('The slide text and notes exceed 80,000 characters. Split the deck and try again.')
      const reviewFlags: string[] = []
      if (['graphicFrame', 'cxnSp', 'videoFile', 'audioFile'].some(name => nodes(slide, name).length)
        || nodes(slide, 'sp').some(shape => !paragraphText(shape) && nodes(shape, 'spPr').length)) {
        reviewFlags.push('Review charts, diagrams, or media alongside the source slide.')
      }
      let skippedImage = false
      for (const [imageIndex, picture] of nodes(slide, 'pic').entries()) {
        const embed = nodes(picture, 'blip')[0]
        const link = embed && links.find(item => item.type === 'image' && item.id === relationshipId(embed, 'embed'))
        const entry = link && entries.get(link.path)
        const mime = link && (/\.png$/i.test(link.path) ? 'image/png' : /\.jpe?g$/i.test(link.path) ? 'image/jpeg' : null)
        if (!entry || !mime || entry.uncompressedSize > maxSlideImageBytes || images.length >= maxImagePreviews) {
          skippedImage = true
          continue
        }
        images.push({ id: `slide-${number}-image-${imageIndex + 1}`, slideNumber: number,
          dataUrl: await dataUrl(await readPart(entry, maxSlideImageBytes, signal), mime) })
      }
      if (skippedImage) reviewFlags.push('An image was too large, unsupported, externally linked, or outside the preview limit.')
      slides.push({ number, text, notes, reviewFlags })
    }
    if (!slides.length) throw new Error('The PowerPoint has no visible slides.')
    return { slides, images }
  } finally {
    await zip.close()
  }
}
