import { useEffect, useRef, useState } from 'react';
import { BarChart3, BookOpen, Eye, GraduationCap, Settings } from 'lucide-react';
import { ClassSetup } from './ClassSetup';
import { ClassDashboard, ClassList } from './Classes';
import { isClassTab } from './classTabIds';
import { CourseBuilder, CourseReviewer, CurriculumList, demoDraftModule } from './Curriculum';
import type { ClassGroup, Course, Module, StaffRole } from './model';
import { AccessSettings, ProgramOverview } from './Operations';
import { browserInstructorStore, type InstructorStore } from './store';
import { PageHeader } from './ui';
import logo from './cic-logo.png';
import './styles.css';

const routes = [
  { path: 'classes', label: 'Classes', icon: GraduationCap },
  { path: 'curriculum', label: 'Curriculum', icon: BookOpen },
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
  store = browserInstructorStore, draftModule = demoDraftModule, role, hash,
}: {
  store?: InstructorStore;
  draftModule?: (source: { text: string; file: File | null }) => Promise<Module>;
  role?: StaffRole;
  hash?: string;
}) {
  const embedded = role !== undefined;
  const [data, setData] = useState(() => store.load());
  const [standaloneRoute, setStandaloneRoute] = useState(currentRoute);
  const [newClass, setNewClass] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [pickedProfileId, setProfileId] = useState(initialProfile);
  const profileId = role ?? pickedProfileId;
  const profile = data.staff.find(person => person.id === profileId) || data.staff[0];
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
    const classes = created ? [...data.classes, group] : data.classes.map(item => item.id === group.id ? group : item);
    const staff = created && profile.role === 'instructor'
      ? data.staff.map(person => person.id === profile.id ? { ...person, classIds: [...person.classIds, group.id] } : person)
      : data.staff;
    if (!save({ ...data, classes, staff })) return false;
    if (created) {
      setNewClass(group.id);
      window.location.hash = '/classes/' + group.id;
    }
    return true;
  }

  function saveCourse(course: Course, created = false) {
    const courses = created ? [...data.courses, course] : data.courses.map(item => item.id === course.id ? course : item);
    if (!save({ ...data, courses })) return false;
    if (created) window.location.hash = '/curriculum/' + course.id;
    return true;
  }

  const group = section === 'classes' ? visibleClasses.find(group => group.id === item) : undefined;
  const course = data.courses.find(course => course.id === (group?.courseId ?? item));
  const assigned = new Set(data.classes.filter(group => group.courseId === course?.id).flatMap(group => group.moduleIds));
  const content = (() => {
    if (!navigation.some(({ path }) => path === section)) return <PageHeader title="Page unavailable for this role" back={{ label: 'Back to workspace', to: home }} />;
    if (section === 'classes') {
      if (item === 'new') return <ClassSetup courses={data.courses} classes={data.classes} onCreate={group => saveClass(group, true)} />;
      if (group) return <ClassDashboard key={group.id} group={group} course={course} onSave={saveClass} justCreated={newClass === group.id} tab={isClassTab(subpage) ? subpage : 'dashboard'} detail={detail} otherClasses={visibleClasses} />;
      if (!item) return <ClassList groups={visibleClasses} courses={data.courses} />;
    }
    if (section === 'curriculum') {
      if (course) return <CourseBuilder key={course.id} initial={course} onSave={saveCourse} assigned={assigned} draftModule={draftModule} />;
      if (!item) return <CurriculumList courses={data.courses} onCreate={course => saveCourse(course, true)} />;
    }
    if (section === 'review') {
      if (course?.modules.some(module => module.published)) return <CourseReviewer key={course.id} course={course} />;
      if (!item) return <CurriculumList key="reviewer" courses={data.courses} reviewer />;
    }
    if (section === 'overview') return <ProgramOverview groups={data.classes} courses={data.courses} />;
    if (section === 'access') return <AccessSettings staff={data.staff} groups={data.classes} onSave={staff => save({ ...data, staff })} />;
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
