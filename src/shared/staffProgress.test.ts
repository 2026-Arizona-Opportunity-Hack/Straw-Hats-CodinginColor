import type { SupabaseClient } from '@supabase/supabase-js';
import { expect, it, vi } from 'vitest';
import { loadStaffProgress } from './staffProgress';

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
