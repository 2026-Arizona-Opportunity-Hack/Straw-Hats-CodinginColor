import { useQuery } from '@tanstack/react-query'
import { loadOrgData } from './api.ts'

export const ORG_KEY = ['admin', 'org'] as const

/** One cached snapshot of org data shared by every admin page. */
export function useOrg() {
  return useQuery({ queryKey: ORG_KEY, queryFn: loadOrgData })
}
