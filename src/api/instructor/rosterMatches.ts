import type { SupabaseClient } from '@supabase/supabase-js'

export type RosterNameMatch = {
  imported_id: string
  imported_name: string
  account_id: string
  account_name: string
  username: string | null
}

export async function listRosterNameMatches(client: SupabaseClient, classId: string): Promise<RosterNameMatch[]> {
  const { data, error } = await client.rpc('list_roster_name_matches', { p_class_id: classId })
  if (error) throw new Error('Could not load name matches. Try refreshing.')
  return (data ?? []) as RosterNameMatch[]
}

export async function confirmRosterNameMatch(client: SupabaseClient, classId: string, match: RosterNameMatch) {
  const { error } = await client.rpc('confirm_roster_name_match', {
    p_class_id: classId,
    p_imported_id: match.imported_id,
    p_account_id: match.account_id,
  })
  if (error?.message === 'ROSTER_MATCH_CHANGED') throw new Error('This match has changed. Refresh the suggestions and review it again.')
  if (error?.code === '42501') throw new Error('You need permission to manage this class.')
  if (error) throw new Error('Could not confirm the match. Refresh the suggestions before trying again.')
}
