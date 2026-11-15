import { useRef, useState } from 'react';
import { ArrowRight, BookOpen, Check, Library } from 'lucide-react';
import { copiedModuleIds } from './classCurriculum';
import type { ClassGroup, Course } from './model';
import { assignableCourses, id, publishedCourses } from './model';
import { PageHeader, Panel } from './ui';

export function ClassSetup({ courses, classes, onCreate, onImport }: {
  courses: Course[]; classes: ClassGroup[];
  onCreate: (group: ClassGroup, imported?: Course, attempted?: ClassGroup) => Promise<void>;
  onImport: (source: Course) => Promise<Course>;
}) {
  const library = publishedCourses(courses.filter(course => course.library));
  // Classes start from the CIC library; each class gets its own copy when it is created.
  // Without library courses (for example a fresh database), fall back to the instructor's own courses.
  const own = library.length ? [] : assignableCourses(courses.filter(course => !classes.some(group => group.courseId === course.id)));
  const available = [...library, ...own];
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [school, setSchool] = useState('');
  const [courseId, setCourseId] = useState(available[0]?.id || '');
  const [moduleIds, setModuleIds] = useState(available[0]?.modules.map(module => module.id) || []);
  const [error, setError] = useState('');
  const stepHeading = useRef<HTMLHeadingElement>(null);
  const attempt = useRef<{ group: ClassGroup; written: ClassGroup; source: Course; imported?: Course } | null>(null);
  const course = available.find(course => course.id === courseId);
  const selectedModules = course?.modules.filter(module => moduleIds.includes(module.id)) || [];
  const steps = ['Class details', 'Assign curriculum'];

  function move(next: number) {
    setStep(next);
    setError('');
    requestAnimationFrame(() => stepHeading.current?.focus());
  }

  function pickCourse(next: Course) {
    setCourseId(next.id);
    setModuleIds(next.modules.map(module => module.id));
    setError('');
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (step === 0 && (!name.trim() || !school.trim())) {
      setError('Enter a class name and school.');
      return;
    }
    if (step === 0) return move(1);
    if (!course || !selectedModules.length) {
      setError('Pick a course and at least one published module.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const previous = attempt.current;
      const retry = previous?.source.id === course.id ? previous : null;
      const source = retry?.source ?? courses.find(item => item.id === course.id) ?? course;
      let imported = retry?.imported;
      if (source.library && !imported) imported = await onImport(source);
      const target = imported ?? source;
      const chosen = selectedModules.map(module => module.id);
      const targetModules = imported ? copiedModuleIds(source, imported, chosen) : chosen;
      let joinCode = previous?.group.joinCode;
      if (!joinCode) {
        do { joinCode = id().slice(0, 6).toUpperCase(); } while (classes.some(group => group.joinCode === joinCode));
      }
      const group: ClassGroup = {
        id: previous?.group.id ?? id(), name: name.trim(), school: school.trim(),
        courseId: target.id, joinCode, moduleIds: targetModules, learners: [],
      };
      // Keep the same class on retry and remember module assignments that may have been written.
      const written = {
        ...group,
        moduleIds: [...new Set([...(previous?.written.moduleIds ?? []), ...targetModules])],
      };
      attempt.current = { group, written, source, imported };
      await onCreate(group, imported, previous?.written);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Could not create the class. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return <>
    <PageHeader title="Create a class" description="Assign curriculum, then share the class code with students." back={{ label: 'Classes', to: '#/classes' }} />
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
        {step === 1 && <div className="ic-stack ic-section-gap" inert={busy}>
          {!available.length ? <p>Publish a module in <a href="#/curriculum">Curriculum</a> before assigning it.</p> : <>
            {[['Global templates', library, 'This class gets its own copy, which you can edit from its Curriculum tab.'], ['Available class courses', own, '']].map(([label, group, hint]) => (group as Course[]).length > 0 &&
              <fieldset key={label as string} className="ic-course-pick"><legend>{label as string}</legend>
                {hint && <p className="ic-note">{hint as string}</p>}
                {(group as Course[]).map(option => <label key={option.id} className="ic-pick-card">
                  <input type="radio" name="course" checked={courseId === option.id} onChange={() => pickCourse(option)} />
                  <span className={"ic-class-mark" + (option.library ? " ic-library-mark" : "")} aria-hidden="true">{option.library ? <Library size={18} /> : <BookOpen size={18} />}</span>
                  <span><strong>{option.title}</strong>
                    {option.description && <span className="ic-note ic-clamp-2">{option.description}</span>}</span>
                </label>)}
              </fieldset>)}
            <fieldset><legend>Modules</legend><p className="ic-note">Students see assigned modules in this order.</p>
              {course?.modules.map(module => <label className="ic-checkbox" key={module.id}><input type="checkbox" checked={moduleIds.includes(module.id)} onChange={event => setModuleIds(ids => event.target.checked ? [...ids, module.id] : ids.filter(id => id !== module.id))} />{module.title}</label>)}
            </fieldset>
          </>}
        </div>}
        {error && <p className="ic-error" role="alert">{error}</p>}
        <div className="ic-form-footer">
          {step > 0 && <button type="button" className="ic-button" disabled={busy} onClick={() => move(step - 1)}>Back</button>}
          <button className="ic-button ic-primary" type="submit" disabled={busy}>{busy ? 'Creating class…' : step === 0 ? 'Choose curriculum' : 'Create class'} <ArrowRight size={16} /></button>
        </div>
      </form></Panel>
      <Panel title="Class summary"><dl className="ic-summary">
        <div><dt>Class</dt><dd>{name || '—'}</dd></div><div><dt>School</dt><dd>{school || '—'}</dd></div>
        <div><dt>Starting module</dt><dd>{step === 1 ? selectedModules[0]?.title || '—' : '—'}</dd></div>
      </dl></Panel>
    </div>
  </>;
}
