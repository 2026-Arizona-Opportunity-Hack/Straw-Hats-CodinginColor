import { describe, expect, it } from 'vitest';
import type { Submission } from './assignments/grading';
import { newAssignment, newQuestion, type Assignment } from './assignments/model';
import { assignmentTotals, attentionList, gainBreakdown, moduleAssignments } from './dashboard';
import type { ClassGroup, ClassRules, Course, Learner } from './model';
import { classProgress } from './progress';

const NOW = new Date('2026-11-15T12:00:00Z').getTime();
const days = (n: number) => new Date(NOW + n * 86_400_000).toISOString();

const course: Course = {
  id: 'c', title: 'AI', description: '', level: 'Beginner',
  modules: [{
    id: 'm1', title: 'Computers', published: true, lessons: [{
      id: 'l1', title: 'L', activities: [
        { id: 'pre', type: 'pretest', title: 'Pretest', markdown: '', url: '', questions: [{ prompt: 'q', choices: ['a', 'b'], answer: 0, concept: 'binary' }] },
        { id: 'chk', type: 'check', title: 'Binary check', markdown: '', url: '', questions: [{ prompt: 'q', choices: ['a', 'b'], answer: 0, concept: 'binary' }] },
        { id: 'post', type: 'posttest', title: 'Post-test', markdown: '', url: '', questions: [{ prompt: 'q', choices: ['a', 'b'], answer: 0, concept: 'binary' }] },
      ],
    }],
  }],
};

const quiz = (patch: Partial<Assignment>): Assignment => ({
  ...newAssignment('quiz'), published: true, moduleId: 'm1',
  blocks: [{ id: 'q', type: 'question', question: { ...newQuestion('single'), id: 'qq', prompt: '?', choices: ['a', 'b'], correct: [0], points: 10 } }],
  ...patch,
});

const learner = (id: string, patch: Partial<Learner> = {}): Learner =>
  ({ id, name: id, passcode: '', baseline: null, attempts: [], hints: [], lastActive: days(0), ...patch });

const submission = (assignmentId: string, studentId: string, answer: number): Submission =>
  ({ id: assignmentId + studentId, assignmentId, studentId, responses: { q: [answer] }, manualScores: {}, rubricScores: {}, feedback: '', submittedAt: days(-1), gradedAt: null });

/** Rules as loaded from class_module_settings and program_settings. */
const rules = (patch: Partial<ClassRules> = {}): ClassRules =>
  ({ inactiveDays: 3, lowScorePct: 60, passMark: { m1: 70 }, maxTries: { m1: 3 }, ...patch });

function klass(learners: Learner[], assignments: Assignment[] = [], submissions: Submission[] = [], classRules: ClassRules | null = rules()): ClassGroup {
  return { id: 'k', name: 'P3', school: 'S', courseId: 'c', joinCode: 'J', moduleIds: ['m1'], learners, assignments, submissions, rules: classRules ?? undefined };
}

describe('attentionList', () => {
  it('names the exact reasons a student needs help, and skips students who are fine', () => {
    const stuck = learner('Ava', {
      lastActive: days(-5),
      attempts: [
        { activityId: 'pre', score: 60, minutes: 5, count: 1, submitted: true },
        { activityId: 'chk', score: 40, minutes: 9, count: 3, submitted: true },
        { activityId: 'post', score: 50, minutes: 5, count: 1, submitted: true },
      ],
    });
    const fine = learner('Ben', {
      attempts: ['pre', 'chk', 'post'].map(activityId => ({ activityId, score: 90, minutes: 3, count: 1, submitted: true })),
    });
    const late = quiz({ id: 'a1', title: 'Parts quiz', dueAt: days(-2) });
    const rows = attentionList(klass([stuck, fine], [late], [submission('a1', 'Ben', 0)]), course, NOW);
    expect(rows.map(row => row.name)).toEqual(['Ava']);
    const kinds = rows[0].reasons.map(reason => reason.kind);
    expect(kinds).toEqual(expect.arrayContaining(['stuck', 'inactive', 'concept', 'missing', 'dropped']));
    expect(rows[0].reasons.find(reason => reason.kind === 'stuck')?.text).toBe('Stuck on "Binary check": 3 tries, best 40%');
    expect(rows[0].reasons.find(reason => reason.kind === 'inactive')?.text).toBe('No activity for 5 days');
  });

  it('flags a student who has not started and one who scored low on graded work', () => {
    const low = learner('Cy', { attempts: [{ activityId: 'pre', score: 80, minutes: 2, count: 1, submitted: true }] });
    const rows = attentionList(klass([learner('Dee'), low], [quiz({ id: 'a1', title: 'Quiz', dueAt: days(3) })], [submission('a1', 'Cy', 1)]), course, NOW);
    expect(rows.find(row => row.name === 'Dee')?.reasons.map(reason => reason.kind)).toEqual(['not_started']);
    expect(rows.find(row => row.name === 'Cy')?.reasons.map(reason => reason.text)).toEqual(['Scored 0% on "Quiz"']);
  });
});

describe('thresholds come from the class rules', () => {
  const ava = () => learner('Ava', {
    lastActive: days(-5),
    attempts: [
      { activityId: 'chk', score: 40, minutes: 9, count: 3, submitted: true },
      { activityId: 'post', score: 50, minutes: 5, count: 1, submitted: true },
    ],
  });
  const kinds = (group: ClassGroup) => attentionList(group, course, NOW)[0]?.reasons.map(reason => reason.kind) ?? [];

  it('is stuck only below the module pass mark after its max tries', () => {
    expect(kinds(klass([ava()]))).toContain('stuck');
    expect(kinds(klass([ava()], [], [], rules({ maxTries: { m1: 4 } })))).not.toContain('stuck');
    expect(kinds(klass([ava()], [], [], rules({ passMark: { m1: 40 } })))).not.toContain('stuck');
    const retook = learner('Eli', { attempts: [{ activityId: 'pre', score: 10, minutes: 3, count: 5, submitted: true }] });
    expect(kinds(klass([retook]))).not.toContain('stuck');
  });

  it('uses the program inactive days for Inactive and for the Stuck status', () => {
    expect(kinds(klass([ava()], [], [], rules({ inactiveDays: 7, maxTries: { m1: 9 } })))).not.toContain('inactive');
    expect(classProgress(klass([ava()], [], [], rules({ inactiveDays: 7, maxTries: { m1: 9 } })), course, undefined, NOW).roster[0].status).toBe('In progress');
    expect(classProgress(klass([ava()], [], [], rules({ inactiveDays: 4, maxTries: { m1: 9 } })), course, undefined, NOW).roster[0].status).toBe('Stuck');
  });

  it('measures concept mastery against the pass mark of the module the check is in', () => {
    const at = (passMark: number) => classProgress(klass([ava()], [], [], rules({ passMark: { m1: passMark } })), course, undefined, NOW).mastery[0];
    expect(at(70)).toMatchObject({ concept: 'binary', passMark: 70, assessed: 1, mastered: 0 });
    expect(at(45)).toMatchObject({ passMark: 45, mastered: 1 });
  });

  it('uses the program low-score line for graded work', () => {
    const half = { ...quiz({ id: 'a1', title: 'Quiz', dueAt: days(3) }) };
    half.blocks = [...half.blocks, { id: 'q2', type: 'question', question: { ...newQuestion('single'), id: 'qq2', prompt: '?', choices: ['a', 'b'], correct: [0], points: 10 } }];
    const work = learner('Cy', { attempts: [{ activityId: 'pre', score: 80, minutes: 2, count: 1, submitted: true }] });
    const sub = { ...submission('a1', 'Cy', 0), responses: { q: [0], q2: [1] } };
    expect(kinds(klass([work], [half], [sub], rules({ lowScorePct: 60 })))).toEqual(['low_score']);
    expect(kinds(klass([work], [half], [sub], rules({ lowScorePct: 50 })))).toEqual([]);
  });

  it('never invents a threshold when a class has no rules yet', () => {
    const group = klass([ava()], [], [], null);
    expect(kinds(group)).toEqual([]);
    const { roster, mastery } = classProgress(group, course, undefined, NOW);
    expect(roster[0].status).toBe('In progress');
    expect(mastery[0]).toMatchObject({ passMark: null, mastered: null });
  });
});

describe('moduleAssignments', () => {
  it('lists published work for the module, soonest due first, with turn-in counts', () => {
    const group = klass([learner('A'), learner('B')], [
      quiz({ id: 'later', title: 'Later', dueAt: days(5) }),
      quiz({ id: 'past', title: 'Past', dueAt: days(-1) }),
      quiz({ id: 'none', title: 'No date', dueAt: null }),
      quiz({ id: 'draft', title: 'Draft', published: false }),
      quiz({ id: 'other', title: 'Other module', moduleId: 'm2' }),
    ], [submission('past', 'A', 0)]);
    const work = moduleAssignments(group, 'm1', NOW);
    expect(work.map(item => item.assignment.title)).toEqual(['Past', 'Later', 'No date']);
    expect(work[0]).toMatchObject({ submitted: 1, missing: 1, students: 2, toGrade: 0 });
  });
});

describe('assignmentTotals and gainBreakdown', () => {
  it('averages graded work only and explains the gain with pretest and post-test averages', () => {
    const a = learner('A', { attempts: [{ activityId: 'pre', score: 40, minutes: 1, count: 1, submitted: true }, { activityId: 'post', score: 70, minutes: 1, count: 1, submitted: true }] });
    const b = learner('B', { attempts: [{ activityId: 'pre', score: 60, minutes: 1, count: 1, submitted: true }, { activityId: 'post', score: 70, minutes: 1, count: 1, submitted: true }] });
    const group = klass([a, b], [quiz({ id: 'q1', dueAt: days(-1) }), quiz({ id: 'q2', dueAt: days(4) })], [submission('q1', 'A', 0)]);
    expect(assignmentTotals(group, NOW)).toEqual({ average: 50, toGrade: 0, missing: 1 });
    expect(gainBreakdown(group, course)).toEqual({ students: 2, pre: 50, post: 70, gain: 20 });
  });
});
