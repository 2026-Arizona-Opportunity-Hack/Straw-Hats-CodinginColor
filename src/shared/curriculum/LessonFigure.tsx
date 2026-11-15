import type { LessonFigure as Figure, FigurePoint } from './figure'

const coordinate = (n: number) => Math.round(Math.min(1000, Math.max(0, n)))
const arrowDirection: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
}

export function LessonFigure({ figure, onPoint, pending = [], edit }: {
  figure: Figure; onPoint?: (point: FigurePoint) => void; pending?: FigurePoint[]
  edit?: { points: FigurePoint[]; move: (index: number, point: FigurePoint) => void }
}) {
  return <figure className="cic-teaching-figure">
    <div className="cic-figure-layer">
      <img src={figure.src} alt={figure.alt} draggable={false} />
      <svg viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden={edit ? undefined : true}
        className={onPoint ? 'cic-figure-drawing' : edit ? 'cic-figure-editing' : undefined} onClick={onPoint && (event => {
          const bounds = event.currentTarget.getBoundingClientRect()
          if (!bounds.width || !bounds.height) return
          const scale = (p: number, size: number) => coordinate(p / size * 1000)
          onPoint({ x: scale(event.clientX - bounds.x, bounds.width), y: scale(event.clientY - bounds.y, bounds.height) })
        })}>
        {figure.marks.map((mark, index) => {
          const color = ['#006d61', '#6d28a5', '#9e3709'][index % 3]
          const points = mark.kind === 'box' ? [mark.from, mark.to] : mark.points
          const x = Math.min(...points.map(p => p.x))
          const y = Math.min(...points.map(p => p.y))
          return <g key={index} stroke={color} strokeWidth="3">
            {mark.kind === 'box' ? <rect x={x} y={y} width={Math.abs(mark.from.x - mark.to.x)} height={Math.abs(mark.from.y - mark.to.y)}
              vectorEffect="non-scaling-stroke" fill="none" /> : <polygon points={points.map(p => p.x + ',' + p.y).join(' ')}
              vectorEffect="non-scaling-stroke" fill={color} fillOpacity=".38" />}
            {mark.label && (mark.kind === 'box' || !figure.marks.some(other => other.kind === 'box' && other.label === mark.label))
              && <text x={Math.min(x + 6, 900)} y={Math.min(988, y + 35)} stroke="white" strokeWidth="6"
              paintOrder="stroke" fill={color} fontSize="38" fontWeight="700">{mark.label}</text>}
          </g>
        })}
        {!!pending.length && <g fill="white" stroke="#133e31" strokeWidth="3">
          <polyline points={pending.map(p => p.x + ',' + p.y).join(' ')} fill="none" vectorEffect="non-scaling-stroke" />
          {pending.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="6" vectorEffect="non-scaling-stroke" />)}
        </g>}
        {edit?.points.map((point, index) => <circle key={index} cx={point.x} cy={point.y} r="12"
          fill="white" stroke="#133e31" strokeWidth="2" vectorEffect="non-scaling-stroke"
          tabIndex={0} role="button" aria-label={'Adjust point ' + (index + 1)}
          onPointerDown={event => {
            if (event.button === 0) event.currentTarget.setPointerCapture(event.pointerId)
          }}
          onPointerMove={event => {
            if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
            const bounds = event.currentTarget.ownerSVGElement?.getBoundingClientRect()
            if (!bounds?.width || !bounds.height) return
            edit.move(index, {
              x: coordinate((event.clientX - bounds.x) / bounds.width * 1000),
              y: coordinate((event.clientY - bounds.y) / bounds.height * 1000),
            })
          }}
          onKeyDown={event => {
            const direction = arrowDirection[event.key]
            if (!direction) return
            event.preventDefault()
            const step = event.shiftKey ? 20 : 5
            edit.move(index, { x: coordinate(point.x + direction[0] * step), y: coordinate(point.y + direction[1] * step) })
          }} />)}
      </svg>
    </div>
    {figure.caption && <figcaption>{figure.caption}</figcaption>}
  </figure>
}
