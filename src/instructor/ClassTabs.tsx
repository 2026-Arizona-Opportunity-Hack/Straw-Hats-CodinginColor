// Tabbed pages inside a class: Dashboard, Modules, Grades, Assignments, Curriculum, Syllabus.
// Each tab is its own URL (#/classes/<id>/<tab>) so back, reload and links work.
import { useState, type FormEvent, type ReactNode } from 'react';
import { ArrowRight, BookOpen, Printer, Search, Trash2, Upload, UserPlus } from 'lucide-react';
import { makeLearners, type ClassGroup, type Course } from './model';
import { assignedModules, classProgress, percent, points, statuses } from './progress';
import { classTabs, type ClassTabId } from './classTabIds';
import { Gradebook } from './assignments/Gradebook';
import { Empty } from './ui';

export function ClassTabBar({ groupId, active }: { groupId: string; active: ClassTabId }) {
  return <nav className="ic-class-tabs" aria-label="Class sections">
    {classTabs.map(tab => <a key={tab.id} href={`#/classes/${groupId}/${tab.id}`} aria-current={tab.id === active ? 'page' : undefined}>{tab.label}</a>)}
  </nav>;
}

/** Card with a small uppercase title, like the dashboard tiles. */
function Tile({ title, note, actions, children }: { title: string; note?: string; actions?: ReactNode; children: ReactNode }) {
  return <section className="ic-tile">
    <header className="ic-tile-heading"><div><h2>{title}</h2>{note && <p className="ic-note">{note}</p>}</div>{actions}</header>
    {children}
  </section>;
}

function StatCard({ label, value, note, tone }: { label: string; value: string | number; note: string; tone?: 'good' | 'alert' }) {
  return <div className="ic-stat-card">
    <span>{label}</span>
    <strong className={tone ? 'is-' + tone : undefined}>{value}</strong>
    <small>{note}</small>
  </div>;
}

type Progress = ReturnType<typeof classProgress>;

// Status colors are reserved for state and always shown with a text label.
const statusColor: Record<string, string> = {
  Complete: 'var(--ic-green)',
  'In progress': 'var(--ic-progress)',
  Stuck: 'var(--ic-warning)',
  'Not started': 'var(--ic-border-strong)',
};

function StatusDonut({ roster }: { roster: Progress['roster'] }) {
  const total = roster.length;
  const counts = statuses.map(status => ({ status, count: roster.filter(row => row.status === status).length }));
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const gap = total > 1 ? 2 : 0;
  // Each segment starts where the previous ones end.
  const slices = counts.map((slice, index) => ({
    ...slice,
    length: total ? (slice.count / total) * circumference : 0,
    start: total ? counts.slice(0, index).reduce((sum, s) => sum + s.count, 0) / total * circumference : 0,
  }));
  return <div className="ic-donut-wrap">
    <svg viewBox="0 0 140 140" className="ic-donut" role="img" aria-label={slices.map(s => `${s.status} ${s.count}`).join(', ')}>
      <circle cx="70" cy="70" r={radius} fill="none" stroke="var(--ic-canvas)" strokeWidth="18" />
      {slices.filter(s => s.count).map(({ status, count, length, start }) => {
        const dash = Math.max(length - gap, 0.5);
        return <circle key={status} cx="70" cy="70" r={radius} fill="none" stroke={statusColor[status]} strokeWidth="18"
          strokeDasharray={`${dash} ${circumference - dash}`} strokeDashoffset={-start} transform="rotate(-90 70 70)">
          <title>{`${status}: ${count} of ${total}`}</title>
        </circle>;
      })}
      <text x="70" y="68" textAnchor="middle" className="ic-donut-total">{total}</text>
      <text x="70" y="86" textAnchor="middle" className="ic-donut-label">STUDENTS</text>
    </svg>
    <ul className="ic-legend">{slices.map(({ status, count }) => <li key={status}>
      <span className="ic-swatch" style={{ background: statusColor[status] }} aria-hidden="true" />
      <span>{status}</span>
      <span className="ic-note">{total ? Math.round((count / total) * 100) : 0}%</span>
      <strong>{count}</strong>
    </li>)}</ul>
  </div>;
}

function moduleStats(group: ClassGroup, course: Course | undefined, moduleId: string) {
  const { roster, activities } = classProgress(group, course, moduleId);
  const possible = roster.length * activities.length;
  const done = roster.reduce((sum, row) => sum + row.completed, 0);
  const scores = roster.flatMap(row => row.submitted.map(attempt => attempt.score)).filter((score): score is number => score !== null);
  return {
    completion: possible ? (done / possible) * 100 : null,
    finished: roster.filter(row => row.status === 'Complete').length,
    stuck: roster.filter(row => row.status === 'Stuck').length,
    avgScore: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null,
    activities: activities.length,
    students: roster.length,
  };
}

export function DashboardTab({ group, course }: { group: ClassGroup; course?: Course }) {
  const { roster, mastery, avgGain } = classProgress(group, course);
  const modules = assignedModules(group, course);
  const count = (status: string) => roster.filter(row => row.status === status).length;
  const paired = roster.filter(row => row.gain !== null).length;
  const attention = roster.filter(row => row.status === 'Stuck' || row.status === 'Not started');
  return <div className="ic-tab-page">
    <div className="ic-stat-grid">
      <StatCard label="Students" value={roster.length} note="Enrolled in this class" />
      <StatCard label="Complete" value={count('Complete')} note="Finished every assigned activity" tone="good" />
      <StatCard label="Need attention" value={count('Stuck')} note={`${count('Not started')} not started yet`} tone={count('Stuck') ? 'alert' : undefined} />
      <StatCard label="Avg learning gain" value={points(avgGain)} note={paired ? `${paired} students with both tests` : 'Awaiting pre and post tests'} tone="good" />
    </div>
    <div className="ic-tile-grid">
      <Tile title="Students by status"><StatusDonut roster={roster} /></Tile>
      <Tile title="Module completion" note="Share of activities submitted, per assigned module.">
        {modules.length ? <ul className="ic-bars">{modules.map(module => {
          const { completion } = moduleStats(group, course, module.id);
          return <li key={module.id} title={`${module.title}: ${percent(completion)} complete`}>
            <span>{module.title}</span>
            <span className="ic-bar-track"><span className="ic-bar-fill" style={{ width: `${completion ?? 0}%` }} /></span>
            <strong>{percent(completion)}</strong>
          </li>;
        })}</ul> : <Empty>No modules assigned yet.</Empty>}
      </Tile>
      <Tile title="Students needing attention" note="Stuck on an activity, or not started." actions={<a className="ic-see-all" href={`#/classes/${group.id}/grades`}>See all <ArrowRight size={15} /></a>}>
        {attention.length ? <ul className="ic-attention">{attention.slice(0, 5).map(row => <li key={row.learner.id}>
          <div><strong>{row.learner.name}</strong><p className="ic-note">{row.completed} of {row.total} activities · {row.minutes} min</p></div>
          <span className={'ic-status ' + (row.status === 'Stuck' ? 'is-stuck' : '')}>{row.status}</span>
        </li>)}</ul> : <Empty>Nobody is stuck right now.</Empty>}
      </Tile>
      <Tile title="Concept mastery" note="Average on tagged checks and post-tests; 70% is mastery.">
        {mastery.length ? <ul className="ic-attention">{mastery.map(item => <li key={item.concept}>
          <div><strong>{item.concept}</strong><p className="ic-note">{item.assessed ? `${item.mastered} of ${item.assessed} students at mastery` : 'Awaiting assessments'}</p></div>
          {item.score !== null && <span className={'ic-status ' + (item.score >= 70 ? 'is-published' : 'is-stuck')}>{percent(item.score)}</span>}
        </li>)}</ul> : <Empty>No tagged assessments yet.</Empty>}
      </Tile>
    </div>
  </div>;
}

export function GradesTab({ group, course, onSelect, onSave }: {
  group: ClassGroup; course?: Course; onSelect: (learnerId: string) => void; onSave: (group: ClassGroup) => boolean;
}) {
  const [view, setView] = useState<'assignments' | 'progress'>('assignments');
  return <div className="ic-tab-page">
    <div className="ic-mode ic-view-switch" role="group" aria-label="Grades view">
      <button type="button" aria-pressed={view === 'assignments'} onClick={() => setView('assignments')}>Assignment grades</button>
      <button type="button" aria-pressed={view === 'progress'} onClick={() => setView('progress')}>Curriculum progress</button>
    </div>
    {view === 'assignments' ? <Gradebook group={group} onSave={onSave} /> : <CurriculumProgress group={group} course={course} onSelect={onSelect} />}
  </div>;
}

function CurriculumProgress({ group, course, onSelect }: { group: ClassGroup; course?: Course; onSelect: (learnerId: string) => void }) {
  const [moduleId, setModuleId] = useState('');
  const [filter, setFilter] = useState('All students');
  const [search, setSearch] = useState('');
  const modules = assignedModules(group, course);
  const { roster } = classProgress(group, course, moduleId);
  const count = (status: string) => roster.filter(row => row.status === status).length;
  const filtered = roster.filter(row => (filter === 'All students' || row.status === filter) && row.learner.name.toLowerCase().includes(search.trim().toLowerCase()));
  return <div className="ic-tab-page">
    <section className="ic-tile ic-filter-bar">
      <label className="ic-search ic-grow"><Search size={16} /><input aria-label="Search students" type="search" placeholder="Search students" value={search} onChange={event => setSearch(event.target.value)} /></label>
      <label className="ic-inline-field">Module<select value={moduleId} onChange={event => setModuleId(event.target.value)}>
        <option value="">All assigned modules</option>{modules.map(module => <option key={module.id} value={module.id}>{module.title}</option>)}
      </select></label>
      <div className="ic-tab-row" role="group" aria-label="Filter by status">
        {['All students', ...statuses].map(status => <button key={status} type="button" aria-pressed={filter === status} onClick={() => setFilter(status)}>{status}<span>{status === 'All students' ? roster.length : count(status)}</span></button>)}
      </div>
    </section>
    <section className="ic-tile">
      {filtered.length ? <div className="ic-table-wrap" tabIndex={0} role="region" aria-label="Grades table">
        <table className="ic-progress-table ic-data-table">
          <thead><tr>{['Student', 'Status', 'Activities', 'Time', 'Pretest', 'Post-test', 'Gain'].map(text => <th scope="col" key={text}>{text}</th>)}</tr></thead>
          <tbody>{filtered.map(row => <tr key={row.learner.id}>
            <td><button type="button" className="ic-link-button" onClick={() => onSelect(row.learner.id)}>{row.learner.name}</button></td>
            <td><span className={'ic-status ' + (row.status === 'Stuck' ? 'is-stuck' : row.status === 'Complete' ? 'is-published' : '')}>{row.status}</span></td>
            <td><div className="ic-progress-entry"><progress aria-label={row.learner.name + ' activities completed'} value={row.completed} max={row.total || 1} />{row.completed}/{row.total}</div></td>
            <td>{row.minutes} min</td><td>{percent(row.pre)}</td><td>{percent(row.post)}</td><td>{points(row.gain)}</td>
          </tr>)}</tbody>
        </table>
      </div> : <Empty>No students match this filter.</Empty>}
      <p className="ic-note ic-section-gap">Select a name to see every attempt, code submission and hint.</p>
    </section>
  </div>;
}

export function CurriculumTab({ group, course, onEditAssignment }: { group: ClassGroup; course?: Course; onEditAssignment: () => void }) {
  if (!course) return <div className="ic-tab-page"><section className="ic-tile"><Empty>This class has no course yet.</Empty></section></div>;
  const modules = assignedModules(group, course);
  return <div className="ic-tab-page">
    <Tile title="Modules in this class" note="Completion, scores and who is stuck, per assigned module."
      actions={<div className="ic-row">
        <button type="button" className="ic-button" onClick={onEditAssignment}>Choose modules</button>
        <a className="ic-button" href={`#/curriculum/${course.id}`}><BookOpen size={16} /> Open course builder</a>
      </div>}>
      {modules.length ? <div className="ic-module-cards">{modules.map((module, index) => {
        const stats = moduleStats(group, course, module.id);
        const healthy = stats.stuck === 0;
        return <article key={module.id} className={'ic-module-card' + (healthy ? '' : ' is-alert')}>
          <header><div><span className="ic-code">MODULE {index + 1}</span><h3>{module.title}</h3></div>
            <span className={'ic-status ' + (healthy ? 'is-published' : 'is-stuck')}>{healthy ? 'On track' : `${stats.stuck} stuck`}</span></header>
          <progress aria-label={`${module.title} completion`} value={stats.completion ?? 0} max={100} />
          <dl>
            <div><dt>Completion</dt><dd>{percent(stats.completion)}</dd></div>
            <div><dt>Avg score</dt><dd>{percent(stats.avgScore)}</dd></div>
            <div><dt>Finished</dt><dd>{stats.finished}/{stats.students}</dd></div>
          </dl>
          <footer className="ic-note">{stats.activities} activities · {module.lessons.length} lesson{module.lessons.length === 1 ? '' : 's'}</footer>
        </article>;
      })}</div> : <Empty>No published modules assigned. Use Choose modules to add some.</Empty>}
    </Tile>
    <Tile title="Full course outline" note={course.title + ' · ' + course.description}>
      <ol className="ic-outline">{course.modules.map(module => <li key={module.id}>
        <div className="ic-outline-module"><strong>{module.title}</strong>
          <span className={'ic-status ' + (group.moduleIds.includes(module.id) && module.published ? 'is-published' : '')}>
            {!module.published ? 'Draft' : group.moduleIds.includes(module.id) ? 'Assigned' : 'Not assigned'}</span></div>
        <ul>{module.lessons.map(lesson => <li key={lesson.id}>{lesson.title}<span className="ic-note"> · {lesson.activities.length} activities</span></li>)}</ul>
      </li>)}</ol>
    </Tile>
  </div>;
}

export function RosterTab({ group, course, onSave, onImport, onCards }: {
  group: ClassGroup; course?: Course; onSave: (group: ClassGroup) => boolean; onImport: () => void; onCards: () => void;
}) {
  const [name, setName] = useState('');
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState('');
  const [now] = useState(() => Date.now());
  const { roster } = classProgress(group, course);
  const rows = roster.filter(row => row.learner.name.toLowerCase().includes(search.trim().toLowerCase()));
  const trimmed = name.trim();

  function addStudent(event: FormEvent) {
    event.preventDefault();
    if (!trimmed || trimmed.length > 100) return;
    if (onSave({ ...group, learners: [...group.learners, ...makeLearners([trimmed], group.learners)] })) {
      setMessage(`Added ${trimmed}.`);
      setName('');
    }
  }

  function removeStudent(id: string, studentName: string) {
    if (!window.confirm(`Remove ${studentName} from ${group.name}? Their progress in this class is deleted.`)) return;
    if (onSave({ ...group, learners: group.learners.filter(learner => learner.id !== id) })) setMessage(`Removed ${studentName}.`);
  }

  return <div className="ic-tab-page">
    <div className="ic-stat-grid">
      <StatCard label="Students" value={group.learners.length} note="On this roster" />
      <StatCard label="Class code" value={group.joinCode} note="Students enter this with their passcode" />
      <StatCard label="Active this week" value={roster.filter(row => row.learner.lastActive && now - new Date(row.learner.lastActive).getTime() < 7 * 86_400_000).length} note="Submitted work in the last 7 days" tone="good" />
      <StatCard label="Never signed in" value={roster.filter(row => !row.learner.lastActive).length} note="Check they have a login card" />
    </div>
    <section className="ic-tile ic-filter-bar">
      <label className="ic-search ic-grow"><Search size={16} /><input aria-label="Search roster" type="search" placeholder="Search students" value={search} onChange={event => setSearch(event.target.value)} /></label>
      <form className="ic-row" onSubmit={addStudent}>
        <label className="ic-inline-field">Add student<input value={name} maxLength={100} placeholder="Full name" onChange={event => setName(event.target.value)} /></label>
        <button type="submit" className="ic-button" disabled={!trimmed}><UserPlus size={16} /> Add</button>
      </form>
      <button type="button" className="ic-button" onClick={onImport}><Upload size={16} /> Add multiple students</button>
      <button type="button" className="ic-button ic-primary" onClick={onCards}><Printer size={16} /> Login cards</button>
      {message && <p className="ic-note" role="status">{message}</p>}
    </section>
    <section className="ic-tile">
      {rows.length ? <div className="ic-table-wrap" tabIndex={0} role="region" aria-label="Roster table">
        <table className="ic-data-table">
          <thead><tr>{['Student', 'Passcode', 'Status', 'Last active', ''].map((text, index) => <th scope="col" key={index}>{text || <span className="ic-sr-only">Actions</span>}</th>)}</tr></thead>
          <tbody>{rows.map(row => <tr key={row.learner.id}>
            <td><strong>{row.learner.name}</strong></td>
            <td><code>{row.learner.passcode}</code></td>
            <td><span className={'ic-status ' + (row.status === 'Stuck' ? 'is-stuck' : row.status === 'Complete' ? 'is-published' : '')}>{row.status}</span></td>
            <td>{row.learner.lastActive ? new Date(row.learner.lastActive).toLocaleDateString() : 'Never'}</td>
            <td className="ic-cell-action"><button type="button" className="ic-icon" aria-label={`Remove ${row.learner.name}`} onClick={() => removeStudent(row.learner.id, row.learner.name)}><Trash2 size={16} /></button></td>
          </tr>)}</tbody>
        </table>
      </div> : <Empty>{search ? 'No students match your search.' : 'No students yet. Add one or import a CSV.'}</Empty>}
      <p className="ic-note ic-section-gap">Students sign in with the class code and their own passcode. We store only their name.</p>
    </section>
  </div>;
}
