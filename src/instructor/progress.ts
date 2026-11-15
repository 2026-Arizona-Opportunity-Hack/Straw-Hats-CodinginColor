// Curriculum progress for one class. Every threshold (pass mark, post-test tries, inactive days)
// comes from the class's rules, loaded from the database (migration 2006), never from constants.
import type { Attempt, ClassGroup, Course, Learner } from './model';

export const statuses = ['Complete', 'In progress', 'Stuck', 'Not started'] as const;

const DAY = 86_400_000;

export function assignedModules(group: ClassGroup, course?: Course) {
  return course?.modules.filter(module => module.published && group.moduleIds.includes(module.id)) || [];
}

/** Whole days since the learner last submitted work, or null if they never did. */
export function idleDays(learner: Learner, now: number) {
  return learner.lastActive ? Math.floor((now - new Date(learner.lastActive).getTime()) / DAY) : null;
}

export function classProgress(group: ClassGroup, course?: Course, moduleId?: string, now = Date.now()) {
  const rules = group.rules;
  const modules = assignedModules(group, course).filter(module => !moduleId || module.id === moduleId);
  // Readings need no submission, so they do not count toward completion.
  const activities = modules.flatMap(module => module.lessons.flatMap(lesson => lesson.activities))
    .filter(activity => activity.type !== 'content');
  const moduleOf = new Map(modules.flatMap(module => module.lessons.flatMap(lesson => lesson.activities.map(activity => [activity.id, module.id] as const))));
  const pretests = new Set(activities.filter(activity => activity.type === 'pretest').map(activity => activity.id));
  /**
   * Below the module's pass mark after using all of its counted tries. Pretests only record a
   * starting point, so they never make anyone stuck; unknown rules never do either.
   */
  const stuckOn = (attempt: Attempt) => {
    if (pretests.has(attempt.activityId)) return false;
    const id = moduleOf.get(attempt.activityId);
    const passMark = id === undefined ? undefined : rules?.passMark[id];
    const maxTries = id === undefined ? undefined : rules?.maxTries[id];
    return passMark !== undefined && maxTries !== undefined && attempt.count >= maxTries && attempt.score !== null && attempt.score < passMark;
  };
  const roster = group.learners.map(learner => {
    const submitted = learner.attempts.filter(attempt => attempt.submitted && moduleOf.has(attempt.activityId));
    const completed = new Set(submitted.map(attempt => attempt.activityId)).size;
    const minutes = submitted.reduce((total, attempt) => total + attempt.minutes, 0);
    const stuck = submitted.filter(stuckOn);
    const idle = idleDays(learner, now);
    const inactiveDays = rules && idle !== null && idle > rules.inactiveDays ? idle : null;
    const status = !completed ? statuses[3] : completed === activities.length ? statuses[0]
      : stuck.length || inactiveDays !== null ? statuses[2] : statuses[1];

    const pairs = modules.flatMap(module => {
      const items = module.lessons.flatMap(lesson => lesson.activities);
      const findScore = (type: 'pretest' | 'posttest') => {
        const ids = items.filter(item => item.type === type).map(item => item.id);
        return average(submitted.filter(attempt => ids.includes(attempt.activityId)).map(attempt => attempt.score));
      };
      const pre = findScore('pretest') ?? (items.some(item => item.type === 'posttest') ? learner.baseline : null);
      const post = findScore('posttest');
      return pre === null || post === null ? [] : [{ pre, post }];
    });
    const pre = average(pairs.map(pair => pair.pre));
    const post = average(pairs.map(pair => pair.post));
    const gain = pre === null || post === null ? null : post - pre;
    return { learner, completed, total: activities.length, minutes, status, pre, post, gain, submitted, stuck, inactiveDays };
  });
  const concepts = [...new Set(activities.flatMap(item => item.questions.map(question => question.concept.trim())).filter(Boolean))];
  const mastery = concepts.map(concept => {
    const checks = activities.filter(item => ['check', 'posttest'].includes(item.type) && item.questions.some(question => question.concept.trim() === concept));
    // Mastery is the pass mark of the module the concept's checks live in. A concept checked in
    // several modules uses the strictest of their pass marks; null when any rule is unknown.
    const marks = [...new Set(checks.map(item => moduleOf.get(item.id)))].map(id => id === undefined ? undefined : rules?.passMark[id]);
    const passMark = marks.length && marks.every(mark => mark !== undefined) ? Math.max(...marks as number[]) : null;
    const scores = new Map<string, number>();
    for (const row of roster) {
      const score = average(row.submitted.map(attempt => {
        const check = checks.find(item => item.id === attempt.activityId);
        if (!check) return null;
        const tags = new Set(check.questions.map(question => question.concept.trim()).filter(Boolean));
        return attempt.conceptScores?.[concept] ?? (tags.size === 1 ? attempt.score : null);
      }));
      if (score !== null) scores.set(row.learner.id, score);
    }
    const assessed = [...scores.values()];
    const mastered = passMark === null ? null : assessed.filter(score => score >= passMark).length;
    return { concept, assessed: assessed.length, mastered, passMark, score: average(assessed), scores };
  });
  return { roster, activities, mastery, avgGain: average(roster.map(row => row.gain)) };
}

function average(values: (number | null)[]) {
  const numbers = values.filter(value => value !== null);
  return numbers.length ? numbers.reduce((sum, number) => sum + number, 0) / numbers.length : null;
}

export const percent = (n: number | null) => n === null ? '—' : Math.round(n) + '%';
export const points = (n: number | null) => {
  if (n === null) return '—';
  const rounded = Math.round(n);
  // Percentage points: post-test % minus pretest %. "pts" reads clearer to teachers than "pp".
  return (rounded > 0 ? '+' : '') + rounded + ' pts';
};
export const attemptFor = (learner: Learner, activityId: string) => learner.attempts.find(attempt => attempt.activityId === activityId);
