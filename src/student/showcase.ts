// Owner: Jacky. Courses CIC plans to offer, shown in Explore as "Coming soon" so students see the
// full range. They can be previewed but not added. Real courses come from the database and
// replace a showcase entry with the same title as soon as they are published.
import type { CatalogCourse } from '../api/student/index.ts'

export const SHOWCASE: CatalogCourse[] = [
  { id: 'showcase-js', title: 'JavaScript Basics', description: 'Make web pages respond to people: clicks, inputs and your first interactive app.', level: 'beginner', delivery_mode: 'self_paced' },
  { id: 'showcase-html', title: 'HTML: Your First Web Page', description: 'Structure a page with headings, images and links, then publish it.', level: 'beginner', delivery_mode: 'self_paced' },
  { id: 'showcase-css', title: 'CSS: Make It Beautiful', description: 'Colour, layout and fonts that make a page look like yours.', level: 'beginner', delivery_mode: 'self_paced' },
  { id: 'showcase-data', title: 'Data Stories with Python', description: 'Clean, chart and explain real data sets about your community.', level: 'intermediate', delivery_mode: 'self_paced' },
  { id: 'showcase-java', title: 'Java Foundations', description: 'Classes, objects and problem solving in a language used across the industry.', level: 'intermediate', delivery_mode: 'self_paced' },
  { id: 'showcase-sql', title: 'SQL: Ask Data Questions', description: 'Query real databases to answer questions about sports, music and more.', level: 'intermediate', delivery_mode: 'self_paced' },
  { id: 'showcase-ai', title: 'AI Projects', description: 'Train a small model, test it for fairness, and present what it learned.', level: 'intermediate', delivery_mode: 'instructor_led' },
  { id: 'showcase-cpp', title: 'C++ Problem Solving', description: 'Speed and logic: algorithms and puzzles from coding competitions.', level: 'advanced', delivery_mode: 'self_paced' },
  { id: 'showcase-webapps', title: 'Web Apps with JavaScript', description: 'Fetch data, build components and ship a working app with your class.', level: 'advanced', delivery_mode: 'instructor_led' },
]

export const isShowcase = (id: string) => id.startsWith('showcase-')

/** Real published courses plus the showcase ones nobody has published yet (matched by title). */
export function withShowcase(catalog: CatalogCourse[]): CatalogCourse[] {
  const titles = new Set(catalog.map((c) => c.title.toLowerCase()))
  return [...catalog, ...SHOWCASE.filter((c) => !titles.has(c.title.toLowerCase()))]
}
