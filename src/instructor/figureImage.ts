import { maxFigureDataUrl } from '../shared/curriculum/figure'

export async function compressFigureImage(source: string) {
  const image = new Image()
  image.src = source
  await image.decode()
  const canvas = document.createElement('canvas')
  const ratio = Math.min(1, 1024 / Math.max(image.naturalWidth, image.naturalHeight))
  canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio))
  canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio))
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Could not prepare the image.')
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  for (const quality of [.86, .74, .58, .42]) {
    const result = canvas.toDataURL('image/jpeg', quality)
    if (result.length <= maxFigureDataUrl) return result
  }
  throw new Error('This image is too large to add to the lesson.')
}
