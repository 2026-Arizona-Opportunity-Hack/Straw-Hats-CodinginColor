import { useQuery } from '@tanstack/react-query'
import { listApplications, listIssues, loadOrgData } from './api.ts'

export const ORG_KEY = ['admin', 'org'] as const

/** One cached snapshot of org data shared by every admin page. */
export function useOrg() {
  return useQuery({ queryKey: ORG_KEY, queryFn: loadOrgData, refetchInterval: 60_000 })
}

// Optional tables: no retry, so a missing table explains itself right away.
export const useIssues = () => useQuery({ queryKey: ['admin', 'issues'], queryFn: listIssues, retry: false })
export const useApplications = () => useQuery({ queryKey: ['admin', 'applications'], queryFn: listApplications, retry: false })
