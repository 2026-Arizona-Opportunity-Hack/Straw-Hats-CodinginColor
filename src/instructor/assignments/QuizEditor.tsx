// Build quiz questions: choice, select-all, true/false, short answer and number.
import { ArrowDown, ArrowUp, Copy, Plus, Trash2 } from 'lucide-react';
import { id } from '../model';
import { newQuestion, questionKinds, type QuestionKind, type QuizQuestion } from './model';

export function QuizEditor({ questions, onChange }: { questions: QuizQuestion[]; onChange: (questions: QuizQuestion[]) => void }) {
  const set = (index: number, patch: Partial<QuizQuestion>) => onChange(questions.map((q, i) => i === index ? { ...q, ...patch } : q));
  const move = (from: number, to: number) => {
    if (to < 0 || to >= questions.length) return;
    const copy = [...questions];
    const [item] = copy.splice(from, 1);
    copy.splice(to, 0, item);
    onChange(copy);
  };

  return <section className="ic-tile ic-stack">
    <header className="ic-tile-heading"><div><h2>Questions</h2><p className="ic-note">{questions.length} question{questions.length === 1 ? '' : 's'} · {questions.reduce((sum, q) => sum + q.points, 0)} points</p></div></header>
    {questions.map((q, index) => <fieldset key={q.id} className="ic-question-card">
      <legend>Question {index + 1}</legend>
      <div className="ic-question-toolbar">
        <label className="ic-inline-field">Type<select value={q.kind} onChange={event => {
          const kind = event.target.value as QuestionKind;
          const fresh = newQuestion(kind);
          set(index, { kind, choices: kind === 'single' || kind === 'multiple' ? (q.choices.length >= 2 && q.kind !== 'truefalse' ? q.choices : fresh.choices) : fresh.choices, correct: kind === 'multiple' ? q.correct : q.correct.slice(0, 1) });
        }}>{Object.entries(questionKinds).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="ic-inline-field">Points<input type="number" min={0} max={100} className="ic-points" value={q.points} onChange={event => set(index, { points: Math.max(0, Number(event.target.value) || 0) })} /></label>
        <span className="ic-row ic-push">
          <button type="button" className="ic-icon" aria-label={`Move question ${index + 1} up`} disabled={index === 0} onClick={() => move(index, index - 1)}><ArrowUp size={16} /></button>
          <button type="button" className="ic-icon" aria-label={`Move question ${index + 1} down`} disabled={index === questions.length - 1} onClick={() => move(index, index + 1)}><ArrowDown size={16} /></button>
          <button type="button" className="ic-icon" aria-label={`Duplicate question ${index + 1}`} onClick={() => onChange([...questions.slice(0, index + 1), { ...structuredClone(q), id: id() }, ...questions.slice(index + 1)])}><Copy size={16} /></button>
          <button type="button" className="ic-icon" aria-label={`Delete question ${index + 1}`} disabled={questions.length === 1} onClick={() => onChange(questions.filter((_, i) => i !== index))}><Trash2 size={16} /></button>
        </span>
      </div>
      <label>Question<textarea id={'prompt-' + q.id} rows={2} value={q.prompt} maxLength={2000} onChange={event => set(index, { prompt: event.target.value })} /></label>
      {(q.kind === 'single' || q.kind === 'multiple' || q.kind === 'truefalse') && <div className="ic-stack ic-choices" role="group" aria-label={`Choices for question ${index + 1}`}>
        <p className="ic-note">{q.kind === 'multiple' ? 'Check every correct choice.' : 'Select the correct choice.'}</p>
        {q.choices.map((choice, ci) => <div className="ic-choice-row" key={ci}>
          <input type={q.kind === 'multiple' ? 'checkbox' : 'radio'} name={q.id + '-correct'} checked={q.correct.includes(ci)}
            aria-label={`Mark choice ${ci + 1} correct`}
            onChange={event => set(index, { correct: q.kind === 'multiple' ? (event.target.checked ? [...q.correct, ci] : q.correct.filter(c => c !== ci)) : [ci] })} />
          {q.kind === 'truefalse' ? <span>{choice}</span> : <input aria-label={`Choice ${ci + 1}`} value={choice} maxLength={500} placeholder={`Choice ${ci + 1}`}
            onChange={event => set(index, { choices: q.choices.map((c, i) => i === ci ? event.target.value : c) })} />}
          {q.kind !== 'truefalse' && q.choices.length > 2 && <button type="button" className="ic-icon" aria-label={`Remove choice ${ci + 1}`} onClick={() => set(index, {
            choices: q.choices.filter((_, i) => i !== ci),
            correct: q.correct.filter(c => c !== ci).map(c => c > ci ? c - 1 : c),
          })}><Trash2 size={15} /></button>}
        </div>)}
        {q.kind !== 'truefalse' && q.choices.length < 8 && <button type="button" className="ic-link-button ic-fit" onClick={() => set(index, { choices: [...q.choices, ''] })}>Add choice</button>}
      </div>}
      {q.kind === 'short' && <label>Accepted answers, one per line<textarea rows={3} value={q.accepted.join('\n')} placeholder={'print\nprint()'} onChange={event => set(index, { accepted: event.target.value.split('\n') })} />
        <span className="ic-note">Matching ignores capital letters and extra spaces.</span></label>}
      {q.kind === 'numeric' && <div className="ic-row">
        <label className="ic-inline-field">Correct number<input type="number" step="any" value={q.answer ?? ''} onChange={event => set(index, { answer: event.target.value === '' ? null : Number(event.target.value) })} /></label>
        <label className="ic-inline-field">Allowed difference<input type="number" step="any" min={0} value={q.tolerance} onChange={event => set(index, { tolerance: Math.max(0, Number(event.target.value) || 0) })} /></label>
      </div>}
    </fieldset>)}
    <div className="ic-add-questions" role="group" aria-label="Add a question">
      <span className="ic-note">Add a question:</span>
      {(Object.keys(questionKinds) as QuestionKind[]).map(kind => <button key={kind} type="button" className="ic-button" onClick={() => {
        const question = newQuestion(kind);
        onChange([...questions, question]);
        // Bring the new question into view with the cursor in its text box.
        requestAnimationFrame(() => document.getElementById('prompt-' + question.id)?.focus());
      }}>
        <Plus size={15} aria-hidden="true" /> {questionKinds[kind]}
      </button>)}
    </div>
  </section>;
}
