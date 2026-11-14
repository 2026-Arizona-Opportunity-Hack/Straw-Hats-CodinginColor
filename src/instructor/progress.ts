import type { ClassGroup, Course, Learner } from './model';

export const statuses = ['Complete', 'In progress', 'Stuck', 'Not started'] as const;

export function assignedModules(group: ClassGroup, course?: Course) {
  return course?.modules.filter(module => module.published && group.moduleIds.includes(module.id)) || [];
}

export function classProgress(group: ClassGroup, course?: Course, moduleId?: string) {
  const modules = assignedModules(group, course).filter(module => !moduleId || module.id === moduleId);
  const activities = modules.flatMap(module => module.lessons.flatMap(lesson => lesson.activities));
  const roster = group.learners.map(learner => {
    const submitted = learner.attempts.filter(attempt => attempt.submitted && activities.some(activity => activity.id === attempt.activityId));
    const completed = new Set(submitted.map(attempt => attempt.activityId)).size;
    const minutes = submitted.reduce((total, attempt) => total + attempt.minutes, 0);
    const status = !completed ? statuses[3] : completed === activities.length ? statuses[0]
      : submitted.some(attempt => attempt.count >= 3 && attempt.score !== null && attempt.score < 70)
        || (learner.lastActive && Date.now() - new Date(learner.lastActive).getTime() > 3 * 86_400_000) ? statuses[2] : statuses[1];

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
    return { learner, completed, total: activities.length, minutes, status, pre, post, gain, submitted };
  });
  const concepts = [...new Set(activities.flatMap(item => item.questions.map(question => question.concept.trim())).filter(Boolean))];
  const mastery = concepts.map(concept => {
    const checks = activities.filter(item => ['check', 'posttest'].includes(item.type) && item.questions.some(question => question.concept.trim() === concept));
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
    const mastered = assessed.filter(score => score >= 70).length;
    return { concept, assessed: assessed.length, mastered, score: average(assessed), scores };
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
  return (rounded > 0 ? '+' : '') + rounded + ' pp';
};
export const attemptFor = (learner: Learner, activityId: string) => learner.attempts.find(attempt => attempt.activityId === activityId);
