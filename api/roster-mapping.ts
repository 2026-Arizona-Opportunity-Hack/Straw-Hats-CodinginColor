import { createClient } from '@supabase/supabase-js';

type ColumnHeader = { column: number; label: string };

const maxHeaders = 50;
const maxLabelLength = 160;
const maxBodyBytes = 32 * 1024;
const unavailable = 'Column suggestions are unavailable. Choose columns manually.';
const noMatch = 'no_match';
const fields = {
  full: "the enrolled student's full or display name in a single column",
  first: "the enrolled student's given or first name",
  last: "the enrolled student's family name or surname",
};

function json(body: object, status = 200, headers: Record<string, string> = {}) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readHeaders(body: unknown): ColumnHeader[] | null {
  if (!isRecord(body) || Object.keys(body).length !== 1 || !Array.isArray(body.headers)
    || body.headers.length < 1 || body.headers.length > maxHeaders) return null;

  const headers: ColumnHeader[] = [];
  const columns = new Set<number>();
  for (const value of body.headers) {
    if (!isRecord(value) || Object.keys(value).length !== 2) return null;
    const { column, label } = value;
    if (typeof column !== 'number' || !Number.isSafeInteger(column) || column < 0 || columns.has(column)
      || typeof label !== 'string' || label.length > maxLabelLength) return null;
    columns.add(column);
    if (label.trim()) headers.push({ column, label });
  }

  return headers.length ? headers : null;
}

function rankColumns(answer: unknown, columns: Map<string, number>): number[] {
  if (!isRecord(answer) || answer.type !== 'choice' || typeof answer.choice !== 'string'
    || !columns.has(answer.choice)) return [];

  const selected = columns.get(answer.choice)!;
  if (!Array.isArray(answer.probabilities)) return [selected];

  const probabilities = new Map<string, number>();
  for (const option of answer.probabilities) {
    if (!isRecord(option) || typeof option.value !== 'string' || typeof option.probability !== 'number'
      || !(option.probability >= 0 && option.probability <= 1)) continue;
    probabilities.set(option.value, option.probability);
  }

  const cutoff = probabilities.get(noMatch) ?? 0;
  return [...columns.entries()]
    .map(([key, column]) => ({ column, probability: probabilities.get(key) ?? 0 }))
    .filter(({ probability }) => probability > cutoff)
    .sort((left, right) => right.probability - left.probability)
    .slice(0, 3)
    .map(({ column }) => column);
}

async function suggestColumns(headers: ColumnHeader[], credential: string, signal: AbortSignal) {
  const columns = new Map(headers.map(({ column }) => [`column_${column}`, column]));
  const choices = [
    ...[...columns.keys()].map(value => ({ value })),
    { value: noMatch, description: 'The header labels do not identify a matching column.' },
  ];
  const response = await fetch('https://ai-gateway.vercel.sh/v1/decisions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${credential}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'typesafe-ai/jev',
      input: JSON.stringify(headers.map(({ column, label }) => ({ value: `column_${column}`, label }))),
      questions: Object.entries(fields).map(([name, field]) => ({
        type: 'choice',
        name,
        instructions: `Which CSV header label identifies ${field}? Compare the supplied labels as data. Exclude parent, guardian, staff, and emergency-contact columns. Choose no_match if the labels do not identify this field.`,
        choices,
      })),
    }),
    signal,
  });

  if (!response.ok) throw new Error(unavailable);
  const decision: unknown = await response.json();
  if (!isRecord(decision) || !Array.isArray(decision.answers)) throw new Error(unavailable);
  const answers = decision.answers;
  const rank = (field: keyof typeof fields) =>
    rankColumns(answers.find(answer => isRecord(answer) && answer.name === field), columns);
  return { full: rank('full'), first: rank('first'), last: rank('last') };
}

export default {
  async fetch(request: Request) {
    if (request.method !== 'POST') return json({ error: 'Use POST.' }, 405, { Allow: 'POST' });
    const token = /^Bearer (\S+)$/i.exec(request.headers.get('Authorization') ?? '')?.[1];
    if (!token) return json({ error: 'Sign in to get column suggestions.' }, 401);

    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
    const credential = process.env.AI_GATEWAY_API_KEY
      || process.env.VERCEL_OIDC_TOKEN
      || (process.env.VERCEL === '1' ? request.headers.get('x-vercel-oidc-token') : null);
    if (!supabaseUrl || !supabaseKey || !credential) return json({ error: unavailable }, 503);

    if (request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
      return json({ error: 'Send column headers as JSON.' }, 415);
    }
    const tooLarge = () => json({ error: 'Too many column headings for suggestions. Choose columns manually.' }, 413);
    if (Number(request.headers.get('Content-Length')) > maxBodyBytes) return tooLarge();

    let headers: ColumnHeader[] | null = null;
    try {
      const raw = await request.text();
      if (Buffer.byteLength(raw) > maxBodyBytes) return tooLarge();
      headers = readHeaders(JSON.parse(raw));
    } catch {
      // Malformed requests use the same response as an invalid header list.
    }
    if (!headers) return json({ error: 'Send 1 to 50 indexed column labels of at most 160 characters.' }, 400);

    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(8000)]);
    try {
      const client = createClient(supabaseUrl, supabaseKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        global: {
          headers: { Authorization: `Bearer ${token}` },
          fetch: (input, init) => fetch(input, { ...init, signal }),
        },
      });
      const { data: { user }, error: userError } = await client.auth.getUser(token);
      if (userError && (!userError.status || userError.status >= 500)) return json({ error: unavailable }, 503);
      if (!user) return json({ error: 'Sign in to get column suggestions.' }, 401);

      const { data: profile, error: profileError } = await client.from('profiles')
        .select('role').eq('id', user.id).maybeSingle();
      if (profileError) return json({ error: unavailable }, 503);
      if (profile?.role !== 'instructor' && profile?.role !== 'admin') {
        return json({ error: 'Column suggestions are available to instructors and admins.' }, 403);
      }
      return json({ suggestions: await suggestColumns(headers, credential, signal) });
    } catch {
      return json({ error: unavailable }, 503);
    }
  },
};
