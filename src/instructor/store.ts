import { BuilderDemo, demoData } from './demoData';
import { normalizeAssignment, type Assignment } from './assignments/model';
import type { ClassGroup, Course, InstructorData } from './model';

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
  publishCourse?(course: Course, previous: Course | undefined, moduleId: string, expectedRevision: number | undefined): Promise<number>;
}

export const browserInstructorStore: InstructorStore = {
  load() {
    try {
      const saved = JSON.parse(localStorage.getItem(storeKey) || 'null');
      if (Array.isArray(saved?.classes) && Array.isArray(saved?.courses)) {
        const courses = saved.courses.some((course: { id?: string }) => course?.id === BuilderDemo.id)
          ? saved.courses : [...saved.courses, structuredClone(BuilderDemo)];
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
