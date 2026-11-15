import { useState } from 'react';
import { Download, Library } from 'lucide-react';
import type { Course } from './model';

/**
 * Lists preloaded library courses. Import makes the instructor's own editable copy;
 * the library course itself never changes.
 */
export function LibraryImport({ courses, onImport, onImported, headingLevel = 3 }: {
  courses: Course[];
  onImport: (source: Course) => Promise<Course | void>;
  onImported?: (copy: Course) => void;
  headingLevel?: 2 | 3;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const library = courses.filter(course => course.library);
  if (!library.length) return null;
  const Heading = headingLevel === 2 ? 'h2' : 'h3';

  async function importCourse(source: Course) {
    setBusy(source.id);
    setStatus(`Importing ${source.title}…`);
    setError('');
    try {
      const copy = await onImport(source);
      setStatus(`Imported ${source.title}. You can change it any time in Curriculum.`);
      if (copy) onImported?.(copy);
    } catch (problem) {
      setStatus('');
      setError(problem instanceof Error ? problem.message : 'Could not import that course.');
    } finally {
      setBusy(null);
    }
  }

  return <section className="ic-library" aria-labelledby="ic-library-heading">
    <Heading id="ic-library-heading"><Library size={18} aria-hidden="true" /> Import from library</Heading>
    <p className="ic-note">Start from a ready-made course. Use it as is or change it to fit your class.</p>
    <ul className="ic-stack">
      {library.map(course => {
        const modules = course.modules.filter(module => module.published).length;
        return <li className="ic-course-row" key={course.id}>
          <div className="ic-class-mark"><Library size={19} aria-hidden="true" /></div>
          <div><strong>{course.title}</strong>
            {course.description && <p>{course.description}</p>}
            <span className="ic-note">{course.level} · {modules} {modules === 1 ? 'module' : 'modules'}</span>
          </div>
          <button type="button" className="ic-button" disabled={busy !== null} aria-label={`Import ${course.title}`} onClick={() => void importCourse(course)}>
            <Download size={15} aria-hidden="true" /> {busy === course.id ? 'Importing…' : 'Import'}
          </button>
        </li>;
      })}
    </ul>
    <div role="status">{status && <p className="ic-success">{status}</p>}</div>
    {error && <p className="ic-error" role="alert">{error}</p>}
  </section>;
}
