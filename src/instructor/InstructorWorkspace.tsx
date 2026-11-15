import { useEffect, useRef, useState } from 'react';
import { BarChart3, BookOpen, Eye, GraduationCap, Settings } from 'lucide-react';
import { ClassSetup } from './ClassSetup';
import { ClassDashboard, ClassList } from './Classes';
import { isClassTab } from './classTabIds';
import { CourseBuilder, CourseReviewer, CurriculumList, demoDraftModule } from './Curriculum';
import { copyCourse, publishModule, type Activity, type ClassGroup, type Course, type Module, type StaffRole } from './model';
import { AccessSettings, ProgramOverview } from './Operations';
import { browserInstructorStore, type InstructorStore } from './store';
import { PageHeader } from './ui';
import logo from './cic-logo.png';
import './styles.css';

const routes = [
  { path: 'classes', label: 'Classes', icon: GraduationCap },
  { path: 'curriculum', label: 'CIC library', icon: BookOpen },
  { path: 'review', label: 'Reviewer preview', icon: Eye },
  { path: 'overview', label: 'Program overview', icon: BarChart3 },
  { path: 'access', label: 'Access settings', icon: Settings },
];

const cleanRoute = (hash: string) => hash.replace(/^#\/?/, '');
const currentRoute = () => cleanRoute(window.location.hash);
const profileKey = 'cic-learn.preview-profile';

function initialProfile() {
  try { return sessionStorage.getItem(profileKey) || 'instructor'; }
  catch { return 'instructor'; }
}

/**
 * Standalone (npm run dev:instructor): own sidebar, profile picker and hash routing.
 * Embedded (role + hash given by src/instructor/InstructorRoute.tsx): renders inside the
 * main app's sidebar layout; the signed-in role picks the profile and the router supplies the hash.
 */
export function InstructorWorkspace({
  store = browserInstructorStore, draftModule = demoDraftModule, role, hash, authorId,
}: {
  store?: InstructorStore;
  draftModule?: (source: { text: string; file: File | null }) => Promise<Module>;
  role?: StaffRole;
  hash?: string;
  authorId?: string;
}) {
  const embedded = role !== undefined;
  const draftsLocal = store === browserInstructorStore;
  const [data, setData] = useState(() => store.load());
  const [standaloneRoute, setStandaloneRoute] = useState(currentRoute);
  const [newClass, setNewClass] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [pickedProfileId, setProfileId] = useState(initialProfile);
  const profileId = role ?? pickedProfileId;
  const profile = data.staff.find(person => person.id === profileId) || data.staff[0];
  const author = authorId ?? profile.id;
  const draftKey = (courseId: string) => author + ':' + courseId;
  const library = data.savedBlocks?.[author] ?? [];
  const homeSection = profile.role === 'reviewer' ? 'review' : 'classes';
  const route = (hash !== undefined ? cleanRoute(hash) : standaloneRoute) || homeSection;
  const [section, item, subpage, detail] = route.split('/');
  const visibleClasses = profile.role === 'admin' ? data.classes : data.classes.filter(group => profile.classIds.includes(group.id));
  // Embedded admins use the main app's admin pages for overview and access.
  const navigation = routes.filter(({ path }) => (profile.role === 'admin' && !embedded)
    || (profile.role === 'reviewer' ? path === 'review' : ['classes', 'curriculum', 'review'].includes(path)));
  const home = '#/' + homeSection;

  useEffect(() => {
    if (embedded) return;
    const change = () => setStandaloneRoute(currentRoute());
    window.addEventListener('hashchange', change);
    return () => window.removeEventListener('hashchange', change);
  }, [embedded]);

  // Move focus to the new page title on navigation (not on first load).
  const previousRoute = useRef(route);
  useEffect(() => {
    if (previousRoute.current === route) return;
    previousRoute.current = route;
    setError('');
    requestAnimationFrame(() => document.getElementById('ic-page-title')?.focus());
  }, [route]);

  function showError(message: string) {
    setError(message);
    requestAnimationFrame(() => document.getElementById('ic-save-error')?.focus());
  }

  function save(next: typeof data) {
    let pending: void | Promise<void>;
    try {
      pending = store.save(next, data);
    } catch {
      showError('Could not save these changes in this browser. Free up browser storage or remove large images and try again.');
      return false;
    }
    // Optimistic: show the change now; a failed online save is reported and the store reloads.
    setData(next);
    setError('');
    pending?.catch(problem => showError(problem instanceof Error ? problem.message : 'Could not save your last change.'));
    return true;
  }

  function saveClass(group: ClassGroup, created = false) {
    const current = draftsLocal ? store.load() : data;
    const classes = created ? [...current.classes, group] : current.classes.map(item => item.id === group.id ? group : item);
    const staff = created && profile.role === 'instructor'
      ? current.staff.map(person => person.id === profile.id ? { ...person, classIds: [...person.classIds, group.id] } : person)
      : current.staff;
    if (!save({ ...current, classes, staff })) return false;
    if (created) {
      setNewClass(group.id);
      window.location.assign('#/classes/' + group.id);
    }
    return true;
  }

  function saveDraft(course: Course) {
    if (!draftsLocal) return save({ ...data, courses: data.courses.map(item => item.id === course.id ? course : item) });
    const current = store.load();
    return save({ ...current, courseDrafts: { ...current.courseDrafts, [draftKey(course.id)]: course } });
  }

  function createCourse(course: Course) {
    if (!draftsLocal) {
      if (save({ ...data, courses: [...data.courses, course] })) window.location.hash = '/curriculum/' + course.id;
      return;
    }
    const current = store.load();
    if (save({
      ...current,
      courses: [...current.courses, { ...course, modules: [] }],
      courseDrafts: { ...current.courseDrafts, [draftKey(course.id)]: course },
    })) window.location.hash = '/curriculum/' + course.id;
  }

  function release(draft: Course, moduleId: string, selected: Module | null) {
    if (!draftsLocal) return saveDraft(draft);
    const current = store.load();
    const catalog = current.courses.find(course => course.id === draft.id);
    if (!catalog || (!selected && current.classes.some(group => group.moduleIds.includes(moduleId)))) return false;
    return save({
      ...current,
      courses: current.courses.map(course => course.id === draft.id ? publishModule(catalog, draft, selected, moduleId) : course),
      courseDrafts: { ...current.courseDrafts, [draftKey(draft.id)]: draft },
    });
  }

  /** Makes the instructor's own editable copy of a library course; the library is never changed. */
  async function importCourse(source: Course): Promise<Course> {
    if (store.importCourse) {
      const copy = await store.importCourse(source);
      // Already saved by the database; show it without writing it again.
      setData(current => ({ ...current, courses: [...current.courses, copy] }));
      return copy;
    }
    const copy = copyCourse(source);
    const current = store.load();
    if (!save({ ...current, courses: [...current.courses, copy] })) throw new Error('Could not save the copy in this browser.');
    return copy;
  }

  function saveLibrary(blocks: Activity[]) {
    const current = store.load();
    return save({ ...current, savedBlocks: { ...current.savedBlocks, [author]: blocks } });
  }

  /**
   * A class on a shared library course cannot be edited in place: give the class its own
   * copy (same module order) and point the class at it.
   */
  async function makeClassEditable(group: ClassGroup, source: Course) {
    const copy = await importCourse(source);
    const moduleIds = source.modules.flatMap((module, index) => group.moduleIds.includes(module.id) && copy.modules[index] ? [copy.modules[index].id] : []);
    if (!saveClass({ ...group, courseId: copy.id, moduleIds })) throw new Error('Could not update the class.');
    window.location.assign(`#/classes/${group.id}/curriculum/edit`);
  }

  const builderFor = (target: Course, inClass?: { className: string; backTo: string }) => <CourseBuilder key={author + ':' + target.id}
    initial={data.courseDrafts?.[draftKey(target.id)] ?? target} released={target} localAuthoring={draftsLocal} onSave={saveDraft} onRelease={release}
    assigned={new Set(data.classes.filter(item => item.courseId === target.id).flatMap(item => item.moduleIds))} draftModule={draftModule}
    library={library} onSaveLibrary={saveLibrary} inClass={inClass} />;

  const group = section === 'classes' ? visibleClasses.find(group => group.id === item) : undefined;
  const course = data.courses.find(course => course.id === (group?.courseId ?? item));
  const content = (() => {
    if (!navigation.some(({ path }) => path === section)) return <PageHeader title="Page unavailable for this role" back={{ label: 'Back to workspace', to: home }} />;
    if (section === 'classes') {
      if (item === 'new') return <ClassSetup courses={data.courses} classes={data.classes} onCreate={group => saveClass(group, true)} onImport={importCourse} />;
      if (group) return <ClassDashboard key={group.id} group={group} course={course} onSave={saveClass} justCreated={newClass === group.id} tab={isClassTab(subpage) ? subpage : 'dashboard'} detail={detail} otherClasses={visibleClasses}
        editor={subpage === 'curriculum' && detail === 'edit' && course && !course.library ? builderFor(course, { className: group.name, backTo: `#/classes/${group.id}/curriculum` }) : undefined}
        onMakeEditable={course?.library ? () => makeClassEditable(group, course) : undefined} />;
      if (!item) return <ClassList groups={visibleClasses} courses={data.courses} />;
    }
    if (section === 'curriculum') {
      // Instructors edit a course inside its class; only admins open the builder from here (library upkeep).
      if (course && profile.role === 'admin') return builderFor(course);
      if (course) return <PageHeader title={course.title} description="Open a class that uses this course and edit it from the class's Curriculum tab." back={{ label: 'CIC library', to: '#/curriculum' }} />;
      if (!item) return <CurriculumList courses={data.courses.map(item => data.courseDrafts?.[draftKey(item.id)] ?? item)} onCreate={createCourse}
        canEditLibrary={profile.role === 'admin'} libraryOnly={profile.role !== 'admin'} />;
    }
    if (section === 'review') {
      // Instructors reach this page from the CIC library's Preview, so they go back there.
      const fromLibrary = profile.role !== 'reviewer';
      if (course?.modules.some(module => module.published)) return <CourseReviewer key={course.id} course={course}
        back={fromLibrary ? { label: 'CIC library', to: '#/curriculum' } : undefined} />;
      if (!item && fromLibrary) return <CurriculumList courses={data.courses} libraryOnly canEditLibrary={profile.role === 'admin'} />;
      // Reviewers check shared curriculum; per-class copies are not theirs to review.
      if (!item) return <CurriculumList key="reviewer" courses={data.courses.filter(course => !course.copiedFrom)} reviewer />;
    }
    if (section === 'overview') return <ProgramOverview groups={data.classes} courses={data.courses} />;
    if (section === 'access') return <AccessSettings staff={data.staff} groups={data.classes} onSave={staff => save({ ...(draftsLocal ? store.load() : data), staff })} />;
    return <PageHeader title="Page not found" back={{ label: 'Back to workspace', to: home }} />;
  })();

  if (embedded) {
    return <div className="ic-app ic-embedded">
      {error && <p className="ic-error" id="ic-save-error" tabIndex={-1} role="alert">{error}</p>}
      {content}
    </div>;
  }

  return <div className="ic-app">
    <a className="ic-skip" href="#ic-main" onClick={event => { event.preventDefault(); document.getElementById('ic-main')?.focus(); }}>Skip to content</a>
    <aside className="ic-sidebar">
      <a href={home} className="ic-brand"><img src={logo} width="40" height="40" alt="" /><div><strong>Coding in Color</strong><span>CIC Learn workspace</span></div></a>
      <nav aria-label="Workspace">{navigation.map(({ path, label, icon: Icon }) => <a key={path} href={'#/' + path} aria-current={section === path ? 'page' : undefined}><Icon size={18} />{label}</a>)}</nav>
      <div className="ic-demo-label"><label>Preview profile<select value={profile.id} onChange={event => {
        const next = data.staff.find(person => person.id === event.target.value);
        if (!next) return;
        setProfileId(next.id);
        try { sessionStorage.setItem(profileKey, next.id); } catch { /* Profile still works for this visit. */ }
        window.location.hash = next.role === 'reviewer' ? '/review' : next.role === 'admin' ? '/overview' : '/classes';
      }}>{data.staff.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label><span>Use fictional student data.</span></div>
    </aside>
    <main className="ic-main" id="ic-main" tabIndex={-1}>
      {error && <p className="ic-error" id="ic-save-error" tabIndex={-1} role="alert">{error}</p>}
      {content}
    </main>
  </div>;
}
