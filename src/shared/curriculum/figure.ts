export const maxDraftImages = 5
export const maxImagePrompt = 1200
export const maxFigureDataUrl = 340_000
export const maxFigureMarks = 16
export const maxMaskPoints = 120

export type FigurePoint = { x: number; y: number }
export type FigureMark =
  | { kind: 'box'; label: string; from: FigurePoint; to: FigurePoint }
  | { kind: 'mask'; label: string; points: FigurePoint[] }
export type LessonFigure = { src: string; alt: string; caption: string; marks: FigureMark[] }
export type ImageDraftResult = { remaining: number; src?: string; cost?: number; error?: string }

const point = (value: FigurePoint | undefined) => !!value && [value.x, value.y]
  .every(n => typeof n === 'number' && n >= 0 && n <= 1000)

export function validLessonFigure(value: unknown): value is LessonFigure {
  const figure = value as LessonFigure | null
  return !!figure && typeof figure.src === 'string' && figure.src.length <= maxFigureDataUrl
    && /^data:image\/jpeg;base64,[a-z0-9+/]+={0,2}$/i.test(figure.src)
    && typeof figure.alt === 'string' && figure.alt.trim().length > 0 && figure.alt.length <= 240
    && typeof figure.caption === 'string' && figure.caption.length <= 400
    && Array.isArray(figure.marks) && figure.marks.length <= maxFigureMarks
    && figure.marks.every(mark => mark && typeof mark.label === 'string' && mark.label.length <= 40
      && (mark.kind === 'box' ? point(mark.from) && point(mark.to)
        : mark.kind === 'mask' && Array.isArray(mark.points) && mark.points.length >= 3
          && mark.points.length <= maxMaskPoints && mark.points.every(point)))
}
