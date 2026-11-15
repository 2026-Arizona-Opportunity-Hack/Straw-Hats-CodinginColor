import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import type { StaffModuleProgress } from '../shared/staffProgress';
import { DashboardTab } from './ClassTabs';
import type { ClassGroup, Course } from './model';
import { assignedModules, classProgress } from './progress';

vi.mock('../shared/supabase', () => ({ supabase: null, isMockMode: true, isLocalDemo: true }));

const course: Course = { id: 'c', title: 'Course', description: '', level: 'Beginner', modules: [
  { id: 'm', title: 'First', published: true, lessons: [{ id: 'l', title: 'Lesson', activities: [
    { id: 'pre', title: 'Pretest', type: 'pretest', markdown: '', url: '', questions: [] },
    { id: 'post', title: 'Post-test', type: 'posttest', markdown: '', url: '', questions: [] },
  ] }] }, { id: 'future', title: 'Future', published: true, lessons: [] },
] };
const state = (patch: Partial<StaffModuleProgress> = {}): StaffModuleProgress => ({
  student_id: 'p', class_id: 'k', course_id: 'c', module_id: 'm', state: 'completed', tested_out: true,
  required_count: 2, done_count: 1, pretest_score: 0.9, posttest_best: null, ...patch,
});
const group = (progress: StaffModuleProgress[]): ClassGroup => ({
  id: 'k', name: 'Class', school: 'School', courseId: 'c', joinCode: 'J', moduleIds: ['m', 'future'], progressModuleIds: ['m'],
  learners: [{ id: 's', name: 'Student', passcode: '', baseline: null, hints: [], lastActive: null,
    attempts: [{ activityId: 'pre', score: 90, count: 1, minutes: 1, submitted: true }], moduleProgress: progress }],
});

it('reports canonical test-out as complete with fewer submitted required activities', () => {
  const result = classProgress(group([state()]), course);
  expect(result.roster[0]).toMatchObject({ status: 'Complete', completed: 1, total: 2 });
  expect(assignedModules(group([state()]), course).map(m => m.id)).toEqual(['m']);
  const html = renderToStaticMarkup(<DashboardTab group={group([state()])} course={course} />);
  expect(html).toContain('100% of enrolled students completed this module');
});

it('does not mark submitted-but-locked work complete and uses canonical paired scores', () => {
  const result = classProgress(group([state({ state: 'locked', done_count: 2, pretest_score: 0.2, posttest_best: 0.4 })]), course);
  expect(result.roster[0]).toMatchObject({ status: 'In progress', completed: 2, total: 2, pre: 20, post: 40, gain: 20 });
});

it('keeps zero-required completion and does not invent state for unlinked roster entries', () => {
  expect(classProgress(group([state({ required_count: 0, done_count: 0 })]), course).roster[0].status).toBe('Complete');
  expect(classProgress(group([]), course).roster[0].status).toBe('Not started');
});

it('retains truthful activity-percentage labels for mock fixtures', () => {
  const mock = group([]);
  delete mock.learners[0].moduleProgress;
  const html = renderToStaticMarkup(<DashboardTab group={mock} course={course} />);
  expect(html).toContain('50% of activities submitted');
});
