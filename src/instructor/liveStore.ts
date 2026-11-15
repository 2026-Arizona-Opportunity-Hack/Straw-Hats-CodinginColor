import { parseWebPracticeChecks } from '../shared/labs/webPracticeChecks';
// Supabase-backed data for the instructor workspace. Loads courses, classes, rosters,
// assignments and progress, and writes back only what changed. Row Level Security decides
// what the signed-in person can read or change (supabase/migrations/2001_instructor_workspace.sql).
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Submission } from './assignments/grading';
import { normalizeAssignment, totalPoints, type Assignment, type AssignmentKind } from './assignments/model';
import {
  activityTypes, type Activity, type ActivityType, type Attempt, type ClassGroup, type ClassRules, type Course, type InstructorData,
  type Learner, type ProgramSettings, type Question, type StaffRole,
} from './model';

type Json = Record<string, unknown>;
type Row = Record<string, unknown>;

const levels = ['beginner', 'intermediate', 'advanced', 'expert'];
const titleCase = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
const byPosition = (a: Row, b: Row) => Number(a.position) - Number(b.position);
const str = (value: unknown) => (typeof value === 'string' ? value : '');
const arr = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

function fail(action: string, error: { message: string; code?: string } | null) {
  if (!error) return;
  // PostgREST reports a table or view the database does not have yet (an unapplied migration).
  if (['PGRST205', '42P01'].includes(error.code ?? '')) throw new Error(`Could not ${action}: the database has no such table or view yet (${error.message}). Apply the latest migrations in supabase/migrations.`);
  throw new Error(`Could not ${action}: ${error.message}`);
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

/**
 * Answer keys live in activity_keys (migration 1002 moves them out of content so students
 * cannot read them). Put them back into the content shape the builder reads; on save the
 * trigger moves them out again.
 */
function withAnswerKey(content: Json, keyRow: unknown): Json {
  const keyHolder = (Array.isArray(keyRow) ? keyRow[0] : keyRow) as { key?: Json } | null | undefined;
  const key = keyHolder?.key;
  if (!key) return content;
  const merged: Json = { ...content };
  if (key.answer !== undefined) merged.answer = key.answer;
  if (key.solution !== undefined) merged.solution = key.solution;
  const answers = (key.answers ?? {}) as Record<string, unknown>;
  if (Array.isArray(content.items)) merged.items = (content.items as Row[]).map(item => (String(item.id) in answers ? { ...item, answer: answers[String(item.id)] } : item));
  const byPosition = Array.isArray(key.question_answers) ? key.question_answers as unknown[] : null;
  if (byPosition && Array.isArray(content.questions)) {
    merged.questions = (content.questions as Row[]).map((q, i) => (byPosition[i] === null || byPosition[i] === undefined ? q : { ...q, answer: byPosition[i] }));
  }
  return merged;
}

function toActivity(row: Row): Activity {
  const content = withAnswerKey((row.content ?? {}) as Json, row.activity_keys);
  const type = (row.type as string) in activityTypes ? row.type as ActivityType : 'content';
  const concept = str(row.concept);
  const questions = ['check', 'worksheet', 'exit', 'pretest', 'posttest'].includes(type) ? questionsFrom(content, concept) : [];
  const tests = Array.isArray(content.tests) ? (content.tests as Row[]).map(test => str(test.assertion)).join('\n') : str(content.tests);
  const activity: Activity = {
    id: String(row.id), type, title: str(content.title) || activityTypes[type],
    markdown: str(content.markdown) || (type === 'code' ? str(content.prompt) : ''),
    url: str(content.url), questions,
  };
  if (type === 'content' && content.presentation === 'cic-article') activity.presentation = 'cic-article';
  if (type === 'code') {
    const lab = content.lab as Json | undefined;
    activity.code = { starter: str(content.starter_code), tests, solution: str(content.solution) };
    if (lab?.verifier === 'web-practice-v1') {
      const checks = parseWebPracticeChecks(lab.checks);
      if (checks) activity.code.lab = { language: 'web', verifier: 'web-practice-v1', starterCss: str(lab.starterCss), checks };
    }
    if (lab?.verifier === 'cat-photo-v1') activity.code.lab = {
      language: 'web', verifier: 'cat-photo-v1', starterCss: str(lab.starterCss), checks: [],
    };
  }
  if (type === 'interactive_html') activity.interactiveHtml = {
    html: str(content.html), instructions: str(content.instructions), reports_score: Boolean(content.reports_score),
  };
  if (content.format === 'open-ended') activity.format = 'open-ended';
  if (type === 'worksheet') activity.discussionEnabled = content.discussion_enabled === true;
  return activity;
}

/** Writes the shared contract fields (what the student app reads) plus the builder's full question list. */
export function activityContent(activity: Activity): Json {
  const choices = (q: Question): Choice[] => q.choices.filter(c => c.trim()).map((label, i) => ({ id: choiceId(i), label }));
  const answerId = (q: Question) => (q.answer === null ? undefined : choiceId(q.choices.slice(0, q.answer).filter(c => c.trim()).length));
  const first = activity.questions[0];
  const base: Json = { title: activity.title, questions: activity.questions };
  switch (activity.type) {
    case 'content': return { ...base, markdown: activity.markdown, ...(activity.presentation ? { presentation: activity.presentation } : {}) };
    case 'video':
    case 'slides': return { ...base, url: activity.url, caption: activity.title, markdown: activity.markdown };
    case 'check': return { ...base, prompt: first?.prompt ?? '', choices: first ? choices(first) : [], answer: first ? answerId(first) : undefined, markdown: activity.markdown };
    case 'exit': return { ...base, prompt: first?.prompt ?? '', choices: first ? choices(first) : [], markdown: activity.markdown };
    case 'worksheet': return {
      ...base, markdown: activity.markdown, format: activity.format, discussion_enabled: !!activity.discussionEnabled,
      fields: activity.questions.map((q, i) => q.choices.some(c => c.trim())
        ? { id: 'f' + i, kind: 'multiple_choice', prompt: q.prompt, choices: choices(q) }
        : { id: 'f' + i, kind: activity.format === 'open-ended' ? 'long_answer' : 'short_answer', prompt: q.prompt }),
    };
    case 'pretest':
    case 'posttest': return {
      ...base, markdown: activity.markdown,
      items: activity.questions.map((q, i) => ({ id: 'q' + i, concept: q.concept, prompt: q.prompt, choices: choices(q), answer: answerId(q) })),
    };
    case 'interactive_html': return { ...base, ...activity.interactiveHtml };
    case 'code': return {
      ...base, prompt: activity.markdown, markdown: activity.markdown, starter_code: activity.code?.starter ?? '',
      tests: (activity.code?.tests ?? '').split('\n').filter(line => line.trim()).map((assertion, i) => ({ name: 'Test ' + (i + 1), assertion })),
      solution: activity.code?.solution ?? '',
      ...(activity.code?.lab?.verifier ? { lab: activity.code.lab } : {}),
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

function toSubmission(row: Row): Submission {
  return {
    id: String(row.id), assignmentId: String(row.assignment_id), studentId: String(row.class_student_id),
    responses: (row.responses ?? {}) as Submission['responses'], manualScores: (row.manual_scores ?? {}) as Submission['manualScores'],
    rubricScores: (row.rubric_scores ?? {}) as Submission['rubricScores'],
    feedback: str(row.feedback), submittedAt: str(row.submitted_at), gradedAt: (row.graded_at as string | null) ?? null,
  };
}

// ---- Progress ----

type ActivityInfo = { type: string; moduleId: string };

/**
 * Which tries count, matching the database rules in 1001_student_progress.sql
 * (Shivraj's handoff, "Scoring rules other code must match"):
 * pretest counts try #1 only; post-test counts the best of the first N tries
 * (class_module_settings.max_posttest_tries, migration 2006); everything else counts the best try.
 */
function countedScore(rows: Row[], info: ActivityInfo | undefined, maxTries: number | undefined): number | null {
  const scored = (list: Row[]) => list.map(r => r.score).filter((v): v is number | string => v !== null && v !== undefined).map(Number);
  const byTry = rows.slice().sort((a, b) => Number(a.attempt_no) - Number(b.attempt_no));
  if (info?.type === 'pretest') return scored(byTry.slice(0, 1))[0] ?? null;
  // No rule for the module (a module outside the class's course): which tries count is unknown.
  if (info?.type === 'posttest' && maxTries === undefined) return null;
  const pool = info?.type === 'posttest' ? byTry.filter(r => Number(r.attempt_no) <= (maxTries as number)) : byTry;
  const scores = scored(pool);
  return scores.length ? Math.max(...scores) : null;
}

function learnersFor(classId: string, roster: Row[], attempts: Row[], activities: Map<string, ActivityInfo>, rules: ClassRules): Learner[] {
  return roster.slice().sort((a, b) => str(a.created_at).localeCompare(str(b.created_at))).map(student => {
    const mine = attempts.filter(a => a.class_id === classId && student.profile_id && a.student_id === student.profile_id);
    const byActivity = new Map<string, Row[]>();
    for (const attempt of mine) byActivity.set(String(attempt.activity_id), [...(byActivity.get(String(attempt.activity_id)) ?? []), attempt]);
    const list: Attempt[] = [...byActivity.entries()].map(([activityId, rows]) => {
      const info = activities.get(activityId);
      const counted = countedScore(rows, info, info && rules.maxTries[info.moduleId]);
      const latest = rows.slice().sort((a, b) => Number(b.attempt_no) - Number(a.attempt_no))[0];
      return {
        activityId, count: rows.length, submitted: rows.some(r => r.submitted_at),
        score: counted === null ? null : counted * 100,
        minutes: Math.round(rows.reduce((sum, r) => sum + Number(r.time_on_task_ms ?? 0), 0) / 60_000),
        response: typeof latest.response === 'string' ? latest.response : undefined,
      };
    });
    const last = mine.map(a => str(a.submitted_at)).filter(Boolean).sort().at(-1) ?? null;
    return { id: String(student.id), name: str(student.display_name), passcode: str(student.passcode), baseline: null, attempts: list, hints: [], lastActive: last };
  });
}

// ---- Load ----

/** Supabase returns at most `max_rows` (1000) rows per request; read every page. */
const PAGE = 1000;
async function selectAll(supabase: SupabaseClient, table: string, columns: string, orderBy = ['id']): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    // A stable order keeps pages from overlapping or skipping rows.
    let query = supabase.from(table).select(columns);
    for (const column of orderBy) query = query.order(column);
    const { data, error } = await query.range(from, from + PAGE - 1);
    fail(`load ${table}`, error);
    rows.push(...((data ?? []) as unknown as Row[]));
    if (!data || data.length < PAGE) return rows;
  }
}

const courseColumns = 'id, title, description, level, owner_id, is_library, copied_from, publication_revision, created_at, modules (id, position, title, concept, published, lessons (id, position, title, activities (id, position, type, concept, points, content, activity_keys (key))))';

function toCourse(c: Row): Course {
  const course: Course = {
    id: String(c.id), title: str(c.title), description: str(c.description), level: titleCase(str(c.level) || 'beginner'),
    publicationRevision: Number(c.publication_revision ?? 0),
    modules: (arr(c.modules) as Row[]).sort(byPosition).map(m => ({
      id: String(m.id), title: str(m.title), published: Boolean(m.published),
      lessons: (arr(m.lessons) as Row[]).sort(byPosition).map(l => ({
        id: String(l.id), title: str(l.title), activities: (arr(l.activities) as Row[]).sort(byPosition).map(toActivity),
      })),
    })),
  };
  if (c.is_library) course.library = true;
  if (c.copied_from) course.copiedFrom = String(c.copied_from);
  return course;
}

/**
 * Copies a library course into a course the signed-in instructor owns (copy_library_course,
 * migration 2004) and returns the copy. The database makes the copy, answer keys included.
 */
export async function importLibraryCourse(supabase: SupabaseClient, libraryCourseId: string): Promise<Course> {
  const copied = await supabase.rpc('copy_library_course', { p_course_id: libraryCourseId });
  fail('import the course', copied.error);
  const loaded = await supabase.from('courses').select(courseColumns).eq('id', copied.data as string).single();
  fail('load the imported course', loaded.error);
  return toCourse(loaded.data as Row);
}

/** program_settings (migration 2006): the single row of CIC-wide thresholds. */
function toSettings(rows: Row[] | null): ProgramSettings {
  const row = rows?.[0];
  if (!row) throw new Error('Could not load program settings: program_settings has no row. Apply supabase/migrations/2006_program_settings_and_rules.sql.');
  return { inactiveDays: Number(row.inactive_days), lowScorePct: Number(row.low_score_pct) };
}

/** One class's rules: class_module_settings rows (pass mark 0..1 in the database, 0-100 here) plus program settings. */
function rulesFor(classId: string, rows: Row[], settings: ProgramSettings): ClassRules {
  const rules: ClassRules = { ...settings, passMark: {}, maxTries: {} };
  for (const row of rows) {
    if (row.class_id !== classId) continue;
    rules.passMark[String(row.module_id)] = Number(row.pass_mark) * 100;
    rules.maxTries[String(row.module_id)] = Number(row.max_posttest_tries);
  }
  return rules;
}

export async function loadLiveData(supabase: SupabaseClient, role: StaffRole, displayName: string): Promise<InstructorData> {
  const [courses, classes, attempts, moduleSettings, programSettings] = await Promise.all([
    // Includes published library courses (RLS "read published courses") so instructors can import them.
    supabase.from('courses').select(courseColumns).order('created_at'),
    supabase.from('classes').select('id, name, school, course_id, join_code, created_at, class_modules (module_id), class_students (id, display_name, passcode, profile_id, created_at), assignments (*), assignment_submissions (*)').order('created_at'),
    selectAll(supabase, 'activity_attempts', 'id, student_id, activity_id, class_id, score, submitted_at, time_on_task_ms, attempt_no, response'),
    selectAll(supabase, 'class_module_settings', 'class_id, module_id, pass_mark, max_posttest_tries', ['class_id', 'module_id']),
    supabase.from('program_settings').select('inactive_days, low_score_pct'),
  ]);
  fail('load courses', courses.error);
  fail('load classes', classes.error);
  fail('load program_settings', programSettings.error);
  const settings = toSettings(programSettings.data as Row[] | null);

  const courseList = (courses.data as Row[]).map(toCourse);
  const activityInfo = new Map<string, ActivityInfo>(courseList.flatMap(course => course.modules.flatMap(m =>
    m.lessons.flatMap(l => l.activities.map(a => [a.id, { type: a.type, moduleId: m.id }] as const)))));
  const classList: ClassGroup[] = (classes.data as Row[]).map(c => {
    const rules = rulesFor(String(c.id), moduleSettings, settings);
    return {
      id: String(c.id), name: str(c.name), school: str(c.school), courseId: String(c.course_id), joinCode: str(c.join_code),
      moduleIds: (arr(c.class_modules) as Row[]).map(m => String(m.module_id)),
      learners: learnersFor(String(c.id), arr(c.class_students) as Row[], attempts, activityInfo, rules),
      assignments: (arr(c.assignments) as Row[]).sort((a, b) => str(a.created_at).localeCompare(str(b.created_at))).map(toAssignment),
      submissions: (arr(c.assignment_submissions) as Row[]).map(toSubmission),
      rules,
    };
  });
  return {
    courses: courseList,
    classes: classList,
    settings,
    // The signed-in person; RLS already limits classes to the ones they can see.
    staff: [{ id: role, name: displayName, role, classIds: classList.map(group => group.id) }],
  };
}

// ---- Save: diff previous vs next and write only what changed ----

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Deletes only rows this browser loaded and the user then removed (in `before`, not in `after`).
 * Never "everything not in my list": a browser opened before a teammate added something would
 * otherwise delete their work on its next save.
 */
async function deleteRemoved(supabase: SupabaseClient, table: string, before: string[], after: string[]) {
  const keep = new Set(after);
  const removed = before.filter(id => !keep.has(id));
  if (removed.length) fail(`remove ${table}`, (await supabase.from(table).delete().in('id', removed)).error);
}

async function upsert(supabase: SupabaseClient, table: string, rows: Row[]) {
  if (rows.length) fail(`save ${table}`, (await supabase.from(table).upsert(rows)).error);
}

/** Database rows for one course's modules, lessons and activities, in display order. */
function courseRows(course: Course) {
  const modules = course.modules.map((m, i) => ({
    id: m.id, course_id: course.id, position: i + 1, title: m.title.trim() || 'Untitled module',
    concept: m.lessons.flatMap(l => l.activities).flatMap(a => a.questions).find(q => q.concept.trim())?.concept.trim() || m.title, published: m.published,
  }));
  const lessons = course.modules.flatMap(m => m.lessons.map((l, i) => ({ id: l.id, module_id: m.id, position: i + 1, title: l.title.trim() || 'Untitled lesson', is_checkpoint: false })));
  const activities = course.modules.flatMap(m => m.lessons.flatMap(l => l.activities.map((a, i) => ({
    id: a.id, lesson_id: l.id, position: i + 1, type: a.type, concept: a.questions.find(q => q.concept.trim())?.concept.trim() || '',
    points: a.questions.length || (a.type === 'code' ? 1 : 0), content: activityContent(a),
  }))));
  return { modules, lessons, activities };
}

/** Rows that are new or differ from what this browser loaded. Unchanged rows are not rewritten. */
function changedRows<T extends { id: string }>(before: T[], after: T[]) {
  const old = new Map(before.map(row => [row.id, row]));
  return after.filter(row => !same(old.get(row.id), row));
}

export async function publishLiveCourse(supabase: SupabaseClient, course: Course, previous: Course | undefined, moduleId: string, expectedRevision: number | undefined) {
  const before = previous ? courseRows(previous) : { modules: [], lessons: [], activities: [] };
  const next = courseRows(course);
  const level = course.level.toLowerCase();
  const { data, error } = await supabase.rpc('publish_curriculum', {
    p_course: { id: course.id, title: course.title.trim(), description: course.description, level: levels.includes(level) ? level : 'beginner' },
    p_module_id: moduleId,
    p_expected_revision: expectedRevision ?? null,
    p_modules: changedRows(before.modules, next.modules),
    p_lessons: changedRows(before.lessons, next.lessons),
    p_activities: changedRows(before.activities, next.activities),
    p_removed_lessons: before.lessons.filter(row => !next.lessons.some(item => item.id === row.id)).map(row => row.id),
    p_removed_activities: before.activities.filter(row => !next.activities.some(item => item.id === row.id)).map(row => row.id),
  });
  fail('publish the module', error);
  return Number(data);
}

async function syncCourse(supabase: SupabaseClient, userId: string, course: Course, prev: Course | undefined) {
  const level = course.level.toLowerCase();
  const row: Row = { id: course.id, title: course.title.trim() || 'Untitled course', description: course.description, level: levels.includes(level) ? level : 'beginner' };
  if (!prev) Object.assign(row, { owner_id: userId, published: true });
  const prevRow = prev && { title: prev.title.trim() || 'Untitled course', description: prev.description, level: prev.level.toLowerCase() };
  if (!prev || !same(prevRow, { title: row.title, description: row.description, level })) fail('save the course', (await supabase.from('courses').upsert(row)).error);

  // Write only what this browser changed. Rewriting every row would put back modules a teammate
  // deleted and overwrite their newer edits (and answer keys) with this browser's older copy.
  const next = courseRows(course);
  const before = prev ? courseRows(prev) : { modules: [], lessons: [], activities: [] };
  // Remove rows the user deleted first, so their positions are free.
  await deleteRemoved(supabase, 'activities', before.activities.map(a => a.id), next.activities.map(a => a.id));
  await deleteRemoved(supabase, 'lessons', before.lessons.map(l => l.id), next.lessons.map(l => l.id));
  await deleteRemoved(supabase, 'modules', before.modules.map(m => m.id), next.modules.map(m => m.id));
  await upsert(supabase, 'modules', changedRows(before.modules, next.modules));
  await upsert(supabase, 'lessons', changedRows(before.lessons, next.lessons));
  await upsert(supabase, 'activities', changedRows(before.activities, next.activities));
}

export async function saveLiveClass(
  supabase: SupabaseClient, userId: string, next: ClassGroup, prev?: ClassGroup, attempted?: ClassGroup,
) {
  // A failed class setup may have written some rows. Remove ones omitted on retry,
  // and still upsert every requested row until a save has completed.
  const removable = prev ?? attempted;
  if (!prev || !same({ ...prev, learners: 0, assignments: 0, moduleIds: 0, submissions: 0 }, { ...next, learners: 0, assignments: 0, moduleIds: 0, submissions: 0 })) {
    const row: Row = { id: next.id, name: next.name, school: next.school, course_id: next.courseId, join_code: next.joinCode };
    if (!prev) row.created_by = userId;
    fail('save the class', (await supabase.from('classes').upsert(row)).error);
  }
  if (!prev || !same(prev.moduleIds, next.moduleIds)) {
    const keep = new Set(next.moduleIds);
    const unassigned = (removable?.moduleIds ?? []).filter(id => !keep.has(id));
    if (unassigned.length) fail('update assigned modules', (await supabase.from('class_modules').delete().eq('class_id', next.id).in('module_id', unassigned)).error);
    const before = new Set(prev?.moduleIds ?? []);
    const added = next.moduleIds.filter(id => !before.has(id)).map(module_id => ({ class_id: next.id, module_id }));
    if (added.length) fail('update assigned modules', (await supabase.from('class_modules').upsert(added, { ignoreDuplicates: true })).error);
  }
  const prevLearners = new Map((prev?.learners ?? []).map(l => [l.id, l]));
  const learners = next.learners;
  if (!prev || !same(prev.learners.map(l => [l.id, l.name, l.passcode]), learners.map(l => [l.id, l.name, l.passcode]))) {
    await deleteRemoved(supabase, 'class_students', (removable?.learners ?? []).map(l => l.id), learners.map(l => l.id));
    await upsert(supabase, 'class_students', learners
      .filter(l => { const old = prevLearners.get(l.id); return !old || old.name !== l.name || old.passcode !== l.passcode; })
      .map(l => ({ id: l.id, class_id: next.id, display_name: l.name, passcode: l.passcode })));
  }
  // Instructors only grade submissions (scores, feedback); students create them.
  const prevSubmissions = new Map((prev?.submissions ?? []).map(s => [s.id, s]));
  for (const submission of next.submissions ?? []) {
    if (same(prevSubmissions.get(submission.id), submission)) continue;
    const result = await supabase.from('assignment_submissions').update({
      manual_scores: submission.manualScores, rubric_scores: submission.rubricScores, feedback: submission.feedback, graded_at: submission.gradedAt, graded_by: submission.gradedAt ? userId : null,
    }).eq('id', submission.id).select('id');
    fail('save the grade', result.error);
    // RLS hides rows instead of erroring, so an update that matched nothing was not allowed.
    if (!result.data?.length) throw new Error('Could not save the grade: you do not have access to this submission.');
  }
  const prevAssignments = new Map((prev?.assignments ?? []).map(a => [a.id, a]));
  const assignments = next.assignments ?? [];
  if (!prev || !same(prev.assignments ?? [], assignments)) {
    await deleteRemoved(supabase, 'assignments', (prev?.assignments ?? []).map(a => a.id), assignments.map(a => a.id));
    await upsert(supabase, 'assignments', assignments.filter(a => !same(prevAssignments.get(a.id), a)).map(a => assignmentRow(a, next.id)));
  }
}

/** `editLibrary`: admins may change shared library courses; everyone else edits their own imported copy. */
export async function saveLiveData(supabase: SupabaseClient, userId: string, prev: InstructorData, next: InstructorData, { editLibrary = false } = {}) {
  const prevCourses = new Map(prev.courses.map(c => [c.id, c]));
  for (const course of next.courses) {
    // Library courses are shared: only admins write them; instructors edit their imported copy.
    const prevCourse = prevCourses.get(course.id);
    if (!editLibrary && (course.library || prevCourse?.library)) continue;
    if (!same(prevCourse, course)) await syncCourse(supabase, userId, course, prevCourse);
  }
  const prevClasses = new Map(prev.classes.map(c => [c.id, c]));
  for (const group of next.classes) {
    if (!same(prevClasses.get(group.id), group)) await saveLiveClass(supabase, userId, group, prevClasses.get(group.id));
  }
}
