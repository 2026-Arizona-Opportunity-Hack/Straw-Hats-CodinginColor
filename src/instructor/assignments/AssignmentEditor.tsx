// Edit one assignment: details, content blocks, settings, and a student preview.
import { useState } from 'react';
import { Download, Eye, Pencil, Save, Trash2 } from 'lucide-react';
import type { ClassGroup, Course } from '../model';
import { PageHeader } from '../ui';
import { formatDue, pointsLabel } from './display';
import { BlockEditor } from './BlockEditor';
import { StudentPreview } from './StudentPreview';
import {
  contentSummary, exportAssignment, publishProblem, totalPoints, type Assignment, type ShowAnswers,
} from './model';

type Props = {
  initial: Assignment;
  group: ClassGroup;
  course?: Course;
  backHref: string;
  onSave: (item: Assignment) => boolean;
  onDelete: () => void;
};

export function AssignmentEditor({ initial, course, backHref, onSave, onDelete }: Props) {
  const [draft, setDraft] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [view, setView] = useState<'edit' | 'preview'>('edit');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  function update(patch: Partial<Assignment>) {
    setDraft(current => ({ ...current, ...patch }));
    setStatus('');
  }

  function save(next = draft) {
    const problem = next.published ? publishProblem(next) : null;
    if (problem) {
      setError(`Can't publish yet: ${problem} Fix it, or uncheck Published to save a draft.`);
      return;
    }
    if (onSave(next)) {
      setSaved(next);
      setError('');
      setStatus(next.published ? 'Saved and published' : 'Draft saved');
    }
  }

  function download() {
    const blob = new Blob([exportAssignment(draft)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = (draft.title.trim() || 'assignment').replace(/[^\w-]+/g, '-').toLowerCase() + '.json';
    link.click();
    URL.revokeObjectURL(link.href);
  }

  return <div className="ic-tab-page">
    <PageHeader level={2} title={draft.title || 'Untitled assignment'} back={{ label: 'Assignments', to: backHref }}
      description={<>{contentSummary(draft)} · {pointsLabel(totalPoints(draft))} · {formatDue(draft.dueAt)}
        <span className={'ic-save-state' + (dirty ? ' is-dirty' : '')} role="status">{status || (dirty ? 'Unsaved changes' : 'All changes saved')}</span></>}>
      <div className="ic-mode" role="group" aria-label="View">
        <button type="button" aria-pressed={view === 'edit'} onClick={() => setView('edit')}><Pencil size={15} /> Edit</button>
        <button type="button" aria-pressed={view === 'preview'} onClick={() => setView('preview')}><Eye size={15} /> Student preview</button>
      </div>
      <button type="button" className="ic-button" onClick={download}><Download size={16} /> Export</button>
      <button type="button" className="ic-button" onClick={() => { if (window.confirm(`Delete "${draft.title}"?`)) onDelete(); }}><Trash2 size={16} /> Delete</button>
      <button type="button" className="ic-button ic-primary" disabled={!dirty} onClick={() => save()}><Save size={16} /> Save</button>
    </PageHeader>
    {error && <p className="ic-error" role="alert">{error}</p>}

    {view === 'preview' ? <StudentPreview assignment={draft} /> : <div className="ic-editor-layout">
      <div className="ic-stack">
        <section className="ic-tile ic-stack">
          <header className="ic-tile-heading"><div><h2>Details</h2></div></header>
          <label>Title<input value={draft.title} maxLength={200} onChange={event => update({ title: event.target.value })} /></label>
          <label>Instructions for students<textarea rows={4} value={draft.instructions} maxLength={20_000} placeholder="What should students do, and how will it be graded?" onChange={event => update({ instructions: event.target.value })} /></label>
        </section>
        <BlockEditor blocks={draft.blocks} title={draft.title} onChange={blocks => update({ blocks })} />
      </div>
      <Settings draft={draft} course={course} update={update} />
    </div>}
  </div>;
}

function Settings({ draft, course, update }: { draft: Assignment; course?: Course; update: (patch: Partial<Assignment>) => void }) {
  return <aside className="ic-tile ic-stack ic-settings" aria-label="Assignment settings">
    <header className="ic-tile-heading"><div><h2>Settings</h2></div></header>
    <label className="ic-checkbox ic-publish"><input type="checkbox" checked={draft.published} onChange={event => update({ published: event.target.checked })} />Published (students can see it)</label>
    <label>Due<input type="datetime-local" value={draft.dueAt ?? ''} onChange={event => update({ dueAt: event.target.value || null })} /></label>
    <p className="ic-note">Total: <strong>{pointsLabel(totalPoints(draft))}</strong>, the sum of each block's points.</p>
    <label>Attempts allowed<select value={draft.attempts ?? 'unlimited'} onChange={event => update({ attempts: event.target.value === 'unlimited' ? null : Number(event.target.value) })}>
      {[1, 2, 3, 5].map(n => <option key={n} value={n}>{n}</option>)}<option value="unlimited">Unlimited</option>
    </select></label>
    <label>Time limit (minutes)<input type="number" min={1} max={600} placeholder="No limit" value={draft.timeLimit ?? ''} onChange={event => update({ timeLimit: event.target.value ? Math.max(1, Number(event.target.value)) : null })} /></label>
    <label>Linked module<select value={draft.moduleId ?? ''} onChange={event => update({ moduleId: event.target.value || null })}>
      <option value="">None</option>{course?.modules.map(module => <option key={module.id} value={module.id}>{module.title}</option>)}
    </select></label>
    {draft.blocks.some(block => block.type === 'question') && <>
      <label className="ic-checkbox"><input type="checkbox" checked={draft.shuffle} onChange={event => update({ shuffle: event.target.checked })} />Shuffle question order</label>
      <label>Show correct answers<select value={draft.showAnswers} onChange={event => update({ showAnswers: event.target.value as ShowAnswers })}>
        <option value="after_submit">Right after submitting</option><option value="after_due">After the due date</option><option value="never">Never</option>
      </select></label>
    </>}
  </aside>;
}
