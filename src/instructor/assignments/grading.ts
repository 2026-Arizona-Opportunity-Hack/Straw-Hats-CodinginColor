// Student submissions to class assignments, and how they are scored.
// Questions and score-reporting interactive pages are graded automatically; written
// responses, code and pages without a score need the instructor. An instructor score
// on any block overrides the automatic one.
import { blockPoints, questionCorrect, type Assignment, type Block, type RubricBlock } from './model';

/** A file a student turned in, stored in the private `submission-files` bucket. */
export type UploadedFile = { path: string; name: string; size: number; type: string };

export type ResponseValue = number[] | string | UploadedFile[];

export const isFileList = (value: ResponseValue | undefined): value is UploadedFile[] =>
  Array.isArray(value) && value.every(item => typeof item === 'object' && item !== null && 'path' in item);

export type Submission = {
  id: string;
  assignmentId: string;
  /** Roster row id (class_students.id). */
  studentId: string;
  /** Answer per block id: chosen choice indexes, text, or uploaded files. Interactive pages store their 0..1 score as text. */
  responses: Record<string, ResponseValue>;
  /** Instructor-entered points per block id; overrides the automatic score. */
  manualScores: Record<string, number>;
  /** Rubric rating chosen per block id, then per criterion id. */
  rubricScores: Record<string, Record<string, string>>;
  feedback: string;
  submittedAt: string;
  gradedAt: string | null;
};

export type GradeStatus = 'missing' | 'needs_grading' | 'graded';

/** Blocks that only the instructor can score. */
export function needsInstructor(block: Block) {
  return block.type === 'written' || block.type === 'code' || block.type === 'file' || (block.type === 'html' && !block.reportsScore);
}

/** Automatic points for one block, or null when the instructor must score it. */
export function autoPoints(block: Block, response: ResponseValue | undefined): number | null {
  if (block.type === 'question') return questionCorrect(block.question, isFileList(response) ? undefined : response) ? block.question.points : 0;
  if (block.type === 'html' && block.reportsScore) {
    const value = typeof response === 'string' ? Number(response) : NaN;
    return Number.isFinite(value) ? Math.round(Math.min(Math.max(value, 0), 1) * block.points * 100) / 100 : 0;
  }
  return needsInstructor(block) ? null : 0;
}

/** Points for one block: the instructor's score if set, otherwise the automatic score. */
export function blockScore(block: Block, submission: Submission): number | null {
  const manual = submission.manualScores[block.id];
  if (typeof manual === 'number') return manual;
  return autoPoints(block, submission.responses[block.id]);
}

/**
 * Points from the rubric ratings chosen so far, and whether every criterion has one.
 * The block counts as graded only when every criterion is rated (or the instructor typed a score).
 */
export function rubricResult(block: RubricBlock, picks: Record<string, string> = {}) {
  let points = 0;
  let rated = 0;
  for (const criterion of block.rubric ?? []) {
    const rating = criterion.ratings.find(r => r.id === picks[criterion.id]);
    if (rating) { points += rating.points; rated += 1; }
  }
  return { points, complete: rated === (block.rubric?.length ?? 0) };
}

export function gradeSubmission(assignment: Assignment, submission: Submission | undefined) {
  const possible = assignment.blocks.reduce((sum, block) => sum + blockPoints(block), 0);
  if (!submission) return { status: 'missing' as GradeStatus, earned: null, possible, ungraded: 0 };
  let earned = 0;
  let ungraded = 0;
  for (const block of assignment.blocks) {
    const score = blockScore(block, submission);
    if (score === null) ungraded += 1;
    else earned += score;
  }
  return { status: (ungraded ? 'needs_grading' : 'graded') as GradeStatus, earned, possible, ungraded };
}

export function isLate(assignment: Assignment, submission: Submission | undefined) {
  if (!submission || !assignment.dueAt) return false;
  return new Date(submission.submittedAt).getTime() > new Date(assignment.dueAt).getTime();
}

const csvCell = (value: string | number) => {
  const text = String(value);
  // Quote, and neutralize spreadsheet formulas in names or titles.
  const safe = /^[=+\-@]/.test(text) ? "'" + text : text;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

/** Gradebook as CSV: one row per student, one column per assignment, then totals. */
export function gradebookCsv(students: { id: string; name: string }[], assignments: Assignment[], submissions: Submission[]) {
  const header = ['Student', ...assignments.map(a => `${a.title} (${gradeSubmission(a, undefined).possible})`), 'Total', 'Possible', 'Percent'];
  const rows = students.map(student => {
    let total = 0;
    let possible = 0;
    const cells = assignments.map(a => {
      const grade = gradeSubmission(a, submissions.find(s => s.assignmentId === a.id && s.studentId === student.id));
      possible += grade.possible;
      if (grade.earned !== null) total += grade.earned;
      return grade.status === 'missing' ? 'missing' : grade.status === 'needs_grading' ? `${grade.earned} (needs grading)` : grade.earned ?? '';
    });
    return [student.name, ...cells, total, possible, possible ? Math.round((total / possible) * 100) + '%' : ''];
  });
  return [header, ...rows].map(row => row.map(csvCell).join(',')).join('\n');
}
