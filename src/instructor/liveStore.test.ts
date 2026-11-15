import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { newAssignment } from './assignments/model';
import { importLibraryCourse, loadLiveData, saveLiveData } from './liveStore';
import type { ClassGroup, Course, InstructorData } from './model';

type Call = { table: string; op: string; payload?: unknown; filters: [string, ...unknown[]][] };

/** Records every query; `respond` decides what each one returns. */
function fakeSupabase(respond: (call: Call) => { data: unknown; error: null } = () => ({ data: [{ id: 'x' }], error: null })) {
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

  it('loads library courses as read-only and remembers where a copy came from', async () => {
    const { client } = fakeSupabase(call => ({
      data: call.table === 'courses'
        ? [{ id: 'lib-1', title: 'AI Academy', is_library: true, modules: [] }, { id: 'mine', title: 'AI Academy', is_library: false, copied_from: 'lib-1', modules: [] }]
        : [],
      error: null,
    }));
    const loaded = await loadLiveData(client, 'instructor', 'T');
    expect(loaded.courses.map(c => [c.id, c.library, c.copiedFrom])).toEqual([['lib-1', true, undefined], ['mine', undefined, 'lib-1']]);
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
});

describe('loadLiveData', () => {
  it('reads every page of attempts past the 1000-row limit', async () => {
    const pageOf = (from: number, size: number) => Array.from({ length: size }, (_, i) => ({ id: `t${from + i}`, class_id: 'c', student_id: 's', activity_id: 'a', score: 1, attempt_no: 1 }));
    const { client, calls } = fakeSupabase(call => {
      if (call.table !== 'activity_attempts') return { data: [], error: null };
      const [, from] = call.filters.find(f => f[0] === 'range') as [string, number];
      return { data: from === 0 ? pageOf(0, 1000) : pageOf(1000, 5), error: null };
    });
    await loadLiveData(client, 'instructor', 'T');
    expect(calls.filter(c => c.table === 'activity_attempts').map(c => c.filters.find(f => f[0] === 'range'))).toEqual([['range', 0, 999], ['range', 1000, 1999]]);
  });
});
