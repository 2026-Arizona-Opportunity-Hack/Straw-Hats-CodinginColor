import { describe, expect, it } from 'vitest';
import { autoPoints, gradebookCsv, gradeSubmission, isLate, rubricResult, type Submission } from './grading';
import { newAssignment, newQuestion, type Assignment, type Block, type RubricBlock } from './model';

const NOW = new Date('2026-11-14T12:00:00Z').getTime();

const question: Block = { id: 'q', type: 'question', question: { ...newQuestion('single'), id: 'qq', prompt: '2+2?', choices: ['3', '4'], correct: [1], points: 2 } };
const written: RubricBlock = {
  id: 'w', type: 'written', prompt: 'Explain', points: 5,
  rubric: [
    { id: 'c1', title: 'Clear', description: '', ratings: [{ id: 'c1-hi', label: 'Yes', description: '', points: 4 }, { id: 'c1-lo', label: 'No', description: '', points: 0 }] },
    { id: 'c2', title: 'Correct', description: '', ratings: [{ id: 'c2-hi', label: 'Yes', description: '', points: 6 }, { id: 'c2-mid', label: 'Partly', description: '', points: 3 }] },
  ],
};

function assignment(patch: Partial<Assignment> = {}): Assignment {
  return { ...newAssignment('quiz'), id: 'a1', title: 'Quiz', blocks: [question, written], ...patch };
}

function submission(patch: Partial<Submission> = {}): Submission {
  return { id: 's1', assignmentId: 'a1', studentId: 'st1', responses: {}, manualScores: {}, rubricScores: {}, feedback: '', submittedAt: '2026-11-13T12:00:00Z', gradedAt: null, ...patch };
}

describe('gradeSubmission', () => {
  it('counts nothing turned in as not due before the due date, and missing after it', () => {
    expect(gradeSubmission(assignment({ dueAt: '2026-11-20T23:59' }), undefined, NOW).status).toBe('not_due');
    expect(gradeSubmission(assignment({ dueAt: '2026-11-01T23:59' }), undefined, NOW).status).toBe('missing');
    expect(gradeSubmission(assignment({ dueAt: null }), undefined, NOW).status).toBe('not_due');
  });

  it('auto-grades questions and waits on the instructor for written work', () => {
    const grade = gradeSubmission(assignment(), submission({ responses: { q: [1] } }), NOW);
    // Rubric blocks are worth the top rating of each criterion: 4 + 6.
    expect(grade).toMatchObject({ status: 'needs_grading', earned: 2, possible: 12, ungraded: 1 });
    // The ungraded written answer (10 points) does not count against the total yet.
    expect(grade.countedPossible).toBe(2);
  });

  it('lets an instructor score override the automatic one', () => {
    const grade = gradeSubmission(assignment(), submission({ responses: { q: [0] }, manualScores: { q: 1, w: 7 } }), NOW);
    expect(grade).toMatchObject({ status: 'graded', earned: 8, ungraded: 0 });
  });
});

describe('rubricResult', () => {
  it('sums picked ratings and is complete only when every criterion is rated', () => {
    expect(rubricResult(written, { c1: 'c1-hi' })).toEqual({ points: 4, complete: false });
    expect(rubricResult(written, { c1: 'c1-hi', c2: 'c2-mid' })).toEqual({ points: 7, complete: true });
  });

  it('ignores a picked rating that was removed from the rubric', () => {
    expect(rubricResult(written, { c1: 'gone', c2: 'c2-hi' })).toEqual({ points: 6, complete: false });
  });
});

describe('autoPoints', () => {
  it('scores reported interactive pages by fraction of points and clamps bad values', () => {
    const html: Block = { id: 'h', type: 'html', html: '<p>', reportsScore: true, points: 5 };
    expect(autoPoints(html, '0.6')).toBe(3);
    expect(autoPoints(html, '7')).toBe(5);
    expect(autoPoints(html, undefined)).toBe(0);
  });
});

describe('isLate', () => {
  it('marks a submission after the due date as late', () => {
    expect(isLate(assignment({ dueAt: '2026-11-12T23:59' }), submission({ submittedAt: '2026-11-13T12:00:00Z' }))).toBe(true);
    expect(isLate(assignment({ dueAt: '2026-11-14T23:59' }), submission({ submittedAt: '2026-11-13T12:00:00Z' }))).toBe(false);
  });
});

describe('gradebookCsv', () => {
  it('leaves work that is not due out of totals and neutralizes spreadsheet formulas', () => {
    const due = assignment({ id: 'due', title: 'Done', blocks: [question], dueAt: '2026-11-01T23:59' });
    const later = assignment({ id: 'later', title: 'Later', blocks: [question], dueAt: '2026-11-30T23:59' });
    const csv = gradebookCsv([{ id: 'st1', name: '=HYPERLINK("x")' }], [due, later],
      [submission({ assignmentId: 'due', responses: { q: [1] } })], NOW).split('\n');
    expect(csv[1]).toBe(`"'=HYPERLINK(""x"")",2,not due,2,2,100%`);
  });
});
