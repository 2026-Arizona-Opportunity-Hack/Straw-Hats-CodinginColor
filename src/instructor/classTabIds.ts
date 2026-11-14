export const classTabs = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'modules', label: 'Modules' },
  { id: 'grades', label: 'Grades' },
  { id: 'assignments', label: 'Assignments' },
  { id: 'curriculum', label: 'Curriculum' },
  { id: 'syllabus', label: 'Syllabus' },
] as const;

export type ClassTabId = typeof classTabs[number]['id'];

export function isClassTab(value: string | undefined): value is ClassTabId {
  return classTabs.some(tab => tab.id === value);
}
