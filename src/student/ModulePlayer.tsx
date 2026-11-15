// Owner: Jacky. Loads the student's module and submits their attempts.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { checkCatPhotoLab, getClassmateNotes, getModule, listActivityStatus, recordAttempt } from '../api/student/index.ts'
import { useAuth } from '../shared/auth/AuthContext.tsx'
import { isLocalDemo } from '../shared/supabase.ts'
import { PageHeader } from '../shared/ui/index.tsx'
import { LessonContent } from './LessonContent.tsx'

export function ModulePlayer() {
  const { moduleId = '' } = useParams()
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const studentId = profile?.id
  const { data: mod, isLoading, isError } = useQuery({
    queryKey: ['module', studentId, moduleId], queryFn: () => getModule(moduleId),
  })
  const activityKey = ['moduleActivities', studentId, moduleId]
  const { data: progress = [], isLoading: progressLoading, isError: progressError } = useQuery({
    queryKey: activityKey, queryFn: () => listActivityStatus(moduleId), enabled: !!mod,
  })

  if (isLoading || (mod && progressLoading)) return <p role="status">Loading lesson…</p>
  if (isError || progressError) return <p role="alert">Could not load this module. Try reloading the page.</p>
  if (!mod) return <p>This module is unavailable. <Link className="underline" to="/student">Back to my courses</Link></p>

  function refreshProgress() {
    void queryClient.invalidateQueries({ queryKey: activityKey })
    void queryClient.invalidateQueries({ queryKey: ['moduleStatus', studentId, mod?.course_id] })
  }
  const statuses = new Map(progress.map(status => [status.activity_id, status]))

  return <>
    <PageHeader title={mod.title} subtitle={mod.concept} />
    <div className="cic-student-lessons">
      {mod.lessons.map(lesson => <LessonContent key={lesson.id} lesson={lesson} statuses={statuses}
        onAttempt={(_, input) => recordAttempt(input)} onSaved={refreshProgress} allowScripts={isLocalDemo}
        checkLab={checkCatPhotoLab} studentId={studentId} loadDiscussion={getClassmateNotes} />)}
    </div>
  </>
}
