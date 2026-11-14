import { demoData } from './demoData';
import type { ClassGroup, InstructorData } from './model';

const storeKey = 'cic-learn.instructor-preview.v1';

export interface InstructorStore {
  load(): InstructorData;
  save(data: InstructorData): void;
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
          classes: saved.classes.map((group: ClassGroup) => Array.isArray(group.assignments) ? group : {
            ...group, assignments: structuredClone(demoData.classes.find(demo => demo.id === group.id)?.assignments ?? []),
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
