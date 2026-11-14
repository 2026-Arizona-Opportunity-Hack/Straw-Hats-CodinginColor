// Tabbed pages inside a class: Dashboard, Modules, Grades, Assignments, Curriculum, Syllabus.
// Each tab is its own URL (#/classes/<id>/<tab>) so back, reload and links work.
import { useState, type ReactNode } from 'react';
import { ArrowRight, BookOpen, Search } from 'lucide-react';
import { activityTypes, questionTypes, type ClassGroup, type Course } from './model';
import { assignedModules, attemptFor, classProgress, percent, points, statuses } from './progress';
import { classTabs, type ClassTabId } from './classTabIds';
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

export function ModulesTab({ group, course, onEditAssignment }: { group: ClassGroup; course?: Course; onEditAssignment: () => void }) {
  const modules = assignedModules(group, course);
  return <div className="ic-tab-page">
    <Tile title="How each module is going" note="Completion, scores and who is stuck, per assigned module."
      actions={course && <button type="button" className="ic-button" onClick={onEditAssignment}>Edit assignment</button>}>
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
      })}</div> : <Empty>No published modules assigned. Use Edit assignment to add some.</Empty>}
    </Tile>
  </div>;
}

export function GradesTab({ group, course, onSelect }: { group: ClassGroup; course?: Course; onSelect: (learnerId: string) => void }) {
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

export function AssignmentsTab({ group, course }: { group: ClassGroup; course?: Course }) {
  const modules = assignedModules(group, course);
  const items = modules.flatMap(module => module.lessons.flatMap(lesson => lesson.activities
    .filter(activity => questionTypes.has(activity.type) || activity.type === 'code')
    .map(activity => ({ module, activity }))));
  return <div className="ic-tab-page">
    <section className="ic-tile">
      <header className="ic-tile-heading"><div><h2>Assignments</h2><p className="ic-note">Work students submit: checks, worksheets, code, tests and exit questions.</p></div></header>
      {items.length ? <div className="ic-table-wrap" tabIndex={0} role="region" aria-label="Assignments table">
        <table className="ic-data-table">
          <thead><tr>{['Assignment', 'Module', 'Type', 'Submitted', 'Avg score'].map(text => <th scope="col" key={text}>{text}</th>)}</tr></thead>
          <tbody>{items.map(({ module, activity }) => {
            const attempts = group.learners.map(learner => attemptFor(learner, activity.id)).filter(attempt => attempt?.submitted);
            const scores = attempts.map(attempt => attempt!.score).filter((score): score is number => score !== null);
            return <tr key={activity.id}>
              <td><strong>{activity.title}</strong></td><td>{module.title}</td>
              <td><span className="ic-status">{activityTypes[activity.type]}</span></td>
              <td><div className="ic-progress-entry"><progress aria-label={activity.title + ' submissions'} value={attempts.length} max={group.learners.length || 1} />{attempts.length}/{group.learners.length}</div></td>
              <td>{percent(scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null)}</td>
            </tr>;
          })}</tbody>
        </table>
      </div> : <Empty>No assignments in the assigned modules yet.</Empty>}
    </section>
  </div>;
}

export function CurriculumTab({ group, course }: { group: ClassGroup; course?: Course }) {
  if (!course) return <div className="ic-tab-page"><section className="ic-tile"><Empty>This class has no course yet.</Empty></section></div>;
  return <div className="ic-tab-page">
    <section className="ic-tile">
      <header className="ic-tile-heading"><div><h2>{course.title}</h2><p className="ic-note">{course.description}</p></div>
        <a className="ic-button" href={`#/curriculum/${course.id}`}><BookOpen size={16} /> Open in course builder</a></header>
      <ol className="ic-outline">{course.modules.map(module => <li key={module.id}>
        <div className="ic-outline-module"><strong>{module.title}</strong>
          <span className={'ic-status ' + (group.moduleIds.includes(module.id) && module.published ? 'is-published' : '')}>
            {!module.published ? 'Draft' : group.moduleIds.includes(module.id) ? 'Assigned' : 'Not assigned'}</span></div>
        <ul>{module.lessons.map(lesson => <li key={lesson.id}>{lesson.title}<span className="ic-note"> · {lesson.activities.length} activities</span></li>)}</ul>
      </li>)}</ol>
    </section>
  </div>;
}

export function SyllabusTab() {
  return <div className="ic-tab-page">
    <section className="ic-tile">
      <header className="ic-tile-heading"><div><h2>Syllabus</h2><p className="ic-note">Course description, schedule, grading policy and expectations for this class.</p></div></header>
      <Empty>The syllabus editor is coming next.</Empty>
    </section>
  </div>;
}
