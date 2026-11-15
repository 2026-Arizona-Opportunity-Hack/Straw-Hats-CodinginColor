// Grades for class assignments: a student-by-assignment gradebook, and a grading view that
// walks through one submission block by block with points and feedback.
import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, FileText, Search } from 'lucide-react';
import { supabase } from '../../shared/supabase';
import type { ClassGroup } from '../model';
import { Dialog, Empty } from '../ui';
import { formatDue, pointsLabel } from './display';
import { autoPoints, gradebookCsv, gradeSubmission, isFileList, isLate, needsInstructor, rubricResult, type ResponseValue, type Submission, type UploadedFile } from './grading';
import { RubricPicker } from './Rubric';
import { blockLabels, blockPoints, hasRubricSupport, questionKinds, totalPoints, type Assignment, type Block, type RubricBlock } from './model';

type Props = { group: ClassGroup; onSave: (group: ClassGroup) => boolean };

const pct = (earned: number | null, possible: number) => (earned === null || !possible ? '—' : Math.round((earned / possible) * 100) + '%');

export function Gradebook({ group, onSave }: Props) {
  const [search, setSearch] = useState('');
  const [onlyNeeds, setOnlyNeeds] = useState(false);
  const [open, setOpen] = useState<{ assignmentId: string; studentId: string } | null>(null);
  const assignments = (group.assignments ?? []).filter(a => a.published);
  const submissions = group.submissions ?? [];
  const find = (assignmentId: string, studentId: string) => submissions.find(s => s.assignmentId === assignmentId && s.studentId === studentId);
  const grades = assignments.flatMap(a => group.learners.map(l => gradeSubmission(a, find(a.id, l.id))));
  const needsGrading = grades.filter(g => g.status === 'needs_grading').length;
  const missing = grades.filter(g => g.status === 'missing').length;
  const graded = grades.filter(g => g.status === 'graded');
  const classAverage = graded.length ? graded.reduce((sum, g) => sum + (g.possible ? (g.earned ?? 0) / g.possible : 0), 0) / graded.length * 100 : null;
  const students = group.learners
    .filter(l => l.name.toLowerCase().includes(search.trim().toLowerCase()))
    .filter(l => !onlyNeeds || assignments.some(a => gradeSubmission(a, find(a.id, l.id)).status === 'needs_grading'));

  function saveSubmission(next: Submission) {
    return onSave({ ...group, submissions: submissions.map(s => (s.id === next.id ? next : s)) });
  }

  function download() {
    const csv = gradebookCsv(group.learners, assignments, submissions);
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    link.download = `${group.name.replace(/[^\w-]+/g, '-').toLowerCase()}-grades.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  return <div className="ic-tab-page">
    <div className="ic-stat-grid">
      <div className="ic-stat-card"><span>Needs grading</span><strong className={needsGrading ? 'is-alert' : undefined}>{needsGrading}</strong><small>Submissions waiting on you</small></div>
      <div className="ic-stat-card"><span>Missing</span><strong>{missing}</strong><small>Published work not turned in</small></div>
      <div className="ic-stat-card"><span>Graded</span><strong className="is-good">{graded.length}</strong><small>Fully scored submissions</small></div>
      <div className="ic-stat-card"><span>Class average</span><strong>{classAverage === null ? '—' : Math.round(classAverage) + '%'}</strong><small>Across graded submissions</small></div>
    </div>
    <section className="ic-tile ic-filter-bar">
      <label className="ic-search ic-grow"><Search size={16} /><input type="search" aria-label="Search students" placeholder="Search students" value={search} onChange={event => setSearch(event.target.value)} /></label>
      <label className="ic-checkbox"><input type="checkbox" checked={onlyNeeds} onChange={event => setOnlyNeeds(event.target.checked)} />Only students with work to grade</label>
      <button type="button" className="ic-button" onClick={download} disabled={!assignments.length}><Download size={16} /> Export CSV</button>
    </section>
    <section className="ic-tile">
      {!assignments.length ? <Empty>Publish an assignment to start a gradebook.</Empty>
        : !students.length ? <Empty>No students match.</Empty>
        : <div className="ic-table-wrap" tabIndex={0} role="region" aria-label="Gradebook">
          <table className="ic-data-table ic-gradebook">
            <thead><tr>
              <th scope="col">Student</th>
              {assignments.map(a => <th scope="col" key={a.id}><a href={`#/classes/${group.id}/assignments/${a.id}`} className="ic-gradebook-title" title={a.title}>{a.title}</a><span className="ic-note">{pointsLabel(totalPoints(a))}{a.dueAt ? ' · ' + formatDue(a.dueAt) : ''}</span></th>)}
              <th scope="col">Total</th>
            </tr></thead>
            <tbody>{students.map(learner => {
              let earned = 0;
              let possible = 0;
              return <tr key={learner.id}>
                <th scope="row">{learner.name}</th>
                {assignments.map(a => {
                  const submission = find(a.id, learner.id);
                  const grade = gradeSubmission(a, submission);
                  possible += grade.possible;
                  earned += grade.earned ?? 0;
                  const late = isLate(a, submission);
                  if (!submission) return <td key={a.id}><span className="ic-grade-missing">Missing</span></td>;
                  return <td key={a.id}>
                    <button type="button" className={'ic-grade-cell' + (grade.status === 'needs_grading' ? ' is-pending' : '')}
                      aria-label={`${learner.name}, ${a.title}: ${grade.status === 'needs_grading' ? 'needs grading' : `${grade.earned} of ${grade.possible}`}${late ? ', late' : ''}. Open to grade.`}
                      onClick={() => setOpen({ assignmentId: a.id, studentId: learner.id })}>
                      {grade.status === 'needs_grading' ? 'Needs grading' : `${grade.earned}/${grade.possible}`}
                      {late && <span className="ic-late">Late</span>}
                    </button>
                  </td>;
                })}
                <td><strong>{pct(earned, possible)}</strong></td>
              </tr>;
            })}</tbody>
          </table>
        </div>}
      <p className="ic-note ic-section-gap">Totals count missing work as zero. Questions are graded automatically; written and code answers wait for you.</p>
    </section>
    {open && (() => {
      const assignment = assignments.find(a => a.id === open.assignmentId);
      const submission = find(open.assignmentId, open.studentId);
      if (!assignment || !submission) return null;
      const order = group.learners.filter(l => find(assignment.id, l.id));
      return <GradeDialog key={submission.id} assignment={assignment} submission={submission}
        studentName={group.learners.find(l => l.id === open.studentId)?.name ?? 'Student'}
        position={order.findIndex(l => l.id === open.studentId)} count={order.length}
        onMove={step => {
          const index = order.findIndex(l => l.id === open.studentId) + step;
          if (order[index]) setOpen({ assignmentId: assignment.id, studentId: order[index].id });
        }}
        onSave={saveSubmission} onClose={() => setOpen(null)} />;
    })()}
  </div>;
}

function GradeDialog({ assignment, submission, studentName, position, count, onMove, onSave, onClose }: {
  assignment: Assignment; submission: Submission; studentName: string; position: number; count: number;
  onMove: (step: number) => void; onSave: (s: Submission) => boolean; onClose: () => void;
}) {
  const [draft, setDraft] = useState(submission);
  const [status, setStatus] = useState('');
  const grade = gradeSubmission(assignment, draft);
  const dirty = JSON.stringify(draft) !== JSON.stringify(submission);
  const late = isLate(assignment, submission);
  const questionNumbers = new Map(assignment.blocks.filter(b => b.type === 'question').map((b, i) => [b.id, i + 1]));

  function setScore(block: Block, value: string) {
    const scores = { ...draft.manualScores };
    if (value === '') delete scores[block.id];
    else scores[block.id] = Math.min(Math.max(Number(value) || 0, 0), blockPoints(block));
    setDraft({ ...draft, manualScores: scores });
    setStatus('');
  }

  /** Choosing a rating per criterion; once every criterion is rated, the block's score is their sum. */
  function pickRating(block: RubricBlock, criterionId: string, ratingId: string | null) {
    const picks = { ...(draft.rubricScores?.[block.id] ?? {}) };
    if (ratingId) picks[criterionId] = ratingId;
    else delete picks[criterionId];
    const result = rubricResult(block, picks);
    const scores = { ...draft.manualScores };
    if (result.complete) scores[block.id] = result.points;
    else delete scores[block.id];
    setDraft({ ...draft, rubricScores: { ...draft.rubricScores, [block.id]: picks }, manualScores: scores });
    setStatus('');
  }

  function save(thenMove?: number) {
    const next = { ...draft, gradedAt: gradeSubmission(assignment, draft).ungraded ? null : new Date().toISOString() };
    if (dirty && !onSave(next)) return;
    setStatus(dirty ? 'Grade saved' : '');
    if (thenMove) onMove(thenMove);
  }

  return <Dialog wide title={`${studentName} · ${assignment.title}`} onClose={onClose}>
    <div className="ic-grade-summary">
      <p className="ic-note">Submitted {new Date(submission.submittedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}{late && <span className="ic-late">Late</span>}</p>
      <p className="ic-grade-total"><strong>{grade.earned}</strong> / {grade.possible} points {grade.ungraded ? <span className="ic-status is-stuck">{grade.ungraded} to grade</span> : <span className="ic-status is-published">Graded</span>}</p>
    </div>
    <ol className="ic-grade-blocks">{assignment.blocks.map(block => {
      if (block.type === 'text' || block.type === 'link') return null;
      const response = draft.responses[block.id];
      const auto = autoPoints(block, response);
      const manual = draft.manualScores[block.id];
      const max = blockPoints(block);
      const label = block.type === 'question' ? `Question ${questionNumbers.get(block.id)} · ${questionKinds[block.question.kind]}` : blockLabels[block.type];
      return <li key={block.id} className={'ic-grade-block' + (needsInstructor(block) && manual === undefined ? ' is-pending' : '')}>
        <div className="ic-grade-block-head">
          <h3>{label}</h3>
          <label className="ic-inline-field">Points<input type="number" min={0} max={max} step="any" className="ic-points"
            aria-label={`Points for ${label}, out of ${max}`}
            placeholder={auto === null ? '—' : String(auto)} value={manual ?? ''} onChange={event => setScore(block, event.target.value)} />
            <span className="ic-note">/ {max}</span></label>
        </div>
        <StudentAnswer block={block} response={response} />
        {hasRubricSupport(block) && block.rubric?.length ? <RubricPicker rubric={block.rubric} blockLabel={label}
          picks={draft.rubricScores?.[block.id] ?? {}} onPick={(criterionId, ratingId) => pickRating(block, criterionId, ratingId)} /> : null}
        <p className="ic-note">{hasRubricSupport(block) && block.rubric?.length && manual === undefined
          ? `Rubric so far: ${rubricResult(block, draft.rubricScores?.[block.id]).points} of ${max}. Pick a rating for every criterion, or type points to override.`
          : hasRubricSupport(block) && block.rubric?.length && rubricResult(block, draft.rubricScores?.[block.id]).complete && manual === rubricResult(block, draft.rubricScores?.[block.id]).points
          ? 'Scored with the rubric.'
          : auto === null
          ? (manual === undefined ? 'Needs your score.' : 'Scored by you.')
          : manual === undefined ? `Auto-graded: ${auto} of ${max}. Type a number to override.` : `Auto-graded ${auto}; you set ${manual}.`}</p>
      </li>;
    })}</ol>
    <label>Feedback for the student<textarea rows={3} value={draft.feedback} maxLength={10_000} placeholder="What went well, and what to work on." onChange={event => { setDraft({ ...draft, feedback: event.target.value }); setStatus(''); }} /></label>
    <div className="ic-grade-footer">
      <span className="ic-row">
        <button type="button" className="ic-button" disabled={position <= 0} onClick={() => save(-1)}><ChevronLeft size={16} /> Previous</button>
        <span className="ic-note">{position + 1} of {count}</span>
        <button type="button" className="ic-button" disabled={position >= count - 1} onClick={() => save(1)}>Next <ChevronRight size={16} /></button>
      </span>
      <span className="ic-row">
        <span className="ic-note" role="status">{status || (dirty ? 'Unsaved changes' : '')}</span>
        <button type="button" className="ic-button ic-primary" disabled={!dirty} onClick={() => save()}>Save grade</button>
      </span>
    </div>
  </Dialog>;
}

function StudentAnswer({ block, response }: { block: Block; response: ResponseValue | undefined }) {
  if (block.type === 'file') return <div className="ic-stack ic-answer"><p className="ic-preserve ic-note">{block.prompt}</p>
    {isFileList(response) && response.length ? <ul className="ic-file-list">{response.map(file => <li key={file.path}><FileLink file={file} /></li>)}</ul> : <p>No file uploaded.</p>}</div>;
  if (isFileList(response)) return null;
  if (block.type === 'question') {
    const q = block.question;
    const picked = Array.isArray(response) ? response : [];
    return <div className="ic-stack ic-answer">
      <p className="ic-preserve">{q.prompt}</p>
      {q.choices.length > 0 ? <ul className="ic-answer-choices">{q.choices.map((choice, i) => choice.trim() && <li key={i}
        className={(picked.includes(i) ? 'is-picked ' : '') + (q.correct.includes(i) ? 'is-correct' : '')}>
        <span>{choice}</span>
        {picked.includes(i) && <span className="ic-tag">Student's answer</span>}
        {q.correct.includes(i) && <span className="ic-tag is-correct">Correct</span>}
      </li>)}</ul>
        : <p>Answer: <strong>{typeof response === 'string' && response.trim() ? response : 'No answer'}</strong>
          <span className="ic-note"> · Expected {q.kind === 'numeric' ? `${q.answer}${q.tolerance ? ' ± ' + q.tolerance : ''}` : q.accepted.filter(a => a.trim()).join(', ')}</span></p>}
    </div>;
  }
  if (block.type === 'written') return <div className="ic-stack ic-answer"><p className="ic-preserve ic-note">{block.prompt}</p>
    <blockquote className="ic-preserve">{typeof response === 'string' && response.trim() ? response : 'No answer'}</blockquote></div>;
  if (block.type === 'code') return <div className="ic-stack ic-answer"><p className="ic-preserve ic-note">{block.prompt}</p>
    <pre><code>{typeof response === 'string' && response.trim() ? response : 'No code submitted'}</code></pre></div>;
  if (block.type === 'html') return <p className="ic-answer">{typeof response === 'string' && response !== '' ? `The page reported ${Math.round(Number(response) * 100)}%.` : 'No score reported.'}</p>;
  return null;
}

const sizeLabel = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

/** Download link for a private submission file: a signed URL that expires after 10 minutes. */
function FileLink({ file }: { file: UploadedFile }) {
  const [url, setUrl] = useState<string | null>(null);
  const [problem, setProblem] = useState('');
  useEffect(() => {
    if (!supabase || file.path.startsWith('demo/')) return;
    let cancelled = false;
    supabase.storage.from('submission-files').createSignedUrl(file.path, 600, { download: file.name }).then(({ data, error }) => {
      if (cancelled) return;
      if (error || !data) setProblem('Could not open this file.');
      else setUrl(data.signedUrl);
    });
    return () => { cancelled = true; };
  }, [file.path, file.name]);
  const meta = <span className="ic-note"> · {sizeLabel(file.size)}</span>;
  if (url) return <a href={url} target="_blank" rel="noopener noreferrer" className="ic-file-link"><FileText size={16} aria-hidden="true" />{file.name}{meta}</a>;
  return <span className="ic-file-link"><FileText size={16} aria-hidden="true" />{file.name}{meta}
    <span className="ic-note"> · {problem || (file.path.startsWith('demo/') || !supabase ? 'sample file, no download in demo data' : 'preparing download…')}</span></span>;
}
