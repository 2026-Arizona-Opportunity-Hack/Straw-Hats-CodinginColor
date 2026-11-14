// Supabase-backed data for the instructor workspace. Loads courses, classes, rosters,
// assignments and progress, and writes back only what changed. Row Level Security decides
// what the signed-in person can read or change (supabase/migrations/2001_instructor_workspace.sql).
import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeAssignment, totalPoints, type Assignment, type AssignmentKind } from './assignments/model';
import {
  activityTypes, type Activity, type ActivityType, type Attempt, type ClassGroup, type Course, type InstructorData,
  type Learner, type Question, type StaffRole,
} from './model';

type Json = Record<string, unknown>;
type Row = Record<string, unknown>;

const levels = ['beginner', 'intermediate', 'advanced', 'expert'];
const titleCase = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
const byPosition = (a: Row, b: Row) => Number(a.position) - Number(b.position);
const str = (value: unknown) => (typeof value === 'string' ? value : '');
const arr = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

function fail(action: string, error: { message: string } | null) {
  if (error) throw new Error(`Could not ${action}: ${error.message}`);
}

// ---- Activities: shared content contract (src/shared/types/activities.ts) <-> course builder ----

type Choice = { id: string; label: string };
const choiceId = (index: number) => String.fromCharCode(97 + index);

function questionsFrom(content: Json, concept: string): Question[] {
  // Saved by the course builder: full question list kept for round trips.
  if (Array.isArray(content.questions) && content.questions.every(q => typeof q === 'object' && q && 'prompt' in q)) {
    return (content.questions as Question[]).map(q => ({
      prompt: str(q.prompt), choices: arr(q.choices).map(String), answer: typeof q.answer === 'number' ? q.answer : null, concept: str(q.concept) || concept,
    }));
  }
  const fromChoices = (prompt: unknown, choices: unknown, answer: unknown, itemConcept = concept): Question => {
    const list = arr(choices) as Choice[];
    const index = list.findIndex(choice => choice?.id === answer);
    return { prompt: str(prompt), choices: list.map(choice => str(choice?.label)), answer: index >= 0 ? index : null, concept: itemConcept };
  };
  if (Array.isArray(content.items)) return (content.items as Row[]).map(item => fromChoices(item.prompt, item.choices, item.answer, str(item.concept) || concept));
  if (Array.isArray(content.fields)) return (content.fields as Row[]).map(field => fromChoices(field.prompt, field.choices, null));
  if (typeof content.prompt === 'string') return [fromChoices(content.prompt, content.choices, content.answer)];
  return [];
}

function toActivity(row: Row): Activity {
  const content = (row.content ?? {}) as Json;
  const type = (row.type as string) in activityTypes ? row.type as ActivityType : 'content';
  const concept = str(row.concept);
  const questions = ['check', 'worksheet', 'exit', 'pretest', 'posttest'].includes(type) ? questionsFrom(content, concept) : [];
  const tests = Array.isArray(content.tests) ? (content.tests as Row[]).map(test => str(test.assertion)).join('\n') : str(content.tests);
  const activity: Activity = {
    id: String(row.id), type, title: str(content.title) || activityTypes[type],
    markdown: str(content.markdown) || (type === 'code' ? str(content.prompt) : ''),
    url: str(content.url), questions,
  };
  if (type === 'code') activity.code = { starter: str(content.starter_code), tests, solution: str(content.solution) };
  if (content.format === 'open-ended') activity.format = 'open-ended';
  return activity;
}

/** Writes the shared contract fields (what the student app reads) plus the builder's full question list. */
function activityContent(activity: Activity): Json {
  const choices = (q: Question): Choice[] => q.choices.filter(c => c.trim()).map((label, i) => ({ id: choiceId(i), label }));
  const answerId = (q: Question) => (q.answer === null ? undefined : choiceId(q.choices.slice(0, q.answer).filter(c => c.trim()).length));
  const first = activity.questions[0];
  const base: Json = { title: activity.title, questions: activity.questions };
  switch (activity.type) {
    case 'content': return { ...base, markdown: activity.markdown };
    case 'video':
    case 'slides': return { ...base, url: activity.url, caption: activity.title, markdown: activity.markdown };
    case 'check': return { ...base, prompt: first?.prompt ?? '', choices: first ? choices(first) : [], answer: first ? answerId(first) : undefined, markdown: activity.markdown };
    case 'exit': return { ...base, prompt: first?.prompt ?? '', choices: first ? choices(first) : [], markdown: activity.markdown };
    case 'worksheet': return {
      ...base, markdown: activity.markdown, format: activity.format,
      fields: activity.questions.map((q, i) => q.choices.some(c => c.trim())
        ? { id: 'f' + i, kind: 'multiple_choice', prompt: q.prompt, choices: choices(q) }
        : { id: 'f' + i, kind: activity.format === 'open-ended' ? 'long_answer' : 'short_answer', prompt: q.prompt }),
    };
    case 'pretest':
    case 'posttest': return {
      ...base, markdown: activity.markdown,
      items: activity.questions.map((q, i) => ({ id: 'q' + i, concept: q.concept, prompt: q.prompt, choices: choices(q), answer: answerId(q) })),
    };
    case 'code': return {
      ...base, prompt: activity.markdown, markdown: activity.markdown, starter_code: activity.code?.starter ?? '',
      tests: (activity.code?.tests ?? '').split('\n').filter(line => line.trim()).map((assertion, i) => ({ name: 'Test ' + (i + 1), assertion })),
      solution: activity.code?.solution ?? '',
    };
  }
}

// ---- Assignments ----

/** <input type="datetime-local"> value <-> ISO timestamp. */
export function localToIso(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
export function isoToLocal(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function toAssignment(row: Row): Assignment {
  const content = (row.content ?? {}) as Record<string, unknown>;
  // normalizeAssignment also reads rows saved before assignments were block-based.
  return normalizeAssignment({
    ...content, kind: row.kind as AssignmentKind, id: String(row.id), title: str(row.title), instructions: str(row.instructions),
    points: Number(row.points ?? 0), dueAt: isoToLocal(row.due_at as string | null), attempts: (row.max_attempts as number | null) ?? null,
    timeLimit: (row.time_limit_minutes as number | null) ?? null, moduleId: (row.module_id as string | null) ?? null,
    published: Boolean(row.published), createdAt: str(row.created_at),
  });
}

function assignmentRow(a: Assignment, classId: string) {
  return {
    id: a.id, class_id: classId, kind: a.kind, title: a.title.trim() || 'Untitled', instructions: a.instructions, points: totalPoints(a),
    due_at: localToIso(a.dueAt), max_attempts: a.attempts, time_limit_minutes: a.timeLimit, module_id: a.moduleId, published: a.published,
    content: { blocks: a.blocks, shuffle: a.shuffle, showAnswers: a.showAnswers },
  };
}

// ---- Progress ----

function learnersFor(classId: string, roster: Row[], attempts: Row[]): Learner[] {
  return roster.slice().sort((a, b) => str(a.created_at).localeCompare(str(b.created_at))).map(student => {
    const mine = attempts.filter(a => a.class_id === classId && student.profile_id && a.student_id === student.profile_id);
    const byActivity = new Map<string, Row[]>();
    for (const attempt of mine) byActivity.set(String(attempt.activity_id), [...(byActivity.get(String(attempt.activity_id)) ?? []), attempt]);
    const list: Attempt[] = [...byActivity.entries()].map(([activityId, rows]) => {
      const latest = rows.slice().sort((a, b) => Number(b.attempt_no) - Number(a.attempt_no))[0];
      return {
        activityId, count: rows.length, submitted: rows.some(r => r.submitted_at),
        score: latest.score === null || latest.score === undefined ? null : Number(latest.score) * 100,
        minutes: Math.round(rows.reduce((sum, r) => sum + Number(r.time_on_task_ms ?? 0), 0) / 60_000),
        response: typeof latest.response === 'string' ? latest.response : undefined,
      };
    });
    const last = mine.map(a => str(a.submitted_at)).filter(Boolean).sort().at(-1) ?? null;
    return { id: String(student.id), name: str(student.display_name), passcode: str(student.passcode), baseline: null, attempts: list, hints: [], lastActive: last };
  });
}

// ---- Load ----

export async function loadLiveData(supabase: SupabaseClient, role: StaffRole, displayName: string): Promise<InstructorData> {
  const [courses, classes, attempts] = await Promise.all([
    supabase.from('courses').select('id, title, description, level, owner_id, created_at, modules (id, position, title, concept, published, lessons (id, position, title, activities (id, position, type, concept, points, content)))').order('created_at'),
    supabase.from('classes').select('id, name, school, course_id, join_code, created_at, class_modules (module_id), class_students (id, display_name, passcode, profile_id, created_at), assignments (*)').order('created_at'),
    supabase.from('activity_attempts').select('student_id, activity_id, class_id, score, submitted_at, time_on_task_ms, attempt_no, response'),
  ]);
  fail('load courses', courses.error);
  fail('load classes', classes.error);
  fail('load progress', attempts.error);

  const courseList: Course[] = (courses.data as Row[]).map(c => ({
    id: String(c.id), title: str(c.title), description: str(c.description), level: titleCase(str(c.level) || 'beginner'),
    modules: (arr(c.modules) as Row[]).sort(byPosition).map(m => ({
      id: String(m.id), title: str(m.title), published: Boolean(m.published),
      lessons: (arr(m.lessons) as Row[]).sort(byPosition).map(l => ({
        id: String(l.id), title: str(l.title), activities: (arr(l.activities) as Row[]).sort(byPosition).map(toActivity),
      })),
    })),
  }));
  const classList: ClassGroup[] = (classes.data as Row[]).map(c => ({
    id: String(c.id), name: str(c.name), school: str(c.school), courseId: String(c.course_id), joinCode: str(c.join_code),
    moduleIds: (arr(c.class_modules) as Row[]).map(m => String(m.module_id)),
    learners: learnersFor(String(c.id), arr(c.class_students) as Row[], attempts.data as Row[]),
    assignments: (arr(c.assignments) as Row[]).sort((a, b) => str(a.created_at).localeCompare(str(b.created_at))).map(toAssignment),
  }));
  return {
    courses: courseList,
    classes: classList,
    // The signed-in person; RLS already limits classes to the ones they can see.
    staff: [{ id: role, name: displayName, role, classIds: classList.map(group => group.id) }],
  };
}

// ---- Save: diff previous vs next and write only what changed ----

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

async function deleteMissing(supabase: SupabaseClient, table: string, column: string, parentIds: string[], keep: string[]) {
  if (!parentIds.length) return;
  let query = supabase.from(table).delete().in(column, parentIds);
  if (keep.length) query = query.not('id', 'in', `(${keep.join(',')})`);
  fail(`remove old ${table}`, (await query).error);
}

async function upsert(supabase: SupabaseClient, table: string, rows: Row[]) {
  if (rows.length) fail(`save ${table}`, (await supabase.from(table).upsert(rows)).error);
}

async function syncCourse(supabase: SupabaseClient, userId: string, course: Course, existed: boolean) {
  const level = course.level.toLowerCase();
  const row: Row = { id: course.id, title: course.title.trim() || 'Untitled course', description: course.description, level: levels.includes(level) ? level : 'beginner' };
  if (!existed) Object.assign(row, { owner_id: userId, published: true });
  fail('save the course', (await supabase.from('courses').upsert(row)).error);

  const modules = course.modules;
  const lessons = modules.flatMap(m => m.lessons.map((l, position) => ({ l, m, position: position + 1 })));
  const activities = lessons.flatMap(({ l }) => l.activities.map((a, position) => ({ a, l, position: position + 1 })));
  // Remove deleted rows first so their positions are free.
  await deleteMissing(supabase, 'modules', 'course_id', [course.id], modules.map(m => m.id));
  await deleteMissing(supabase, 'lessons', 'module_id', modules.map(m => m.id), lessons.map(({ l }) => l.id));
  await deleteMissing(supabase, 'activities', 'lesson_id', lessons.map(({ l }) => l.id), activities.map(({ a }) => a.id));
  await upsert(supabase, 'modules', modules.map((m, i) => ({
    id: m.id, course_id: course.id, position: i + 1, title: m.title.trim() || 'Untitled module',
    concept: m.lessons.flatMap(l => l.activities).flatMap(a => a.questions).find(q => q.concept.trim())?.concept.trim() || m.title, published: m.published,
  })));
  await upsert(supabase, 'lessons', lessons.map(({ l, m, position }) => ({ id: l.id, module_id: m.id, position, title: l.title.trim() || 'Untitled lesson', is_checkpoint: false })));
  await upsert(supabase, 'activities', activities.map(({ a, l, position }) => ({
    id: a.id, lesson_id: l.id, position, type: a.type, concept: a.questions.find(q => q.concept.trim())?.concept.trim() || '',
    points: a.questions.length || (a.type === 'code' ? 1 : 0), content: activityContent(a),
  })));
}

async function syncClass(supabase: SupabaseClient, userId: string, next: ClassGroup, prev: ClassGroup | undefined) {
  if (!prev || !same({ ...prev, learners: 0, assignments: 0, moduleIds: 0 }, { ...next, learners: 0, assignments: 0, moduleIds: 0 })) {
    const row: Row = { id: next.id, name: next.name, school: next.school, course_id: next.courseId, join_code: next.joinCode };
    if (!prev) row.created_by = userId;
    fail('save the class', (await supabase.from('classes').upsert(row)).error);
  }
  if (!prev || !same(prev.moduleIds, next.moduleIds)) {
    fail('update assigned modules', (await supabase.from('class_modules').delete().eq('class_id', next.id)).error);
    await upsert(supabase, 'class_modules', next.moduleIds.map(module_id => ({ class_id: next.id, module_id })));
  }
  const prevLearners = new Map((prev?.learners ?? []).map(l => [l.id, l]));
  const learners = next.learners;
  if (!prev || !same(prev.learners.map(l => [l.id, l.name, l.passcode]), learners.map(l => [l.id, l.name, l.passcode]))) {
    await deleteMissing(supabase, 'class_students', 'class_id', [next.id], learners.map(l => l.id));
    await upsert(supabase, 'class_students', learners
      .filter(l => { const old = prevLearners.get(l.id); return !old || old.name !== l.name || old.passcode !== l.passcode; })
      .map(l => ({ id: l.id, class_id: next.id, display_name: l.name, passcode: l.passcode })));
  }
  const prevAssignments = new Map((prev?.assignments ?? []).map(a => [a.id, a]));
  const assignments = next.assignments ?? [];
  if (!prev || !same(prev.assignments ?? [], assignments)) {
    await deleteMissing(supabase, 'assignments', 'class_id', [next.id], assignments.map(a => a.id));
    await upsert(supabase, 'assignments', assignments.filter(a => !same(prevAssignments.get(a.id), a)).map(a => assignmentRow(a, next.id)));
  }
}

export async function saveLiveData(supabase: SupabaseClient, userId: string, prev: InstructorData, next: InstructorData) {
  const prevCourses = new Map(prev.courses.map(c => [c.id, c]));
  for (const course of next.courses) {
    if (!same(prevCourses.get(course.id), course)) await syncCourse(supabase, userId, course, prevCourses.has(course.id));
  }
  const prevClasses = new Map(prev.classes.map(c => [c.id, c]));
  for (const group of next.classes) {
    if (!same(prevClasses.get(group.id), group)) await syncClass(supabase, userId, group, prevClasses.get(group.id));
  }
}
