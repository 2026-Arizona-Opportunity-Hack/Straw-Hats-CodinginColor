import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { CicLibrary } from './CicLibrary';
import type { Activity, Course } from './model';

const deck = (title: string, patch: Partial<Activity> = {}): Activity => ({
  id: title, title, type: 'slides', url: 'https://docs.google.com/presentation/d/workshop/edit',
  markdown: '', questions: [], cicLibraryDeck: true, ...patch,
});
const course = (id: string, activities: Activity[], patch: Partial<Course> = {}): Course => ({
  id, title: 'Workshop curriculum', level: 'Beginner', description: '', published: true,
  modules: [
    { id: `${id}-m1`, title: 'Introduction', published: true, lessons: [{ id: `${id}-l1`, title: 'Getting started', activities }] },
    { id: `${id}-m2`, title: 'Draft', published: false, lessons: [{ id: `${id}-l2`, title: 'Draft', activities: [deck('Draft module deck')] }] },
  ],
  ...patch,
});

it('lists only curated Slides in published global curriculum with validated links', () => {
  const courses = [
    course('global', [
      deck('Workshop deck'),
      deck('Uncurated deck', { cicLibraryDeck: false }),
      deck('Video block', { type: 'video' }),
      deck('Unsafe deck', { url: 'javascript:alert(1)' }),
    ]),
    course('class-course', [deck('Class-only deck')], { local: true }),
    course('class-copy', [deck('Copied deck')], { copiedFrom: 'global' }),
    course('unpublished-course', [deck('Unpublished course deck')], { published: false }),
  ];
  const markup = renderToStaticMarkup(<CicLibrary courses={courses} />);
  expect(markup).toContain('Workshop deck');
  expect(markup).toContain('https://docs.google.com/presentation/d/workshop/preview');
  expect(markup).toContain('#/curriculum/global/view/global-l1');
  for (const title of ['Uncurated deck', 'Video block', 'Unsafe deck', 'Class-only deck', 'Copied deck', 'Unpublished course deck', 'Draft module deck']) {
    expect(markup).not.toContain(title);
  }
});

it('shows an empty state when nobody has curated a published deck', () => {
  expect(renderToStaticMarkup(<CicLibrary courses={[]} />)).toContain('No curated slide decks yet.');
});
