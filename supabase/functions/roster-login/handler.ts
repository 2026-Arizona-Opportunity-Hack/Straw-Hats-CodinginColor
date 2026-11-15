type Result<T> = { data: T | null; error: unknown };
type Prepared = { error?: string; roster_id: string; profile_id: string | null; email: string };
export interface RosterAuth {
  prepare(code: string, passcode: string): Promise<Result<Prepared>>;
  create(email: string, rosterId: string): Promise<Result<{ user: { id: string } | null }>>;
  bind(rosterId: string, code: string, passcode: string, profileId: string): Promise<Result<{ error?: string; profile_id: string; email: string }>>;
  link(email: string): Promise<Result<{ user: { id: string } | null; properties: { hashed_token: string } | null }>>;
  verify(token: string): Promise<Result<{ user: { id: string } | null; session: { access_token: string; refresh_token: string } | null }>>;
  revoke(token: string): Promise<unknown>;
}
const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store',
};
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers });

export async function rosterLogin(request: Request, auth: RosterAuth): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { headers });
  if (request.method !== 'POST') return reply({ error: 'METHOD_NOT_ALLOWED' }, 405);
  try {
    // Read a bounded stream: Content-Length can be missing or dishonest.
    const reader = request.body?.getReader();
    if (!reader) return reply({ error: 'INVALID_LOGIN' }, 400);
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 1024) { await reader.cancel(); return reply({ error: 'INVALID_LOGIN' }, 400); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    let body;
    try { body = JSON.parse(new TextDecoder().decode(bytes)); }
    catch { return reply({ error: 'INVALID_LOGIN' }, 400); }
    if (typeof body?.classCode !== 'string' || !body.classCode.trim() || body.classCode.length > 100 ||
        typeof body.passcode !== 'string' || !/^\d{6}$/.test(body.passcode)) return reply({ error: 'INVALID_LOGIN' }, 400);
    const code = body.classCode.trim().toUpperCase();
    const passcode = body.passcode;
    const prepared = await auth.prepare(code, passcode);
    if (prepared.error || !prepared.data) return reply({ error: 'LOGIN_UNAVAILABLE' }, 503);
    if (prepared.data.error) return reply({ error: prepared.data.error }, prepared.data.error === 'TRY_LATER' ? 429 : 401);
    const card = prepared.data;
    let profileId = card.profile_id;
    if (!profileId) {
      const created = await auth.create(card.email, card.roster_id);
      // A concurrent first login can win creation; retry safely finds its marked identity.
      if (created.error || !created.data?.user) return reply({ error: 'LOGIN_UNAVAILABLE' }, 503);
      profileId = created.data.user.id;
    }
    const bound = await auth.bind(card.roster_id, code, passcode, profileId);
    if (bound.error || !bound.data) return reply({ error: 'LOGIN_UNAVAILABLE' }, 503);
    if (bound.data.error || bound.data.profile_id !== profileId) return reply({ error: 'INVALID_LOGIN' }, 401);
    const link = await auth.link(bound.data.email);
    if (link.error || link.data?.user?.id !== profileId || !link.data.properties?.hashed_token) return reply({ error: 'LOGIN_UNAVAILABLE' }, 503);
    const verified = await auth.verify(link.data.properties.hashed_token);
    if (verified.error || verified.data?.user?.id !== profileId || !verified.data.session) return reply({ error: 'LOGIN_UNAVAILABLE' }, 503);
    // Role, archive status and card credentials can change while Auth issues the session.
    const final = await auth.bind(card.roster_id, code, passcode, profileId);
    if (final.error || final.data?.error || final.data?.profile_id !== profileId) {
      await auth.revoke(verified.data.session.access_token);
      return reply({ error: 'INVALID_LOGIN' }, 401);
    }
    return reply({ access_token: verified.data.session.access_token, refresh_token: verified.data.session.refresh_token });
  } catch {
    // Never echo Auth errors, identifiers, passcodes or tokens into the response/log.
    return reply({ error: 'LOGIN_UNAVAILABLE' }, 503);
  }
}
