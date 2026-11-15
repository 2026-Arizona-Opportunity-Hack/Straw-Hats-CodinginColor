import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { newAssignment } from './assignments/model';
import { activityContent, importLibraryCourse, loadLiveData, saveLiveClass, saveLiveData } from './liveStore';
import type { ClassGroup, Course, InstructorData } from './model';

type Call = { table: string; op: string; payload?: unknown; filters: [string, ...unknown[]][] };
type Reply = { data: unknown; error: null | { message: string; code?: string } };

/** The seeded program_settings row (migration 2006). */
const settingsRow = { inactive_days: 3, low_score_pct: 60 };
/** Answers program_settings like the database; everything else from `respond`. */
const withSettings = (respond: (call: Call) => Reply) => (call: Call): Reply =>
  call.table === 'program_settings' ? { data: [settingsRow], error: null } : respond(call);

/** Records every query; `respond` decides what each one returns. */
function fakeSupabase(respond: (call: Call) => Reply = () => ({ data: [{ id: 'x' }], error: null })) {
  const calls: Call[] = [];
  const client = {
    from(table: string) {
      const call: Call = { table, op: 'select', filters: [] };
      const builder: Record<string, unknown> = {
        then: (resolve: (value: unknown) => void) => { calls.push(call); resolve(respond(call)); },
      };
      for (const op of ['select', 'delete', 'upsert', 'update']) {
        builder[op] = (payload?: unknown) => { if (op !== 'select' || call.op === 'select') { call.op = op; call.payload = payload; } return builder; };
      }
      for (const filter of ['eq', 'in', 'not', 'order', 'range', 'single']) {
        builder[filter] = (...args: unknown[]) => { call.filters.push([filter, ...args]); return builder; };
      }
      return builder;
    },
    rpc(fn: string, args: unknown) {
      const call: Call = { table: fn, op: 'rpc', payload: args, filters: [] };
      calls.push(call);
      return Promise.resolve(respond(call));
    },
  };
  return { client: client as unknown as SupabaseClient, calls };
}

const klass = (assignments: ClassGroup['assignments']): ClassGroup => ({
  id: 'class-1', name: 'P3', school: 'S', courseId: 'course-1', joinCode: 'J', moduleIds: [], learners: [], assignments, submissions: [],
});
const data = (patch: Partial<InstructorData>): InstructorData => ({ courses: [], classes: [], staff: [], ...patch });

describe('saveLiveClass', () => {
  it('removes draft rows dropped after a failed setup and retries all selected rows', async () => {
    const student = (id: string) => ({
      id, name: id, passcode: '123456', baseline: null, attempts: [], hints: [], lastActive: null,
    });
    const kept = student('Kept');
    const omitted = student('Omitted');
    const attempted = { ...klass([]), learners: [kept, omitted], moduleIds: ['keep', 'omit'] };
    const next = { ...attempted, learners: [kept], moduleIds: ['keep'] };
    const { client, calls } = fakeSupabase();

    await saveLiveClass(client, 'user', next, undefined, attempted);

    expect(calls.filter(call => call.op === 'delete').map(({ table, filters }) => ({ table, filters }))).toEqual([
      { table: 'class_modules', filters: [['eq', 'class_id', next.id], ['in', 'module_id', ['omit']]] },
      { table: 'class_students', filters: [['in', 'id', [omitted.id]]] },
    ]);
    expect(calls.filter(call => call.op === 'upsert').map(({ table, payload }) => ({ table, payload }))).toMatchObject([
      { table: 'classes', payload: { id: next.id } },
      { table: 'class_modules', payload: [{ class_id: next.id, module_id: 'keep' }] },
      { table: 'class_students', payload: [{ class_id: next.id, id: kept.id }] },
    ]);
  });
});

describe('saveLiveData', () => {
  it('never deletes an assignment this browser did not load (stale browser)', async () => {
    const mine = { ...newAssignment('quiz'), id: 'mine', title: 'Mine' };
    const { client, calls } = fakeSupabase();
    // A teammate added another assignment after this browser loaded; this browser edits its own.
    await saveLiveData(client, 'user', data({ classes: [klass([mine])] }), data({ classes: [klass([{ ...mine, title: 'Mine, edited' }])] }));
    expect(calls.filter(c => c.op === 'delete')).toEqual([]);
    expect(calls.find(c => c.table === 'assignments' && c.op === 'upsert')?.payload).toMatchObject([{ id: 'mine', title: 'Mine, edited' }]);
  });

  it('deletes exactly the assignment the user removed', async () => {
    const a = { ...newAssignment('quiz'), id: 'a' };
    const b = { ...newAssignment('quiz'), id: 'b' };
    const { client, calls } = fakeSupabase();
    await saveLiveData(client, 'user', data({ classes: [klass([a, b])] }), data({ classes: [klass([a])] }));
    expect(calls.filter(c => c.op === 'delete')).toEqual([{ table: 'assignments', op: 'delete', payload: undefined, filters: [['in', 'id', ['b']]] }]);
  });

  it('rewrites only the activity that changed, not the rest of the course', async () => {
    const activity = (id: string, title: string) => ({ id, type: 'content' as const, title, markdown: 'text', url: '', questions: [] });
    const course = (second: string): Course => ({
      id: 'course-1', title: 'Python', description: '', level: 'Beginner',
      modules: [{ id: 'm1', title: 'Loops', published: true, lessons: [{ id: 'l1', title: 'L', activities: [activity('a1', 'One'), activity('a2', second)] }] }],
    });
    const { client, calls } = fakeSupabase();
    await saveLiveData(client, 'user', data({ courses: [course('Two')] }), data({ courses: [course('Two, edited')] }));
    const written = calls.filter(c => c.op === 'upsert');
    expect(written.map(c => c.table)).toEqual(['activities']);
    expect((written[0].payload as { id: string }[]).map(row => row.id)).toEqual(['a2']);
  });
});

describe('library courses', () => {
  const library = (title: string): Course => ({
    id: 'lib-1', title: 'AI Academy', description: '', level: 'Beginner', library: true,
    modules: [{ id: 'lm1', title: 'Prompts', published: true, lessons: [{ id: 'll1', title, activities: [] }] }],
  });

  it('never writes a library course back, even after it was edited', async () => {
    const { client, calls } = fakeSupabase();
    await saveLiveData(client, 'admin', data({ courses: [library('Intro')] }), data({ courses: [library('Intro, edited')] }));
    expect(calls).toEqual([]);
  });

  it('lets an admin edit a library course', async () => {
    const { client, calls } = fakeSupabase();
    await saveLiveData(client, 'admin', data({ courses: [library('Intro')] }), data({ courses: [library('Intro, edited')] }), { editLibrary: true });
    expect(calls.find(c => c.table === 'lessons' && c.op === 'upsert')?.payload).toMatchObject([{ id: 'll1', title: 'Intro, edited' }]);
  });

  it('loads library courses and retains local scope even when the source was removed', async () => {
    const { client } = fakeSupabase(withSettings(call => ({
      data: call.table === 'courses'
        ? [
          { id: 'lib-1', title: 'AI Academy', is_library: true, modules: [] },
          { id: 'mine', title: 'AI Academy', copied_from: 'lib-1', local_curricula: { course_id: 'mine' }, modules: [] },
          { id: 'orphan', title: 'School lessons', copied_from: null, local_curricula: { course_id: 'orphan' }, modules: [] },
        ]
        : [],
      error: null,
    })));
    const loaded = await loadLiveData(client, 'instructor', 'T');
    expect(loaded.courses.map(c => [c.id, c.library, c.copiedFrom, c.local])).toEqual([
      ['lib-1', true, undefined, undefined], ['mine', undefined, 'lib-1', true], ['orphan', undefined, undefined, true],
    ]);
  });

  it('imports through copy_library_course and loads the new copy', async () => {
    const { client, calls } = fakeSupabase(call => ({
      data: call.op === 'rpc' ? 'copy-1' : { id: 'copy-1', title: 'AI Academy', copied_from: 'lib-1', modules: [] },
      error: null,
    }));
    const copy = await importLibraryCourse(client, 'lib-1');
    expect(calls[0]).toMatchObject({ table: 'copy_library_course', op: 'rpc', payload: { p_course_id: 'lib-1' } });
    expect(calls[1].filters).toContainEqual(['eq', 'id', 'copy-1']);
    expect(copy).toMatchObject({ id: 'copy-1', copiedFrom: 'lib-1' });
    expect(copy.library).toBeUndefined();
  });

  it('round-trips deck curation and writes false to clear a previously curated deck', async () => {
    const slides = { title: 'Workshop deck', url: 'https://docs.google.com/presentation/d/example/view', cic_library_deck: true };
    const { client } = fakeSupabase(withSettings(call => ({
      data: call.table === 'courses'
        ? [{ id: 'library', published: true, modules: [{ id: 'm1', lessons: [{ id: 'l1', activities: [
          { id: 's1', type: 'slides', content: slides },
          { id: 's2', type: 'slides', content: { title: 'Other deck', cic_library_deck: 'true' } },
          { id: 'v1', type: 'video', content: { title: 'Video', cic_library_deck: true } },
        ] }] }] }]
        : [],
      error: null,
    })));
    const { courses: [course] } = await loadLiveData(client, 'admin', 'T');
    const [curated, unmarked, video] = course.modules[0].lessons[0].activities;
    expect(course.published).toBe(true);
    expect(curated.cicLibraryDeck).toBe(true);
    expect(unmarked.cicLibraryDeck).toBe(false);
    expect(video.cicLibraryDeck).toBeUndefined();
    expect(activityContent(curated)).toMatchObject({ cic_library_deck: true });
    expect(activityContent({ ...curated, cicLibraryDeck: false })).toMatchObject({ cic_library_deck: false });
    expect(activityContent({ ...video, cicLibraryDeck: true })).not.toHaveProperty('cic_library_deck');
  });
});

describe('loadLiveData', () => {
  it('reads every page of attempts past the 1000-row limit', async () => {
    const pageOf = (from: number, size: number) => Array.from({ length: size }, (_, i) => ({ id: `t${from + i}`, class_id: 'c', student_id: 's', activity_id: 'a', score: 1, attempt_no: 1 }));
    const { client, calls } = fakeSupabase(withSettings(call => {
      if (call.table !== 'activity_attempts') return { data: [], error: null };
      const [, from] = call.filters.find(f => f[0] === 'range') as [string, number];
      return { data: from === 0 ? pageOf(0, 1000) : pageOf(1000, 5), error: null };
    }));
    await loadLiveData(client, 'instructor', 'T');
    expect(calls.filter(c => c.table === 'activity_attempts').map(c => c.filters.find(f => f[0] === 'range'))).toEqual([['range', 0, 999], ['range', 1000, 1999]]);
  });

  const posttestCourse = {
    id: 'course-1', title: 'Python', level: 'beginner', modules: [
      { id: 'm1', position: 1, title: 'Loops', published: true, lessons: [{ id: 'l1', position: 1, title: 'L', activities: [{ id: 'post1', position: 1, type: 'posttest', concept: 'loops', content: {} }] }] },
      { id: 'm2', position: 2, title: 'Lists', published: true, lessons: [{ id: 'l2', position: 1, title: 'L', activities: [{ id: 'post2', position: 1, type: 'posttest', concept: 'lists', content: {} }] }] },
    ],
  };
  const tries = ['post1', 'post2'].flatMap(activity => [0.2, 0.4, 0.9].map((score, i) => ({
    id: `${activity}-${i}`, class_id: 'class-1', student_id: 'p1', activity_id: activity, score, attempt_no: i + 1, submitted_at: '2026-11-14T10:00:00Z', time_on_task_ms: 0,
  })));
  const classRow = { id: 'class-1', name: 'P3', course_id: 'course-1', class_modules: [{ module_id: 'm1' }, { module_id: 'm2' }], class_students: [{ id: 'cs1', display_name: 'Ana', profile_id: 'p1' }], assignments: [], assignment_submissions: [] };

  it('puts program settings and per-module class rules on the data, and counts only the first N post-test tries', async () => {
    const { client } = fakeSupabase(withSettings(call => ({
      data: {
        courses: [posttestCourse],
        classes: [classRow],
        activity_attempts: tries,
        class_module_settings: [
          { class_id: 'class-1', module_id: 'm1', pass_mark: '0.70', max_posttest_tries: 2 },
          { class_id: 'class-1', module_id: 'm2', pass_mark: 0.85, max_posttest_tries: 3 },
          { class_id: 'other', module_id: 'm1', pass_mark: 0.5, max_posttest_tries: 1 },
        ],
      }[call.table] ?? [],
      error: null,
    })));
    const loaded = await loadLiveData(client, 'instructor', 'T');
    expect(loaded.settings).toEqual({ inactiveDays: 3, lowScorePct: 60 });
    expect(loaded.classes[0].rules).toEqual({ inactiveDays: 3, lowScorePct: 60, passMark: { m1: 70, m2: 85 }, maxTries: { m1: 2, m2: 3 } });
    const score = (id: string) => loaded.classes[0].learners[0].attempts.find(a => a.activityId === id)?.score;
    expect(score('post1')).toBeCloseTo(40);
    expect(score('post2')).toBeCloseTo(90);
  });

  it('names the missing view when migration 2006 is not applied, instead of guessing numbers', async () => {
    const { client } = fakeSupabase(withSettings(call => call.table === 'class_module_settings'
      ? { data: null, error: { code: 'PGRST205', message: "Could not find the table 'public.class_module_settings' in the schema cache" } }
      : { data: [], error: null }));
    await expect(loadLiveData(client, 'instructor', 'T')).rejects.toThrow(/class_module_settings/);
  });

  it('refuses to load without the program_settings row', async () => {
    const { client } = fakeSupabase(() => ({ data: [], error: null }));
    await expect(loadLiveData(client, 'instructor', 'T')).rejects.toThrow(/program_settings has no row/);
  });
});
