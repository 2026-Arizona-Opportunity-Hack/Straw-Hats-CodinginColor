import { defaultUrlTransform } from 'react-markdown'

export function curriculumUrl(url: string, key: string) {
  if (key === 'src' && /^data:image\/(png|jpeg|webp|gif);base64,[a-z0-9+/=]+$/i.test(url)) return url
  return defaultUrlTransform(url)
}
