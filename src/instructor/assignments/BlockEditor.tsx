// Build an assignment from blocks in any order: text, links and videos, interactive pages,
// questions of every kind, written prompts and code exercises.
import { useState } from 'react';
import {
  AlignLeft, ArrowDown, ArrowUp, CheckSquare, CircleDot, Code2, Copy, FileText, FileUp, Globe, Hash, MonitorPlay, ToggleLeft, Trash2, Type,
} from 'lucide-react';
import { InteractiveHtmlFrame } from '../../shared/ui/InteractiveHtmlFrame';
import { pointsLabel } from './display';
import { RubricEditor } from './Rubric';
import {
  blockName, blockPoints, cloneBlock, fileTypeGroups, hasRubricSupport, isHttpsUrl, linkEmbed, MAX_UPLOAD_MB, newBlock, newQuestion, questionKinds, rubricTotal,
  type Block, type BlockType, type FileTypeGroup, type QuestionKind, type QuizQuestion,
} from './model';

type AddOption = { label: string; icon: typeof Type; type: Exclude<BlockType, 'completion'>; questionKind?: QuestionKind };

const contentOptions: AddOption[] = [
  { label: 'Text', icon: AlignLeft, type: 'text' },
  { label: 'Link or video', icon: Globe, type: 'link' },
  { label: 'Interactive page', icon: MonitorPlay, type: 'html' },
];
const questionOptions: AddOption[] = [
  { label: 'Multiple choice', icon: CircleDot, type: 'question', questionKind: 'single' },
  { label: 'Select all that apply', icon: CheckSquare, type: 'question', questionKind: 'multiple' },
  { label: 'True or false', icon: ToggleLeft, type: 'question', questionKind: 'truefalse' },
  { label: 'Short answer', icon: Type, type: 'question', questionKind: 'short' },
  { label: 'Number', icon: Hash, type: 'question', questionKind: 'numeric' },
];
const workOptions: AddOption[] = [
  { label: 'Written response', icon: FileText, type: 'written' },
  { label: 'Code exercise', icon: Code2, type: 'code' },
  { label: 'File upload', icon: FileUp, type: 'file' },
];

export function BlockEditor({ blocks, title, onChange }: { blocks: Block[]; title: string; onChange: (blocks: Block[]) => void }) {
  const set = (index: number, block: Block) => onChange(blocks.map((b, i) => (i === index ? block : b)));
  const move = (from: number, to: number) => {
    if (to < 0 || to >= blocks.length) return;
    const copy = [...blocks];
    const [item] = copy.splice(from, 1);
    copy.splice(to, 0, item);
    onChange(copy);
  };
  const add = (option: AddOption) => {
    const block = newBlock(option.type, option.questionKind);
    onChange([...blocks, block]);
    // Bring the new block into view with the cursor in its first field.
    requestAnimationFrame(() => document.getElementById('block-' + block.id)?.querySelector<HTMLElement>('textarea, input:not([type=checkbox]):not([type=radio])')?.focus());
  };
  const questions = blocks.filter(b => b.type === 'question').length;

  return <section className="ic-tile ic-stack" aria-label="Assignment content">
    <header className="ic-tile-heading"><div><h2>Content</h2>
      <p className="ic-note">{blocks.length} block{blocks.length === 1 ? '' : 's'} · {questions} question{questions === 1 ? '' : 's'} · {pointsLabel(blocks.reduce((sum, b) => sum + blockPoints(b), 0))}. Students see blocks in this order.</p></div></header>
    {!blocks.length && <p className="ic-empty">Add a block below to start.</p>}
    {blocks.map((block, index) => <fieldset key={block.id} id={'block-' + block.id} className="ic-question-card ic-block-card">
      <legend>{blockName(blocks, index)}</legend>
      <div className="ic-question-toolbar">
        {block.type === 'question' && <QuestionTypeSelect question={block.question} onChange={question => set(index, { ...block, question })} />}
        {hasRubricSupport(block) && block.rubric?.length ? <span className="ic-note">Points: <strong>{rubricTotal(block.rubric)}</strong> from the rubric</span>
          : block.type !== 'text' && block.type !== 'link' && <PointsField label={blockName(blocks, index)}
          value={block.type === 'question' ? block.question.points : block.points}
          onChange={points => set(index, block.type === 'question' ? { ...block, question: { ...block.question, points } } : { ...block, points })} />}
        <span className="ic-row ic-push">
          <button type="button" className="ic-icon" aria-label={`Move ${blockName(blocks, index)} up`} disabled={index === 0} onClick={() => move(index, index - 1)}><ArrowUp size={16} /></button>
          <button type="button" className="ic-icon" aria-label={`Move ${blockName(blocks, index)} down`} disabled={index === blocks.length - 1} onClick={() => move(index, index + 1)}><ArrowDown size={16} /></button>
          <button type="button" className="ic-icon" disabled={block.type === 'completion'} aria-label={`Duplicate ${blockName(blocks, index)}`} onClick={() => onChange([...blocks.slice(0, index + 1), cloneBlock(block), ...blocks.slice(index + 1)])}><Copy size={16} /></button>
          <button type="button" className="ic-icon" disabled={block.type === 'completion'} aria-label={`Delete ${blockName(blocks, index)}`} onClick={() => onChange(blocks.filter((_, i) => i !== index))}><Trash2 size={16} /></button>
        </span>
      </div>
      <BlockFields block={block} title={title} onChange={next => set(index, next)} />
      {hasRubricSupport(block) && <RubricEditor rubric={block.rubric} onChange={rubric => set(index, { ...block, rubric })} />}
    </fieldset>)}
    <div className="ic-add-blocks" role="group" aria-label="Add a block">
      {[['Content', contentOptions], ['Questions', questionOptions], ['Student work', workOptions]].map(([group, options]) => <div key={group as string} className="ic-add-group">
        <span className="ic-add-label">{group as string}</span>
        {(options as AddOption[]).map(option => <button key={option.label} type="button" className="ic-button" onClick={() => add(option)}>
          <option.icon size={15} aria-hidden="true" /> {option.label}
        </button>)}
      </div>)}
    </div>
  </section>;
}

function PointsField({ label, value, onChange }: { label: string; value: number; onChange: (points: number) => void }) {
  return <label className="ic-inline-field">Points<input type="number" min={0} max={100} className="ic-points" aria-label={`Points for ${label}`} value={value}
    onChange={event => onChange(Math.max(0, Number(event.target.value) || 0))} /></label>;
}

function QuestionTypeSelect({ question: q, onChange }: { question: QuizQuestion; onChange: (q: QuizQuestion) => void }) {
  return <label className="ic-inline-field">Type<select value={q.kind} onChange={event => {
    const kind = event.target.value as QuestionKind;
    const fresh = newQuestion(kind);
    const keepChoices = (kind === 'single' || kind === 'multiple') && q.choices.length >= 2 && q.kind !== 'truefalse';
    onChange({ ...q, kind, choices: keepChoices ? q.choices : fresh.choices, correct: kind === 'multiple' ? q.correct : q.correct.slice(0, 1) });
  }}>{Object.entries(questionKinds).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>;
}

function BlockFields({ block, title, onChange }: { block: Block; title: string; onChange: (block: Block) => void }) {
  switch (block.type) {
    case 'completion': return <p className="ic-note">Awarded automatically when the student completes {block.title.toLowerCase()} in the linked lesson.</p>;
    case 'text': return <label>Text<textarea rows={4} value={block.text} maxLength={20_000} placeholder="Explain, give context, or set up the next part." onChange={event => onChange({ ...block, text: event.target.value })} /></label>;
    case 'link': return <LinkFields block={block} title={title} onChange={onChange} />;
    case 'html': return <HtmlFields block={block} title={title} onChange={onChange} />;
    case 'question': return <QuestionFields question={block.question} onChange={question => onChange({ ...block, question })} />;
    case 'written': return <div className="ic-field">
      <label>Prompt<textarea rows={3} aria-describedby={'hint-' + block.id} value={block.prompt} maxLength={5000} placeholder="What should students write about?" onChange={event => onChange({ ...block, prompt: event.target.value })} /></label>
      <p className="ic-note" id={'hint-' + block.id}>Students answer in their own words. You grade this by hand.</p></div>;
    case 'file': return <FileFields block={block} onChange={onChange} />;
    case 'code': return <>
      <label>Task<textarea rows={3} value={block.prompt} maxLength={5000} placeholder="Write a function that adds two numbers." onChange={event => onChange({ ...block, prompt: event.target.value })} /></label>
      <label>Starter code<textarea className="ic-code-input" rows={6} spellCheck={false} value={block.starter} onChange={event => onChange({ ...block, starter: event.target.value })} /></label>
      <div className="ic-field">
        <label>Tests<textarea className="ic-code-input" rows={3} spellCheck={false} aria-describedby={'hint-' + block.id} placeholder="assert add(2, 3) == 5" value={block.tests} onChange={event => onChange({ ...block, tests: event.target.value })} /></label>
        <p className="ic-note" id={'hint-' + block.id}>Python <code>assert</code> lines run after the student's code.</p>
      </div>
    </>;
  }
}

function LinkFields({ block, title, onChange }: { block: Extract<Block, { type: 'link' }>; title: string; onChange: (block: Block) => void }) {
  const embed = linkEmbed(block.url);
  const valid = isHttpsUrl(block.url);
  return <>
    <div className="ic-field">
      <label>URL<input type="url" inputMode="url" aria-describedby={'hint-' + block.id} placeholder="https://www.youtube.com/watch?v=…" value={block.url} onChange={event => onChange({ ...block, url: event.target.value.trim() })} /></label>
      <p className="ic-note" id={'hint-' + block.id}>YouTube, Vimeo, Google Drive, Docs, Sheets, Slides and Forms show inside the assignment. Other sites open in a new tab.</p>
    </div>
    <label>Caption (optional)<input value={block.caption} maxLength={300} placeholder="Watch the first 5 minutes." onChange={event => onChange({ ...block, caption: event.target.value })} /></label>
    {block.url && !valid && <p className="ic-error" role="alert">Use a full link that starts with https://.</p>}
    {valid && (embed
      ? <iframe className="ic-video" src={embed} title={block.caption || title || 'Linked resource'} loading="lazy" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
      : <p className="ic-note">Students get a button that opens <a href={block.url} target="_blank" rel="noopener noreferrer">{new URL(block.url).hostname}</a> in a new tab.</p>)}
  </>;
}

function FileFields({ block, onChange }: { block: Extract<Block, { type: 'file' }>; onChange: (block: Block) => void }) {
  const toggle = (group: FileTypeGroup, on: boolean) =>
    onChange({ ...block, fileTypes: on ? [...block.fileTypes, group] : block.fileTypes.filter(g => g !== group) });
  return <>
    <label>What to upload<textarea rows={2} value={block.prompt} maxLength={5000} placeholder="Upload your essay as a PDF." onChange={event => onChange({ ...block, prompt: event.target.value })} /></label>
    <fieldset className="ic-file-types">
      <legend>Allowed file types</legend>
      {(Object.keys(fileTypeGroups) as FileTypeGroup[]).map(group => <label key={group} className="ic-checkbox">
        <input type="checkbox" checked={block.fileTypes.includes(group)} onChange={event => toggle(group, event.target.checked)} />
        <span className="ic-file-type"><span>{fileTypeGroups[group].label}</span><span className="ic-note">{fileTypeGroups[group].accept.join(' ')}</span></span>
      </label>)}
    </fieldset>
    <div className="ic-row">
      <label className="ic-inline-field">Files allowed<select value={block.maxFiles} onChange={event => onChange({ ...block, maxFiles: Number(event.target.value) })}>
        {[1, 2, 3, 5, 10].map(n => <option key={n} value={n}>{n}</option>)}
      </select></label>
      <label className="ic-inline-field">Max size per file<select value={block.maxSizeMb} onChange={event => onChange({ ...block, maxSizeMb: Number(event.target.value) })}>
        {[5, 10, 25].filter(n => n <= MAX_UPLOAD_MB).map(n => <option key={n} value={n}>{n} MB</option>)}
      </select></label>
    </div>
  </>;
}

const scoreSnippet = "parent.postMessage({ type: 'cic:complete', score: 1 }, '*')";

function HtmlFields({ block, title, onChange }: { block: Extract<Block, { type: 'html' }>; title: string; onChange: (block: Block) => void }) {
  const [error, setError] = useState('');
  return <>
    <p className="ic-note">Paste HTML (for example, a page an AI assistant made for you) or upload an .html file. It runs in a locked sandbox with no access to student accounts.</p>
    <label>Upload .html<input type="file" accept=".html,.htm,text/html" onChange={async event => {
      const file = event.currentTarget.files?.[0];
      event.currentTarget.value = '';
      if (!file) return;
      if (file.size > 500_000) return setError('Choose a file under 500 KB.');
      setError('');
      onChange({ ...block, html: await file.text() });
    }} /></label>
    {error && <p className="ic-error" role="alert">{error}</p>}
    <label>HTML<textarea className="ic-code-input" rows={8} spellCheck={false} value={block.html} onChange={event => onChange({ ...block, html: event.target.value })} /></label>
    <label className="ic-checkbox"><input type="checkbox" checked={block.reportsScore} onChange={event => onChange({ ...block, reportsScore: event.target.checked })} />The page reports a score</label>
    {block.reportsScore
      ? <p className="ic-note">The page must run <code>{scoreSnippet}</code> when the student finishes (score from 0 to 1). Add that sentence to your AI prompt.</p>
      : <p className="ic-note">Students click "Mark as done" when they finish.</p>}
    {block.html.trim() && <InteractiveHtmlFrame html={block.html} title={`Preview: ${title}`} height={380} />}
  </>;
}

function QuestionFields({ question: q, onChange }: { question: QuizQuestion; onChange: (q: QuizQuestion) => void }) {
  const set = (patch: Partial<QuizQuestion>) => onChange({ ...q, ...patch });
  return <>
    <label>Question<textarea rows={2} value={q.prompt} maxLength={2000} onChange={event => set({ prompt: event.target.value })} /></label>
    {(q.kind === 'single' || q.kind === 'multiple' || q.kind === 'truefalse') && <div className="ic-stack ic-choices" role="group" aria-label="Choices">
      <p className="ic-note">{q.kind === 'multiple' ? 'Check every correct choice.' : 'Select the correct choice.'}</p>
      {q.choices.map((choice, ci) => <div className="ic-choice-row" key={ci}>
        <input type={q.kind === 'multiple' ? 'checkbox' : 'radio'} name={q.id + '-correct'} checked={q.correct.includes(ci)}
          aria-label={`Mark choice ${ci + 1} correct`}
          onChange={event => set({ correct: q.kind === 'multiple' ? (event.target.checked ? [...q.correct, ci] : q.correct.filter(c => c !== ci)) : [ci] })} />
        {q.kind === 'truefalse' ? <span>{choice}</span> : <input aria-label={`Choice ${ci + 1}`} value={choice} maxLength={500} placeholder={`Choice ${ci + 1}`}
          onChange={event => set({ choices: q.choices.map((c, i) => (i === ci ? event.target.value : c)) })} />}
        {q.kind !== 'truefalse' && q.choices.length > 2 && <button type="button" className="ic-icon" aria-label={`Remove choice ${ci + 1}`} onClick={() => set({
          choices: q.choices.filter((_, i) => i !== ci),
          correct: q.correct.filter(c => c !== ci).map(c => (c > ci ? c - 1 : c)),
        })}><Trash2 size={15} /></button>}
      </div>)}
      {q.kind !== 'truefalse' && q.choices.length < 8 && <button type="button" className="ic-link-button ic-fit" onClick={() => set({ choices: [...q.choices, ''] })}>Add choice</button>}
    </div>}
    {q.kind === 'short' && <div className="ic-field">
      <label>Accepted answers, one per line<textarea rows={3} aria-describedby={'hint-' + q.id} value={q.accepted.join('\n')} placeholder={'print\nprint()'} onChange={event => set({ accepted: event.target.value.split('\n') })} /></label>
      <p className="ic-note" id={'hint-' + q.id}>Matching ignores capital letters and extra spaces.</p>
    </div>}
    {q.kind === 'numeric' && <div className="ic-row">
      <label className="ic-inline-field">Correct number<input type="number" step="any" value={q.answer ?? ''} onChange={event => set({ answer: event.target.value === '' ? null : Number(event.target.value) })} /></label>
      <label className="ic-inline-field">Allowed difference<input type="number" step="any" min={0} value={q.tolerance} onChange={event => set({ tolerance: Math.max(0, Number(event.target.value) || 0) })} /></label>
    </div>}
  </>;
}
