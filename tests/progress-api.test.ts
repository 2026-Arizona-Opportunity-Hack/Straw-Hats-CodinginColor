import { createHash } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import handler from '../api/progress.ts';

const key = `cic_live_${'a'.repeat(32)}`;
const hash = createHash('sha256').update(key).digest('hex');
const report = { version: 1, generated_at: '2026-11-15T00:00:00Z', cohorts: [] };
function request(authorization = `Bearer ${key}`, method = 'GET', query = '') {
  return handler.fetch(new Request(`http://localhost/api/progress${query}`, { method, headers: { Authorization: authorization } }));
}
function services({ stored = [{ key_hash: hash, revoked_at: null as string | null }], rpc = report as object | null, failure = '' } = {}) {
  const fetcher = vi.fn(async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = new URL(String(input));
    if (failure && url.pathname.endsWith(failure)) return Response.json({ message: 'private DB details' }, { status: 500 });
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer fixture-server-secret');
    expect(String(input) + String(init?.body)).not.toContain(key);
    if (url.pathname.endsWith('/api_keys')) {
      expect(url.searchParams.get('key_hash')).toBe(`eq.${hash}`);
      expect(url.searchParams.get('revoked_at')).toBe('is.null');
      return Response.json(stored);
    }
    expect(url.pathname).toBe('/rest/v1/rpc/read_api_progress');
    expect(JSON.parse(String(init?.body))).toEqual({ p_key_hash: hash });
    return Response.json(rpc);
  });
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}
beforeEach(() => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'fixture-server-secret');
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it.each(['', 'Bearer jwt', `Bearer ${key}extra`])('rejects malformed authorization without database access (%s)', async authorization => {
  const fetcher = services();
  expect((await request(authorization)).status).toBe(401);
  expect(fetcher).not.toHaveBeenCalled();
});
it.each([{ stored: [] }, { stored: [{ key_hash: hash, revoked_at: '2026-11-15' }] }, { stored: [{ key_hash: 'b'.repeat(64), revoked_at: null }] }])('rejects missing, revoked or mismatched keys', async ({ stored }) => {
  const fetcher = services({ stored });
  expect((await request()).status).toBe(401);
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it('uses fresh authorization and returns only the aggregate RPC result without caching', async () => {
  const fetcher = services();
  const response = await request();
  expect(response.status).toBe(200);
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  expect(response.headers.get('Vary')).toBe('Authorization');
  expect(await response.json()).toEqual(report);
  await request();
  expect(fetcher).toHaveBeenCalledTimes(4);
});
it('rejects a key revoked between lookup and aggregation', async () => {
  services({ rpc: null });
  expect((await request()).status).toBe(401);
});
it.each(['api_keys', 'read_api_progress'])('fails closed on %s errors without leaking database details', async failure => {
  services({ failure });
  const response = await request();
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: 'Progress reporting is unavailable.' });
});
it('does not accept mutations, query filters, or missing server configuration', async () => {
  const fetcher = services();
  expect((await request(undefined, 'POST')).status).toBe(405);
  expect((await request(undefined, 'GET', '?student_id=anything')).status).toBe(400);
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
  expect((await request()).status).toBe(503);
  expect(fetcher).not.toHaveBeenCalled();
});
