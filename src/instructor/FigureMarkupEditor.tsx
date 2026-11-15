import { useId, useState } from 'react'
import { LessonFigure } from '../shared/curriculum/LessonFigure'
import { maxFigureMarks, maxMaskPoints, type FigureMark, type FigurePoint, type LessonFigure as Figure } from '../shared/curriculum/figure'

export function FigureMarkupEditor({ figure, onChange }: { figure: Figure; onChange: (next: Figure) => void }) {
  const [mode, setMode] = useState<FigureMark['kind']>('box')
  const [label, setLabel] = useState('')
  const [points, setPoints] = useState<FigurePoint[]>([])
  const [selected, setSelected] = useState<number | null>(null)
  const [position, setPosition] = useState({ x: '25', y: '25' })
  const positionHint = useId()
  const mark = selected === null ? undefined : figure.marks[selected]
  const full = figure.marks.length >= maxFigureMarks
  const nextPoint = { x: Number(position.x) * 10, y: Number(position.y) * 10 }
  const validPosition = [position.x, position.y].every(value => value.trim() !== '' && Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 100)
  const smallBox = mode === 'box' && !!points[0] && (Math.abs(points[0].x - nextPoint.x) <= 3 || Math.abs(points[0].y - nextPoint.y) <= 3)
  function editMark(updated: FigureMark) {
    onChange({ ...figure, marks: figure.marks.map((original, index) => index === selected ? updated : original) })
  }
  function movePoint(index: number, point: FigurePoint) {
    if (!mark) return
    if (mark.kind === 'mask') {
      editMark({ ...mark, points: mark.points.map((original, i) => i === index ? point : original) })
      return
    }
    const from = index === 0 ? point : mark.from
    const to = index === 1 ? point : mark.to
    if (Math.abs(from.x - to.x) > 3 && Math.abs(from.y - to.y) > 3) editMark({ ...mark, from, to })
  }
  function addMark(mark: FigureMark) {
    if (full) return
    onChange({ ...figure, marks: [...figure.marks, mark] })
    setPoints([])
    setLabel('')
  }
  function addPoint(next: FigurePoint) {
    if (mode === 'box' && points[0]) {
      const from = points[0]
      if (Math.abs(from.x - next.x) > 3 && Math.abs(from.y - next.y) > 3) {
        addMark({ kind: mode, label: label.trim(), from, to: next })
      }
      return
    }
    if (points.length < maxMaskPoints) setPoints([...points, next])
  }
  const annotationCount = figure.marks.length + ' annotations added.'
  return <div className="ic-stack">
    {!!figure.marks.length && <label>Adjust an annotation<select value={selected ?? ''} onChange={event => {
      setSelected(event.target.value === '' ? null : Number(event.target.value))
      setPoints([])
    }}>
      <option value="">Choose an annotation</option>
      {figure.marks.map((item, index) => <option key={index} value={index}>
        {index + 1}. {item.label ? item.label + ' · ' + item.kind : item.kind === 'box' ? 'Box' : 'Mask'}
      </option>)}
    </select></label>}
    <div className="ic-row ic-figure-tools" role="group" aria-label="Annotation tools">
      {(['box', 'mask'] as const).map(tool => <button key={tool} type="button" className="ic-button" aria-pressed={!mark && mode === tool}
        onClick={() => { setSelected(null); setMode(tool); setPoints([]) }}>{tool === 'box' ? 'Draw box' : 'Trace mask'}</button>)}
      {mark ? <button type="button" className="ic-button" onClick={() => {
        onChange({ ...figure, marks: figure.marks.filter((_, index) => index !== selected) })
        setSelected(null)
      }}>Remove annotation</button> : <button type="button" className="ic-button" disabled={!points.length && !figure.marks.length} onClick={() => points.length
        ? setPoints(points.slice(0, -1)) : onChange({ ...figure, marks: figure.marks.slice(0, -1) })}>Undo</button>
      }
      {!mark && mode === 'mask' && <button type="button" className="ic-button" disabled={full || points.length < 3}
        onClick={() => addMark({ kind: 'mask', label: label.trim(), points })}>Finish mask</button>}
    </div>
    <label>Annotation label (optional)<input value={mark?.label ?? label} maxLength={40} disabled={!mark && full}
      onChange={event => mark ? editMark({ ...mark, label: event.target.value }) : setLabel(event.target.value)} /></label>
    <p className="ic-note" role="status">{mark ? 'Drag a point to move it, or focus it and use the arrow keys.'
      : full ? 'This image has reached its annotation limit.'
      : mode === 'box' ? (points.length ? 'Select the opposite corner.' : 'Select two opposite corners. ' + annotationCount)
        : 'Select points around the object, then choose Finish mask. ' + (points.length ? points.length + ' points selected.' : annotationCount)}</p>
    {!mark && <details className="ic-annotation-position">
      <summary>Add points with the keyboard</summary>
      <div className="ic-stack">
        <p className="ic-note" id={positionHint}>Enter percentages from the left and top of the image, then choose Add point.
          {mode === 'box' ? ' Add two opposite corners to make a box.' : ' Add at least three points, then choose Finish mask.'}</p>
        <div className="ic-row">
          <label>From left (%)<input type="number" min="0" max="100" step="1" value={position.x} disabled={full}
            aria-describedby={positionHint} onChange={event => setPosition({ ...position, x: event.target.value })} /></label>
          <label>From top (%)<input type="number" min="0" max="100" step="1" value={position.y} disabled={full}
            aria-describedby={positionHint} onChange={event => setPosition({ ...position, y: event.target.value })} /></label>
          <button type="button" className="ic-button" disabled={full || !validPosition || smallBox || points.length >= maxMaskPoints}
            onClick={() => addPoint(nextPoint)}>Add point</button>
        </div>
        {!validPosition && <p className="ic-note" role="status">Enter a number from 0 to 100 for each position.</p>}
        {smallBox && <p className="ic-note">Choose a corner with a different horizontal and vertical position.</p>}
      </div>
    </details>}
    <LessonFigure figure={figure} pending={points} onPoint={mark || full ? undefined : addPoint}
      edit={mark && { points: mark.kind === 'box' ? [mark.from, mark.to] : mark.points, move: movePoint }} />
    <label>Image description<input maxLength={240} value={figure.alt} onChange={event => onChange({ ...figure, alt: event.target.value })} /></label>
    <label>Caption (optional)<input maxLength={400} value={figure.caption} onChange={event => onChange({ ...figure, caption: event.target.value })} /></label>
  </div>
}
