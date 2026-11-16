import { useState } from 'react';
import { ArrowRight, BookOpen, ExternalLink, Pencil, Plus, Presentation } from 'lucide-react';
import { CourseCreateDialog } from './CourseCreateDialog';
import { slidesUrl, type Course } from './model';
import { Dialog, Empty, PageHeader, Panel } from './ui';

function libraryDecks(courses: Course[]) {
  return courses.filter(course => !course.local && !course.copiedFrom && course.published !== false).flatMap(course =>
    course.modules.filter(module => module.published).flatMap(module => module.lessons.flatMap(lesson =>
      lesson.activities.filter(block => block.type === 'slides' && block.cicLibraryDeck === true).flatMap(block => {
        const url = slidesUrl(block.url);
        return url ? [{ course, module, lesson, block, url }] : [];
      }),
    )),
  );
}

export function CicLibrary({ courses, drafts = [], canCurate = false, onCreate, onAddCourse }: {
  courses: Course[];
  drafts?: Course[];
  canCurate?: boolean;
  onCreate?: (course: Course) => void;
  onAddCourse?: (courseId: string) => Promise<void>;
}) {
  const [dialog, setDialog] = useState<'create' | 'existing' | null>(null);
  const [courseId, setCourseId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const global = courses.filter(course => !course.local && !course.copiedFrom && course.published !== false);
  const listed = global.filter(course => course.library || course.libraryListed);
  const available = global.filter(course => !course.library && !course.libraryListed);
  const draftIds = new Set(drafts.map(course => course.id));
  const decks = libraryDecks(courses);
  return <>
    <PageHeader title="CIC Library" description="Shared curriculum and slide decks for workshops and schools.">
      {onAddCourse && <button type="button" className="ic-button" onClick={() => {
        setCourseId('');
        setError('');
        setMessage('');
        setDialog('existing');
      }}><Plus size={16} aria-hidden="true" /> Add existing course</button>}
      {onCreate && <button type="button" className="ic-button ic-primary" onClick={() => setDialog('create')}><Plus size={16} aria-hidden="true" /> New course</button>}
    </PageHeader>
    {message && <p className="ic-success" role="status">{message}</p>}
    <div className="ic-stack">
      <h2 className="ic-section-title">Courses</h2>
      {[...drafts, ...listed].map(course => <article className="ic-panel ic-course-row" key={course.id}>
        <div className="ic-class-mark ic-library-mark"><BookOpen size={21} aria-hidden="true" /></div>
        <div>
          <h3>{course.title}</h3>
          {course.description && <p className="ic-clamp-2">{course.description}</p>}
          <span className="ic-note">{draftIds.has(course.id) ? 'Draft saved in this browser' : course.level}</span>
        </div>
        <div className="ic-row">
          {!draftIds.has(course.id) && <a className="ic-button" href={`#/curriculum/${course.id}`}>View<span className="sr-only"> {course.title}</span></a>}
          {canCurate && <a className="ic-button" href={`#/library/${course.id}/edit`}><Pencil size={16} aria-hidden="true" /> Edit curriculum<span className="sr-only"> for {course.title}</span></a>}
        </div>
      </article>)}
      {!listed.length && !drafts.length && <Panel><Empty>No courses in CIC Library yet.</Empty></Panel>}
      <h2 className="ic-section-title">Slide decks</h2>
    {decks.length ? <div className="ic-stack">
      {decks.map(({ course, module, lesson, block, url }) => <article className="ic-panel ic-course-row" key={block.id}>
        <div className="ic-class-mark ic-library-mark"><Presentation size={21} aria-hidden="true" /></div>
        <div>
          <h3>{block.title}</h3>
          <p className="ic-note">{course.title} · {module.title} · {lesson.title}</p>
        </div>
        <div className="ic-row">
          <a className="ic-button" href={url} target="_blank" rel="noreferrer" aria-label={`Open deck ${block.title}`}>
            <ExternalLink size={16} aria-hidden="true" /> Open deck
          </a>
          <a className="ic-button" href={`#/curriculum/${course.id}/view/${lesson.id}`} aria-label={`View ${block.title} in Curriculum`}>
            View in Curriculum <ArrowRight size={16} aria-hidden="true" />
          </a>
        </div>
      </article>)}
    </div> : <Panel><Empty>No curated slide decks yet.</Empty>
      {canCurate && <p>In <a href="#/curriculum">Curriculum</a>, mark a global Slides block for the library and publish its module.</p>}
    </Panel>}
    </div>
    {dialog === 'create' && onCreate && <CourseCreateDialog onCreate={onCreate} onClose={() => setDialog(null)} />}
    {dialog === 'existing' && onAddCourse && <Dialog title="Add a global course" closeDisabled={saving} onClose={() => setDialog(null)}>
      {available.length ? <form className="ic-stack" onSubmit={async event => {
        event.preventDefault();
        if (!courseId || saving) return;
        setSaving(true);
        setError('');
        try {
          await onAddCourse(courseId);
          setMessage('Course added to CIC Library.');
          setDialog(null);
        } catch (problem) {
          setError(problem instanceof Error ? problem.message : 'Could not add this course. Try again.');
        } finally {
          setSaving(false);
        }
      }}>
        <label>Global course<select value={courseId} required disabled={saving} onChange={event => setCourseId(event.target.value)}>
          <option value="">Select a course</option>
          {available.map(course => <option key={course.id} value={course.id}>{course.title}</option>)}
        </select></label>
        {error && <p className="ic-error" role="alert">{error}</p>}
        <div className="ic-form-footer">
          <button type="button" className="ic-button" disabled={saving} onClick={() => setDialog(null)}>Cancel</button>
          <button type="submit" className="ic-button ic-primary" disabled={saving || !courseId}>{saving ? 'Adding…' : 'Add to CIC Library'}</button>
        </div>
      </form> : <Empty>All available global courses are already in CIC Library.</Empty>}
    </Dialog>}
  </>;
}
