// Owner: Shivraj. The student's courses plus each one's module progress.
// Shared by Home, My courses and My classroom so they read the same cached queries.
import { useQueries, useQuery } from '@tanstack/react-query'
import { listModuleStatus, listMyCourses } from '../api/student/index.ts'
import { useAuth } from '../shared/auth/AuthContext.tsx'

export function useMyCourseProgress() {
  const { profile } = useAuth()
  const { data: courses = [], isLoading, isError } = useQuery({ queryKey: ['myCourses', profile?.id], queryFn: listMyCourses })
  const progress = useQueries({
    queries: courses.map((c) => ({ queryKey: ['moduleStatus', profile?.id, c.id], queryFn: () => listModuleStatus(c.id) })),
  })
  const modulesOf = (id: string) => progress[courses.findIndex((c) => c.id === id)]?.data
  return { courses, progress, modulesOf, isLoading, isError }
}
