import { parse, serialize } from 'parse5'
import { catPhotoChecks, catPhotoElements } from '../../../supabase/functions/cat-photo-check/checks.ts'
import catPhoto from './cat-photo.jpg?inline'

export async function previewCatPhotoChecks(source: string) {
  const checks = catPhotoChecks(parse(source))
  return { checks, completed: checks.every(check => check.passed) }
}

export function catPhotoPreview(source: string) {
  const doc = parse(source)
  for (const node of catPhotoElements(doc)) {
    if (node.nodeName !== 'img') continue
    const src = node.attrs?.find(attr => attr.name === 'src')
    if (src?.value === 'cat.jpg') src.value = catPhoto
  }
  return serialize(doc)
}
