// Rubrics for hand-graded blocks: build them (editor), show them to students (view), and
// score with them while grading (picker).
import { Plus, Trash2 } from 'lucide-react';
import { pointsLabel } from './display';
import { criterionMax, newCriterion, newRating, rubricTotal, type RubricCriterion, type RubricRating } from './model';

export function RubricEditor({ rubric, onChange }: { rubric: RubricCriterion[] | undefined; onChange: (rubric: RubricCriterion[] | undefined) => void }) {
  if (!rubric?.length) {
    return <div className="ic-rubric-empty">
      <p className="ic-note">Grade this with a points box, or add a rubric so students know how it is graded.</p>
      <button type="button" className="ic-button ic-fit" onClick={() => onChange([newCriterion('')])}><Plus size={15} /> Add rubric</button>
    </div>;
  }
  const setCriterion = (index: number, patch: Partial<RubricCriterion>) => onChange(rubric.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  const setRating = (ci: number, ri: number, patch: Partial<RubricRating>) =>
    setCriterion(ci, { ratings: rubric[ci].ratings.map((r, i) => (i === ri ? { ...r, ...patch } : r)) });

  return <div className="ic-rubric-editor" role="group" aria-label="Rubric">
    <div className="ic-rubric-head">
      <strong>Rubric</strong>
      <span className="ic-note">Worth {pointsLabel(rubricTotal(rubric))}: the top rating of each criterion.</span>
      <button type="button" className="ic-link-button ic-push" onClick={() => { if (window.confirm('Remove the whole rubric?')) onChange(undefined); }}>Remove rubric</button>
    </div>
    {rubric.map((criterion, ci) => <fieldset key={criterion.id} className="ic-criterion">
      <legend>Criterion {ci + 1} · up to {pointsLabel(criterionMax(criterion))}</legend>
      <div className="ic-criterion-fields">
        <label className="ic-grow">Criterion<input value={criterion.title} maxLength={200} placeholder="Explains the idea clearly" onChange={event => setCriterion(ci, { title: event.target.value })} /></label>
        <label className="ic-grow">What you look for (optional)<input value={criterion.description} maxLength={500} onChange={event => setCriterion(ci, { description: event.target.value })} /></label>
        <button type="button" className="ic-icon" aria-label={`Delete criterion ${ci + 1}`} disabled={rubric.length === 1} onClick={() => onChange(rubric.filter((_, i) => i !== ci))}><Trash2 size={16} /></button>
      </div>
      <div className="ic-ratings" role="group" aria-label={`Ratings for criterion ${ci + 1}`}>
        <div className="ic-rating-edit ic-rating-labels" aria-hidden="true"><span>Rating</span><span>Points</span><span>Description (optional)</span></div>
        {criterion.ratings.map((rating, ri) => <div key={rating.id} className="ic-rating-edit">
          <input aria-label={`Rating ${ri + 1} name, criterion ${ci + 1}`} value={rating.label} maxLength={80} placeholder="Excellent" onChange={event => setRating(ci, ri, { label: event.target.value })} />
          <input aria-label={`Rating ${ri + 1} points, criterion ${ci + 1}`} type="number" min={0} max={100} step="any" className="ic-points" value={rating.points} onChange={event => setRating(ci, ri, { points: Math.max(0, Number(event.target.value) || 0) })} />
          <input aria-label={`Rating ${ri + 1} description, criterion ${ci + 1}`} className="ic-rating-desc" value={rating.description} maxLength={300} placeholder="What earns this rating" onChange={event => setRating(ci, ri, { description: event.target.value })} />
          <button type="button" className="ic-icon" aria-label={`Delete rating ${rating.label || ri + 1} in criterion ${ci + 1}`} disabled={criterion.ratings.length === 1}
            onClick={() => setCriterion(ci, { ratings: criterion.ratings.filter((_, i) => i !== ri) })}><Trash2 size={15} /></button>
        </div>)}
        {criterion.ratings.length < 6 && <button type="button" className="ic-link-button ic-fit" onClick={() => setCriterion(ci, { ratings: [...criterion.ratings, newRating('', 0)] })}>Add rating</button>}
      </div>
    </fieldset>)}
    <button type="button" className="ic-button ic-fit" onClick={() => onChange([...rubric, newCriterion('')])}><Plus size={15} /> Add criterion</button>
  </div>;
}

/** Read-only rubric table, as students see it. */
export function RubricView({ rubric }: { rubric: RubricCriterion[] }) {
  return <details className="ic-rubric-view">
    <summary>How this is graded · {pointsLabel(rubricTotal(rubric))}</summary>
    <table className="ic-data-table">
      <thead><tr><th scope="col">Criterion</th><th scope="col">Ratings</th></tr></thead>
      <tbody>{rubric.map(c => <tr key={c.id}>
        <th scope="row"><strong>{c.title}</strong>{c.description && <span className="ic-note"> {c.description}</span>}</th>
        <td><ul className="ic-rating-list">{c.ratings.map(r => <li key={r.id}><strong>{r.label}</strong> · {pointsLabel(r.points)}{r.description && <span className="ic-note"> · {r.description}</span>}</li>)}</ul></td>
      </tr>)}</tbody>
    </table>
  </details>;
}

/** Choose one rating per criterion while grading. */
export function RubricPicker({ rubric, picks, onPick, blockLabel }: {
  rubric: RubricCriterion[]; picks: Record<string, string>; onPick: (criterionId: string, ratingId: string | null) => void; blockLabel: string;
}) {
  return <div className="ic-rubric-picker">
    {rubric.map(c => <div key={c.id} className="ic-pick-row" role="group" aria-label={`${blockLabel}: ${c.title}`}>
      <div className="ic-pick-title"><strong>{c.title}</strong>{c.description && <span className="ic-note">{c.description}</span>}</div>
      <div className="ic-pick-options">{c.ratings.map(r => <button key={r.id} type="button" aria-pressed={picks[c.id] === r.id} className="ic-pick"
        title={r.description || undefined} onClick={() => onPick(c.id, picks[c.id] === r.id ? null : r.id)}>
        <span>{r.label}</span><strong>{r.points}</strong>
      </button>)}</div>
    </div>)}
  </div>;
}
