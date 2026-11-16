import { useRef, useState } from 'react';
import { ArrowRight, BookOpen, Check, Library } from 'lucide-react';
import { copiedModuleIds } from './classCurriculum';
import type { ClassGroup, Course, CurriculumSchool, SchoolCurriculum } from './model';
import { assignableCourses, id, publishedCourses } from './model';
import type { SchoolClassRequest } from './store';
import { PageHeader, Panel } from './ui';

export function ClassSetup({ courses, classes, schools = [], schoolCurricula = [], onCreate, onImport, onCreateForSchool }: {
  courses: Course[]; classes: ClassGroup[];
  schools?: CurriculumSchool[]; schoolCurricula?: SchoolCurriculum[];
  onCreate: (group: ClassGroup, imported?: Course, attempted?: ClassGroup) => Promise<void>;
  onImport: (source: Course) => Promise<Course>;
  onCreateForSchool: (request: SchoolClassRequest) => Promise<void>;
}) {
  const library = publishedCourses(courses.filter(course => course.library));
  // Keep shared school templates out of the unlinked school's "available" fallback.
  const own = library.length ? [] : assignableCourses(courses.filter(course =>
    !classes.some(group => group.courseId === course.id) && !schoolCurricula.some(template => template.courseId === course.id)));
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [school, setSchool] = useState('');
  const [schoolId, setSchoolId] = useState(schools.length === 1 ? schools[0].id : '');
  const [courseId, setCourseId] = useState('');
  const [moduleIds, setModuleIds] = useState<string[]>([]);
  const [error, setError] = useState('');
  const stepHeading = useRef<HTMLHeadingElement>(null);
  const attempt = useRef<{ group: ClassGroup; written: ClassGroup; source: Course; imported?: Course } | null>(null);
  const schoolAttempt = useRef<SchoolClassRequest | null>(null);
  const selectedSchool = schools.find(option => option.id === schoolId);
  const schoolName = selectedSchool?.name ?? school.trim();
  const templates = schoolCurricula.filter(template => template.schoolId === selectedSchool?.id);
  const schoolCourses = publishedCourses(courses.filter(course => templates.some(template => template.courseId === course.id)));
  const available = [...schoolCourses, ...library, ...(selectedSchool ? [] : own)];
  const course = available.find(course => course.id === courseId);
  const originalId = templates.find(template => template.courseId === courseId)?.globalCourseId;
  const original = library.find(option => option.id === originalId);
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

  function makeJoinCode() {
    let code: string;
    do { code = id().slice(0, 6).toUpperCase(); } while (classes.some(group => group.joinCode === code));
    return code;
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (step === 0 && (!name.trim() || !schoolName)) {
      setError('Enter a class name and school.');
      return;
    }
    if (step === 0) {
      const initial = available.find(option => option.id === courseId) ?? available[0];
      if (initial?.id !== courseId && initial) pickCourse(initial);
      return move(1);
    }
    if (!course || !selectedModules.length) {
      setError('Pick a course and at least one published module.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const chosen = selectedModules.map(module => module.id);
      if (selectedSchool) {
        const previous = schoolAttempt.current;
        const source = courses.find(item => item.id === course.id) ?? course;
        const existing = previous?.schoolId === selectedSchool.id && previous.name === name.trim()
          && previous.source.id === source.id && previous.source.publicationRevision === source.publicationRevision
          && previous.moduleIds.join() === chosen.join();
        const request = existing ? previous : {
          id: id(), schoolId: selectedSchool.id, name: name.trim(), joinCode: makeJoinCode(), source, moduleIds: chosen,
        };
        schoolAttempt.current = request;
        await onCreateForSchool(request);
        return;
      }
      const previous = attempt.current;
      const retry = previous?.source.id === course.id ? previous : null;
      const source = retry?.source ?? courses.find(item => item.id === course.id) ?? course;
      let imported = retry?.imported;
      if (source.library && !imported) imported = await onImport(source);
      const target = imported ?? source;
      const targetModules = imported ? copiedModuleIds(source, imported, chosen) : chosen;
      const group: ClassGroup = {
        id: previous?.group.id ?? id(), name: name.trim(), school: schoolName,
        courseId: target.id, joinCode: previous?.group.joinCode ?? makeJoinCode(), moduleIds: targetModules, learners: [],
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
          {schools.length > 0 && <label>School<select required value={schoolId} onChange={event => {
            setSchoolId(event.target.value);
            setCourseId('');
          }}>
            <option value="">Choose a school</option>
            {schools.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
            <option value="other">Other school</option>
          </select></label>}
          {(!schools.length || schoolId === 'other') && <label>{schools.length ? 'School name' : 'School'}
            <input required maxLength={100} placeholder="e.g. Maryvale High School" value={school} onChange={event => setSchool(event.target.value)} />
          </label>}
        </div>}
        {step === 1 && <div className="ic-stack ic-section-gap" inert={busy}>
          {!available.length ? <p>Publish a module in <a href="#/curriculum">Curriculum</a> before assigning it.</p> : <>
            {[
              { label: 'School templates', options: schoolCourses },
              { label: 'Global templates', options: library },
              { label: 'Available class courses', options: selectedSchool ? [] : own },
            ].map(({ label, options }) => options.length > 0 &&
              <fieldset key={label} className="ic-course-pick"><legend>{label}</legend>
                {options.map(option => <label key={option.id} className="ic-pick-card">
                  <input type="radio" name="course" checked={courseId === option.id} onChange={() => pickCourse(option)} />
                  <span className={"ic-class-mark" + (option.library ? " ic-library-mark" : "")} aria-hidden="true">{option.library ? <Library size={18} /> : <BookOpen size={18} />}</span>
                  <span><strong>{option.title}</strong>
                    {option.description && <span className="ic-note ic-clamp-2">{option.description}</span>}</span>
                </label>)}
              </fieldset>)}
            {original && <div><button type="button" className="ic-button" onClick={() => pickCourse(original)}>
              Use global original
            </button></div>}
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
        <div><dt>Class</dt><dd>{name || '—'}</dd></div><div><dt>School</dt><dd>{schoolName || '—'}</dd></div>
        <div><dt>Starting module</dt><dd>{step === 1 ? selectedModules[0]?.title || '—' : '—'}</dd></div>
      </dl></Panel>
    </div>
  </>;
}
