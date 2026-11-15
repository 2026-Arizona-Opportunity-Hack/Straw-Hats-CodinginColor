// What a student sees, block by block. Instructors can answer the questions here to test
// the answer key; written and code blocks are graded by hand, so they are not scored here.
import { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { InteractiveHtmlFrame } from '../../shared/ui/InteractiveHtmlFrame';
import { formatDue, pointsLabel } from './display';
import { RubricView } from './Rubric';
import {
  blockPoints, fileTypeGroups, gradeQuiz, hasRubricSupport, isHttpsUrl, linkEmbed, questionCorrect, questionKinds, questionsOf, totalPoints,
  type Assignment, type Block, type QuizQuestion, type QuizResponse,
} from './model';

export function StudentPreview({ assignment }: { assignment: Assignment }) {
  const [responses, setResponses] = useState<QuizResponse>({});
  const [checked, setChecked] = useState(false);
  const [done, setDone] = useState<Record<string, number | null>>({});
  const questions = questionsOf(assignment);
  const result = checked ? gradeQuiz(questions, responses) : null;
  const handGraded = assignment.blocks.filter(b => b.type === 'written' || b.type === 'code' || b.type === 'file').length;
  const numbers = new Map(questions.map((q, i) => [q.id, i + 1]));

  return <section className="ic-tile ic-stack ic-student-preview" aria-label="Student preview">
    <p className="ic-preview-banner">Student preview · answers here are not saved</p>
    <header><h2 className="ic-preview-title">{assignment.title}</h2>
      <p className="ic-note">{pointsLabel(totalPoints(assignment))} · {assignment.dueAt ? 'Due ' + formatDue(assignment.dueAt) : 'No due date'}{assignment.timeLimit ? ` · ${assignment.timeLimit} min limit` : ''}{assignment.attempts ? ` · ${assignment.attempts} attempt${assignment.attempts > 1 ? 's' : ''}` : ''}</p></header>
    {assignment.instructions && <p className="ic-preserve">{assignment.instructions}</p>}

    <form className="ic-stack" onSubmit={event => {
      event.preventDefault();
      const blank = questions.filter(q => { const r = responses[q.id]; return r === undefined || (Array.isArray(r) ? !r.length : !r.trim()); }).length;
      if (blank && !window.confirm(`${blank} question${blank === 1 ? ' is' : 's are'} unanswered. Submit anyway?`)) return;
      setChecked(true);
    }}>
      {assignment.blocks.map(block => <div key={block.id} className="ic-stack ic-preview-block"><PreviewBlock block={block} title={assignment.title} checked={checked}
        number={block.type === 'question' ? numbers.get(block.question.id) ?? 0 : 0}
        response={block.type === 'question' ? responses[block.question.id] : undefined}
        onRespond={(qid, value) => setResponses(r => ({ ...r, [qid]: value }))}
        done={done[block.id]} onDone={score => setDone(d => ({ ...d, [block.id]: score }))} />
        {hasRubricSupport(block) && block.rubric?.length ? <RubricView rubric={block.rubric} /> : null}</div>)}
      {!assignment.blocks.length && <p className="ic-note">This assignment has no content yet.</p>}
      {result ? <div className="ic-row">
        <p className="ic-success" role="status">Auto-graded: {result.earned} of {pointsLabel(result.possible)} ({Math.round(result.percent)}%){handGraded ? ` · ${handGraded} item${handGraded === 1 ? '' : 's'} for the instructor to grade` : ''}</p>
        <button type="button" className="ic-button" onClick={() => { setChecked(false); setResponses({}); }}>Try again</button>
      </div> : assignment.blocks.length > 0 && <div className="ic-form-footer"><button type="submit" className="ic-button ic-primary">Submit</button></div>}
    </form>
  </section>;
}

function PreviewBlock({ block, number, title, checked, response, onRespond, done, onDone }: {
  block: Block; number: number; title: string; checked: boolean;
  response: number[] | string | undefined; onRespond: (questionId: string, value: number[] | string) => void;
  done: number | null | undefined; onDone: (score: number | null) => void;
}) {
  switch (block.type) {
    case 'text': return <p className="ic-preserve ic-preview-text">{block.text}</p>;
    case 'link': {
      if (!isHttpsUrl(block.url)) return <p className="ic-note">Link not added yet.</p>;
      const embed = linkEmbed(block.url);
      return <figure className="ic-preview-media">
        {embed ? <iframe className="ic-video" src={embed} title={block.caption || title} loading="lazy" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
          : <a className="ic-button ic-primary ic-fit" href={block.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} /> Open {new URL(block.url).hostname}</a>}
        {block.caption && <figcaption className="ic-note">{block.caption}</figcaption>}
      </figure>;
    }
    case 'completion': return <p className="ic-note">{block.title} · {pointsLabel(block.points)} for completion in the linked lesson</p>;
    case 'html': return block.html.trim() ? <div className="ic-stack">
      <InteractiveHtmlFrame html={block.html} title={title} onComplete={score => onDone(score ?? null)} />
      {done !== undefined ? <p className="ic-success" role="status">Done{done !== null ? ` · score ${Math.round(done * 100)}%` : ''}</p>
        : !block.reportsScore && <button type="button" className="ic-button ic-fit" onClick={() => onDone(null)}>Mark as done</button>}
    </div> : <p className="ic-note">Page not added yet.</p>;
    case 'question': return <PreviewQuestion q={block.question} number={number} checked={checked} response={response} onRespond={value => onRespond(block.question.id, value)} />;
    case 'written': return <label className="ic-question-card"><span className="ic-preserve">{block.prompt || 'Prompt not written yet.'}</span>
      <textarea rows={4} placeholder="Write your answer…" /><span className="ic-note">{pointsLabel(blockPoints(block))} · graded by your instructor</span></label>;
    case 'file': return <FileUploadPreview block={block} />;
    case 'code': return <label className="ic-question-card"><span className="ic-preserve">{block.prompt || 'Task not written yet.'}</span>
      <textarea className="ic-code-input" rows={7} spellCheck={false} defaultValue={block.starter} />
      <span className="ic-note">{pointsLabel(blockPoints(block))} · students run this in the browser; the code runner is being built.</span></label>;
  }
}

function FileUploadPreview({ block }: { block: Extract<Block, { type: 'file' }> }) {
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState('');
  const accept = block.fileTypes.flatMap(group => fileTypeGroups[group].accept);
  return <div className="ic-question-card ic-stack">
    <span className="ic-preserve">{block.prompt || 'Upload instructions not written yet.'}</span>
    <label>Choose file{block.maxFiles > 1 ? 's' : ''}<input type="file" multiple={block.maxFiles > 1} accept={accept.join(',')} onChange={event => {
      const chosen = [...(event.currentTarget.files ?? [])];
      const problem = chosen.length > block.maxFiles ? `Choose up to ${block.maxFiles} file${block.maxFiles === 1 ? '' : 's'}.`
        : chosen.find(f => !accept.some(ext => f.name.toLowerCase().endsWith(ext))) ? `Allowed types: ${accept.join(', ')}.`
        : chosen.find(f => f.size > block.maxSizeMb * 1024 * 1024) ? `Each file must be under ${block.maxSizeMb} MB.` : '';
      setError(problem);
      setFiles(problem ? [] : chosen);
    }} /></label>
    {error && <p className="ic-error" role="alert">{error}</p>}
    {files.length > 0 && <ul className="ic-file-list">{files.map(f => <li key={f.name}>{f.name} · {Math.max(1, Math.round(f.size / 1024))} KB</li>)}</ul>}
    <span className="ic-note">{pointsLabel(blockPoints(block))} · {accept.join(' ')} · up to {block.maxFiles} file{block.maxFiles === 1 ? '' : 's'}, {block.maxSizeMb} MB each. In this preview, files are checked but not uploaded.</span>
  </div>;
}

function PreviewQuestion({ q, number, checked, response, onRespond }: {
  q: QuizQuestion; number: number; checked: boolean; response: number[] | string | undefined; onRespond: (value: number[] | string) => void;
}) {
  const correct = checked && questionCorrect(q, response);
  return <fieldset className={'ic-question-card' + (checked ? (correct ? ' is-correct' : ' is-wrong') : '')}>
    <legend>Question {number} · {pointsLabel(q.points)} · {questionKinds[q.kind]}</legend>
    <p className="ic-preserve">{q.prompt || <em>No question text yet</em>}</p>
    {(q.kind === 'single' || q.kind === 'truefalse' || q.kind === 'multiple') && <div className="ic-option-list">{q.choices.map((choice, ci) => choice.trim() && <label key={ci} className="ic-checkbox">
      <input type={q.kind === 'multiple' ? 'checkbox' : 'radio'} name={'preview-' + q.id} aria-disabled={checked}
        checked={Array.isArray(response) && response.includes(ci)}
        // Not `disabled`: Chrome greys out a disabled checked radio, hiding what the student picked.
        onChange={event => {
          if (checked) return;
          const current = Array.isArray(response) ? response : [];
          onRespond(q.kind === 'multiple' ? (event.target.checked ? [...current, ci] : current.filter(c => c !== ci)) : [ci]);
        }} />{choice}</label>)}</div>}
    {(q.kind === 'short' || q.kind === 'numeric') && <label>Your answer<input type={q.kind === 'numeric' ? 'number' : 'text'} step="any" readOnly={checked}
      value={typeof response === 'string' ? response : ''} onChange={event => onRespond(event.target.value)} /></label>}
    {checked && <p className={correct ? 'ic-good-text' : 'ic-stuck-text'} role="status">{correct ? 'Correct' : 'Not correct'}</p>}
  </fieldset>;
}
