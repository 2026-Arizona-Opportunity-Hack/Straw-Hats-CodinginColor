import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { ArrowDown, ArrowRight, ArrowUp, BookOpen, Copy, Eye, FilePlus2, GripVertical, ImagePlus, Plus, Save, Star, Trash2 } from 'lucide-react';
import { isLocalDemo } from '../shared/supabase.ts';
import { DemoLesson } from '../student/DemoLesson';
import { LessonContent } from '../student/LessonContent';
import { CodingLabEditor } from './CodingLabEditor';
import { DiscussionReview } from './DiscussionReview';
import { HtmlActivityEditor, HtmlActivityPreview } from './HtmlActivity';
import { emptyHtml } from './htmlStarter';
import { BlockPicker } from './BlockPicker';
import { ImportMaterials } from './ImportMaterials';
import { readAndCheckLesson } from './lessonTemplates';
import { ActivityPreview, LessonPreview } from './LessonPreview';
import { practiceAttempt, previewLesson } from './studentPreview';
import {
  activityTypes, blankQuestion, copyBlock, embedUrl, gradedTypes, id, newActivity, newLesson, newModule, questionTypes, reorder, slidesUrl, unresolvedModuleContent,
  type Activity, type Course, type Lesson, type Module,
} from './model';
import { Dialog, Empty, PageHeader, Panel } from './ui';

type View = { moduleId?: string; lessonId?: string; activityId?: string };
type OutlineKind = 'module' | 'lesson' | 'block';
type DragItem = { kind: OutlineKind; index: number; parent: string };

function StudentPreview({ lessons, moduleId, local }: { lessons: Lesson[]; moduleId: string; local: boolean }) {
  return <div className="ic-stack">
    <p className="ic-note">Student preview of this draft. Answers here are practice only.</p>
    {lessons.map((lesson, index) => local ? <DemoLesson lesson={lesson} key={lesson.id} />
      : <LessonContent key={lesson.id} lesson={previewLesson(lesson, moduleId, index)} onAttempt={practiceAttempt} />)}
  </div>;
}

export function CurriculumList({ courses, reviewer = false, onCreate }: { courses: Course[]; reviewer?: boolean; onCreate?: (course: Course) => void }) {
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [level, setLevel] = useState('Beginner');
  const [template, setTemplate] = useState('blank');
  const visible = reviewer ? courses.filter(course => course.modules.some(module => module.published)) : courses;
  return <>
    <PageHeader title={reviewer ? 'Curriculum reviewer' : 'Curriculum'} description={reviewer
      ? 'Browse published courses and article-style lessons in the read-only preview.'
      : 'Build and publish article-style modules that students can follow independently.'}>
      {!reviewer && <button className="ic-button ic-primary" onClick={() => setAdding(true)}><Plus size={17} /> New course</button>}
    </PageHeader>
    <div className="ic-stack">
      {visible.map(course => {
        const published = course.modules.filter(module => module.published).length;
        return <article className="ic-panel ic-course-row" key={course.id}>
          <div className="ic-class-mark"><BookOpen size={21} /></div>
          <div><h2><a href={`#/${reviewer ? 'review' : 'curriculum'}/${course.id}`}>{course.title}</a></h2>
            {course.description && <p>{course.description}</p>}
            <span className="ic-note">{course.level} · {published} published{!reviewer && ` · ${course.modules.length - published} draft`}</span>
          </div><a className="ic-button" href={`#/${reviewer ? 'review' : 'curriculum'}/${course.id}`}>{reviewer ? 'Browse course' : 'Open builder'} <ArrowRight size={16} /></a>
        </article>;
      })}
      {!visible.length && <Panel><Empty>{reviewer ? 'No courses have published modules yet.' : 'Create a course to start authoring.'}</Empty></Panel>}
    </div>
    {adding && <Dialog title="Create a course" onClose={() => setAdding(false)}>
      <form className="ic-stack" onSubmit={event => {
        event.preventDefault();
        if (!title.trim()) return;
        const module = newModule();
        if (template === 'read-check') module.lessons = [readAndCheckLesson()];
        onCreate?.({ id: id(), title: title.trim(), description: '', level, modules: [module] });
      }}><label>Course title<input required autoFocus value={title} maxLength={100} onChange={event => setTitle(event.target.value)} /></label>
        <label>Level<select value={level} onChange={event => setLevel(event.target.value)}>{['Beginner', 'Intermediate', 'Advanced', 'Expert'].map(value => <option key={value}>{value}</option>)}</select></label>
        <label>Start with<select value={template} onChange={event => setTemplate(event.target.value)}>
          <option value="blank">Blank lesson</option><option value="read-check">Read &amp; check</option>
        </select></label>
        <div className="ic-form-footer"><button className="ic-button ic-primary" type="submit">Create course</button></div>
      </form>
    </Dialog>}
  </>;
}

export function CourseReviewer({ course }: { course: Course }) {
  const modules = course.modules.filter(module => module.published);
  const [active, setActive] = useState(modules[0]?.lessons[0]?.id);
  const lesson = modules.flatMap(module => module.lessons).find(lesson => lesson.id === active);
  return <>
    <PageHeader title={course.title} description={course.description} back={{ label: 'Reviewer library', to: '#/review' }} />
    <div className="ic-builder">
      <Panel title="Published lessons">
        {modules.map(module => <div className="ic-review-module" key={module.id}><h3>{module.title}</h3><ul>
          {module.lessons.map(lesson => <li key={lesson.id}><button type="button" className="ic-tree-button" aria-pressed={active === lesson.id} onClick={() => setActive(lesson.id)}>{lesson.title}</button></li>)}
        </ul></div>)}
      </Panel>
      <Panel>{lesson ? <LessonPreview lesson={lesson} /> : <Empty>No published lessons are available.</Empty>}</Panel>
    </div>
  </>;
}

export function CourseBuilder({ initial, released, localAuthoring, onSave, onRelease, assigned, library, onSaveLibrary }: {
  initial: Course;
  released: Course;
  localAuthoring: boolean;
  library: Activity[];
  onSaveLibrary: (blocks: Activity[]) => boolean;
  onRelease: (course: Course, moduleId: string, selected: Module | null) => Promise<Course | false>;
  onSave: (course: Course) => boolean;
  assigned: Set<string>;
}) {
  const [course, setCourse] = useState(initial);
  const [savedDraft, setSavedDraft] = useState(initial);
  const [manageBlocks, setManageBlocks] = useState(false);
  const [view, setView] = useState<View>({ moduleId: initial.modules[0]?.id, lessonId: initial.modules[0]?.lessons[0]?.id });
  const [preview, setPreview] = useState(false);
  const [tab, setTab] = useState<'edit' | 'preview'>('edit');
  const [importer, setImporter] = useState<'markdown' | 'converter' | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [resetDraft, setResetDraft] = useState(false);
  const [dragging, setDragging] = useState<DragItem | null>(null);
  const [picker, setPicker] = useState<number | null>(null);
  const addBlockButton = useRef<HTMLButtonElement>(null);
  const pickerTrigger = useRef<HTMLElement | null>(null);
  const [removal, setRemoval] = useState<{ kind: OutlineKind; index: number; parent: string; title: string } | null>(null);
  const module = course.modules.find(module => module.id === view.moduleId);
  const lesson = module?.lessons.find(lesson => lesson.id === view.lessonId);
  const activity = lesson?.activities.find(activity => activity.id === view.activityId);
  const liveModule = released.modules.find(item => item.id === module?.id && item.published);
  const savedBlocks = new Set(released.modules.find(item => item.id === module?.id)?.lessons
    .find(item => item.id === lesson?.id)?.activities.map(block => block.id));
  const unsaved = course !== savedDraft;
  const staleDraft = released.publicationRevision !== undefined && course.publicationRevision !== released.publicationRevision;
  const saveDraft = useCallback(() => {
    if (!onSave(course)) return false;
    setSavedDraft(course);
    return true;
  }, [course, onSave]);

  const flushDraft = useRef<(() => boolean) | null>(null);
  useEffect(() => {
    flushDraft.current = unsaved && !publishing ? () => onSave(course) : null;
    if (!unsaved || publishing) return;
    const timer = window.setTimeout(saveDraft, 700);
    return () => window.clearTimeout(timer);
  }, [course, onSave, saveDraft, unsaved, publishing]);
  useEffect(() => () => { flushDraft.current?.(); }, []);

  useEffect(() => {
    if (!unsaved && !publishing) return;
    function preventLoss(event: BeforeUnloadEvent) {
      if (publishing || flushDraft.current?.() === false) event.preventDefault();
    }
    window.addEventListener('beforeunload', preventLoss);
    return () => window.removeEventListener('beforeunload', preventLoss);
  }, [unsaved, publishing]);

  function select(next: View) {
    setView(next);
    setError('');
    setTab('edit');
    setPicker(null);
  }

  function updateModule(moduleId: string, fn: (module: Module) => Module) {
    setCourse(course => ({ ...course, modules: course.modules.map(module => module.id === moduleId ? fn(module) : module) }));
  }

  function updateLesson(lessonId: string, fn: (lesson: Lesson) => Lesson) {
    if (!module) return;
    updateModule(module.id, module => ({ ...module, lessons: module.lessons.map(lesson => lesson.id === lessonId ? fn(lesson) : lesson) }));
  }

  function updateActivity(activityId: string, fn: (activity: Activity) => Activity) {
    if (!lesson) return;
    updateLesson(lesson.id, lesson => ({ ...lesson, activities: lesson.activities.map(activity => activity.id === activityId ? fn(activity) : activity) }));
  }

  async function updatePublication(selected: Module | null) {
    if (!module || publishing || staleDraft || !saveDraft()) return;
    setPublishing(true);
    setError('');
    setMessage('');
    const draft = { ...course, modules: course.modules.map(item => item.id === module.id ? { ...item, published: !!selected } : item) };
    try {
      const saved = await onRelease(draft, module.id, selected);
      if (!saved) return;
      setCourse(saved);
      setSavedDraft(saved);
      setMessage(selected ? 'Module published and ready to assign.' : 'Module moved to draft.');
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Could not publish this update. Your draft is saved in this browser.');
    } finally {
      setPublishing(false);
    }
  }

  function publish() {
    if (!module) return;
    const issue = unresolvedModuleContent(module);
    if (!course.title.trim()) return setError('Give the course a title before publishing.');
    if (issue) return setError(issue);
    void updatePublication(module);
  }

  function unpublish() {
    if (!module || assigned.has(module.id)) return setError('Remove this module from its class assignments before unpublishing.');
    void updatePublication(null);
  }

  function addModule(next = newModule()) {
    setCourse(course => ({ ...course, modules: [...course.modules, next] }));
    select({ moduleId: next.id });
  }

  function addLesson(htmlFirst = false) {
    if (!module) return;
    const next = newLesson();
    if (htmlFirst) {
      next.htmlFirst = true;
      next.activities.push({ ...newActivity('interactive_html'), interactiveHtml: { ...emptyHtml } });
    }
    updateModule(module.id, module => ({ ...module, lessons: [...module.lessons, next] }));
    select({ moduleId: module.id, lessonId: next.id, activityId: next.activities[0]?.id });
  }

  function insertBlock(next: Activity, position: number) {
    if (!lesson || !module) return;
    updateLesson(lesson.id, lesson => ({ ...lesson, activities: [
      ...lesson.activities.slice(0, position), next, ...lesson.activities.slice(position),
    ] }));
    select({ moduleId: module.id, lessonId: lesson.id, activityId: next.id });
    requestAnimationFrame(() => document.getElementById('block-title-' + next.id)?.focus());
  }

  function openPicker(position: number, trigger: HTMLElement) {
    pickerTrigger.current = trigger;
    setPicker(position);
  }

  const closePicker = useCallback((restoreFocus: boolean) => {
    setPicker(null);
    if (restoreFocus) requestAnimationFrame(() => pickerTrigger.current?.focus());
  }, []);

  useEffect(() => {
    if (!lesson || tab !== 'edit' || preview || importer || removal || resetDraft || manageBlocks || picker !== null) return;
    function shortcut(event: KeyboardEvent) {
      if (event.key !== '/' || event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.target instanceof HTMLElement && event.target.closest('input, textarea, select, [contenteditable]')) return;
      const trigger = addBlockButton.current;
      if (!trigger) return;
      event.preventDefault();
      openPicker(lesson!.activities.length, trigger);
    }
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, [lesson, tab, preview, importer, removal, resetDraft, manageBlocks, picker]);

  function move(kind: OutlineKind, parent: string, from: number, to: number) {
    if (from === to) return;
    if (kind === 'module') setCourse(course => ({ ...course, modules: reorder(course.modules, from, to) }));
    if (kind === 'lesson') updateModule(parent, module => ({ ...module, lessons: reorder(module.lessons, from, to) }));
    if (kind === 'block') updateLesson(parent, lesson => ({ ...lesson, activities: reorder(lesson.activities, from, to) }));
  }

  function remove() {
    if (!removal) return;
    const { kind, parent, index } = removal;
    if (kind === 'module') setCourse(course => ({ ...course, modules: course.modules.filter((_, i) => i !== index) }));
    if (kind === 'lesson') updateModule(parent, module => ({ ...module, lessons: module.lessons.filter((_, i) => i !== index) }));
    if (kind === 'block') updateLesson(parent, lesson => ({ ...lesson, activities: lesson.activities.filter((_, i) => i !== index) }));
    select(kind === 'module' ? {} : { moduleId: module?.id, lessonId: kind === 'block' ? lesson?.id : undefined });
    setRemoval(null);
  }

  function treeRow(kind: OutlineKind, parent: string, index: number, length: number, label: string, isSelected: boolean, onSelect: () => void, status?: string) {
    return <div className={`ic-tree-row ic-tree-${kind}${isSelected ? ' is-selected' : ''}`}
      onDragOver={event => { if (dragging?.kind === kind && dragging.parent === parent) event.preventDefault(); }}
      onDrop={event => {
        event.preventDefault();
        if (dragging?.kind === kind && dragging.parent === parent) move(kind, parent, dragging.index, index);
        setDragging(null);
      }}>
      <span className="ic-drag" draggable aria-hidden="true" onDragStart={event => {
        event.dataTransfer.setData('text/plain', label);
        event.dataTransfer.effectAllowed = 'move';
        setDragging({ kind, parent, index });
      }} onDragEnd={() => setDragging(null)}><GripVertical size={15} /></span>
      <button type="button" className="ic-tree-button" aria-pressed={isSelected} onClick={onSelect}>{label}{status && <span>{status}</span>}</button>
      {isSelected && <div className="ic-tree-controls">
        <button type="button" className="ic-icon" disabled={!index} aria-label={`Move ${kind} up`} onClick={() => move(kind, parent, index, index - 1)}><ArrowUp size={14} /></button>
        <button type="button" className="ic-icon" disabled={index >= length - 1} aria-label={`Move ${kind} down`} onClick={() => move(kind, parent, index, index + 1)}><ArrowDown size={14} /></button>
        {!(module?.published || (module && assigned.has(module.id))) && <button type="button" className="ic-icon" aria-label={`Remove ${kind}`} onClick={() => setRemoval({ kind, parent, index, title: label })}><Trash2 size={14} /></button>}
      </div>}
    </div>;
  }

  return <>
    <PageHeader title={course.title || 'Untitled course'} description="Course builder" back={{ label: 'Curriculum', to: '#/curriculum' }}>
      {localAuthoring && <button type="button" className="ic-button" onClick={() => setManageBlocks(true)}><Star size={16} /> My blocks</button>}
      <button type="button" className="ic-button" onClick={() => setImporter('converter')}><FilePlus2 size={16} /> Draft from materials</button>
      <button type="button" className="ic-button" disabled={!module?.lessons.length} onClick={() => setPreview(true)}><Eye size={16} /> Preview module</button>
      <button type="button" className="ic-button ic-primary" disabled={publishing} onClick={saveDraft}><Save size={16} /> Save draft</button>
    </PageHeader>
    <div className="ic-builder-status">
      <span role="status">{publishing ? 'Updating publication…' : unsaved ? 'Unsaved draft changes' : 'Draft saved in this browser'}</span>
      <span role="status">{message}</span>
    </div>
    {error && <p className="ic-error" role="alert">{error}</p>}
    {staleDraft && <div className="ic-row ic-section-gap">
      <p className="ic-note" role="alert">A newer publication is available. Copy draft edits you want to keep before starting from the latest version.</p>
      <button className="ic-button" type="button" onClick={() => setResetDraft(true)}>Use latest version</button>
    </div>}
    <div className="ic-builder" inert={publishing}>
      <Panel title="Course outline">
        <button type="button" className="ic-tree-button ic-course-settings" aria-pressed={!module} onClick={() => select({})}>Course details</button>
        <div className="ic-outline">
          {course.modules.map((item, index) => <div className="ic-tree-group" key={item.id}>
            {treeRow('module', course.id, index, course.modules.length, item.title || 'Untitled module', item.id === module?.id && !lesson,
              () => select({ moduleId: item.id }), item.published ? 'Published' : 'Draft')}
            {item.id === module?.id && item.lessons.map((child, lessonIndex) => <div key={child.id}>
              {treeRow('lesson', item.id, lessonIndex, item.lessons.length, child.title || 'Untitled lesson', child.id === lesson?.id && !activity,
                () => select({ moduleId: item.id, lessonId: child.id }))}
            </div>)}
          </div>)}
        </div>
        <button type="button" className="ic-button ic-section-gap" onClick={() => addModule()}><Plus size={16} /> Add module</button>
      </Panel>
      <div className="ic-stack ic-editor">
        {!module && <Panel title="Course details"><div className="ic-stack">
          <label>Course title<input value={course.title} maxLength={100} onChange={event => setCourse({ ...course, title: event.target.value })} /></label>
          <label>Description<textarea rows={3} value={course.description} onChange={event => setCourse({ ...course, description: event.target.value })} /></label>
          <label>Level<select value={course.level} onChange={event => setCourse({ ...course, level: event.target.value })}>
            {['Beginner', 'Intermediate', 'Advanced', 'Expert'].map(value => <option key={value}>{value}</option>)}
          </select></label></div></Panel>}
        {module && !lesson && <Panel title="Module details" actions={<button type="button" className="ic-button ic-primary" disabled={staleDraft} onClick={publish}>{liveModule ? 'Publish update' : 'Publish module'}</button>}>
          <label>Module title<input value={module.title} maxLength={100} onChange={event => updateModule(module.id, item => ({ ...item, title: event.target.value }))} /></label>
          <div className="ic-row ic-section-gap"><span className={'ic-status ' + (module.published ? 'is-published' : '')}>{liveModule ? 'Published' : 'Draft'}</span>{liveModule && <button type="button" className="ic-button" disabled={staleDraft} onClick={unpublish}>Unpublish module</button>}<button type="button" className="ic-button" onClick={() => addLesson()}><Plus size={16} /> Add lesson</button>{localAuthoring && <button type="button" className="ic-button" onClick={() => addLesson(true)}><Plus size={16} /> Add HTML lesson</button>}</div>
          {module.lessons.length ? <ul className="ic-list ic-section-gap">{module.lessons.map(child => <li key={child.id}><button type="button" className="ic-link-button" onClick={() => select({ moduleId: module.id, lessonId: child.id })}>{child.title}</button><span className="ic-note">{child.activities.length} activities</span></li>)}</ul> : <Empty>Add a lesson to start this module.</Empty>}
        </Panel>}
        {module && lesson && <section className={'ic-panel ic-lesson-page' + (lesson.htmlFirst ? ' ic-html-lesson' : '')} aria-label="Lesson editor">
          <div className="ic-lesson-toolbar">
            <span className="ic-note">{module.title} · {module.published ? 'Published' : 'Draft'}</span>
            <div className="ic-mode" role="group" aria-label="Editor view">
              <button type="button" aria-pressed={tab === 'edit'} onClick={() => setTab('edit')}>Edit</button>
              <button type="button" aria-pressed={tab === 'preview'} onClick={() => { setPicker(null); setTab('preview'); }}>Preview lesson</button>
            </div>
          </div>
          {tab === 'preview' ? <StudentPreview lessons={[lesson]} moduleId={module.id} local={localAuthoring} /> : <>
            <input className="ic-lesson-title" aria-label="Lesson title" value={lesson.title} placeholder="Untitled lesson" maxLength={100}
              onChange={event => updateLesson(lesson.id, item => ({ ...item, title: event.target.value }))} />
            {!lesson.activities.length && <button type="button" className="ic-button ic-fit" onClick={() => {
              const starter = readAndCheckLesson();
              updateLesson(lesson.id, current => ({
                ...current, title: current.title === 'New lesson' ? starter.title : current.title, activities: starter.activities,
              }));
            }}>Use Read &amp; check template</button>}
            {Array.from({ length: lesson.activities.length + 1 }, (_, index) => {
              const block = lesson.activities[index];
              const editing = block?.id === activity?.id;
              const title = block?.title || (block && activityTypes[block.type]);
              return <div key={block?.id ?? 'end'}>
                <div className={`ic-block-gap${block ? '' : ' ic-block-end'}`}>
                  <button type="button" ref={block ? undefined : addBlockButton} className="ic-block-insert" aria-label={block ? 'Insert block before ' + title : 'Add block'} aria-expanded={picker === index}
                    onClick={event => picker === index ? closePicker(false) : openPicker(index, event.currentTarget)}
                    onKeyDown={event => { if (event.key === '/') { event.preventDefault(); openPicker(index, event.currentTarget); } }}>
                    <Plus size={16} aria-hidden="true" />{!block && <>Add block <kbd>/</kbd></>}
                  </button>
                  {picker === index && <BlockPicker allowHtml={localAuthoring} library={library} onClose={closePicker} onPick={next => insertBlock(next, index)} />}
                </div>
                {block && <div className={`ic-lesson-block${editing ? ' is-editing' : ''}`}
                  onDragOver={event => { if (dragging?.kind === 'block' && dragging.parent === lesson.id) event.preventDefault(); }}
                  onDrop={event => {
                    if (dragging?.kind !== 'block' || dragging.parent !== lesson.id) return;
                    event.preventDefault();
                    move('block', lesson.id, dragging.index, index);
                    setDragging(null);
                  }}>
                  <span className="ic-block-grip" draggable title="Drag to reorder" aria-hidden="true" onDragStart={event => {
                    event.dataTransfer.setData('text/plain', block.id);
                    event.dataTransfer.effectAllowed = 'move';
                    setPicker(null);
                    setDragging({ kind: 'block', index, parent: lesson.id });
                  }} onDragEnd={() => setDragging(null)}><GripVertical size={16} /></span>
                  <div className="ic-block-content">
                    <div className="ic-block-toolbar">
                      <span>{block.format === 'open-ended' ? 'Open-ended question' : block.type === 'check' ? 'Quiz' : activityTypes[block.type]}</span>
                      <div className="ic-tree-controls">
                        {editing && <>
                          <button type="button" className="ic-icon" aria-label="Duplicate block" onClick={() => insertBlock(copyBlock(block), index + 1)}><Copy size={15} /></button>
                          {localAuthoring && <button type="button" className="ic-icon" aria-label="Save to My blocks" onClick={() => {
                            if (onSaveLibrary([...library, copyBlock(block)])) setMessage('Block saved to My blocks.');
                          }}><Star size={15} /></button>}
                          <button type="button" className="ic-icon" aria-label="Move block up" disabled={index === 0} onClick={() => move('block', lesson.id, index, index - 1)}><ArrowUp size={15} /></button>
                          <button type="button" className="ic-icon" aria-label="Move block down" disabled={index === lesson.activities.length - 1} onClick={() => move('block', lesson.id, index, index + 1)}><ArrowDown size={15} /></button>
                          {(!savedBlocks.has(block.id) || (!module.published && !assigned.has(module.id))) && <button type="button" className="ic-icon" aria-label="Remove block"
                            onClick={() => setRemoval({ kind: 'block', index, parent: lesson.id, title: title || 'Untitled block' })}><Trash2 size={15} /></button>}
                        </>}
                        <button type="button" className="ic-link-button" aria-label={editing ? 'Done editing ' + title : 'Edit ' + title} onClick={() => {
                          select({ moduleId: module.id, lessonId: lesson.id, activityId: editing ? undefined : block.id });
                          if (!editing) requestAnimationFrame(() => document.getElementById('block-title-' + block.id)?.focus());
                        }}>{editing ? 'Done' : 'Edit'}</button>
                      </div>
                    </div>
                    {editing ? <ActivityEditor key={block.id} activity={block} localAuthoring={localAuthoring} onChange={fn => updateActivity(block.id, fn)} />
                      : <ActivityPreview activity={block} />}
                  </div>
                </div>}
              </div>;
            })}
            <button type="button" className="ic-link-button ic-import-markdown" onClick={() => setImporter('markdown')}><FilePlus2 size={16} /> Import Markdown</button>
          </>}
        </section>}
      </div>
    </div>
    {manageBlocks && <Dialog title="My blocks" onClose={() => setManageBlocks(false)}>
      {library.length ? <ul className="ic-list">{library.map(block => <li key={block.id}>
        <span>{block.title || activityTypes[block.type]}</span>
        <button type="button" className="ic-link-button" onClick={() => onSaveLibrary(library.filter(item => item.id !== block.id))}>Remove from library</button>
      </li>)}</ul> : <Empty>Save a configured block to reuse it in any lesson.</Empty>}
    </Dialog>}
    {preview && module && <Dialog wide title="Student preview" onClose={() => setPreview(false)}>
      <StudentPreview lessons={module.lessons} moduleId={module.id} local={localAuthoring} />
    </Dialog>}
    {importer && <ImportMaterials mode={importer} close={() => setImporter(null)} onMarkdown={text => {
      if (lesson) insertBlock({ ...newActivity(), markdown: text }, lesson.activities.length);
      setImporter(null);
    }} onDraft={draft => { addModule(draft); setImporter(null); }} />}
    {removal && <Dialog title={`Remove ${removal.kind}?`} onClose={() => setRemoval(null)}>
      <p>“{removal.title}” will be removed from the draft outline when you save.</p>
      <div className="ic-form-footer"><button className="ic-button" onClick={() => setRemoval(null)}>Cancel</button><button className="ic-button ic-primary" onClick={remove}>Remove {removal.kind}</button></div>
    </Dialog>}
    {resetDraft && <Dialog title="Replace this draft?" onClose={() => setResetDraft(false)}>
      <p>The latest published version will replace the draft in this browser.</p>
      <div className="ic-form-footer">
        <button type="button" className="ic-button" onClick={() => setResetDraft(false)}>Keep draft</button>
        <button type="button" className="ic-button ic-primary" onClick={() => {
          if (!onSave(released)) return;
          flushDraft.current = null;
          setCourse(released);
          setSavedDraft(released);
          select({ moduleId: released.modules[0]?.id, lessonId: released.modules[0]?.lessons[0]?.id });
          setResetDraft(false);
        }}>Replace draft</button>
      </div>
    </Dialog>}
  </>;
}

function ActivityEditor({ activity, onChange, localAuthoring }: { activity: Activity; localAuthoring: boolean; onChange: (fn: (activity: Activity) => Activity) => void }) {
  const [reviewNotes, setReviewNotes] = useState(false);
  const image = useRef<HTMLInputElement>(null);
  const mediaHintId = useId();
  const [imageError, setImageError] = useState('');
  const [alt, setAlt] = useState('');
  function set(patch: Partial<Activity>) {
    onChange(activity => ({ ...activity, ...patch }));
  }
  function addImage(file: File) {
    setImageError('');
    if (!['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(file.type) || file.size > 400_000) {
      return setImageError('Choose a PNG, JPEG, GIF, or WebP under 400 KB for this local demo.');
    }
    const reader = new FileReader();
    reader.onerror = () => setImageError('Could not read that image.');
    reader.onload = () => {
      if (typeof reader.result !== 'string') return;
      const url = reader.result;
      const description = alt.trim().replace(/[\[\]\\]/g, '');
      onChange(activity => ({ ...activity, markdown: activity.markdown + '\n\n![' + description + '](' + url + ')' }));
      setAlt('');
    };
    reader.readAsDataURL(file);
  }
  return <div className="ic-stack">
    <label>Block title<input id={'block-title-' + activity.id} value={activity.title} maxLength={100} onChange={event => set({ title: event.target.value })} /></label>
    {activity.type === 'interactive_html' && <div className="ic-html-editor">
      {localAuthoring && <HtmlActivityEditor value={activity.interactiveHtml ?? emptyHtml} onChange={interactiveHtml => set({ interactiveHtml })} />}
      <HtmlActivityPreview activity={activity.interactiveHtml ?? emptyHtml} title={activity.title || 'HTML activity'} scripts={isLocalDemo} />
    </div>}
    {(activity.type === 'video' || activity.type === 'slides') && <div><label>{activity.type === 'video' ? 'Video URL' : 'Slide deck URL'}<input type="url" aria-describedby={mediaHintId}
      placeholder={activity.type === 'video' ? 'https://www.youtube.com/watch?v=…' : 'https://docs.google.com/presentation/d/…'}
      value={activity.url} onChange={event => set({ url: event.target.value })} /></label>
      <p className="ic-note" id={mediaHintId}>{activity.type === 'video'
        ? activity.url && !embedUrl(activity.url) ? 'Enter a YouTube, Vimeo, or Google Drive video link.' : 'Supports YouTube, Vimeo, and Google Drive videos.'
        : activity.url && !slidesUrl(activity.url) ? 'Enter a Google Slides or Google Drive link.' : 'Use a slide deck students have permission to view.'}</p>
    </div>}
    {activity.type !== 'interactive_html' && <label>{activity.type === 'content' ? 'Article Markdown' : activity.type === 'code' ? 'Lab instructions' : 'Instructions (optional Markdown)'}
      <textarea className="ic-markdown-input" rows={activity.type === 'content' || activity.type === 'code' ? 10 : 3}
        value={activity.markdown} onChange={event => set({ markdown: event.target.value })}
        placeholder="Use ## for a heading or triple backticks for a code example." />
    </label>}
    {activity.type === 'code' && (activity.code?.lab?.verifier === 'cat-photo-v1'
      ? <div className="ic-stack">
        <label>Starter HTML<textarea className="ic-markdown-input" rows={5} value={activity.code.starter}
          onChange={event => set({ code: { ...activity.code!, starter: event.target.value } })} /></label>
        <p className="ic-note">Cat Photo App checks the page heading, a short introduction, and the photo description.</p>
      </div>
      : localAuthoring
      ? <CodingLabEditor activity={activity} onChange={code => set({ code })} />
      : <fieldset className="ic-stack"><legend>Coding exercise</legend>
        {(['starter', 'tests', 'solution'] as const).map((key, index) => <label key={key}>{['Starter code', 'Test cases', 'Instructor solution'][index]}
          <textarea className="ic-markdown-input" rows={3} value={activity.code?.[key] || ''} onChange={event => set({
            code: { starter: '', tests: '', solution: '', ...activity.code, [key]: event.target.value },
          })} />
        </label>)}
      </fieldset>)}
    {activity.type === 'content' && <div className="ic-image-controls">
      <label>Image description<input value={alt} onChange={event => setAlt(event.target.value)} placeholder="Describe the image for students" maxLength={120} /></label>
      <input ref={image} type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden onChange={event => {
        const file = event.currentTarget.files?.[0];
        event.currentTarget.value = '';
        if (file) addImage(file);
      }} />
      <button className="ic-button" type="button" disabled={!alt.trim()} onClick={() => image.current?.click()}><ImagePlus size={16} /> Add image</button>
      {imageError && <p className="ic-error" role="alert">{imageError}</p>}
    </div>}
    {activity.type === 'worksheet' && (activity.discussionEnabled || activity.questions.some(q => !q.choices.some(choice => choice.trim()))) &&
      <div className="ic-stack">
        <label className="ic-checkbox"><input type="checkbox" checked={!!activity.discussionEnabled}
          onChange={event => set({ discussionEnabled: event.target.checked })} /> Share anonymous answers with the class after submitting</label>
        {activity.discussionEnabled && !localAuthoring && <button type="button" className="ic-button ic-fit" onClick={() => setReviewNotes(true)}>Review classmate notes</button>}
      </div>}
    {reviewNotes && <DiscussionReview activityId={activity.id} onClose={() => setReviewNotes(false)} />}
    {questionTypes.has(activity.type) && <>
      {activity.questions.map((question, index) => {
        const update = (patch: Partial<typeof question>) => onChange(activity => ({ ...activity, questions: activity.questions.map((item, i) => i === index ? { ...item, ...patch } : item) }));
        return <fieldset className="ic-question" key={index}><legend>{activity.type === 'worksheet' ? 'Field' : 'Question'} {index + 1}</legend>
          <div className="ic-stack">
            <label>Prompt<textarea rows={2} value={question.prompt} onChange={event => update({ prompt: event.target.value })} /></label>
            <label>Concept tag<input value={question.concept} onChange={event => update({ concept: event.target.value })} placeholder="e.g. Variables" /></label>
            {gradedTypes.has(activity.type) && <div className="ic-stack">
              {(question.choices.length ? question.choices : ['', '']).map((choice, choiceIndex, choices) => <div className="ic-quiz-choice" key={choiceIndex}>
                <label>Choice {choiceIndex + 1}<input value={choice} onChange={event => {
                  const value = event.target.value;
                  update({
                    choices: choices.map((item, i) => i === choiceIndex ? value : item),
                    answer: question.answer === choiceIndex && !value.trim() ? null : question.answer,
                  });
                }} /></label>
                {choices.length > 2 && <button type="button" className="ic-icon" aria-label={`Remove choice ${choiceIndex + 1}`} onClick={() => {
                  const { answer } = question;
                  update({ choices: choices.filter((_, i) => i !== choiceIndex),
                    answer: answer === null || answer === choiceIndex ? null : answer > choiceIndex ? answer - 1 : answer });
                }}><Trash2 size={15} /></button>}
              </div>)}
              <button type="button" className="ic-link-button ic-fit" onClick={() => update({ choices: [...(question.choices.length ? question.choices : ['', '']), ''] })}>Add choice</button>
            </div>}
            {activity.format !== 'open-ended' && !gradedTypes.has(activity.type) && <label>Answer choices, one per line<textarea rows={3} value={question.choices.join('\n')} onChange={event => {
              const choices = event.target.value.split('\n');
              update({ choices, answer: question.answer !== null && choices[question.answer]?.trim() ? question.answer : null });
            }} /></label>}
            {activity.format !== 'open-ended' && (gradedTypes.has(activity.type) || question.choices.some(choice => choice.trim())) && <label>Correct answer<select value={question.answer ?? ''} onChange={event => update({ answer: event.target.value === '' ? null : Number(event.target.value) })}>
              <option value="">No correct answer selected</option>
              {question.choices.map((choice, index) => choice.trim() && <option key={index} value={index}>{choice.trim()}</option>)}
            </select></label>}
            {activity.questions.length > 1 && <button type="button" className="ic-link-button" onClick={() => onChange(activity => ({ ...activity, questions: activity.questions.filter((_, i) => i !== index) }))}>Remove this question</button>}
          </div>
        </fieldset>;
      })}
      {(activity.type === 'check' || activity.type === 'exit') && <p className="ic-note">
        {activity.questions.length > 1 ? 'Students see the first question. Move each additional question into its own block.' : 'Students answer one question per block. Add another block for another question.'}
      </p>}
      {activity.format !== 'open-ended' && activity.type !== 'check' && activity.type !== 'exit' && <button type="button" className="ic-button ic-fit" onClick={() => onChange(activity => ({
        ...activity, questions: [...activity.questions, { ...blankQuestion(), choices: gradedTypes.has(activity.type) ? ['', '', ''] : [] }],
      }))}><Plus size={16} /> Add {activity.type === 'worksheet' ? 'field' : 'question'}</button>}
    </>}
  </div>;
}
