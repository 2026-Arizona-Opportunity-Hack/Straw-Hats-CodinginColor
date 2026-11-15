import { supabase } from '../../shared/supabase';
import type { NameField } from '../../instructor/roster';

export type RosterSuggestions = Record<NameField, number[]>;

export async function suggestRosterMapping(headers: string[], signal: AbortSignal): Promise<RosterSuggestions> {
  const indexedHeaders = headers.flatMap((label, column) => label ? [{ column, label }] : []);
  const session = await supabase?.auth.getSession();
  const token = session?.data.session?.access_token;
  const response = await fetch('/api/roster-mapping', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    body: JSON.stringify({ headers: indexedHeaders }),
    signal,
  });
  if (!response.ok) throw new Error('Column suggestions are unavailable.');
  const { suggestions } = await response.json() as { suggestions: RosterSuggestions };
  for (const field of ['full', 'first', 'last'] as const) {
    if (!Array.isArray(suggestions?.[field]) || suggestions[field].length > 3 ||
      suggestions[field].some(column => !Number.isInteger(column) || !headers[column])) {
      throw new Error('Invalid column suggestions.');
    }
  }
  return suggestions;
}
