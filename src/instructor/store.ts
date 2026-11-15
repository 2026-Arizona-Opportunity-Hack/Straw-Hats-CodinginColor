import { demoData } from './demoData';
import { normalizeAssignment, type Assignment } from './assignments/model';
import type { ClassGroup, InstructorData } from './model';

const storeKey = 'cic-learn.instructor-preview.v1';

export interface InstructorStore {
  load(): InstructorData;
  /**
   * Persist `data`. Synchronous stores throw on failure; async stores (Supabase) return a
   * promise and report failures through it. `previous` lets a store write only what changed.
   */
  save(data: InstructorData, previous: InstructorData): void | Promise<void>;
}

export const browserInstructorStore: InstructorStore = {
  load() {
    try {
      const saved = JSON.parse(localStorage.getItem(storeKey) || 'null');
      if (Array.isArray(saved?.classes) && Array.isArray(saved?.courses)) {
        return {
          ...saved,
          staff: Array.isArray(saved.staff) && saved.staff.length ? saved.staff : structuredClone(demoData.staff),
          // Data saved before assignments existed: start from the demo set for demo classes.
          classes: saved.classes.map((group: ClassGroup) => Array.isArray(group.assignments)
            // Older saves stored one fixed type per assignment; convert those to blocks.
            ? { ...group, assignments: group.assignments.map(a => normalizeAssignment(a as Assignment & Record<string, unknown>)), submissions: group.submissions ?? [] }
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
