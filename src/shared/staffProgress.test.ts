import type { SupabaseClient } from '@supabase/supabase-js';
import { expect, it, vi } from 'vitest';
import { loadStaffClassProgress, loadStaffProgress } from './staffProgress';

it.each([
  { data: null, error: { code: 'PGRST202', message: 'Missing function' } },
  { data: null, error: { code: '42501', message: 'STAFF_ONLY' } },
  { data: [], error: null },
])('refuses missing, denied or malformed snapshots', async reply => {
  const client = { rpc: vi.fn().mockResolvedValue(reply) };
  await expect(loadStaffProgress(client as unknown as SupabaseClient)).rejects.toThrow(/3008_staff_progress_snapshot/);
});

it('accepts a legitimate empty snapshot without substituting mock counts', async () => {
  const client = { rpc: vi.fn().mockResolvedValue({ data: { modules: [] }, error: null }) };
  expect(await loadStaffProgress(client as unknown as SupabaseClient)).toEqual([]);
  expect(client.rpc).toHaveBeenCalledWith('staff_progress_snapshot');
});

it('sends the selected class and passes cancellation through to Supabase', async () => {
  const { signal } = new AbortController();
  const abortSignal = vi.fn().mockResolvedValue({ data: { modules: [] }, error: null });
  const client = { rpc: vi.fn().mockReturnValue({ abortSignal }) };
  expect(await loadStaffClassProgress(client as unknown as SupabaseClient, 'class-a', signal)).toEqual([]);
  expect(client.rpc.mock.calls).toEqual([['staff_class_progress', { p_class_id: 'class-a' }]]);
  expect(abortSignal).toHaveBeenCalledWith(signal);
});

it.each([
  { data: null, error: { code: 'PGRST202', message: 'Missing function' } },
  { data: null, error: { code: '42501', message: 'CLASS_NOT_AVAILABLE' } },
  { data: { modules: [{ class_id: 'class-b' }] }, error: null },
])('refuses unavailable or cross-class progress without falling back', async reply => {
  const client = { rpc: vi.fn().mockResolvedValue(reply) };
  await expect(loadStaffClassProgress(client as unknown as SupabaseClient, 'class-a')).rejects.toThrow(/class progress/);
  expect(client.rpc.mock.calls).toEqual([['staff_class_progress', { p_class_id: 'class-a' }]]);
});
