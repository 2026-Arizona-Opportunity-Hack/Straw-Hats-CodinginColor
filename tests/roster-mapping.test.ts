import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import handler from '../api/roster-mapping.ts';

const headers = [
  { column: 0, label: 'Parent Given Name' },
  { column: 2, label: 'Pupil Forename' },
  { column: 4, label: 'Legal Given Name' },
  { column: 5, label: 'Pupil Family Name' },
  { column: 8, label: ' Given Name ' },
  { column: 9, label: '' },
  { column: 10, label: 'Alternate Given Name' },
];
const token = 'fictional-user-token';
const gatewayUrl = 'https://ai-gateway.vercel.sh/v1/decisions';
const openRouterUrl = 'https://openrouter.ai/api/alpha/decisions';

function post(body: unknown = { headers }, authorization = `Bearer ${token}`) {
  return handler.fetch(new Request('http://localhost/api/roster-mapping', {
    method: 'POST',
    headers: { Authorization: authorization, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }));
}

function mockServices({ role = 'instructor', authorized = true, gatewayOk = true } = {}) {
  const gateway = vi.fn(async (_url: URL, _options?: RequestInit) => {
    if (!gatewayOk) return new Response('Unavailable', { status: 502 });
    return Response.json({
      answers: [
        { type: 'choice', name: 'full', choice: 'no_match' },
        {
          type: 'choice',
          name: 'first',
          choice: 'column_2',
          probabilities: [
            { value: 'column_0', probability: 0.01 },
            { value: 'no_match', probability: 0.03 },
            { value: 'column_8', probability: 0.11 },
            { value: 'column_10', probability: 0.04 },
            { value: 'column_2', probability: 0.56 },
            { value: 'column_4', probability: 0.25 },
            { value: 'column_200', probability: 1 },
          ],
        },
        { type: 'choice', name: 'last', choice: 'column_5' },
      ],
    });
  });
  const supabase = vi.fn(async (url: URL, _options?: RequestInit) => {
    if (url.pathname === '/auth/v1/user') {
      if (!authorized) return Response.json({ code: 'bad_jwt', message: 'Invalid token' }, { status: 401 });
      return Response.json({ id: 'fixture-user', user_metadata: { role: 'admin' } });
    }
    if (url.pathname === '/rest/v1/profiles') return Response.json([{ role }]);
    throw new Error(`Unexpected path ${url.pathname}`);
  });
  const openRouter = vi.fn(async (_url: URL, _options?: RequestInit) => Response.json({
    answers: {
      full: { type: 'choice', choice: 'no_match' },
      first: { type: 'choice', choice: 'column_2', probabilities: { column_0: 0.01, column_2: 0.77, column_4: 0.17, no_match: 0.05 } },
      last: { type: 'choice', choice: 'column_5', probabilities: { column_5: 0.98, no_match: 0.02 } },
    },
  }));
  vi.stubGlobal('fetch', (input: Parameters<typeof fetch>[0], options?: RequestInit) => {
    const url = new URL(String(input));
    if (url.href === gatewayUrl) return gateway(url, options);
    if (url.href === openRouterUrl) return openRouter(url, options);
    return supabase(url, options);
  });
  return { gateway, supabase, openRouter };
}

describe('roster mapping API', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'fixture-public-key');
    vi.stubEnv('OPENROUTER_API_KEY', '');
    vi.stubEnv('AI_GATEWAY_API_KEY', 'fixture-gateway-key');
    vi.stubEnv('VERCEL_OIDC_TOKEN', '');
    vi.stubEnv('VERCEL', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it.each(['instructor', 'admin'])('returns ranked known columns and sends only headers for %s', async role => {
    const { gateway, supabase } = mockServices({ role });
    const response = await post();

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).toEqual({ suggestions: { full: [], first: [2, 4, 8], last: [5] } });
    const request = gateway.mock.calls[0][1]!;
    expect(new Headers(request.headers).get('Authorization')).toBe('Bearer fixture-gateway-key');
    const body = JSON.parse(String(request.body));
    expect(body.model).toBe('typesafe-ai/jev');
    expect(JSON.parse(body.input)).toEqual(headers.filter(({ label }) => label).map(({ column, label }) => ({
      value: `column_${column}`,
      label,
    })));
    expect(body.questions.map(({ name }: { name: string }) => name)).toEqual(['full', 'first', 'last']);
    expect(body.questions[0].choices.at(-1).value).toBe('no_match');
    const [profileUrl, profileRequest] = supabase.mock.calls[1];
    expect(profileUrl.searchParams.get('select')).toBe('role');
    expect(profileUrl.searchParams.get('id')).toBe('eq.fixture-user');
    expect(new Headers(profileRequest?.headers).get('Authorization')).toBe(`Bearer ${token}`);
  });

  it.each(['student', 'reviewer'])('does not call Jev for a signed-in %s', async role => {
    const { gateway } = mockServices({ role });
    expect((await post()).status).toBe(403);
    expect(gateway).not.toHaveBeenCalled();
  });

  it('uses the configured OpenRouter key and ranks its named choice probabilities', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'fixture-openrouter-key');
    const { gateway, openRouter } = mockServices();
    const response = await post();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ suggestions: { full: [], first: [2, 4], last: [5] } });
    expect(gateway).not.toHaveBeenCalled();
    const request = openRouter.mock.calls[0][1];
    expect(new Headers(request?.headers).get('Authorization')).toBe('Bearer fixture-openrouter-key');
    const body = JSON.parse(String(request?.body));
    expect(body.model).toBe('typesafe/jev-1.14');
    expect(body.state).toEqual({ headers: headers.filter(({ label }) => label).map(({ column, label }) => ({
      value: `column_${column}`, label,
    })) });
    expect(Object.keys(body.questions)).toEqual(['full', 'first', 'last']);
    expect(body.questions.first.criteria).toMatchObject({ column_2: 'Pupil Forename', no_match: expect.any(String) });
  });

  it('checks credentials before calling Jev', async () => {
    const { gateway, supabase } = mockServices({ authorized: false });
    expect((await post({ headers }, '')).status).toBe(401);
    expect(supabase).not.toHaveBeenCalled();
    expect((await post()).status).toBe(401);
    expect(gateway).not.toHaveBeenCalled();
  });

  it('rejects row samples and duplicate column indices', async () => {
    const { gateway } = mockServices();
    expect((await post({ headers, rows: [['Fictional Pupil']] })).status).toBe(400);
    expect((await post({ headers: [{ ...headers[0], values: ['Fictional Pupil'] }] })).status).toBe(400);
    expect((await post({ headers: [headers[0], headers[0]] })).status).toBe(400);
    expect(gateway).not.toHaveBeenCalled();
  });

  it('returns a recoverable error if AI Gateway fails or is unconfigured', async () => {
    const { gateway } = mockServices({ gatewayOk: false });
    const failed = await post();
    expect(failed.status).toBe(503);
    expect(await failed.json()).toEqual({ error: 'Column suggestions are unavailable. Choose columns manually.' });

    vi.stubEnv('AI_GATEWAY_API_KEY', '');
    expect((await post()).status).toBe(503);
    expect(gateway).toHaveBeenCalledTimes(1);
  });

  it('accepts the Vercel runtime OIDC credential', async () => {
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('AI_GATEWAY_API_KEY', '');
    const { gateway } = mockServices();
    const response = await handler.fetch(new Request('http://localhost/api/roster-mapping', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'x-vercel-oidc-token': 'fixture-oidc-token',
      },
      body: JSON.stringify({ headers }),
    }));

    expect(response.status).toBe(200);
    expect(new Headers(gateway.mock.calls[0][1]?.headers).get('Authorization')).toBe('Bearer fixture-oidc-token');
  });
});
