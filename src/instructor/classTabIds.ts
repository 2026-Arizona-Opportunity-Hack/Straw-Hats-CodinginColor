export const classTabs = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'curriculum', label: 'Curriculum' },
  { id: 'assignments', label: 'Assignments' },
  { id: 'grades', label: 'Grades' },
  { id: 'roster', label: 'Roster' },
] as const;

export type ClassTabId = typeof classTabs[number]['id'];

export function isClassTab(value: string | undefined): value is ClassTabId {
  return classTabs.some(tab => tab.id === value);
}
