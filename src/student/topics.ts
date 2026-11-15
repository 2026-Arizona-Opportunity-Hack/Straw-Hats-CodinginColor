// Owner: Jacky. Topics shown on the student home page.
// A topic with `courseId` shows that course's real modules (from src/api/student).
// A topic without one shows its outline as "coming soon" until an instructor publishes it.
import type { CourseLevel } from '../shared/types/db.ts'

export interface Topic {
  id: string
  title: string
  description: string
  /** Short code-style mark drawn in the topic's tile. */
  glyph: string
  level: CourseLevel
  courseId?: string
  /** Lesson titles shown before the real course exists. */
  outline: string[]
}

export const TOPICS: Topic[] = [
  {
    id: 'python',
    title: 'Intro to Python',
    description: 'Write your first programs: store values, make decisions and repeat steps.',
    glyph: '>>>',
    level: 'beginner',
    courseId: 'course-intro-python',
    outline: ['Variables', 'Loops', 'Conditionals', 'Functions', 'Lists'],
  },
  {
    id: 'html-css',
    title: 'Web pages with HTML & CSS',
    description: 'Build a real web page, then style it with colors, fonts and layout.',
    glyph: '</>',
    level: 'beginner',
    outline: ['Tags and page structure', 'Text, links and images', 'Styling with CSS', 'Layout with boxes', 'Publish your page'],
  },
  {
    id: 'javascript',
    title: 'Intro to JavaScript',
    description: 'Make web pages respond to clicks and typing, and build a small game.',
    glyph: '{ }',
    level: 'intermediate',
    outline: ['Variables and values', 'Functions', 'Events and clicks', 'Changing the page', 'Mini game project'],
  },
  {
    id: 'ai-basics',
    title: 'AI Basics',
    description: 'What AI is, how it learns from data, and how to use it responsibly.',
    glyph: 'AI',
    level: 'beginner',
    courseId: 'course-ai-basics',
    outline: ['What is AI?', 'How machines learn', 'Bias and fairness', 'Using AI tools well'],
  },
  {
    id: 'java',
    title: 'Java Foundations',
    description: 'Classes, objects and methods: the language used in AP Computer Science A.',
    glyph: 'J',
    level: 'advanced',
    outline: ['Your first Java program', 'Data types', 'Methods', 'Classes and objects', 'Arrays'],
  },
  {
    id: 'data-science',
    title: 'Data Science',
    description: 'Collect data, find patterns and turn numbers into charts that tell a story.',
    glyph: 'Σ',
    level: 'intermediate',
    outline: ['Asking questions with data', 'Cleaning a dataset', 'Averages and spread', 'Making charts', 'Data story project'],
  },
]
