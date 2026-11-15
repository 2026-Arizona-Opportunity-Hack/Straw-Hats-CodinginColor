import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, BookOpen, Library, Pencil, Copy, Eye, FilePlus2, GripVertical, ImagePlus, Plus, Save, Star, Trash2 } from 'lucide-react';
import { isLocalDemo } from '../shared/supabase.ts';
import { CodingLabEditor } from './CodingLabEditor';
import { HtmlActivityEditor, HtmlActivityPreview } from './HtmlActivity';
import { emptyHtml } from './htmlStarter';
import { BlockPicker } from './BlockPicker';
import { ActivityPreview, LessonPreview } from './LessonPreview';
import {
  activityTypes, blankQuestion, copyBlock, embedUrl, gradedTypes, id, newActivity, newLesson, newModule, questionTypes, reorder, slidesUrl, unresolvedModuleContent,
  type Activity, type Course, type Lesson, type Module,
} from './model';
import { Dialog, Empty, PageHeader, Panel } from './ui';

type View = { moduleId?: string; lessonId?: string; activityId?: string };
type OutlineKind = 'module' | 'lesson' | 'block';
type DragItem = { kind: OutlineKind; index: number; parent: string };

export function CurriculumList({ courses, reviewer = false, onCreate, canEditLibrary = false, libraryOnly = false }: {
  courses: Course[]; reviewer?: boolean; onCreate?: (course: Course) => void; canEditLibrary?: boolean;
  /** Instructors: only the CIC library here; they edit a course inside the class that uses it. */
  libraryOnly?: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [level, setLevel] = useState('Beginner');
  const visible = reviewer ? courses.filter(course => course.modules.some(module => module.published)) : courses.filter(course => !course.library);
  if (libraryOnly) return <>
    <PageHeader title="CIC library" description="Ready-made courses from Coding in Color. Preview them here, then add one to a class from Create a class or the class's Curriculum tab, where you can change it for that class." />
    <LibraryList courses={courses.filter(course => course.library)} canEdit={canEditLibrary} heading={false} />
  </>;
  return <>
    <PageHeader title={reviewer ? 'Curriculum reviewer' : 'Curriculum'} description={reviewer
      ? 'Browse published courses and article-style lessons in the read-only preview.'
      : 'Build and publish article-style modules that students can follow independently.'}>
      {!reviewer && <button className="ic-button ic-primary" onClick={() => setAdding(true)}><Plus size={17} /> New course</button>}
    </PageHeader>
    <div className="ic-stack">
      {!reviewer && <h2 className="ic-section-title">My courses</h2>}
      {visible.map(course => {
        const published = course.modules.filter(module => module.published).length;
        return <article className="ic-panel ic-course-row" key={course.id}>
          <div className="ic-class-mark"><BookOpen size={21} /></div>
          <div><CourseHeading reviewer={reviewer}><a href={`#/${reviewer ? 'review' : 'curriculum'}/${course.id}`}>{course.title}</a></CourseHeading>
            {course.description && <p className="ic-clamp-2">{course.description}</p>}
            <span className="ic-note">{course.level} · {published} published{!reviewer && ` · ${course.modules.length - published} draft`}</span>
          </div><a className="ic-button" href={`#/${reviewer ? 'review' : 'curriculum'}/${course.id}`}>{reviewer ? 'Browse course' : 'Open builder'} <ArrowRight size={16} /></a>
        </article>;
      })}
      {!visible.length && <Panel><Empty>{reviewer ? 'No courses have published modules yet.' : 'Courses you build, and the ones you pick when you create a class, show up here.'}</Empty></Panel>}
      {!reviewer && <LibraryList courses={courses.filter(course => course.library)} canEdit={canEditLibrary} />}
    </div>
    {adding && <Dialog title="Create a course" onClose={() => setAdding(false)}>
      <form className="ic-stack" onSubmit={event => {
        event.preventDefault();
        if (!title.trim()) return;
        onCreate?.({ id: id(), title: title.trim(), description: '', level, modules: [newModule()] });
      }}><label>Course title<input required autoFocus value={title} maxLength={100} onChange={event => setTitle(event.target.value)} /></label>
        <label>Level<select value={level} onChange={event => setLevel(event.target.value)}>{['Beginner', 'Intermediate', 'Advanced', 'Expert'].map(value => <option key={value}>{value}</option>)}</select></label>
        <div className="ic-form-footer"><button className="ic-button ic-primary" type="submit">Create course</button></div>
      </form>
    </Dialog>}
  </>;
}

// Under the "My courses" heading, course titles are one level down.
function CourseHeading({ reviewer, children }: { reviewer: boolean; children: React.ReactNode }) {
  return reviewer ? <h2>{children}</h2> : <h3>{children}</h3>;
}

/** Ready-made CIC courses. Instructors preview them here and pick one when they create a class. */
function LibraryList({ courses, canEdit, heading = true }: { courses: Course[]; canEdit: boolean; heading?: boolean }) {
  if (!courses.length) return heading ? null : <Panel><Empty>No library courses yet.</Empty></Panel>;
  return <section className={'ic-stack' + (heading ? ' ic-section-gap' : '')} aria-labelledby={heading ? 'ic-library-heading' : undefined} aria-label={heading ? undefined : 'Library courses'}>
    {heading && <div><h2 className="ic-section-title" id="ic-library-heading">CIC library</h2>
      <p className="ic-note">Ready-made courses from Coding in Color. Pick one when you create a class; it becomes yours to change.</p></div>}
    {courses.map(course => {
      const modules = course.modules.filter(module => module.published).length;
      return <article className="ic-panel ic-course-row" key={course.id}>
        <div className="ic-class-mark ic-library-mark"><Library size={21} aria-hidden="true" /></div>
        <div>{heading ? <h3><a href={`#/review/${course.id}`}>{course.title}</a></h3> : <h2><a href={`#/review/${course.id}`}>{course.title}</a></h2>}
          {course.description && <p className="ic-clamp-2">{course.description}</p>}
          <span className="ic-note">{course.level} · {modules} {modules === 1 ? 'module' : 'modules'} ready</span>
        </div>
        <div className="ic-row">
          <a className="ic-button" href={`#/review/${course.id}`} aria-label={`Preview ${course.title}`}><Eye size={16} aria-hidden="true" /> Preview</a>
          {canEdit && <a className="ic-button" href={`#/curriculum/${course.id}`} aria-label={`Edit ${course.title}`}><Pencil size={16} aria-hidden="true" /> Edit</a>}
        </div>
      </article>;
    })}
  </section>;
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
      {lesson ? <div className="ic-review-lesson"><LessonPreview lesson={lesson} /></div> : <Panel><Empty>No published lessons are available.</Empty></Panel>}
    </div>
  </>;
}

export function CourseBuilder({ initial, released, localAuthoring, onSave, onRelease, assigned, draftModule, library, onSaveLibrary, inClass }: {
  /** Set when the builder opens inside a class card: a compact header that returns to the class. */
  inClass?: { className: string; backTo: string };
  initial: Course;
  released: Course;
  localAuthoring: boolean;
  library: Activity[];
  onSaveLibrary: (blocks: Activity[]) => boolean;
  onRelease: (course: Course, moduleId: string, selected: Module | null) => boolean;
  onSave: (course: Course) => boolean;
  assigned: Set<string>;
  draftModule: (source: { text: string; file: File | null }) => Promise<Module>;
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
  const saveDraft = useCallback(() => {
    if (!localAuthoring) {
      const invalid = course.modules.find(item => item.published && unresolvedModuleContent(item));
      if (!course.title.trim()) return setError('Give the course a title before saving.');
      if (invalid) return setError(invalid.title + ' · ' + unresolvedModuleContent(invalid));
    }
    if (!onSave(course)) return;
    setSavedDraft(course);
  }, [course, localAuthoring, onSave]);

  useEffect(() => {
    if (!unsaved || !localAuthoring) return;
    const timer = window.setTimeout(saveDraft, 700);
    return () => window.clearTimeout(timer);
  }, [saveDraft, unsaved, localAuthoring]);

  useEffect(() => {
    if (!unsaved) return;
    function preventLoss(event: BeforeUnloadEvent) { event.preventDefault(); }
    window.addEventListener('beforeunload', preventLoss);
    return () => window.removeEventListener('beforeunload', preventLoss);
  }, [unsaved]);

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

  function publish() {
    if (!module) return;
    const issue = unresolvedModuleContent(module);
    if (!course.title.trim()) return setError('Give the course a title before publishing.');
    if (issue) return setError(issue);
    if (!localAuthoring) {
      const invalid = course.modules.find(item => item.published && item.id !== module.id && unresolvedModuleContent(item));
      if (invalid) return setError(invalid.title + ' · ' + unresolvedModuleContent(invalid));
    }
    const next = { ...course, modules: course.modules.map(item => item.id === module.id ? { ...item, published: true } : item) };
    if (!onRelease(next, module.id, module)) return;
    setCourse(next);
    setSavedDraft(next);
    setError('');
    setMessage('Module published and ready to assign.');
  }

  function unpublish() {
    if (!module || assigned.has(module.id)) return setError('Remove this module from its class assignments before unpublishing.');
    const next = { ...course, modules: course.modules.map(item => item.id === module.id ? { ...item, published: false } : item) };
    if (!onRelease(next, module.id, null)) return;
    setCourse(next);
    setSavedDraft(next);
    setError('');
    setMessage('Module moved to draft.');
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
    if (!lesson || tab !== 'edit' || preview || importer || removal || manageBlocks || picker !== null) return;
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
  }, [lesson, tab, preview, importer, removal, manageBlocks, picker]);

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
    {(() => {
      const actions = <>
        {localAuthoring && <button type="button" className="ic-button" onClick={() => setManageBlocks(true)}><Star size={16} /> My blocks</button>}
        <button type="button" className="ic-button" onClick={() => setImporter('converter')}><FilePlus2 size={16} /> Draft from materials</button>
        <button type="button" className="ic-button" disabled={!module?.lessons.length} onClick={() => setPreview(true)}><Eye size={16} /> Preview module</button>
        <button type="button" className="ic-button ic-primary" onClick={saveDraft}><Save size={16} /> {localAuthoring ? 'Save draft' : 'Save changes'}</button>
      </>;
      return inClass
        ? <div className="ic-class-builder-head">
          <div><a className="ic-back" href={inClass.backTo}><ArrowLeft size={15} aria-hidden="true" /> Back to {inClass.className} curriculum</a>
            <h2>Edit curriculum</h2><p className="ic-note">Changes apply to this class only. The CIC library stays the same.</p></div>
          <div className="ic-row">{actions}</div>
        </div>
        : <PageHeader title={course.title || 'Untitled course'} description="Course builder" back={{ label: 'Curriculum', to: '#/curriculum' }}>{actions}</PageHeader>;
    })()}
    <div className="ic-builder-status">
      <span>{unsaved ? 'Unsaved changes' : localAuthoring ? 'Draft saved locally' : 'Changes saved'}</span>
      <span role="status">{message}</span>
    </div>
    {error && <p className="ic-error" role="alert">{error}</p>}
    <div className="ic-builder">
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
        {module && !lesson && <Panel title="Module details" actions={<button type="button" className="ic-button ic-primary" onClick={publish}>{liveModule ? 'Publish update' : 'Publish module'}</button>}>
          <label>Module title<input value={module.title} maxLength={100} onChange={event => updateModule(module.id, item => ({ ...item, title: event.target.value }))} /></label>
          <div className="ic-row ic-section-gap"><span className={'ic-status ' + (module.published ? 'is-published' : '')}>{liveModule ? 'Published' : 'Draft'}</span>{liveModule && <button type="button" className="ic-button" onClick={unpublish}>Unpublish module</button>}<button type="button" className="ic-button" onClick={() => addLesson()}><Plus size={16} /> Add lesson</button>{localAuthoring && <button type="button" className="ic-button" onClick={() => addLesson(true)}><Plus size={16} /> Add HTML lesson</button>}</div>
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
          {tab === 'preview' ? <LessonPreview lesson={lesson} interactive /> : <>
            <input className="ic-lesson-title" aria-label="Lesson title" value={lesson.title} placeholder="Untitled lesson" maxLength={100}
              onChange={event => updateLesson(lesson.id, item => ({ ...item, title: event.target.value }))} />
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
      {module.lessons.map(item => <LessonPreview lesson={item} key={item.id} interactive />)}
    </Dialog>}
    {importer && <ImportMaterials mode={importer} draftModule={draftModule} close={() => setImporter(null)} onMarkdown={text => {
      if (lesson) insertBlock({ ...newActivity(), markdown: text }, lesson.activities.length);
      setImporter(null);
    }} onDraft={draft => { addModule(draft); setImporter(null); }} />}
    {removal && <Dialog title={`Remove ${removal.kind}?`} onClose={() => setRemoval(null)}>
      <p>“{removal.title}” will be removed from the draft outline when you save.</p>
      <div className="ic-form-footer"><button className="ic-button" onClick={() => setRemoval(null)}>Cancel</button><button className="ic-button ic-primary" onClick={remove}>Remove {removal.kind}</button></div>
    </Dialog>}
  </>;
}

function ActivityEditor({ activity, onChange, localAuthoring }: { activity: Activity; localAuthoring: boolean; onChange: (fn: (activity: Activity) => Activity) => void }) {
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
    {activity.type === 'code' && (localAuthoring
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
      {activity.format !== 'open-ended' && <button type="button" className="ic-button ic-fit" onClick={() => onChange(activity => ({
        ...activity, questions: [...activity.questions, { ...blankQuestion(), choices: gradedTypes.has(activity.type) ? ['', '', ''] : [] }],
      }))}><Plus size={16} /> Add {activity.type === 'worksheet' ? 'field' : 'question'}</button>}
    </>}
  </div>;
}

function ImportMaterials({ mode, close, draftModule, onMarkdown, onDraft }: {
  mode: 'markdown' | 'converter'; close: () => void;
  draftModule: (source: { text: string; file: File | null }) => Promise<Module>;
  onMarkdown: (text: string) => void; onDraft: (module: Module) => void;
}) {
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const converter = mode === 'converter';
  return <Dialog title={converter ? 'Draft a module from materials' : 'Import Markdown'} onClose={close}>
    <form className="ic-stack" onSubmit={async event => {
      event.preventDefault();
      if (!converter) return onMarkdown(text.trim());
      setBusy(true);
      setError('');
      try { onDraft(await draftModule({ text: text.trim(), file })); }
      catch (error) { setError(error instanceof Error ? error.message : 'Could not draft a module. Try again.'); }
      finally { setBusy(false); }
    }}>
      <p className="ic-note">{converter
        ? 'The local demo turns pasted text or a text file into an editable module draft with a practice prompt. Review the draft before publishing.'
        : 'Paste an article or upload a Markdown file. It will be added as an article in this lesson.'}</p>
      <label>{converter ? 'Worksheet or lesson text' : 'Markdown'}<textarea rows={7} value={text} onChange={event => setText(event.target.value)} placeholder="## Your lesson title" /></label>
      <label>{converter ? 'Text or Markdown file' : 'Markdown file'}<input type="file" accept=".md,.markdown,.txt,text/plain,text/markdown" onChange={async event => {
        const selected = event.currentTarget.files?.[0] || null;
        setError('');
        if (selected && selected.size > 200_000) {
          event.currentTarget.value = '';
          setFile(null);
          setError('Choose a file under 200 KB.');
          return;
        }
        setFile(selected);
        if (!converter && selected) {
          try { setText(await selected.text()); }
          catch { setError('Could not read the file. Paste the Markdown instead.'); }
        }
      }} /></label>
      {error && <p className="ic-error" role="alert">{error}</p>}
      <div className="ic-form-footer"><button type="submit" className="ic-button ic-primary" disabled={busy || (!text.trim() && !(converter && file))}>{busy ? 'Drafting…' : converter ? 'Generate draft' : 'Add article'}</button></div>
    </form>
  </Dialog>;
}

export async function demoDraftModule({ text, file }: { text: string; file: File | null }): Promise<Module> {
  const source = text || (file ? (await file.text()).trim() : '');
  if (!source) throw new Error('Paste lesson text or choose a text file with content.');
  const firstLine = source.split('\n').find(line => line.trim())?.replace(/^#+\s*/, '').trim() || 'Imported lesson';
  const title = firstLine.slice(0, 80);
  const lesson = newLesson(title);
  lesson.activities = [
    { ...newActivity(), title: 'Read and explore', markdown: source },
    { ...newActivity('worksheet'), title: 'Try it yourself', questions: [{ ...blankQuestion(), prompt: 'Use an example from the reading and explain what you changed.' }] },
    { ...newActivity('exit'), title: 'Exit question', questions: [{ ...blankQuestion(), prompt: 'What did you learn, and what would you like to try next?' }] },
  ];
  return { id: id(), title, published: false, lessons: [lesson] };
}
