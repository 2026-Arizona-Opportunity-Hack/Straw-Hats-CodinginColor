import { useState } from 'react';
import { ArrowRight, BookOpen, Clipboard, GraduationCap, Plus, Printer, Search, Users } from 'lucide-react';
import { RosterUpload } from './ClassSetup';
import { makeLearners, type ClassGroup, type Course, type Learner } from './model';
import { assignedModules, attemptFor, classProgress, percent, points, statuses } from './progress';
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

export function ClassDashboard({ group, course, onSave, justCreated }: {
  group: ClassGroup; course?: Course; onSave: (group: ClassGroup) => boolean; justCreated: boolean;
}) {
  const [moduleId, setModuleId] = useState('');
  const [filter, setFilter] = useState('All students');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [dialog, setDialog] = useState<'cards' | 'roster' | 'assignment' | null>(null);
  const [rows, setRows] = useState<RosterRow[]>([]);
  const [draftModules, setDraftModules] = useState(group.moduleIds);
  const [feedback, setFeedback] = useState('');
  const modules = assignedModules(group, course);
  const { roster, activities, mastery, avgGain } = classProgress(group, course, moduleId);
  const filtered = roster.filter(row => (filter === 'All students' || row.status === filter) && row.learner.name.toLowerCase().includes(search.trim().toLowerCase()));
  const details = roster.find(row => row.learner.id === selected);
  const count = (status: string) => roster.filter(row => row.status === status).length;
  const ready = rows.filter(row => !row.issue).map(row => row.name);
  const exampleLink = 'https://example.com/join/' + group.joinCode;
  const paired = roster.filter(row => row.gain !== null).length;

  return <>
    <PageHeader title={group.name} description={group.school + (course ? ' · ' + course.title : '')} back={{ label: 'Classes', to: '#/classes' }}>
      <button className="ic-button" onClick={() => { setRows([]); setDialog('roster'); }}><Users size={17} /> Import roster</button>
      <button className="ic-button ic-primary" onClick={() => { setFeedback(''); setDialog('cards'); }}><Printer size={17} /> Student login cards</button>
    </PageHeader>
    {justCreated && <p className="ic-success" role="status">Class created with {group.learners.length} students. Open student login cards to see the example link and passcodes.</p>}
    <Panel title="Class progress" actions={<label className="ic-inline-field">Module<select value={moduleId} onChange={event => setModuleId(event.target.value)}>
      <option value="">All assigned modules</option>{modules.map(module => <option key={module.id} value={module.id}>{module.title}</option>)}
    </select></label>}>
      <div className="ic-stats">
        <div><span>Students</span><strong>{roster.length}</strong></div>
        <div><span>Complete</span><strong>{count('Complete')}</strong></div>
        <div><span>Need attention</span><strong>{count('Stuck')}</strong></div>
        <div><span>Avg. learning gain</span><strong>{points(avgGain)}</strong><small>{paired ? `${paired} with paired scores` : 'Awaiting paired scores'}</small></div>
      </div>
    </Panel>
    <Panel title="Roster" actions={<label className="ic-search"><Search size={16} /><input aria-label="Search students" type="search" placeholder="Search students" value={search} onChange={event => setSearch(event.target.value)} /></label>}>
      <div className="ic-tab-row" role="group" aria-label="Filter roster by status">
        {['All students', ...statuses].map(status => <button key={status} type="button" aria-pressed={filter === status} onClick={() => setFilter(status)}>{status}<span>{status === 'All students' ? roster.length : count(status)}</span></button>)}
      </div>
      {filtered.length ? <div className="ic-table-wrap" tabIndex={0} role="region" aria-label="Student progress table">
        <table className="ic-progress-table">
          <thead><tr>{['Student', 'Status', 'Activities', 'Time', 'Pre → post', 'Gain'].map(text => <th scope="col" key={text}>{text}</th>)}</tr></thead>
          <tbody>{filtered.map(row => <tr key={row.learner.id}>
            <td><button type="button" className="ic-link-button" onClick={() => setSelected(row.learner.id)}>{row.learner.name}</button></td>
            <td><span className={'ic-status ' + (row.status === 'Stuck' ? 'is-stuck' : row.status === 'Complete' ? 'is-published' : '')}>{row.status}</span></td>
            <td><div className="ic-progress-entry"><progress aria-label={row.learner.name + ' activities completed'} value={row.completed} max={row.total || 1} />{row.completed}/{row.total}</div></td>
            <td>{row.minutes} min</td><td>{percent(row.pre)} → {percent(row.post)}</td><td>{points(row.gain)}</td>
          </tr>)}</tbody>
        </table>
      </div> : <Empty>No students match this filter.</Empty>}
      <p className="ic-note ic-section-gap">Stuck means three or more attempts with a score below 70%, or no activity for more than three days after starting.</p>
    </Panel>
    <div className="ic-two-col">
      <Panel title="Concept mastery">
        {mastery.length ? <><p className="ic-note">Mastery means an average score of 70% or higher on tagged checks and post-tests.</p>
          <ul className="ic-list">{mastery.map(item => <li key={item.concept}>
            <div><strong>{item.concept}</strong><p className="ic-note">{item.assessed ? `${item.mastered} of ${item.assessed} assessed students met mastery` : 'Awaiting assessments'}</p></div>
            {item.score !== null && <span className={'ic-status ' + (item.score >= 70 ? 'is-published' : 'is-stuck')}>{percent(item.score)} avg.</span>}
          </li>)}</ul></> : <Empty>No tagged assessments for this selection.</Empty>}
        {mastery.some(item => item.assessed > 0) && <div className="ic-table-wrap ic-section-gap" tabIndex={0} role="region" aria-label="Mastery by student">
          <table><thead><tr><th scope="col">Student</th>{mastery.map(item => <th scope="col" key={item.concept}>{item.concept}</th>)}</tr></thead>
            <tbody>{roster.filter(row => mastery.some(item => item.scores.has(row.learner.id))).map(row => <tr key={row.learner.id}>
              <th scope="row">{row.learner.name}</th>{mastery.map(item => {
                const score = item.scores.get(row.learner.id) ?? null;
                return <td key={item.concept} className={score === null ? '' : score < 70 ? 'ic-warning-row' : 'ic-mastery-met'}>{percent(score)}</td>;
              })}
            </tr>)}</tbody>
          </table>
        </div>}
      </Panel>
      <Panel title="Assigned curriculum" actions={course && <button type="button" className="ic-button" onClick={() => { setDraftModules(group.moduleIds); setDialog('assignment'); }}>Edit assignment</button>}>
        {modules.length ? <ol className="ic-module-list">{modules.map(module => <li key={module.id}>{module.title}</li>)}</ol> : <Empty>No published modules assigned.</Empty>}
      </Panel>
    </div>
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
        if (onSave({ ...group, moduleIds: draftModules })) { setModuleId(''); setDialog(null); }
      }}>Save assignment</button></div>
    </Dialog>}
  </>;
}

function LoginCards({ group, learners }: { group: ClassGroup; learners: Learner[] }) {
  return <div className="ic-login-cards">{learners.map(learner => <article key={learner.id}>
    <h3>{learner.name}</h3><p>{group.name}</p><p>Class code <strong>{group.joinCode}</strong></p><p>Passcode <strong>{learner.passcode}</strong></p>
  </article>)}</div>;
}
