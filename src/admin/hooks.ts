import { queryOptions, useQuery } from '@tanstack/react-query'
import { useLocation, useMatch } from 'react-router-dom'
import { listApplications, listIssues, loadOrgData } from './api.ts'

export const ORG_KEY = ['admin', 'org'] as const

export function orgQueryOptions(classId?: string) {
  return queryOptions({
    queryKey: classId ? [...ORG_KEY, 'class', classId] as const : ORG_KEY,
    queryFn: () => loadOrgData(classId),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
}

/** The report, toolbar and palette share the same snapshot for the current class filter. */
export function useOrg(enabled = true) {
  const analytics = useMatch('/admin/analytics')
  const { search } = useLocation()
  const classId = analytics ? new URLSearchParams(search).get('class') || undefined : undefined
  return useQuery({ ...orgQueryOptions(classId), enabled })
}

// Optional tables: no retry, so a missing table explains itself right away.
export const useIssues = () => useQuery({ queryKey: ['admin', 'issues'], queryFn: listIssues, retry: false })
export const useApplications = () => useQuery({ queryKey: ['admin', 'applications'], queryFn: listApplications, retry: false })
