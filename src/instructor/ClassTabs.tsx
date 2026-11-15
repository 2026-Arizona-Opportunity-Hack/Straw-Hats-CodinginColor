// Tabbed pages inside a class: Dashboard, Modules, Grades, Assignments, Curriculum, Syllabus.
// Each tab is its own URL (#/classes/<id>/<tab>) so back, reload and links work.
import { useState, type FormEvent, type ReactNode } from 'react';
import { ArrowRight, Pencil, Printer, Search, Trash2, Upload, UserPlus } from 'lucide-react';
import { makeLearners, type ClassGroup, type Course } from './model';
import { assignedModules, classProgress, percent, points, statuses } from './progress';
import { classTabs, type ClassTabId } from './classTabIds';
import { Gradebook } from './assignments/Gradebook';
import { formatDue } from './assignments/display';
import { assignmentTotals, attentionList, gainBreakdown, moduleAssignments, type AttentionReason } from './dashboard';
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

function moduleStats(group: ClassGroup, course: Course | undefined, moduleId: string) {
  const { roster, activities } = classProgress(group, course, moduleId);
  const eligible = roster.filter(row => row.learner.moduleProgress === undefined || row.learner.moduleProgress.some(state => state.module_id === moduleId));
  const done = eligible.filter(row => row.status === 'Complete').length;
  const live = roster.some(row => row.learner.moduleProgress !== undefined);
  const possible = roster.length * activities.length;
  const scores = roster.flatMap(row => row.submitted.map(attempt => attempt.score)).filter((score): score is number => score !== null);
  return {
    live,
    completion: live ? (eligible.length ? (done / eligible.length) * 100 : null)
      : possible ? roster.reduce((sum, row) => sum + row.completed, 0) / possible * 100 : null,
    finished: done,
    stuck: roster.filter(row => row.status === 'Stuck').length,
    avgScore: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null,
    activities: activities.length,
    students: live ? eligible.length : roster.length,
  };
}

export function DashboardTab({ group, course }: { group: ClassGroup; course?: Course }) {
  const { mastery } = classProgress(group, course);
  const modules = assignedModules(group, course);
  const attention = attentionList(group, course);
  const totals = assignmentTotals(group);
  const gain = gainBreakdown(group, course);
  const passMarks = [...new Set(mastery.map(item => item.passMark).filter(mark => mark !== null))];
  const masteryNote = 'Average on tagged checks and post-tests; ' + (passMarks.length === 1
    ? `${Math.round(passMarks[0])}% (the module pass mark) is mastery.`
    : 'mastery is the pass mark of the module each check is in.');
  return <div className="ic-tab-page">
    <div className="ic-stat-grid">
      <StatCard label="Avg learning gain" value={points(gain.gain)} tone={gain.gain !== null && gain.gain < 0 ? 'alert' : 'good'}
        note={gain.students ? `Pretest ${percent(gain.pre)} to post-test ${percent(gain.post)} · ${gain.students} student${gain.students === 1 ? '' : 's'} with both` : 'Shows once students take both the pretest and the post-test'} />
      <StatCard label="Avg assignment score" value={percent(totals.average)} note="Graded work, with missing work as 0; not-due and ungraded work left out" />
      <StatCard label="Waiting to grade" value={totals.toGrade} note="Submissions with parts you still need to score" tone={totals.toGrade ? 'alert' : undefined} />
      <StatCard label="Missing work" value={totals.missing} note="Past-due assignments with nothing turned in" tone={totals.missing ? 'alert' : undefined} />
    </div>
    <p className="ic-note ic-gain-help">Learning gain = post-test score minus pretest score, in percentage points (pts). +15 pts means a student went from, say, 50% to 65%.</p>
    <div className="ic-tile-grid">
      <Tile title="Students needing attention" note="Open a name to see exactly where they need help."
        actions={<a className="ic-see-all" href={`#/classes/${group.id}/grades`}>Grades <ArrowRight size={15} /></a>}>
        {attention.length ? <ul className="ic-drill">{attention.map(row => <li key={row.learnerId}>
          <details>
            <summary><strong>{row.name}</strong>
              <span className="ic-reason-chips">{[...new Set(row.reasons.map(reason => reason.kind))].map(kind => <span key={kind} className={'ic-chip is-' + kind}>{reasonLabel[kind]}</span>)}</span>
            </summary>
            <ul className="ic-reasons">{row.reasons.map((reason, index) => <li key={index} className={'is-' + reason.kind}>{reason.text}</li>)}</ul>
          </details>
        </li>)}</ul> : <Empty>Nobody needs attention right now.</Empty>}
      </Tile>
      <Tile title="Module completion" note="Open a module to see its assignments and due dates.">
        {modules.length ? <ul className="ic-drill">{modules.map(module => {
          const { completion, live } = moduleStats(group, course, module.id);
          const work = moduleAssignments(group, module.id);
          return <li key={module.id}><details>
            <summary>
              <span className="ic-drill-title">{module.title}</span>
              <span className="ic-bar-track" aria-hidden="true"><span className="ic-bar-fill" style={{ width: `${completion ?? 0}%` }} /></span>
              <strong aria-label={live ? `${percent(completion)} of enrolled students completed this module` : `${percent(completion)} of activities submitted`}>{percent(completion)}</strong>
            </summary>
            {work.length ? <ul className="ic-module-work">{work.map(({ assignment, submitted, toGrade, missing, students }) => <li key={assignment.id}>
              <a href={`#/classes/${group.id}/assignments/${assignment.id}`}>{assignment.title}</a>
              <span className="ic-note">Due {formatDue(assignment.dueAt)}{assignment.dueAt && new Date(assignment.dueAt).getTime() < Date.now() ? <strong className="ic-overdue"> · past due</strong> : null}</span>
              <span className="ic-note">{submitted}/{students} turned in{toGrade ? ` · ${toGrade} to grade` : ''}{missing ? ` · ${missing} missing` : ''}</span>
            </li>)}</ul> : <p className="ic-note ic-module-empty">No assignments linked to this module. Pick the module in an assignment's settings to show it here.</p>}
          </details></li>;
        })}</ul> : <Empty>No modules assigned yet.</Empty>}
      </Tile>
      <Tile title="Concept mastery" note={masteryNote}>
        {mastery.length ? <ul className="ic-attention">{mastery.map(item => <li key={item.concept}>
          <div><strong>{item.concept}</strong><p className="ic-note">{!item.assessed ? 'Awaiting assessments' : item.mastered === null ? 'Pass mark not loaded yet' : `${item.mastered} of ${item.assessed} students at mastery`}</p></div>
          {item.score !== null && <span className={'ic-status ' + (item.passMark === null ? '' : item.score >= item.passMark ? 'is-published' : 'is-stuck')}>{percent(item.score)}</span>}
        </li>)}</ul> : <Empty>No tagged assessments yet.</Empty>}
      </Tile>
    </div>
  </div>;
}

const reasonLabel: Record<AttentionReason['kind'], string> = {
  stuck: 'Stuck', inactive: 'Inactive', not_started: 'Not started', concept: 'Concept gap',
  missing: 'Missing work', low_score: 'Low score', dropped: 'Score dropped',
};

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
          <thead><tr>{['Student', 'Status', 'Required activities', 'Time', 'Pretest', 'Post-test', 'Gain'].map(text => <th scope="col" key={text}>{text}</th>)}</tr></thead>
          <tbody>{filtered.map(row => <tr key={row.learner.id}>
            <td><button type="button" className="ic-link-button" onClick={() => onSelect(row.learner.id)}>{row.learner.name}</button></td>
            <td><span className={'ic-status ' + (row.status === 'Stuck' ? 'is-stuck' : row.status === 'Complete' ? 'is-published' : '')}>{row.status}</span></td>
            <td><div className="ic-progress-entry"><progress aria-label={row.learner.name + ' activities completed'} value={row.completed} max={row.total || 1} />{row.completed}/{row.total}</div></td>
            <td>{row.minutes} min</td><td>{percent(row.pre)}</td><td>{percent(row.post)}</td><td>{points(row.gain)}</td>
          </tr>)}</tbody>
        </table>
      </div> : <Empty>No students match this filter.</Empty>}
      <p className="ic-note ic-section-gap">Completion follows the student's module state, including testing out and allowed final-check attempts. Required activity submissions are shown separately. Select a name to see activity details.</p>
    </section>
  </div>;
}

export function CurriculumTab({ group, course, onEditAssignment, onMakeEditable }: {
  group: ClassGroup; course?: Course; onEditAssignment: () => void; onMakeEditable?: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  if (!course) return <div className="ic-tab-page"><section className="ic-tile"><Empty>This class has no course yet.</Empty></section></div>;
  const modules = assignedModules(group, course);
  const hasProgress = group.learners.some(learner => learner.attempts.length > 0);
  async function makeEditable() {
    if (!onMakeEditable) return;
    if (hasProgress && !window.confirm('Students have already started this course. Their saved work stays in the database, but it will not show for the editable version. Continue?')) return;
    setBusy(true);
    setProblem('');
    try { await onMakeEditable(); } catch (error) { setProblem(error instanceof Error ? error.message : 'Could not make the course editable.'); } finally { setBusy(false); }
  }
  const editAction = onMakeEditable
    ? <button type="button" className="ic-button ic-primary" disabled={busy} onClick={() => void makeEditable()}><Pencil size={16} aria-hidden="true" /> {busy ? 'Preparing…' : 'Edit for this class'}</button>
    : <a className="ic-button ic-primary" href={`#/classes/${group.id}/curriculum/edit`}><Pencil size={16} aria-hidden="true" /> Edit curriculum</a>;
  return <div className="ic-tab-page">
    <Tile title="Modules in this class" note="Completion, scores and who is stuck, per assigned module."
      actions={<div className="ic-row">
        <button type="button" className="ic-button" onClick={onEditAssignment}>Choose modules</button>
        {editAction}
      </div>}>
      {onMakeEditable && <p className="ic-note">This class uses the shared CIC library version. Choose Edit for this class to get a version you can change; other classes are not affected.</p>}
      {problem && <p className="ic-error" role="alert">{problem}</p>}
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
