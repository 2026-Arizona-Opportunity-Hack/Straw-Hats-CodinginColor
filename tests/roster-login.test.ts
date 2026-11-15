import { describe, expect, it, vi } from 'vitest';
import { rosterLogin, type RosterAuth } from '../supabase/functions/roster-login/handler.ts';

const ok = <T,>(data: T) => Promise.resolve({ data, error: null });
function setup(existing = false) {
  const calls: string[] = [];
  const auth: RosterAuth = {
    prepare: vi.fn(() => { calls.push('prepare'); return ok({ roster_id: 'card', profile_id: existing ? 'student' : null, email: 'card@students.cic.invalid' }); }),
    create: vi.fn(() => { calls.push('create'); return ok({ user: { id: 'student' } }); }),
    bind: vi.fn(() => { calls.push('bind'); return ok({ profile_id: 'student', email: 'card@students.cic.invalid' }); }),
    link: vi.fn(() => { calls.push('link'); return ok({ user: { id: 'student' }, properties: { hashed_token: 'server-only-proof' } }); }),
    verify: vi.fn(() => { calls.push('verify'); return ok({ user: { id: 'student' }, session: { access_token: 'access', refresh_token: 'refresh' } }); }),
    revoke: vi.fn(() => ok(null)),
  };
  const request = (body: unknown = { classCode: ' class-a ', passcode: '012345' }) => new Request('http://local/roster-login', { method: 'POST', body: JSON.stringify(body) });
  return { auth, calls, request };
}

describe('login card session boundary', () => {
  it('links and enrolls the real identity before issuing a session, preserving leading zeros', async () => {
    const { auth, calls, request } = setup();
    const response = await rosterLogin(request(), auth);
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).toEqual({ access_token: 'access', refresh_token: 'refresh' });
    expect(calls).toEqual(['prepare', 'create', 'bind', 'link', 'verify', 'bind']);
    expect(auth.bind).toHaveBeenCalledWith('card', 'CLASS-A', '012345', 'student');
  });
  it('reuses an existing identity without resetting its password or creating an account', async () => {
    const { auth, calls, request } = setup(true);
    expect((await rosterLogin(request(), auth)).status).toBe(200);
    expect(calls).toEqual(['prepare', 'bind', 'link', 'verify', 'bind']);
  });
  it.each([['INVALID_LOGIN', 401], ['TRY_LATER', 429]] as const)('stops before Auth for %s', async (error, status) => {
    const { auth, request } = setup();
    vi.mocked(auth.prepare).mockResolvedValue({ data: { error } as never, error: null });
    expect((await rosterLogin(request(), auth)).status).toBe(status);
    expect(auth.create).not.toHaveBeenCalled();
    expect(auth.link).not.toHaveBeenCalled();
  });
  it('returns no session when the card is removed, changed or relinked during provisioning', async () => {
    const { auth, request } = setup();
    vi.mocked(auth.bind).mockResolvedValue({ data: { error: 'INVALID_LOGIN' } as never, error: null });
    expect((await rosterLogin(request(), auth)).status).toBe(401);
    expect(auth.link).not.toHaveBeenCalled();
  });
  it('does not reuse a preclaimed synthetic account after createUser fails', async () => {
    const { auth, request } = setup();
    vi.mocked(auth.create).mockResolvedValue({ data: null, error: new Error('private identity conflict') });
    const response = await rosterLogin(request(), auth);
    expect(await response.json()).toEqual({ error: 'LOGIN_UNAVAILABLE' });
    expect(auth.bind).not.toHaveBeenCalled();
  });
  it('refuses an Auth link for a replaced user instead of exchanging its token', async () => {
    const { auth, request } = setup(true);
    vi.mocked(auth.link).mockResolvedValue({ data: { user: { id: 'other' }, properties: { hashed_token: 'other-proof' } }, error: null });
    expect((await rosterLogin(request(), auth)).status).toBe(503);
    expect(auth.verify).not.toHaveBeenCalled();
  });
  it('withholds and revokes a session if the learner was promoted, archived or their card revoked during Auth', async () => {
    const { auth, request } = setup(true);
    vi.mocked(auth.bind).mockResolvedValueOnce({ data: { profile_id: 'student', email: 'legacy@test.invalid' }, error: null })
      .mockResolvedValueOnce({ data: { error: 'INVALID_LOGIN' } as never, error: null });
    const response = await rosterLogin(request(), auth);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'INVALID_LOGIN' });
    expect(auth.revoke).toHaveBeenCalledWith('access');
  });
  it('does not mint a session for an unexpected binding result', async () => {
    const { auth, request } = setup(true);
    vi.mocked(auth.bind).mockResolvedValue({ data: { profile_id: 'other', email: 'other@test.invalid' }, error: null });
    expect((await rosterLogin(request(), auth)).status).toBe(401);
    expect(auth.link).not.toHaveBeenCalled();
  });
  it('rejects oversized bodies and malformed PINs before calling privileged code', async () => {
    const { auth, request } = setup();
    expect((await rosterLogin(request({ classCode: 'A'.repeat(2000), passcode: '012345' }), auth)).status).toBe(400);
    expect((await rosterLogin(request({ classCode: 'A', passcode: 12345 }), auth)).status).toBe(400);
    expect(auth.prepare).not.toHaveBeenCalled();
  });
});
