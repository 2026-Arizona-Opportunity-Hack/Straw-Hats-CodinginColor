import { useRef, useState, type ReactNode } from 'react';
import { ArrowRight, BookOpen, Clipboard, GraduationCap, Plus, Search } from 'lucide-react';
import { skipToken, useQuery } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadStaffClassProgress } from '../shared/staffProgress';
import { RosterUpload } from './RosterUpload';
import { makeLearners, type Activity, type ClassGroup, type Course, type Learner } from './model';
import { attemptFor, classProgress, percent, points, withClassProgress } from './progress';
import {
  ClassTabBar, CurriculumTab, DashboardTab, GradesTab, RosterTab,
} from './ClassTabs';
import type { ClassTabId } from './classTabIds';
import { AttemptResponse } from './AttemptResponse';
import { AssignmentsTab } from './assignments/AssignmentsTab';
import type { RosterRow } from './roster';
import { copyText, Dialog, Empty, PageHeader, Panel } from './ui';

export function ClassList({ groups, courses, showProgress = true }: { groups: ClassGroup[]; courses: Course[]; showProgress?: boolean }) {
  const [search, setSearch] = useState('');
  const matches = groups.filter(group => (group.name + ' ' + group.school).toLowerCase().includes(search.trim().toLowerCase()));
  return <>
    <PageHeader title="Classes" description="Set up classes, share student access, and see who needs help.">
      <a className="ic-button ic-primary" href="#/classes/new"><Plus size={17} /> Create class</a>
    </PageHeader>
    <div className="ic-toolbar"><label className="ic-search"><Search size={17} /><input type="search" aria-label="Search classes" placeholder="Search classes or schools" value={search} onChange={event => setSearch(event.target.value)} /></label></div>
    {matches.length ? <div className="ic-class-grid">{matches.map(group => {
      const course = courses.find(course => course.id === group.courseId);
      const summary = showProgress ? classProgress(group, course) : null;
      const stuck = summary?.roster.filter(row => row.status === 'Stuck').length ?? 0;
      const complete = summary?.roster.filter(row => row.status === 'Complete').length;
      return <article key={group.id} className="ic-panel ic-class-card">
        <div className="ic-class-top"><div className="ic-class-mark"><GraduationCap size={22} /></div><div><h2><a href={'#/classes/' + group.id}>{group.name}</a></h2><p>{group.school}</p></div></div>
        <div className="ic-card-course"><BookOpen size={16} /> {course?.title || 'No course assigned'}</div>
        <dl className="ic-card-stats"><div><dt>Students</dt><dd>{group.learners.length}</dd></div>
          {summary && <><div><dt>Complete</dt><dd>{complete}</dd></div><div><dt>Learning gain</dt><dd>{points(summary.avgGain)}</dd></div></>}
        </dl>
        <footer>{summary && <span className={stuck ? 'ic-stuck-text' : 'ic-note'}>{stuck ? `${stuck} need attention` : 'No students flagged'}</span>}<a href={'#/classes/' + group.id}>View class <ArrowRight size={15} /></a></footer>
      </article>;
    })}</div> : <Panel><Empty>{search ? 'No classes match your search.' : 'Create a class to get started.'}</Empty></Panel>}
  </>;
}

export type ClassProgressSource = { client: SupabaseClient; queryKey: readonly string[] };

export function ClassDashboard({ group, course, onSave, onAddStudents, justCreated, tab, detail, otherClasses, editor, blockActions, onMakeEditable, progressSource }: {
  group: ClassGroup; course?: Course; onSave: (group: ClassGroup) => boolean; justCreated: boolean; tab: ClassTabId;
  onAddStudents: (students: Learner[]) => Promise<void>;
  /** Course builder shown inside the Curriculum tab while editing this class's curriculum. */
  editor?: ReactNode;
  blockActions?: (activity: Activity) => ReactNode;
  /** Present when the class still uses a shared library course: gives the class its own copy to edit. */
  onMakeEditable?: () => Promise<void>;
  /** Item inside the tab, e.g. an assignment id. */
  detail?: string;
  otherClasses: ClassGroup[];
  progressSource?: ClassProgressSource;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [dialog, setDialog] = useState<'share' | 'roster' | 'assignment' | null>(null);
  const [rows, setRows] = useState<RosterRow[]>([]);
  const [savingRoster, setSavingRoster] = useState(false);
  const [rosterError, setRosterError] = useState('');
  const rosterAttempt = useRef<Learner[] | null>(null);
  const [draftModules, setDraftModules] = useState(group.moduleIds);
  const [feedback, setFeedback] = useState('');
  const [rosterMessage, setRosterMessage] = useState('');
  const needsProgress = tab === 'dashboard' || tab === 'grades' || tab === 'roster';
  const refreshDashboard = Boolean(progressSource) && tab === 'dashboard';
  const progress = useQuery({
    queryKey: [...(progressSource?.queryKey ?? ['demo']), group.id, group.courseId],
    queryFn: progressSource ? ({ signal }) => loadStaffClassProgress(progressSource.client, group.id, signal) : skipToken,
    enabled: Boolean(progressSource) && needsProgress,
    refetchOnWindowFocus: refreshDashboard,
    refetchInterval: refreshDashboard ? 30_000 : false,
    staleTime: 30_000,
    gcTime: 0,
  });
  const report = progressSource && progress.data
    ? withClassProgress(group, progress.data)
    : progressSource ? undefined : group;
  const { roster, activities } = report && (needsProgress || selected) ? classProgress(report, course) : { roster: [], activities: [] };
  const saveReport = (next: ClassGroup) => onSave(progressSource
    ? { ...next, learners: next.learners.map(learner => ({ ...learner, moduleProgress: undefined })) }
    : next);
  const details = roster.find(row => row.learner.id === selected);
  const ready = rows.filter(row => !row.issue).map(row => row.name);
  const editAssignment = () => { setDraftModules(group.moduleIds); setDialog('assignment'); };
  const updateRoster = (next: RosterRow[]) => {
    setRows(next);
    setRosterError('');
    rosterAttempt.current = null;
  };
  const openImport = () => { updateRoster([]); setRosterMessage(''); setDialog('roster'); };
  const openShare = () => { setFeedback(''); setDialog('share'); };

  async function importRoster() {
    if (savingRoster || !ready.length) return;
    setSavingRoster(true);
    setRosterError('');
    const students = rosterAttempt.current ?? makeLearners(ready, group.learners);
    rosterAttempt.current = students;
    try {
      await onAddStudents(students);
      setRosterMessage(`Imported ${students.length} ${students.length === 1 ? 'student' : 'students'}.`);
      setDialog(null);
    } catch (problem) {
      setRosterError(problem instanceof Error ? problem.message : 'Could not save the roster. Try again.');
    } finally {
      setSavingRoster(false);
    }
  }

  return <>
    <PageHeader title={group.name} description={group.school + (course ? ' · ' + course.title : '')} back={{ label: 'Classes', to: '#/classes' }}>
      <button className="ic-button ic-primary" onClick={openShare}><Clipboard size={17} /> Share class code</button>
    </PageHeader>
    {justCreated && <p className="ic-success" role="status">Class created. Share the class code so students can sign up and join.</p>}
    {rosterMessage && <p className="ic-success" role="status">{rosterMessage}</p>}
    <ClassTabBar groupId={group.id} active={tab} />
    {needsProgress && report && progress.isRefetchError && <p role="status" className="ic-note">
      Could not refresh class progress. Showing the last loaded results.
    </p>}
    {needsProgress && !report && (progress.isError
      ? <div role="alert" className="ic-error"><p>{progress.error.message}</p><button type="button" className="ic-button" onClick={() => void progress.refetch()}>Try again</button></div>
      : <p role="status" className="ic-note">Loading class progress…</p>)}
    {tab === 'dashboard' && report && <DashboardTab group={report} course={course} />}
    {tab === 'curriculum' && (editor ?? <CurriculumTab group={group} course={course} onEditAssignment={editAssignment}
      onMakeEditable={onMakeEditable} viewing={detail === 'view'} blockActions={blockActions} />)}
    {tab === 'assignments' && <AssignmentsTab group={group} course={course} otherClasses={otherClasses} assignmentId={detail} onSave={onSave} />}
    {tab === 'grades' && report && <GradesTab group={report} course={course} onSelect={setSelected} onSave={saveReport} />}
    {tab === 'roster' && report && <RosterTab group={report} course={course} onSave={saveReport} onImport={openImport} />}
    {details && <Dialog wide title={details.learner.name + ' · Activity details'} onClose={() => setSelected(null)}>
      <p className="ic-note">{details.status} · {details.completed} of {details.total} completed · {details.minutes} min · Learning gain {points(details.gain)}</p>
      <ul className="ic-list ic-section-gap">{activities.map(activity => {
        const attempt = attemptFor(details.learner, activity.id);
        return <li key={activity.id}><div><strong>{activity.title}</strong>
          <p className="ic-note">{attempt?.submitted ? `${attempt.count} attempt(s) · ${attempt.minutes} min · Score ${percent(attempt.score)}` : 'Not submitted'}</p>
          <AttemptResponse attempt={attempt} />
        </div></li>;
      })}</ul>
      <h3>Hint log</h3>
      {details.learner.hints.length ? <ul>{details.learner.hints.map((hint, index) => <li key={index}>{hint.concept} · {hint.text}</li>)}</ul> : <Empty>No hints requested.</Empty>}
    </Dialog>}
    {dialog === 'share' && <Dialog title="Share class code" onClose={() => setDialog(null)}>
      <p className="ic-note">New students enter this code on CIC Learn’s <strong>Create an account</strong> page. Students with an account can enter it in <strong>My classroom</strong> after signing in.</p>
      <div className="ic-share">
        <label>Class code<input value={group.joinCode} readOnly onFocus={event => event.target.select()} /></label>
        <button type="button" className="ic-button ic-primary" onClick={async () => setFeedback(await copyText(group.joinCode) ? 'Class code copied.' : 'Select the class code to copy it.')}><Clipboard size={16} /> Copy code</button>
      </div>
      <p className="ic-note" role="status">{feedback}</p>
    </Dialog>}
    {dialog === 'roster' && <Dialog wide title="Import more students" closeDisabled={savingRoster} onClose={() => setDialog(null)}>
      <p className="ic-note">Students who sign up with the class code appear on the roster automatically. Importing those same students first can create duplicate roster entries.</p>
      <div inert={savingRoster}><RosterUpload rows={rows} setRows={updateRoster} /></div>
      {rosterError && <p className="ic-error" role="alert">{rosterError}</p>}
      <div className="ic-form-footer"><button type="button" disabled={savingRoster || !ready.length} className="ic-button ic-primary" onClick={importRoster}>
        {savingRoster ? 'Saving roster…' : `Import ${ready.length || ''} students`}
      </button></div>
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
