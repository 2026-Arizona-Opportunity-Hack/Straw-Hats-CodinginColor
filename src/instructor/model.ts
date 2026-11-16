import { validLessonFigure, type LessonFigure } from '../shared/curriculum/figure.ts';
import type { CodingLabSettings, InteractiveHtmlPayload } from '../shared/types/activities.ts';
import type { Submission } from './assignments/grading';
import type { Assignment } from './assignments/model';
import type { StaffModuleProgress } from '../shared/staffProgress';

export const activityTypes = {
  content: 'Article',
  video: 'Video',
  slides: 'Slides',
  interactive_html: 'Custom HTML',
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
  code?: { starter: string; tests: string; solution: string; lab?: CodingLabSettings };
  format?: 'open-ended';
  presentation?: 'cic-article';
  figure?: LessonFigure;
  discussionEnabled?: boolean;
  cicLibraryDeck?: boolean;
  interactiveHtml?: InteractiveHtmlPayload;
};
export type Lesson = { id: string; title: string; activities: Activity[]; htmlFirst?: boolean };
export type Module = {
  id: string; title: string; published: boolean; revision?: number; lessons: Lesson[];
  archived?: boolean;
  /** Stored order on a live course. Visible modules may omit drafts and leave gaps. */
  position?: number;
};
export type ModuleAction = 'archive' | 'delete';
export type Course = {
  id: string; title: string; description: string; level: string; modules: Module[];
  published?: boolean;
  publicationRevision?: number;
  /** Template that instructors can copy for a class. */
  library?: boolean;
  /** Listed in the staff-facing CIC Library. */
  libraryListed?: boolean;
  /** The library course this one was copied from. */
  copiedFrom?: string;
  /** A class-local course remains local even after its source or last class is removed. */
  local?: boolean;
};
export type SavedAnswer = { prompt: string; value: string; code?: boolean };
export type Attempt = {
  activityId: string;
  score: number | null;
  minutes: number;
  count: number;
  submitted: boolean;
  response?: string | SavedAnswer[];
  /** Latest saved response can be a practice try, distinct from the counted score. */
  responseAttempt?: number;
  scoreAttempt?: number;
  conceptScores?: Record<string, number>;
};
export type Learner = {
  /** Canonical state attached for reporting after the selected class loads. */
  moduleProgress?: StaffModuleProgress[];
  /** Auth profile linked to the roster row, which has its own ID. */
  profileId?: string;
  id: string;
  name: string;
  passcode: string;
  baseline: number | null;
  attempts: Attempt[];
  hints: { concept: string; text: string }[];
  lastActive: string | null;
};
/** CIC-wide thresholds from the program_settings table (migration 2006). */
export type ProgramSettings = {
  /** More than this many days without submitted work counts as inactive. */
  inactiveDays: number;
  /** A graded assignment under this percentage is a low score. */
  lowScorePct: number;
};
/**
 * The rules one class works by, from class_module_settings and program_settings (migration 2006).
 * Keyed by module id; pass marks are 0-100 like every score in the workspace.
 */
export type ClassRules = ProgramSettings & {
  passMark: Record<string, number>;
  maxTries: Record<string, number>;
};
export type ClassGroup = {
  id: string;
  name: string;
  school: string;
  schoolId?: string;
  archivedAt?: string;
  courseId: string;
  moduleIds: string[];
  /** Released module scope for reports; assignment editing still uses moduleIds. */
  progressModuleIds?: string[];
  joinCode: string;
  learners: Learner[];
  /** Class-level assignments (quizzes, links, pages, written, code). */
  assignments?: Assignment[];
  /** Student work on those assignments, with the instructor's grades. */
  submissions?: Submission[];
  /**
   * Loaded from the database with the class. Missing only on a class created in this browser
   * and not reloaded yet; progress numbers that need a rule then show as not assessed.
   */
  rules?: ClassRules;
};
export type StaffRole = 'instructor' | 'admin' | 'reviewer';
export type StaffProfile = { id: string; name: string; role: StaffRole; classIds: string[] };
export type CurriculumSchool = { id: string; name: string };
export type SchoolCurriculum = { schoolId: string; courseId: string; globalCourseId: string };
export type CurriculumSnapshot = {
  id: string; classId?: string; className: string; schoolId?: string; schoolName: string;
  classCreatedAt: string; archivedAt: string; courseTitle: string; moduleCount: number;
  course?: Course;
};
export type InstructorData = {
  courses: Course[];
  classes: ClassGroup[];
  staff: StaffProfile[];
  /** From program_settings when loaded from Supabase. */
  settings?: ProgramSettings;
  courseDrafts?: Record<string, Course>;
  savedBlocks?: Record<string, Activity[]>;
  schools?: CurriculumSchool[];
  schoolCurricula?: SchoolCurriculum[];
  curriculumSnapshots?: CurriculumSnapshot[];
};

export function copyBlock(block: Activity): Activity {
  return { ...structuredClone(block), id: id() };
}

/** An editable copy of a library course with new ids, so edits never touch the library. */
export function copyCourse(source: Course): Course {
  const course = structuredClone(source);
  delete course.library;
  delete course.libraryListed;
  return {
    ...course, id: id(), copiedFrom: source.id, local: true,
    modules: course.modules.map(module => ({
      ...module, id: id(), revision: undefined,
      lessons: module.lessons.map(lesson => ({ ...lesson, id: id(), activities: lesson.activities.map(copyBlock) })),
    })),
  };
}

/** Courses an instructor can assign to a class: their own published modules, never the library itself. */
export function assignableCourses(courses: Course[]) {
  return publishedCourses(courses.filter(course => !course.library));
}

// Replace only the selected release. Draft changes in other modules stay private.
export function publishModule(catalog: Course, draft: Course, selected: Module): Course {
  const releases = new Map(catalog.modules.map(module => [module.id, module]));
  const previous = releases.get(selected.id);
  const revision = (previous?.revision ?? (previous?.published ? 1 : 0)) + 1;
  releases.set(selected.id, { ...structuredClone(selected), published: true, archived: false, revision });
  const ids = new Set([...draft.modules.map(module => module.id), ...releases.keys()]);
  const modules = [...ids].flatMap(id => releases.get(id) ?? []);
  return { ...draft, libraryListed: catalog.libraryListed || draft.libraryListed, modules };
}

export function changeModuleState(course: Course, moduleId: string, action: ModuleAction): Course {
  const modules = action === 'archive'
    ? course.modules.map(module => module.id === moduleId ? { ...module, published: false, archived: true } : module)
    : course.modules.filter(module => module.id !== moduleId).map((module, index) =>
      module.position === undefined ? module : { ...module, position: index + 1 });
  return { ...course, modules };
}

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
      if (activity.type === 'interactive_html' && (!activity.interactiveHtml?.html.trim() || new TextEncoder().encode(activity.interactiveHtml.html).length > 256 * 1024)) {
        return 'Add HTML source up to 256 KB to each Custom HTML block.';
      }
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
      if (activity.type === 'code' && activity.code?.lab) {
        const { starter, lab } = activity.code;
        if (starter.length > 48_000 || (lab.starterCss?.length ?? 0) > 48_000) return 'Starter files must be at most 48,000 characters.';
        if (lab.checks.some(check => !check.name.trim() || (lab.language === 'web' && check.kind !== 'stylesheet' && !check.selector?.trim()))) {
          return 'Name each lab check and provide a selector for each HTML/CSS check.';
        }
      }
      if (activity.type === 'content' && activity.figure) {
        if (!validLessonFigure(activity.figure)) return 'Give each lesson image a valid image description and annotations.';
        continue;
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
