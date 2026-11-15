import { FilesetResolver, ImageSegmenter } from '@mediapipe/tasks-vision'
import { contours } from 'd3-contour'
import { maxFigureMarks, maxMaskPoints, type FigureMark, type FigurePoint } from '../shared/curriculum/figure'

const wasmPath = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.32/wasm'
const modelPath = 'https://storage.googleapis.com/mediapipe-models/image_segmenter/deeplab_v3/float32/1/deeplab_v3.tflite'
let segmenter: Promise<ImageSegmenter> | undefined

function loadSegmenter() {
  segmenter ??= FilesetResolver.forVisionTasks(wasmPath)
    .then(files => ImageSegmenter.createFromOptions(files, {
      baseOptions: { modelAssetPath: modelPath },
      outputCategoryMask: true,
      outputConfidenceMasks: false,
    }))
    .catch(error => {
      segmenter = undefined
      throw error
    })
  return segmenter
}

export async function suggestFigureMarks(src: string) {
  const image = new Image()
  image.src = src
  const [model] = await Promise.all([loadSegmenter(), image.decode()])
  let marks: FigureMark[] = []
  model.segment(image, ({ categoryMask }) => {
    if (categoryMask) marks = outlinesFromMask(
      categoryMask.getAsUint8Array(), categoryMask.width, categoryMask.height, model.getLabels(),
    )
  })
  return marks
}

function outlineArea(path: number[][]) {
  return Math.abs(path.slice(1).reduce((sum, [x, y], i) => sum + path[i][0] * y - path[i][1] * x, 0)) / 2
}

function simplify(points: FigurePoint[], tolerance: number): FigurePoint[] {
  if (points.length <= 2) return points
  const start = points[0]
  const end = points[points.length - 1]
  const dx = end.x - start.x
  const dy = end.y - start.y
  const span = dx * dx + dy * dy
  let farthest = 0
  let split = 0
  for (let i = 1; i < points.length - 1; i++) {
    const x = points[i].x - start.x
    const y = points[i].y - start.y
    const t = span ? Math.max(0, Math.min(1, (x * dx + y * dy) / span)) : 0
    const distance = Math.hypot(x - t * dx, y - t * dy)
    if (distance > farthest) {
      farthest = distance
      split = i
    }
  }
  if (farthest <= tolerance) return [start, end]
  return [...simplify(points.slice(0, split + 1), tolerance).slice(0, -1), ...simplify(points.slice(split), tolerance)]
}

export function outlinesFromMask(pixels: Uint8Array, width: number, height: number, labels: string[]): FigureMark[] {
  const scale = Math.min(1, 144 / Math.max(width, height))
  const cols = Math.max(1, Math.round(width * scale))
  const rows = Math.max(1, Math.round(height * scale))
  const samples = Uint8Array.from({ length: cols * rows }, (_, i) => {
    const x = Math.floor((i % cols + 0.5) * width / cols)
    const y = Math.floor((Math.floor(i / cols) + 0.5) * height / rows)
    return pixels[y * width + x]
  })
  const trace = contours().size([cols, rows]).thresholds([0.5])
  return [...new Set(samples)].flatMap(id => {
    const name = labels[id]
    if (!id || !name || name.toLowerCase() === 'background') return []
    const label = name[0].toUpperCase() + name.slice(1)
    const [outline] = trace(Array.from(samples, pixel => Number(pixel === id)))
    return outline.coordinates.map(([path]) => ({ path, label, area: outlineArea(path) }))
  }).filter(region => region.area >= cols * rows * 0.008)
    .sort((a, b) => b.area - a.area)
    .slice(0, maxFigureMarks / 2)
    .flatMap(({ path, label }): FigureMark[] => {
      const boundary = path.map(([x, y]) => ({ x: Math.round(x / cols * 1000), y: Math.round(y / rows * 1000) }))
      let outline = simplify(boundary, 7).slice(0, -1)
      for (let tolerance = 14; outline.length > maxMaskPoints; tolerance *= 2) {
        outline = simplify(boundary, tolerance).slice(0, -1)
      }
      if (outline.length < 3) return []
      const x = boundary.map(point => point.x)
      const y = boundary.map(point => point.y)
      return [
        { kind: 'mask', label, points: outline },
        { kind: 'box', label, from: { x: Math.min(...x), y: Math.min(...y) }, to: { x: Math.max(...x), y: Math.max(...y) } },
      ]
    })
}
