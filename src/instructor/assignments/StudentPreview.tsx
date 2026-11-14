// What a student sees. Instructors can answer a quiz here to test the answer key.
import { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { InteractiveHtmlFrame } from '../../shared/ui/InteractiveHtmlFrame';
import { formatDue, pointsLabel } from './display';
import { gradeQuiz, isHttpsUrl, linkEmbed, questionCorrect, questionKinds, totalPoints, type Assignment, type QuizResponse } from './model';

export function StudentPreview({ assignment }: { assignment: Assignment }) {
  const [responses, setResponses] = useState<QuizResponse>({});
  const [checked, setChecked] = useState(false);
  const [htmlScore, setHtmlScore] = useState<number | null | undefined>(undefined);
  const result = checked ? gradeQuiz(assignment.quiz.questions, responses) : null;
  const embed = assignment.kind === 'link' ? linkEmbed(assignment.link.url) : null;

  return <section className="ic-tile ic-stack ic-student-preview" aria-label="Student preview">
    <p className="ic-preview-banner">Student preview · answers here are not saved</p>
    <header><h2 className="ic-preview-title">{assignment.title}</h2>
      <p className="ic-note">{pointsLabel(totalPoints(assignment))} · {assignment.dueAt ? 'Due ' + formatDue(assignment.dueAt) : 'No due date'}{assignment.timeLimit ? ` · ${assignment.timeLimit} min limit` : ''}{assignment.attempts ? ` · ${assignment.attempts} attempt${assignment.attempts > 1 ? 's' : ''}` : ''}</p></header>
    {assignment.instructions && <p className="ic-preserve">{assignment.instructions}</p>}

    {assignment.kind === 'quiz' && <form className="ic-stack" onSubmit={event => {
      event.preventDefault();
      const blank = assignment.quiz.questions.filter(q => { const r = responses[q.id]; return r === undefined || (Array.isArray(r) ? !r.length : !r.trim()); }).length;
      if (blank && !window.confirm(`${blank} question${blank === 1 ? ' is' : 's are'} unanswered. Submit anyway?`)) return;
      setChecked(true);
    }}>
      {assignment.quiz.questions.map((q, index) => {
        const response = responses[q.id];
        const correct = checked && questionCorrect(q, response);
        return <fieldset key={q.id} className={'ic-question-card' + (checked ? (correct ? ' is-correct' : ' is-wrong') : '')}>
          <legend>Question {index + 1} · {q.points} pt{q.points === 1 ? '' : 's'} · {questionKinds[q.kind]}</legend>
          <p className="ic-preserve">{q.prompt || <em>No question text yet</em>}</p>
          {(q.kind === 'single' || q.kind === 'truefalse' || q.kind === 'multiple') && <div className="ic-option-list">{q.choices.map((choice, ci) => choice.trim() && <label key={ci} className="ic-checkbox">
            <input type={q.kind === 'multiple' ? 'checkbox' : 'radio'} name={'preview-' + q.id} aria-disabled={checked}
              checked={Array.isArray(response) && response.includes(ci)}
              // Not `disabled`: Chrome greys out a disabled checked radio, hiding what the student picked.
              onChange={event => checked || setResponses(r => {
                const current = Array.isArray(r[q.id]) ? r[q.id] as number[] : [];
                return { ...r, [q.id]: q.kind === 'multiple' ? (event.target.checked ? [...current, ci] : current.filter(c => c !== ci)) : [ci] };
              })} />{choice}</label>)}</div>}
          {(q.kind === 'short' || q.kind === 'numeric') && <label>Your answer<input type={q.kind === 'numeric' ? 'number' : 'text'} step="any" disabled={checked}
            value={typeof response === 'string' ? response : ''} onChange={event => setResponses(r => ({ ...r, [q.id]: event.target.value }))} /></label>}
          {checked && <p className={correct ? 'ic-good-text' : 'ic-stuck-text'} role="status">{correct ? 'Correct' : 'Not correct'}</p>}
        </fieldset>;
      })}
      {result ? <div className="ic-row">
        <p className="ic-success" role="status">Score: {result.earned} of {pointsLabel(result.possible)} ({Math.round(result.percent)}%)</p>
        <button type="button" className="ic-button" onClick={() => { setChecked(false); setResponses({}); }}>Try again</button>
      </div> : <div className="ic-form-footer"><button type="submit" className="ic-button ic-primary" disabled={!assignment.quiz.questions.length}>Submit quiz</button></div>}
    </form>}

    {assignment.kind === 'link' && (isHttpsUrl(assignment.link.url)
      ? embed ? <iframe className="ic-video" src={embed} title={assignment.title} loading="lazy" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
        : <a className="ic-button ic-primary ic-fit" href={assignment.link.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} /> Open {new URL(assignment.link.url).hostname}</a>
      : <p className="ic-note">No link added yet.</p>)}

    {assignment.kind === 'html' && (assignment.html.html.trim() ? <>
      <InteractiveHtmlFrame html={assignment.html.html} title={assignment.title} onComplete={score => setHtmlScore(score ?? null)} />
      {htmlScore !== undefined ? <p className="ic-success" role="status">Done{htmlScore !== null ? ` · score ${Math.round(htmlScore * 100)}%` : ''}</p>
        : !assignment.html.reportsScore && <button type="button" className="ic-button ic-fit" onClick={() => setHtmlScore(null)}>Mark as done</button>}
    </> : <p className="ic-note">No page added yet.</p>)}

    {assignment.kind === 'written' && assignment.written.prompts.filter(p => p.trim()).map((prompt, index) => <label key={index}>
      <span className="ic-preserve">{prompt}</span><textarea rows={4} placeholder="Write your answer…" /></label>)}

    {assignment.kind === 'code' && <label>Your code<textarea className="ic-code-input" rows={8} spellCheck={false} defaultValue={assignment.code.starter} />
      <span className="ic-note">Students run this in the browser; the code runner is being built.</span></label>}
  </section>;
}
