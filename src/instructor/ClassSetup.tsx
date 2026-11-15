import { useRef, useState } from 'react';
import { ArrowRight, Check } from 'lucide-react';
import type { ClassGroup, Course } from './model';
import { id, makeLearners, publishedCourses } from './model';
import type { RosterRow } from './roster';
import { RosterUpload } from './RosterUpload';
import { PageHeader, Panel } from './ui';

export function ClassSetup({ courses, classes, onCreate }: {
  courses: Course[]; classes: ClassGroup[]; onCreate: (group: ClassGroup) => void;
}) {
  const available = publishedCourses(courses);
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [school, setSchool] = useState('');
  const [rows, setRows] = useState<RosterRow[]>([]);
  const [courseId, setCourseId] = useState(available[0]?.id || '');
  const [moduleIds, setModuleIds] = useState(available[0]?.modules.map(module => module.id) || []);
  const [error, setError] = useState('');
  const stepHeading = useRef<HTMLHeadingElement>(null);
  const valid = rows.filter(row => !row.issue).map(row => row.name);
  const course = available.find(course => course.id === courseId);
  const selectedModules = course?.modules.filter(module => moduleIds.includes(module.id)) || [];
  const steps = ['Class details', 'Import roster', 'Assign curriculum'];

  function move(next: number) {
    setStep(next);
    setError('');
    requestAnimationFrame(() => stepHeading.current?.focus());
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (step === 0 && (!name.trim() || !school.trim())) {
      setError('Enter a class name and school.');
      return;
    }
    if (step === 1 && !valid.length) {
      setError('Confirm at least one student before continuing.');
      return;
    }
    if (step < 2) return move(step + 1);
    if (!course || !selectedModules.length) {
      setError('Pick a course and at least one published module.');
      return;
    }
    let joinCode: string;
    do { joinCode = id().slice(0, 6).toUpperCase(); } while (classes.some(group => group.joinCode === joinCode));
    onCreate({ id: id(), name: name.trim(), school: school.trim(), courseId, joinCode, moduleIds: selectedModules.map(module => module.id), learners: makeLearners(valid) });
  }

  return <>
    <PageHeader title="Create a class" description="Add a roster and choose what students will learn first." back={{ label: 'Classes', to: '#/classes' }} />
    <ol className="ic-steps" aria-label="Class setup progress">
      {steps.map((title, index) => <li key={title} aria-current={step === index ? 'step' : undefined}>
        <span>{index < step ? <Check size={15} aria-label="Complete" /> : index + 1}</span>{title}
      </li>)}
    </ol>
    <div className="ic-setup-layout">
      <Panel><form onSubmit={submit}>
        <h2 ref={stepHeading} tabIndex={-1}>{steps[step]}</h2>
        {step === 0 && <div className="ic-form-grid ic-section-gap">
          <label>Class name<input required maxLength={100} placeholder="e.g. Maryvale · Period 3" value={name} onChange={event => setName(event.target.value)} /></label>
          <label>School<input required maxLength={100} placeholder="e.g. Maryvale High School" value={school} onChange={event => setSchool(event.target.value)} /></label>
        </div>}
        <div hidden={step !== 1}><RosterUpload rows={rows} setRows={next => { setRows(next); setError(''); }} /></div>
        {step === 2 && <div className="ic-stack ic-section-gap">
          {!available.length ? <p>Publish a module in <a href="#/curriculum">Curriculum</a> before assigning it.</p> : <>
            <label>Course<select value={courseId} onChange={event => {
              setCourseId(event.target.value);
              setModuleIds(available.find(course => course.id === event.target.value)?.modules.map(module => module.id) || []);
            }}>{available.map(course => <option key={course.id} value={course.id}>{course.title}</option>)}</select></label>
            <fieldset><legend>Modules</legend><p className="ic-note">Students see assigned modules in this order.</p>
              {course?.modules.map(module => <label className="ic-checkbox" key={module.id}><input type="checkbox" checked={moduleIds.includes(module.id)} onChange={event => setModuleIds(ids => event.target.checked ? [...ids, module.id] : ids.filter(id => id !== module.id))} />{module.title}</label>)}
            </fieldset>
          </>}
        </div>}
        {error && <p className="ic-error" role="alert">{error}</p>}
        <div className="ic-form-footer">
          {step > 0 && <button type="button" className="ic-button" onClick={() => move(step - 1)}>Back</button>}
          <button className="ic-button ic-primary" type="submit" disabled={step === 1 && !valid.length}>{['Continue to roster', 'Choose curriculum', 'Create class'][step]} <ArrowRight size={16} /></button>
        </div>
      </form></Panel>
      <Panel title="Class summary"><dl className="ic-summary">
        <div><dt>Class</dt><dd>{name || '—'}</dd></div><div><dt>School</dt><dd>{school || '—'}</dd></div>
        <div><dt>Students ready</dt><dd>{valid.length}</dd></div>
        <div><dt>Starting module</dt><dd>{step === 2 ? selectedModules[0]?.title || '—' : '—'}</dd></div>
      </dl></Panel>
    </div>
  </>;
}
