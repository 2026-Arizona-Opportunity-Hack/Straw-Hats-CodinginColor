import { createHash, timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

function json(body: object, status = 200, headers: Record<string, string> = {}) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store', Vary: 'Authorization', ...headers } });
}

export default {
  async fetch(request: Request) {
    if (request.method !== 'GET') return json({ error: 'Use GET.' }, 405, { Allow: 'GET' });
    const denied = () => json({ error: 'A valid read API key is required.' }, 401, { 'WWW-Authenticate': 'Bearer' });
    const key = /^Bearer (cic_live_[A-Za-z0-9_-]{32})$/i.exec(request.headers.get('Authorization') ?? '')?.[1];
    if (!key) return denied();
    if (new URL(request.url).search) return json({ error: 'Query parameters are not supported.' }, 400);
    const url = process.env.VITE_SUPABASE_URL;
    const credential = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const unavailable = () => json({ error: 'Progress reporting is unavailable.' }, 503);
    if (!url || !credential) return unavailable();

    try {
      const signal = AbortSignal.any([request.signal, AbortSignal.timeout(10000)]);
      const client = createClient(url, credential, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        global: { fetch: (input, init) => fetch(input, { ...init, signal }) },
      });
      const digest = createHash('sha256').update(key).digest();
      const hash = digest.toString('hex');
      const { data: stored, error } = await client.from('api_keys')
        .select('key_hash,revoked_at').eq('key_hash', hash).is('revoked_at', null).maybeSingle();
      if (error) return unavailable();
      const storedHash = stored?.key_hash;
      const expected = typeof storedHash === 'string' && /^[a-f0-9]{64}$/.test(storedHash)
        ? Buffer.from(storedHash, 'hex') : Buffer.alloc(32);
      const matches = timingSafeEqual(digest, expected);
      if (!matches || !stored || stored.revoked_at !== null) return denied();

      // Recheck revocation within the aggregate query. Never cache key validity or data.
      const { data, error: reportError } = await client.rpc('read_api_progress', { p_key_hash: hash });
      if (reportError) return unavailable();
      if (data === null) return denied();
      return json(data);
    } catch {
      return unavailable();
    }
  },
};
