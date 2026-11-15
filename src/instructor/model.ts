import type { Submission } from './assignments/grading';
import type { Assignment } from './assignments/model';

export const activityTypes = {
  content: 'Article',
  video: 'Video',
  slides: 'Slides',
  check: 'Knowledge check',
  worksheet: 'Worksheet',
  code: 'Code exercise',
  exit: 'Exit question',
  pretest: 'Pretest',
  posttest: 'Post-test',
} as const;

export type ActivityType = keyof typeof activityTypes;
export type Question = { prompt: string; choices: string[]; answer: number | null; concept: string };
export type Activity = {
  id: string;
  type: ActivityType;
  title: string;
  markdown: string;
  url: string;
  questions: Question[];
  code?: { starter: string; tests: string; solution: string };
  format?: 'open-ended';
};
export type Lesson = { id: string; title: string; activities: Activity[] };
export type Module = { id: string; title: string; published: boolean; lessons: Lesson[] };
export type Course = { id: string; title: string; description: string; level: string; modules: Module[] };
export type Attempt = {
  activityId: string;
  score: number | null;
  minutes: number;
  count: number;
  submitted: boolean;
  response?: string;
  conceptScores?: Record<string, number>;
};
export type Learner = {
  id: string;
  name: string;
  passcode: string;
  baseline: number | null;
  attempts: Attempt[];
  hints: { concept: string; text: string }[];
  lastActive: string | null;
};
export type ClassGroup = {
  id: string;
  name: string;
  school: string;
  courseId: string;
  moduleIds: string[];
  joinCode: string;
  learners: Learner[];
  /** Class-level assignments (quizzes, links, pages, written, code). */
  assignments?: Assignment[];
  /** Student work on those assignments, with the instructor's grades. */
  submissions?: Submission[];
};
export type StaffRole = 'instructor' | 'admin' | 'reviewer';
export type StaffProfile = { id: string; name: string; role: StaffRole; classIds: string[] };
export type InstructorData = { courses: Course[]; classes: ClassGroup[]; staff: StaffProfile[] };

export const id = () => globalThis.crypto.randomUUID();
export const blankQuestion = (): Question => ({ prompt: '', choices: [], answer: null, concept: '' });
export const questionTypes = new Set<ActivityType>(['check', 'worksheet', 'exit', 'pretest', 'posttest']);
export const gradedTypes = new Set<ActivityType>(['check', 'pretest', 'posttest']);

export function newActivity(type: ActivityType = 'content'): Activity {
  return { id: id(), type, title: activityTypes[type], markdown: '', url: '', questions: questionTypes.has(type) ? [blankQuestion()] : [] };
}

export function newLesson(title = 'New lesson'): Lesson {
  return { id: id(), title, activities: [] };
}

export function newModule(title = 'New module'): Module {
  return { id: id(), title, published: false, lessons: [newLesson()] };
}

export function reorder<T>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return items;
  const copy = [...items];
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
}

export function publishedCourses(courses: Course[]) {
  return courses.map(course => ({ ...course, modules: course.modules.filter(module => module.published) })).filter(course => course.modules.length);
}

export function unresolvedModuleContent(module: Module): string | null {
  if (!module.title.trim() || !module.lessons.length) return 'Add a module title and at least one lesson.';
  for (const lesson of module.lessons) {
    if (!lesson.title.trim() || !lesson.activities.length) return 'Give each lesson a title and at least one activity.';
    for (const activity of lesson.activities) {
      if (!activity.title.trim()) return 'Give each activity a title.';
      if (activity.type === 'video' && !embedUrl(activity.url)) return 'Add a valid YouTube, Vimeo, or Google Drive link to each video.';
      if (activity.type === 'slides' && !slidesUrl(activity.url)) return 'Add a valid Google Slides or Google Drive link to each slide deck.';
      if (questionTypes.has(activity.type) && (!activity.questions.length || activity.questions.some(q => !q.prompt.trim()))) {
        return 'Add a prompt to each question or worksheet field.';
      }
      if (gradedTypes.has(activity.type)) {
        if (activity.questions.some(q => q.choices.filter(choice => choice.trim()).length < 2 || q.answer === null || !q.choices[q.answer]?.trim())) {
          return 'Give assessment questions at least two choices and mark a correct answer.';
        }
      }
      if ((activity.type === 'content' || activity.type === 'code') && !activity.markdown.trim()) return 'Fill in each article and coding exercise.';
    }
  }
  return null;
}

export function embedUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return null;
    const host = url.hostname.replace(/^www\./, '');
    const segments = url.pathname.split('/').filter(Boolean);
    if (['youtube.com', 'm.youtube.com', 'youtu.be', 'youtube-nocookie.com'].includes(host)) {
      const video = host === 'youtu.be' ? segments[0] : url.searchParams.get('v') || segments[1];
      return video && /^[\w-]{11}$/.test(video) ? 'https://www.youtube-nocookie.com/embed/' + video : null;
    }
    if (host === 'vimeo.com' || host === 'player.vimeo.com') {
      const video = segments.at(-1);
      return video && /^\d+$/.test(video) ? 'https://player.vimeo.com/video/' + video : null;
    }
    if (host === 'drive.google.com' && segments[0] === 'file' && segments[1] === 'd' && /^[\w-]+$/.test(segments[2] || '')) {
      return 'https://drive.google.com/file/d/' + segments[2] + '/preview';
    }
  } catch {
    return null;
  }
  return null;
}

export function slidesUrl(value: string) {
  try {
    const url = new URL(value);
    const path = url.pathname.match(/^\/presentation\/d\/(e\/)?([\w-]+)(?:\/|$)/);
    if (url.protocol === 'https:' && url.hostname === 'docs.google.com' && path) {
      return 'https://docs.google.com/presentation/d/' + (path[1] || '') + path[2] + (path[1] ? '/embed' : '/preview');
    }
    return url.hostname === 'drive.google.com' ? embedUrl(value) : null;
  } catch {
    return null;
  }
}

export function makeLearners(names: string[], existing: Learner[] = []): Learner[] {
  const passcodes = new Set(existing.map(learner => learner.passcode));
  return names.map(name => {
    let passcode: string;
    do {
      const random = new Uint32Array(1);
      crypto.getRandomValues(random);
      passcode = String(100000 + random[0] % 900000);
    } while (passcodes.has(passcode));
    passcodes.add(passcode);
    return { id: id(), name, passcode, baseline: null, attempts: [], hints: [], lastActive: null };
  });
}
