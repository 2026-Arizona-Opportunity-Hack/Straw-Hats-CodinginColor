import { useState } from 'react';
import { ArrowRight, BookOpen, Clipboard, GraduationCap, Plus, Printer, Search, Users } from 'lucide-react';
import { RosterUpload } from './ClassSetup';
import { makeLearners, type ClassGroup, type Course, type Learner } from './model';
import { attemptFor, classProgress, percent, points } from './progress';
import {
  ClassTabBar, CurriculumTab, DashboardTab, GradesTab, RosterTab,
} from './ClassTabs';
import type { ClassTabId } from './classTabIds';
import { AssignmentsTab } from './assignments/AssignmentsTab';
import type { RosterRow } from './roster';
import { copyText, Dialog, Empty, PageHeader, Panel } from './ui';

export function ClassList({ groups, courses }: { groups: ClassGroup[]; courses: Course[] }) {
  const [search, setSearch] = useState('');
  const matches = groups.filter(group => (group.name + ' ' + group.school).toLowerCase().includes(search.trim().toLowerCase()));
  return <>
    <PageHeader title="Classes" description="Set up classes, share student access, and see who needs help.">
      <a className="ic-button ic-primary" href="#/classes/new"><Plus size={17} /> Create class</a>
    </PageHeader>
    <div className="ic-toolbar"><label className="ic-search"><Search size={17} /><input type="search" aria-label="Search classes" placeholder="Search classes or schools" value={search} onChange={event => setSearch(event.target.value)} /></label></div>
    {matches.length ? <div className="ic-class-grid">{matches.map(group => {
      const course = courses.find(course => course.id === group.courseId);
      const { roster, avgGain } = classProgress(group, course);
      const stuck = roster.filter(row => row.status === 'Stuck').length;
      const complete = roster.filter(row => row.status === 'Complete').length;
      return <article key={group.id} className="ic-panel ic-class-card">
        <div className="ic-class-top"><div className="ic-class-mark"><GraduationCap size={22} /></div><div><h2><a href={'#/classes/' + group.id}>{group.name}</a></h2><p>{group.school}</p></div></div>
        <div className="ic-card-course"><BookOpen size={16} /> {course?.title || 'No course assigned'}</div>
        <dl className="ic-card-stats"><div><dt>Students</dt><dd>{roster.length}</dd></div><div><dt>Complete</dt><dd>{complete}</dd></div><div><dt>Learning gain</dt><dd>{points(avgGain)}</dd></div></dl>
        <footer><span className={stuck ? 'ic-stuck-text' : 'ic-note'}>{stuck ? `${stuck} need attention` : 'No students flagged'}</span><a href={'#/classes/' + group.id}>View class <ArrowRight size={15} /></a></footer>
      </article>;
    })}</div> : <Panel><Empty>{search ? 'No classes match your search.' : 'Create a class to get started.'}</Empty></Panel>}
  </>;
}

export function ClassDashboard({ group, course, onSave, justCreated, tab, detail, otherClasses }: {
  group: ClassGroup; course?: Course; onSave: (group: ClassGroup) => boolean; justCreated: boolean; tab: ClassTabId;
  /** Item inside the tab, e.g. an assignment id. */
  detail?: string;
  otherClasses: ClassGroup[];
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [dialog, setDialog] = useState<'cards' | 'roster' | 'assignment' | null>(null);
  const [rows, setRows] = useState<RosterRow[]>([]);
  const [draftModules, setDraftModules] = useState(group.moduleIds);
  const [feedback, setFeedback] = useState('');
  const { roster, activities } = classProgress(group, course);
  const details = roster.find(row => row.learner.id === selected);
  const ready = rows.filter(row => !row.issue).map(row => row.name);
  const exampleLink = 'https://example.com/join/' + group.joinCode;
  const editAssignment = () => { setDraftModules(group.moduleIds); setDialog('assignment'); };
  const openImport = () => { setRows([]); setDialog('roster'); };
  const openCards = () => { setFeedback(''); setDialog('cards'); };

  return <>
    <PageHeader title={group.name} description={group.school + (course ? ' · ' + course.title : '')} back={{ label: 'Classes', to: '#/classes' }}>
      <button className="ic-button" onClick={openImport}><Users size={17} /> Import roster</button>
      <button className="ic-button ic-primary" onClick={openCards}><Printer size={17} /> Student login cards</button>
    </PageHeader>
    {justCreated && <p className="ic-success" role="status">Class created with {group.learners.length} students. Open student login cards to see the example link and passcodes.</p>}
    <ClassTabBar groupId={group.id} active={tab} />
    {tab === 'dashboard' && <DashboardTab group={group} course={course} />}
    {tab === 'curriculum' && <CurriculumTab group={group} course={course} onEditAssignment={editAssignment} />}
    {tab === 'assignments' && <AssignmentsTab group={group} course={course} otherClasses={otherClasses} assignmentId={detail} onSave={onSave} />}
    {tab === 'grades' && <GradesTab group={group} course={course} onSelect={setSelected} onSave={onSave} />}
    {tab === 'roster' && <RosterTab group={group} course={course} onSave={onSave} onImport={openImport} onCards={openCards} />}
    {details && <Dialog wide title={details.learner.name + ' · Activity details'} onClose={() => setSelected(null)}>
      <p className="ic-note">{details.status} · {details.completed} of {details.total} completed · {details.minutes} min · Learning gain {points(details.gain)}</p>
      <ul className="ic-list ic-section-gap">{activities.map(activity => {
        const attempt = attemptFor(details.learner, activity.id);
        return <li key={activity.id}><div><strong>{activity.title}</strong>
          <p className="ic-note">{attempt?.submitted ? `${attempt.count} attempt(s) · ${attempt.minutes} min · Score ${percent(attempt.score)}` : 'Not submitted'}</p>
          {attempt?.response && <pre><code>{attempt.response}</code></pre>}
        </div></li>;
      })}</ul>
      <h3>Hint log</h3>
      {details.learner.hints.length ? <ul>{details.learner.hints.map((hint, index) => <li key={index}>{hint.concept} · {hint.text}</li>)}</ul> : <Empty>No hints requested.</Empty>}
    </Dialog>}
    {dialog === 'cards' && <Dialog wide title="Student login cards" onClose={() => setDialog(null)}>
      <p className="ic-note">Demo credentials. Each student uses the class code and their individual passcode.</p>
      <div className="ic-share"><label>Example student link<input value={exampleLink} readOnly onFocus={event => event.target.select()} /></label><button className="ic-button" onClick={async () => setFeedback(await copyText(exampleLink) ? 'Example link copied.' : 'Select the example link to copy it.')}><Clipboard size={16} /> Copy link</button></div>
      <p className="ic-note" role="status">{feedback}</p>
      <LoginCards group={group} learners={group.learners} />
      <div className="ic-form-footer"><button className="ic-button ic-primary" onClick={() => window.print()}><Printer size={16} /> Print login cards</button></div>
    </Dialog>}
    {dialog === 'roster' && <Dialog wide title="Import more students" onClose={() => setDialog(null)}>
      <RosterUpload rows={rows} setRows={setRows} />
      <div className="ic-form-footer"><button type="button" disabled={!ready.length} className="ic-button ic-primary" onClick={() => {
        if (onSave({ ...group, learners: [...group.learners, ...makeLearners(ready, group.learners)] })) {
          setFeedback('');
          setDialog('cards');
        }
      }}>Import {ready.length || ''} students</button></div>
    </Dialog>}
    {dialog === 'assignment' && <Dialog title="Edit assigned modules" onClose={() => setDialog(null)}>
      <fieldset><legend>{course?.title}</legend>{course?.modules.filter(module => module.published).map(module => <label className="ic-checkbox" key={module.id}>
        <input type="checkbox" checked={draftModules.includes(module.id)} onChange={event => setDraftModules(ids => event.target.checked ? [...ids, module.id] : ids.filter(id => id !== module.id))} />{module.title}
      </label>)}</fieldset>
      <div className="ic-form-footer"><button className="ic-button ic-primary" disabled={!course?.modules.some(module => module.published && draftModules.includes(module.id))} onClick={() => {
        if (onSave({ ...group, moduleIds: draftModules })) setDialog(null);
      }}>Save assignment</button></div>
    </Dialog>}
  </>;
}

function LoginCards({ group, learners }: { group: ClassGroup; learners: Learner[] }) {
  return <div className="ic-login-cards">{learners.map(learner => <article key={learner.id}>
    <h3>{learner.name}</h3><p>{group.name}</p><p>Class code <strong>{group.joinCode}</strong></p><p>Passcode <strong>{learner.passcode}</strong></p>
  </article>)}</div>;
}
