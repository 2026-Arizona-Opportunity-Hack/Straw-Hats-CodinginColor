import { useState } from 'react';
import { Download } from 'lucide-react';
import type { ClassGroup, Course, StaffProfile, StaffRole } from './model';
import { classProgress, percent, points } from './progress';
import { Empty, PageHeader, Panel } from './ui';

const roles = { instructor: 'Instructor', admin: 'CIC admin / Program manager', reviewer: 'External reviewer' };

export function ProgramOverview({ groups, courses }: { groups: ClassGroup[]; courses: Course[] }) {
  const [school, setSchool] = useState('');
  const schools = [...new Set(groups.map(group => group.school))].sort();
  const results = groups.filter(group => !school || school === group.school).map(group => {
    const course = courses.find(course => course.id === group.courseId);
    const { roster, avgGain } = classProgress(group, course);
    return {
      group, course, learners: roster.length, completions: roster.filter(row => row.status === 'Complete').length,
      needHelp: roster.filter(row => row.status === 'Stuck').length,
      paired: roster.filter(row => row.gain !== null).length, avgGain,
    };
  });
  const total = results.reduce((sum, item) => sum + item.learners, 0);
  const complete = results.reduce((sum, item) => sum + item.completions, 0);
  const paired = results.reduce((sum, item) => sum + item.paired, 0);
  const gain = paired ? results.reduce((sum, item) => sum + (item.avgGain || 0) * item.paired, 0) / paired : null;

  function resultsCsv() {
    const encode = (value: string | number | null) => {
      const text = String(value ?? '');
      const safe = typeof value === 'string' && /^[\s]*[=+\-@]/.test(text) ? "'" + text : text;
      return '"' + safe.replaceAll('"', '""') + '"';
    };
    const rows = [['School', 'Class', 'Course', 'Enrollments', 'Complete', 'Stuck', 'Paired scores', 'Average gain (pp)'],
      ...results.map(({ group, course, learners, completions, needHelp, paired, avgGain }) => [group.school, group.name, course?.title || '', learners, completions, needHelp, paired, avgGain === null ? null : Math.round(avgGain)])];
    return rows.map(row => row.map(encode).join(',')).join('\r\n');
  }

  return <>
    <PageHeader title="Program overview" description="Compare class completion and learning gain across schools.">
      {results.length > 0 && <a className="ic-button" download="cic-cohort-summary.csv"
        href={'data:text/csv;charset=utf-8,%EF%BB%BF' + encodeURIComponent(resultsCsv())}><Download size={16} /> Export cohort CSV</a>}
    </PageHeader>
    <Panel title="Cohort outcomes" actions={<label className="ic-inline-field">School<select value={school} onChange={event => setSchool(event.target.value)}>
      <option value="">All schools</option>{schools.map(school => <option key={school}>{school}</option>)}
    </select></label>}>
      <div className="ic-stats"><div><span>Classes</span><strong>{results.length}</strong></div><div><span>Enrollments</span><strong>{total}</strong></div>
        <div><span>Class completion</span><strong>{percent(total ? 100 * complete / total : null)}</strong></div>
        <div><span>Avg. learning gain</span><strong>{points(gain)}</strong><small>{paired} with paired scores</small></div>
      </div>
    </Panel>
    <Panel title="Classes by school">
      {results.length ? <div className="ic-table-wrap" tabIndex={0} role="region" aria-label="Cohort outcomes by class">
        <table className="ic-progress-table"><thead><tr>{['School', 'Class', 'Enrollments', 'Completed', 'Need attention', 'Avg. gain'].map(text => <th scope="col" key={text}>{text}</th>)}</tr></thead>
          <tbody>{results.map(({ group, learners, completions, needHelp, avgGain }) => <tr key={group.id}>
            <td>{group.school}</td><td><a href={'#/classes/' + group.id}>{group.name}</a></td><td>{learners}</td>
            <td>{completions}/{learners}</td><td>{needHelp}</td><td>{points(avgGain)}</td>
          </tr>)}</tbody>
        </table>
      </div> : <Empty>No classes for this school.</Empty>}
      <p className="ic-note ic-section-gap">The export contains class totals. Learning gain uses only enrollments with paired pretest and post-test scores.</p>
    </Panel>
  </>;
}

export function AccessSettings({ staff, groups, onSave }: {
  staff: StaffProfile[];
  groups: ClassGroup[];
  onSave: (staff: StaffProfile[]) => boolean;
}) {
  const [edited, setEdited] = useState(staff);
  const [message, setMessage] = useState('');
  const hasAdmin = edited.some(person => person.role === 'admin');
  function update(id: string, patch: Partial<StaffProfile>) {
    setEdited(profiles => profiles.map(person => person.id === id ? { ...person, ...patch } : person));
    setMessage('');
  }
  return <>
    <PageHeader title="Access settings" description="Preview staff roles and class assignments using demo profiles." />
    <Panel title="Staff access">
      <form onSubmit={event => {
        event.preventDefault();
        if (onSave(edited)) setMessage('Demo access settings saved.');
      }}>
        <div className="ic-stack">{edited.map(person => <fieldset key={person.id}>
          <legend>{person.name}</legend>
          <div className="ic-form-grid">
            <label>Role<select value={person.role} onChange={event => update(person.id, { role: event.target.value as StaffRole })}>
              {Object.entries(roles).map(([value, role]) => <option key={value} value={value}>{role}</option>)}
            </select></label>
            {person.role === 'instructor' && <div><h3>Assigned classes</h3>{groups.map(group => <label className="ic-checkbox" key={group.id}>
              <input type="checkbox" checked={person.classIds.includes(group.id)} onChange={event => update(person.id, {
                classIds: event.target.checked ? [...person.classIds, group.id] : person.classIds.filter(id => id !== group.id),
              })} />{group.name}
            </label>)}{!groups.length && <p className="ic-note">No classes yet.</p>}</div>}
          </div>
        </fieldset>)}</div>
        {!hasAdmin && <p className="ic-error" role="alert">Keep at least one CIC admin to manage access.</p>}
        <div className="ic-form-footer"><span role="status">{message}</span><button type="submit" className="ic-button ic-primary" disabled={edited === staff || !hasAdmin}>Save access settings</button></div>
      </form>
    </Panel>
    <Panel title="What each role can see">
      <ul className="ic-list">
        <li><div><strong>Student</strong><p className="ic-note">Their assigned lessons and their own progress.</p></div></li>
        <li><div><strong>Instructor</strong><p className="ic-note">Assigned classes and student progress, plus the curriculum builder.</p></div></li>
        <li><div><strong>CIC admin / Program manager</strong><p className="ic-note">All classes, cohort reports, and staff access settings.</p></div></li>
        <li><div><strong>External reviewer</strong><p className="ic-note">Published curriculum only.</p></div></li>
      </ul>
      <p className="ic-note ic-section-gap">Use the preview profile selector to see each staff view. These controls simulate access in this browser.</p>
    </Panel>
  </>;
}
