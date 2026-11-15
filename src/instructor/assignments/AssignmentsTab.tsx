// Assignments tab: list, create, import, duplicate, publish and delete class assignments.
import { useState } from 'react';
import { Copy, Plus, Search, Trash2, Upload } from 'lucide-react';
import type { ClassGroup, Course } from '../model';
import { percent } from '../progress';
import { gradeSubmission } from './grading';
import { Dialog, Empty } from '../ui';
import { AssignmentEditor } from './AssignmentEditor';
import { formatDue, kindIcon } from './display';
import {
  assignmentKinds, contentSummary, duplicateAssignment, newAssignment, parseAssignmentFile, parseQuizText, publishProblem, questionBlocks, totalPoints,
  type Assignment, type AssignmentKind,
} from './model';

type Props = {
  group: ClassGroup;
  course?: Course;
  otherClasses: ClassGroup[];
  assignmentId?: string;
  onSave: (group: ClassGroup) => boolean;
};

export function AssignmentsTab({ group, course, otherClasses, assignmentId, onSave }: Props) {
  const assignments = group.assignments ?? [];
  const editing = assignments.find(item => item.id === assignmentId);
  const base = `#/classes/${group.id}/assignments`;

  function saveAll(next: Assignment[]) {
    return onSave({ ...group, assignments: next });
  }
  function upsert(item: Assignment) {
    return saveAll(assignments.some(a => a.id === item.id) ? assignments.map(a => a.id === item.id ? item : a) : [...assignments, item]);
  }
  function create(item: Assignment) {
    if (upsert(item)) window.location.hash = `${base.slice(1)}/${item.id}`;
  }

  if (assignmentId) {
    if (!editing) return <div className="ic-tab-page"><section className="ic-tile"><Empty>That assignment no longer exists. <a href={base}>Back to assignments</a></Empty></section></div>;
    return <AssignmentEditor key={editing.id} initial={editing} group={group} course={course} backHref={base}
      onSave={upsert}
      onDelete={() => { if (saveAll(assignments.filter(a => a.id !== editing.id))) window.location.hash = base.slice(1); }} />;
  }
  return <AssignmentList group={group} course={course} otherClasses={otherClasses} assignments={assignments} base={base} onCreate={create} saveAll={saveAll} />;
}

function AssignmentList({ group, course, otherClasses, assignments, base, onCreate, saveAll }: {
  group: ClassGroup; course?: Course; otherClasses: ClassGroup[]; assignments: Assignment[]; base: string;
  onCreate: (item: Assignment) => void; saveAll: (next: Assignment[]) => boolean;
}) {
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<'all' | AssignmentKind>('all');
  const [status, setStatus] = useState<'all' | 'published' | 'draft'>('all');
  const [dialog, setDialog] = useState<'new' | 'import' | null>(null);
  const [message, setMessage] = useState('');
  const modules = course?.modules ?? [];
  const rows = assignments
    .filter(a => kind === 'all' || a.kind === kind)
    .filter(a => status === 'all' || (status === 'published') === a.published)
    .filter(a => a.title.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => (a.dueAt ?? '9999').localeCompare(b.dueAt ?? '9999'));
  const published = assignments.filter(a => a.published).length;
  const roster = new Set(group.learners.map(learner => learner.id));

  function togglePublish(item: Assignment) {
    const problem = item.published ? null : publishProblem(item);
    if (problem) return setMessage(`Can't publish "${item.title}": ${problem} Open it to finish.`);
    if (saveAll(assignments.map(a => a.id === item.id ? { ...a, published: !a.published } : a))) {
      setMessage(`${item.published ? 'Unpublished' : 'Published'} "${item.title}".`);
    }
  }
  function remove(item: Assignment) {
    if (!window.confirm(`Delete "${item.title}"? Student submissions for it are kept but hidden.`)) return;
    if (saveAll(assignments.filter(a => a.id !== item.id))) setMessage(`Deleted "${item.title}".`);
  }
  function duplicate(item: Assignment) {
    const copy = duplicateAssignment(item);
    if (saveAll([...assignments, copy])) setMessage(`Created "${copy.title}" as a draft.`);
  }

  return <div className="ic-tab-page">
    <div className="ic-stat-grid">
      <div className="ic-stat-card"><span>Assignments</span><strong>{assignments.length}</strong><small>{published} published · {assignments.length - published} drafts</small></div>
      <div className="ic-stat-card"><span>Quizzes</span><strong>{assignments.filter(a => a.kind === 'quiz').length}</strong><small>Graded automatically</small></div>
      <div className="ic-stat-card"><span>Due this week</span><strong>{assignments.filter(a => a.published && a.dueAt && dueWithin(a.dueAt, 7)).length}</strong><small>Published, due in 7 days</small></div>
      <div className="ic-stat-card"><span>Total points</span><strong>{assignments.filter(a => a.published).reduce((sum, a) => sum + totalPoints(a), 0)}</strong><small>Across published work</small></div>
    </div>
    <section className="ic-tile ic-filter-bar">
      <label className="ic-search ic-grow"><Search size={16} /><input type="search" aria-label="Search assignments" placeholder="Search assignments" value={search} onChange={event => setSearch(event.target.value)} /></label>
      <label className="ic-inline-field">Type<select value={kind} onChange={event => setKind(event.target.value as typeof kind)}>
        <option value="all">All types</option>{Object.entries(assignmentKinds).map(([value, info]) => <option key={value} value={value}>{info.label}</option>)}
      </select></label>
      <label className="ic-inline-field">Status<select value={status} onChange={event => setStatus(event.target.value as typeof status)}>
        <option value="all">All</option><option value="published">Published</option><option value="draft">Drafts</option>
      </select></label>
      <button type="button" className="ic-button" onClick={() => setDialog('import')}><Upload size={16} /> Import assignment</button>
      <button type="button" className="ic-button ic-primary" onClick={() => setDialog('new')}><Plus size={16} /> New assignment</button>
      {message && <p className="ic-note" role="status">{message}</p>}
    </section>
    <section className="ic-tile">
      {rows.length ? <div className="ic-table-wrap" tabIndex={0} role="region" aria-label="Assignments table">
        <table className="ic-data-table">
          <thead><tr>{['Assignment', 'Content', 'Module', 'Due', 'Points', 'Submitted', 'Avg', 'Status', ''].map((text, i) => <th scope="col" key={i}>{text || <span className="ic-sr-only">Actions</span>}</th>)}</tr></thead>
          <tbody>{rows.map(item => {
            const Icon = kindIcon[item.kind];
            const submissions = (group.submissions ?? []).filter(s => s.assignmentId === item.id && roster.has(s.studentId));
            const scores = submissions.map(s => gradeSubmission(item, s))
              .filter(grade => grade.status === 'graded' && grade.possible > 0)
              .map(grade => (grade.earned ?? 0) / grade.possible * 100);
            return <tr key={item.id}>
              <td><a className="ic-strong-link" href={`${base}/${item.id}`}>{item.title}</a></td>
              <td><span className="ic-kind"><Icon size={15} aria-hidden="true" />{contentSummary(item)}</span></td>
              <td>{modules.find(m => m.id === item.moduleId)?.title ?? '—'}</td>
              <td className="ic-nowrap">{formatDue(item.dueAt)}</td>
              <td>{totalPoints(item)}</td>
              <td><div className="ic-progress-entry"><progress aria-label={item.title + ' submissions'} value={submissions.length} max={group.learners.length || 1} />{submissions.length}/{group.learners.length}</div></td>
              <td>{percent(scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null)}</td>
              <td><button type="button" className={'ic-status ic-status-button ' + (item.published ? 'is-published' : '')} onClick={() => togglePublish(item)}
                aria-label={`${item.published ? 'Published' : 'Draft'}: ${item.published ? 'unpublish' : 'publish'} ${item.title}`}>{item.published ? 'Published' : 'Draft'}</button></td>
              <td className="ic-cell-actions">
                <button type="button" className="ic-icon" aria-label={`Duplicate ${item.title}`} onClick={() => duplicate(item)}><Copy size={16} /></button>
                <button type="button" className="ic-icon" aria-label={`Delete ${item.title}`} onClick={() => remove(item)}><Trash2 size={16} /></button>
              </td>
            </tr>;
          })}</tbody>
        </table>
      </div> : <Empty>{assignments.length ? 'No assignments match these filters.' : 'No assignments yet. Create one or import a quiz.'}</Empty>}
      <p className="ic-note ic-section-gap">Published quizzes appear under Class assignments for enrolled students. Click the status to publish or unpublish.</p>
    </section>
    {dialog === 'new' && <Dialog wide title="New assignment" onClose={() => setDialog(null)}>
      <p className="ic-note">Pick a type. You can change everything else on the next screen.</p>
      <div className="ic-kind-grid">{(Object.keys(assignmentKinds) as AssignmentKind[]).map(value => {
        const Icon = kindIcon[value];
        return <button key={value} type="button" className="ic-kind-option" onClick={() => { setDialog(null); onCreate(newAssignment(value)); }}>
          <Icon size={22} aria-hidden="true" /><strong>{assignmentKinds[value].label}</strong><span>{assignmentKinds[value].detail}</span>
        </button>;
      })}</div>
    </Dialog>}
    {dialog === 'import' && <ImportDialog group={group} otherClasses={otherClasses} onClose={() => setDialog(null)} onImport={item => { setDialog(null); onCreate(item); }} />}
  </div>;
}

function dueWithin(value: string, days: number) {
  const due = new Date(value).getTime();
  const now = new Date().getTime();
  return due >= now && due - now <= days * 86_400_000;
}

const quizExample = `What does print(2 + 3) show?
A. 23
B. 5
C. 2 + 3
ANSWER: B

Which of these are Python loops?
A. for
B. while
C. repeat
ANSWER: A, B`;

function ImportDialog({ group, otherClasses, onClose, onImport }: {
  group: ClassGroup; otherClasses: ClassGroup[]; onClose: () => void; onImport: (item: Assignment) => void;
}) {
  const [mode, setMode] = useState<'text' | 'file' | 'copy'>('text');
  const [text, setText] = useState('');
  const [title, setTitle] = useState('Imported quiz');
  const [error, setError] = useState('');
  const parsed = text.trim() ? parseQuizText(text) : null;
  const sources = [group, ...otherClasses.filter(other => other.id !== group.id)]
    .flatMap(source => (source.assignments ?? []).map(item => ({ source, item })));

  return <Dialog wide title="Import an assignment" onClose={onClose}>
    <div className="ic-tab-row" role="group" aria-label="Import from">
      <button type="button" aria-pressed={mode === 'text'} onClick={() => { setMode('text'); setError(''); }}>Paste quiz text</button>
      <button type="button" aria-pressed={mode === 'file'} onClick={() => { setMode('file'); setError(''); }}>Assignment file</button>
      <button type="button" aria-pressed={mode === 'copy'} onClick={() => { setMode('copy'); setError(''); }}>Copy from a class</button>
    </div>
    {mode === 'text' && <form className="ic-stack" onSubmit={event => {
      event.preventDefault();
      if (!parsed?.questions.length) return setError('Paste at least one question in the format shown.');
      onImport({ ...newAssignment('quiz'), title: title.trim() || 'Imported quiz', blocks: questionBlocks(parsed.questions) });
    }}>
      <p className="ic-note">One question per block, choices as <code>A.</code> <code>B.</code>, then an <code>ANSWER:</code> line. Many quiz tools export this format (Moodle calls it Aiken).</p>
      <label>Quiz title<input value={title} maxLength={200} onChange={event => setTitle(event.target.value)} /></label>
      <label>Questions<textarea rows={10} value={text} placeholder={quizExample} onChange={event => setText(event.target.value)} /></label>
      {parsed && <p className="ic-note" role="status">{parsed.questions.length} question{parsed.questions.length === 1 ? '' : 's'} ready{parsed.errors.length ? `, ${parsed.errors.length} skipped` : ''}.</p>}
      {parsed?.errors.length ? <ul className="ic-error ic-error-list">{parsed.errors.map(item => <li key={item}>{item}</li>)}</ul> : null}
      {error && <p className="ic-error" role="alert">{error}</p>}
      <div className="ic-form-footer"><button type="submit" className="ic-button ic-primary" disabled={!parsed?.questions.length}>Create quiz draft</button></div>
    </form>}
    {mode === 'file' && <div className="ic-stack">
      <p className="ic-note">Choose a <code>.json</code> file made with Export on any assignment.</p>
      <label>Assignment file<input type="file" accept=".json,application/json" onChange={async event => {
        const file = event.currentTarget.files?.[0];
        event.currentTarget.value = '';
        if (!file) return;
        if (file.size > 1_000_000) return setError('Choose a file under 1 MB.');
        try { onImport(parseAssignmentFile(await file.text())); }
        catch (problem) { setError(problem instanceof Error ? problem.message : 'Could not read that file.'); }
      }} /></label>
      {error && <p className="ic-error" role="alert">{error}</p>}
    </div>}
    {mode === 'copy' && (sources.length ? <ul className="ic-attention">{sources.map(({ source, item }) => {
      const Icon = kindIcon[item.kind];
      return <li key={source.id + item.id}>
        <div><strong><Icon size={15} aria-hidden="true" /> {item.title}</strong><p className="ic-note">{source.id === group.id ? 'This class' : source.name} · {assignmentKinds[item.kind].label} · {totalPoints(item)} pts</p></div>
        <button type="button" className="ic-button" onClick={() => onImport(duplicateAssignment(item, item.title))}>Copy</button>
      </li>;
    })}</ul> : <Empty>No assignments in your classes yet.</Empty>)}
  </Dialog>;
}
