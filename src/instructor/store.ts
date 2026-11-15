import { BuilderDemo, demoData, LibraryDemo } from './demoData';
import { normalizeAssignment, type Assignment } from './assignments/model';
import type { ClassGroup, Course, InstructorData, Module, ModuleAction } from './model';

const storeKey = 'cic-learn.instructor-preview.v1';
const liveDraftKey = (author: string) => 'cic-learn.course-drafts.v1:' + author;

export function loadCourseDrafts(author: string): Record<string, Course> {
  try { return JSON.parse(localStorage.getItem(liveDraftKey(author)) || '{}') ?? {}; }
  catch { return {}; }
}

export function saveCourseDraft(author: string, course: Course) {
  const drafts = loadCourseDrafts(author);
  localStorage.setItem(liveDraftKey(author), JSON.stringify({ ...drafts, [course.id]: course }));
}

export interface InstructorStore {
  load(): InstructorData;
  /**
   * Persist `data`. Synchronous stores throw on failure; async stores (Supabase) return a
   * promise and report failures through it. `previous` lets a store write only what changed.
   */
  save(data: InstructorData, previous: InstructorData): void | Promise<void>;
  /** Save a roster change without discarding the caller's draft on failure. */
  saveClass?(group: ClassGroup, previous?: ClassGroup, attempted?: ClassGroup): Promise<void>;
  publishCourse?(course: Course, previous: Course | undefined, moduleId: string, expectedRevision: number | undefined):
    Promise<{ revision: number; assessmentWarning?: string; released?: Module }>;
  manageModule?(courseId: string, moduleId: string, expectedRevision: number, action: ModuleAction): Promise<number>;
  addToLibrary?(courseId: string): Promise<void>;
  /**
   * Copies a library course into a course the signed-in person owns and returns the copy.
   * Without it (browser preview) the workspace copies the course itself and saves it.
   */
  importCourse?(source: Course): Promise<Course>;
}

export const browserInstructorStore: InstructorStore = {
  load() {
    try {
      const saved = JSON.parse(localStorage.getItem(storeKey) || 'null');
      if (Array.isArray(saved?.classes) && Array.isArray(saved?.courses)) {
        // Older saves predate these demo courses; add them.
        const courses = [BuilderDemo, LibraryDemo].reduce((list: Course[], demo) =>
          list.some(course => course?.id === demo.id) ? list : [...list, structuredClone(demo)], saved.courses);
        return {
          ...saved, courses,
          staff: Array.isArray(saved.staff) && saved.staff.length ? saved.staff : structuredClone(demoData.staff),
          // Data saved before assignments existed: start from the demo set for demo classes.
          classes: saved.classes.map((group: ClassGroup) => Array.isArray(group.assignments)
            // Older saves stored one fixed type per assignment; convert those to blocks.
            ? { ...group, assignments: group.assignments.map(a => normalizeAssignment(a as Assignment & Record<string, unknown>)), submissions: (group.submissions ?? []).map(sub => ({ ...sub, rubricScores: sub.rubricScores ?? {} })) }
            : {
              ...group,
              assignments: structuredClone(demoData.classes.find(demo => demo.id === group.id)?.assignments ?? []),
              submissions: structuredClone(demoData.classes.find(demo => demo.id === group.id)?.submissions ?? []),
            }),
        };
      }
    } catch {
      // Fall back to the demo when browser storage is unavailable.
    }
    return structuredClone(demoData);
  },
  save(data) {
    localStorage.setItem(storeKey, JSON.stringify(data));
  },
};
