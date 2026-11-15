// Numbers behind the class Dashboard tab: why each student needs attention, the work each
// module has due, and assignment totals. Pure functions so they can be tested.
import { gradeSubmission } from './assignments/grading';
import type { Assignment } from './assignments/model';
import type { ClassGroup, Course } from './model';
import { classProgress } from './progress';

const DAY = 86_400_000;
/** A score under this is below mastery (same line the Concept mastery tile uses). */
export const MASTERY = 70;

export type AttentionReason =
  | { kind: 'stuck'; text: string }
  | { kind: 'inactive'; text: string }
  | { kind: 'not_started'; text: string }
  | { kind: 'concept'; text: string }
  | { kind: 'missing'; text: string }
  | { kind: 'low_score'; text: string }
  | { kind: 'dropped'; text: string };

export interface AttentionRow { learnerId: string; name: string; reasons: AttentionReason[] }

const published = (group: ClassGroup) => (group.assignments ?? []).filter(assignment => assignment.published);
const submissionFor = (group: ClassGroup, assignment: Assignment, learnerId: string) =>
  (group.submissions ?? []).find(item => item.assignmentId === assignment.id && item.studentId === learnerId);

/** Every student with at least one concrete reason to check in, most reasons first. */
export function attentionList(group: ClassGroup, course: Course | undefined, now = Date.now()): AttentionRow[] {
  const { roster, activities, mastery } = classProgress(group, course);
  const title = (id: string) => activities.find(activity => activity.id === id)?.title || 'an activity';
  const assignments = published(group);
  return roster.map(row => {
    const reasons: AttentionReason[] = [];
    const { learner } = row;
    if (row.total > 0 && row.completed === 0) reasons.push({ kind: 'not_started', text: 'Has not started any assigned activity' });
    for (const attempt of row.submitted) {
      if (attempt.count >= 3 && attempt.score !== null && attempt.score < MASTERY) {
        reasons.push({ kind: 'stuck', text: `Stuck on "${title(attempt.activityId)}": ${attempt.count} tries, best ${Math.round(attempt.score)}%` });
      }
    }
    if (learner.lastActive) {
      const days = Math.floor((now - new Date(learner.lastActive).getTime()) / DAY);
      if (days > 3) reasons.push({ kind: 'inactive', text: `No activity for ${days} days` });
    }
    for (const item of mastery) {
      const score = item.scores.get(learner.id);
      if (score !== undefined && score < MASTERY) reasons.push({ kind: 'concept', text: `Below mastery in ${item.concept} (${Math.round(score)}%)` });
    }
    for (const assignment of assignments) {
      const grade = gradeSubmission(assignment, submissionFor(group, assignment, learner.id), now);
      if (grade.status === 'missing') reasons.push({ kind: 'missing', text: `Missing "${assignment.title}"` });
      else if (grade.status === 'graded' && grade.possible > 0 && grade.earned !== null && grade.earned / grade.possible * 100 < 60) {
        reasons.push({ kind: 'low_score', text: `Scored ${Math.round(grade.earned / grade.possible * 100)}% on "${assignment.title}"` });
      }
    }
    if (row.gain !== null && row.gain < 0) reasons.push({ kind: 'dropped', text: `Post-test lower than pretest (${Math.round(row.gain)} points)` });
    return { learnerId: learner.id, name: learner.name, reasons };
  }).filter(row => row.reasons.length).sort((a, b) => b.reasons.length - a.reasons.length || a.name.localeCompare(b.name));
}

export interface ModuleWork {
  assignment: Assignment;
  submitted: number;
  toGrade: number;
  missing: number;
  students: number;
}

/** Published assignments linked to one module, soonest due first (no due date last). */
export function moduleAssignments(group: ClassGroup, moduleId: string, now = Date.now()): ModuleWork[] {
  const students = group.learners.length;
  return published(group).filter(assignment => assignment.moduleId === moduleId)
    .sort((a, b) => (a.dueAt ? new Date(a.dueAt).getTime() : Infinity) - (b.dueAt ? new Date(b.dueAt).getTime() : Infinity))
    .map(assignment => {
      const grades = group.learners.map(learner => gradeSubmission(assignment, submissionFor(group, assignment, learner.id), now));
      return {
        assignment, students,
        submitted: grades.filter(grade => grade.status === 'graded' || grade.status === 'needs_grading').length,
        toGrade: grades.filter(grade => grade.status === 'needs_grading').length,
        missing: grades.filter(grade => grade.status === 'missing').length,
      };
    });
}

/** Class-wide assignment numbers for the top cards. */
export function assignmentTotals(group: ClassGroup, now = Date.now()) {
  let earned = 0, counted = 0, toGrade = 0, missing = 0;
  for (const assignment of published(group)) {
    for (const learner of group.learners) {
      const grade = gradeSubmission(assignment, submissionFor(group, assignment, learner.id), now);
      if (grade.status === 'needs_grading') toGrade += 1;
      if (grade.status === 'missing') missing += 1;
      if (grade.earned !== null) earned += grade.earned;
      counted += grade.countedPossible;
    }
  }
  return { average: counted ? earned / counted * 100 : null, toGrade, missing };
}

/** Pretest and post-test averages behind the learning gain, for students who took both. */
export function gainBreakdown(group: ClassGroup, course: Course | undefined) {
  const paired = classProgress(group, course).roster.filter(row => row.gain !== null);
  const mean = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  return {
    students: paired.length,
    pre: mean(paired.map(row => row.pre as number)),
    post: mean(paired.map(row => row.post as number)),
    gain: mean(paired.map(row => row.gain as number)),
  };
}
