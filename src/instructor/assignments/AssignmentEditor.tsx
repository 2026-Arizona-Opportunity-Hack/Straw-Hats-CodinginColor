// Edit one assignment: details, type-specific content, settings, and a student preview.
import { useState } from 'react';
import { Download, Eye, Pencil, Save, Trash2 } from 'lucide-react';
import { InteractiveHtmlFrame } from '../../shared/ui/InteractiveHtmlFrame';
import type { ClassGroup, Course } from '../model';
import { PageHeader } from '../ui';
import { formatDue, kindIcon } from './display';
import { QuizEditor } from './QuizEditor';
import { StudentPreview } from './StudentPreview';
import {
  assignmentKinds, exportAssignment, isHttpsUrl, linkEmbed, publishProblem, totalPoints, type Assignment, type ShowAnswers,
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
  const Icon = kindIcon[draft.kind];

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
    const clean = { ...next, points: totalPoints(next) };
    if (onSave(clean)) {
      setDraft(clean);
      setSaved(clean);
      setError('');
      setStatus(clean.published ? 'Saved and published' : 'Draft saved');
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
      description={<>{assignmentKinds[draft.kind].label} · {totalPoints(draft)} points · {formatDue(draft.dueAt)}
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
          <header className="ic-tile-heading"><div><h2><Icon size={14} aria-hidden="true" /> {assignmentKinds[draft.kind].label}</h2><p className="ic-note">{assignmentKinds[draft.kind].detail}.</p></div></header>
          <label>Title<input value={draft.title} maxLength={200} onChange={event => update({ title: event.target.value })} /></label>
          <label>Instructions for students<textarea rows={4} value={draft.instructions} maxLength={20_000} placeholder="What should students do, and how will it be graded?" onChange={event => update({ instructions: event.target.value })} /></label>
        </section>
        {draft.kind === 'quiz' && <QuizEditor questions={draft.quiz.questions} onChange={questions => update({ quiz: { ...draft.quiz, questions } })} />}
        {draft.kind === 'link' && <LinkEditor url={draft.link.url} title={draft.title} onChange={url => update({ link: { url } })} />}
        {draft.kind === 'html' && <HtmlEditor value={draft.html} title={draft.title} onChange={html => update({ html })} />}
        {draft.kind === 'written' && <PromptsEditor prompts={draft.written.prompts} onChange={prompts => update({ written: { prompts } })} />}
        {draft.kind === 'code' && <section className="ic-tile ic-stack">
          <header className="ic-tile-heading"><div><h2>Code</h2><p className="ic-note">Students edit the starter code and run it in the browser. Tests are Python <code>assert</code> lines run after their code.</p></div></header>
          <label>Starter code<textarea className="ic-code-input" rows={8} spellCheck={false} value={draft.code.starter} onChange={event => update({ code: { ...draft.code, starter: event.target.value } })} /></label>
          <label>Tests<textarea className="ic-code-input" rows={5} spellCheck={false} placeholder={'assert add(2, 3) == 5'} value={draft.code.tests} onChange={event => update({ code: { ...draft.code, tests: event.target.value } })} /></label>
        </section>}
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
    {draft.kind === 'quiz'
      ? <p className="ic-note">Points: <strong>{totalPoints(draft)}</strong> (sum of question points)</p>
      : <label>Points<input type="number" min={0} max={1000} value={draft.points} onChange={event => update({ points: Math.max(0, Number(event.target.value) || 0) })} /></label>}
    <label>Attempts allowed<select value={draft.attempts ?? 'unlimited'} onChange={event => update({ attempts: event.target.value === 'unlimited' ? null : Number(event.target.value) })}>
      {[1, 2, 3, 5].map(n => <option key={n} value={n}>{n}</option>)}<option value="unlimited">Unlimited</option>
    </select></label>
    <label>Time limit (minutes)<input type="number" min={1} max={600} placeholder="No limit" value={draft.timeLimit ?? ''} onChange={event => update({ timeLimit: event.target.value ? Math.max(1, Number(event.target.value)) : null })} /></label>
    <label>Linked module<select value={draft.moduleId ?? ''} onChange={event => update({ moduleId: event.target.value || null })}>
      <option value="">None</option>{course?.modules.map(module => <option key={module.id} value={module.id}>{module.title}</option>)}
    </select></label>
    {draft.kind === 'quiz' && <>
      <label className="ic-checkbox"><input type="checkbox" checked={draft.quiz.shuffle} onChange={event => update({ quiz: { ...draft.quiz, shuffle: event.target.checked } })} />Shuffle question order</label>
      <label>Show correct answers<select value={draft.quiz.showAnswers} onChange={event => update({ quiz: { ...draft.quiz, showAnswers: event.target.value as ShowAnswers } })}>
        <option value="after_submit">Right after submitting</option><option value="after_due">After the due date</option><option value="never">Never</option>
      </select></label>
    </>}
  </aside>;
}

function LinkEditor({ url, title, onChange }: { url: string; title: string; onChange: (url: string) => void }) {
  const embed = linkEmbed(url);
  const valid = isHttpsUrl(url);
  return <section className="ic-tile ic-stack">
    <header className="ic-tile-heading"><div><h2>Link</h2><p className="ic-note">YouTube, Vimeo, Google Drive, Docs, Sheets, Slides and Forms show inside the assignment. Other sites open in a new tab.</p></div></header>
    <label>URL<input type="url" inputMode="url" placeholder="https://" value={url} onChange={event => onChange(event.target.value.trim())} /></label>
    {url && !valid && <p className="ic-error" role="alert">Use a full link that starts with https://.</p>}
    {valid && (embed
      ? <iframe className="ic-video" src={embed} title={title || 'Linked resource'} loading="lazy" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
      : <p className="ic-note">Students get a button that opens <a href={url} target="_blank" rel="noopener noreferrer">{new URL(url).hostname}</a> in a new tab.</p>)}
  </section>;
}

const scoreSnippet = "parent.postMessage({ type: 'cic:complete', score: 1 }, '*')";

function HtmlEditor({ value, title, onChange }: { value: Assignment['html']; title: string; onChange: (value: Assignment['html']) => void }) {
  const [error, setError] = useState('');
  return <section className="ic-tile ic-stack">
    <header className="ic-tile-heading"><div><h2>Page content</h2><p className="ic-note">Paste HTML (for example, a page an AI assistant made for you) or upload an .html file. It runs in a locked sandbox with no access to student accounts.</p></div></header>
    <label>Upload .html<input type="file" accept=".html,.htm,text/html" onChange={async event => {
      const file = event.currentTarget.files?.[0];
      event.currentTarget.value = '';
      if (!file) return;
      if (file.size > 500_000) return setError('Choose a file under 500 KB.');
      setError('');
      onChange({ ...value, html: await file.text() });
    }} /></label>
    {error && <p className="ic-error" role="alert">{error}</p>}
    <label>HTML<textarea className="ic-code-input" rows={10} spellCheck={false} value={value.html} onChange={event => onChange({ ...value, html: event.target.value })} /></label>
    <label className="ic-checkbox"><input type="checkbox" checked={value.reportsScore} onChange={event => onChange({ ...value, reportsScore: event.target.checked })} />The page reports a score</label>
    {value.reportsScore
      ? <p className="ic-note">The page must run <code>{scoreSnippet}</code> when the student finishes (score from 0 to 1). Add that sentence to your AI prompt.</p>
      : <p className="ic-note">Students click "Mark as done" when they finish.</p>}
    {value.html.trim() && <InteractiveHtmlFrame html={value.html} title={`Preview: ${title}`} height={420} />}
  </section>;
}

function PromptsEditor({ prompts, onChange }: { prompts: string[]; onChange: (prompts: string[]) => void }) {
  return <section className="ic-tile ic-stack">
    <header className="ic-tile-heading"><div><h2>Prompts</h2><p className="ic-note">Students answer each prompt in their own words. You grade these by hand.</p></div></header>
    {prompts.map((prompt, index) => <div className="ic-row ic-prompt-row" key={index}>
      <label className="ic-grow">Prompt {index + 1}<textarea rows={2} value={prompt} onChange={event => onChange(prompts.map((p, i) => i === index ? event.target.value : p))} /></label>
      {prompts.length > 1 && <button type="button" className="ic-icon" aria-label={`Remove prompt ${index + 1}`} onClick={() => onChange(prompts.filter((_, i) => i !== index))}><Trash2 size={16} /></button>}
    </div>)}
    <button type="button" className="ic-link-button ic-fit" onClick={() => onChange([...prompts, ''])}>Add prompt</button>
  </section>;
}
