import { ArrowRight, ExternalLink, Presentation } from 'lucide-react';
import { slidesUrl, type Course } from './model';
import { Empty, PageHeader, Panel } from './ui';

type LibraryCourse = Course & { local?: boolean };

function libraryDecks(courses: LibraryCourse[]) {
  return courses.filter(course => !course.local && !course.copiedFrom && course.published !== false).flatMap(course =>
    course.modules.filter(module => module.published).flatMap(module => module.lessons.flatMap(lesson =>
      lesson.activities.filter(block => block.type === 'slides' && block.cicLibraryDeck === true).flatMap(block => {
        const url = slidesUrl(block.url);
        return url ? [{ course, module, lesson, block, url }] : [];
      }),
    )),
  );
}

export function CicLibrary({ courses }: { courses: LibraryCourse[] }) {
  const decks = libraryDecks(courses);
  return <>
    <PageHeader title="CIC Library" description="Slide decks curated by Coding in Color for workshops and schools." />
    {decks.length ? <div className="ic-stack">
      {decks.map(({ course, module, lesson, block, url }) => <article className="ic-panel ic-course-row" key={block.id}>
        <div className="ic-class-mark ic-library-mark"><Presentation size={21} aria-hidden="true" /></div>
        <div>
          <h2>{block.title}</h2>
          <p className="ic-note">{course.title} · {module.title} · {lesson.title}</p>
        </div>
        <div className="ic-row">
          <a className="ic-button" href={url} target="_blank" rel="noreferrer" aria-label={`Open deck ${block.title}`}>
            <ExternalLink size={16} aria-hidden="true" /> Open deck
          </a>
          <a className="ic-button" href={`#/curriculum/${course.id}/view/${lesson.id}`} aria-label={`View ${block.title} in Curriculum`}>
            View in Curriculum <ArrowRight size={16} aria-hidden="true" />
          </a>
        </div>
      </article>)}
    </div> : <Panel><Empty>No curated slide decks yet.</Empty></Panel>}
  </>;
}
