import { useQuery } from '@tanstack/react-query'
import { listApplications, listIssues, loadOrgData } from './api.ts'

export const ORG_KEY = ['admin', 'org'] as const

/** Admin edits invalidate this shared snapshot. Admins can also refresh it on demand. */
export function useOrg(enabled = true) {
  return useQuery({
    queryKey: ORG_KEY,
    queryFn: loadOrgData,
    enabled,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
}

// Optional tables: no retry, so a missing table explains itself right away.
export const useIssues = () => useQuery({ queryKey: ['admin', 'issues'], queryFn: listIssues, retry: false })
export const useApplications = () => useQuery({ queryKey: ['admin', 'applications'], queryFn: listApplications, retry: false })
