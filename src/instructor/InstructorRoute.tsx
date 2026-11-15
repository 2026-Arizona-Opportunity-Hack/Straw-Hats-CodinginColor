// Owner: Ken. Mounts the instructor workspace inside the main app layout.
// With Supabase configured it loads and saves live data; in mock mode it uses browser storage.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../shared/auth/AuthContext.tsx'
import { supabase } from '../shared/supabase.ts'
import { InstructorWorkspace } from './InstructorWorkspace.tsx'
import { importLibraryCourse, loadLiveData, publishLiveCourse, saveLiveData } from './liveStore.ts'
import type { InstructorData, StaffRole } from './model.ts'
import type { InstructorStore } from './store.ts'

export function InstructorRoute() {
  const { profile } = useAuth()
  const { hash } = useLocation()
  const role: StaffRole = profile?.role === 'admin' || profile?.role === 'reviewer' ? profile.role : 'instructor'
  if (!supabase || !profile) return <InstructorWorkspace role={role} hash={hash} authorId={profile?.id} />
  return <LiveWorkspace role={role} hash={hash} userId={profile.id} name={profile.display_name} />
}

function LiveWorkspace({ role, hash, userId, name }: { role: StaffRole; hash: string; userId: string; name: string }) {
  const client = supabase!
  const queryClient = useQueryClient()
  const queryKey = useMemo(() => ['instructor-workspace', userId, role], [userId, role])
  const { data, error, isPending, dataUpdatedAt, refetch } = useQuery({
    queryKey,
    queryFn: () => loadLiveData(client, role, name),
    // Refresh published data when returning to the workspace.
    refetchOnMount: 'always',
    // Keep the active editor stable on tab changes.
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  })
  const [syncError, setSyncError] = useState('')
  // Saves run one at a time, in order, so quick edits cannot overtake each other.
  const [queue] = useState(createSerialQueue)

  const store = useMemo<InstructorStore | null>(() => data ? {
    load: () => structuredClone(data),
    save: (next: InstructorData, previous: InstructorData) => {
      return queue.run(() => saveLiveData(client, userId, previous, next, { editLibrary: role === 'admin' })).catch(problem => {
        setSyncError(`${problem instanceof Error ? problem.message : 'Saving failed.'} The page was reloaded from the database, so recent changes may be missing.`)
        void queryClient.invalidateQueries({ queryKey })
        throw problem
      })
    },
    publishCourse: (course, previous, moduleId, expectedRevision) =>
      queue.run(() => publishLiveCourse(client, course, previous, moduleId, expectedRevision)),
    importCourse: source => importLibraryCourse(client, source.id),
  } : null, [data, client, userId, role, queryClient, queryKey, queue])

  if (isPending) return <p className="p-6" role="status">Loading your classes…</p>
  if (error || !store) {
    return <div className="p-6" role="alert">
      <p className="font-semibold">Could not load your classes.</p>
      <p className="mt-1 text-sm">{error instanceof Error ? error.message : 'Unknown error.'}</p>
      <button type="button" className="mt-3 rounded-lg border px-3 py-2" onClick={() => void refetch()}>Try again</button>
    </div>
  }
  return <>
    {syncError && <p role="alert" className="mb-4 rounded-lg bg-warn-soft px-4 py-3 text-sm font-semibold text-warn">{syncError}</p>}
    {/* Remount with fresh data after a reload. */}
    <InstructorWorkspace key={userId + ':' + dataUpdatedAt} role={role} hash={hash} authorId={userId} store={store} />
  </>
}

/** Runs async tasks one after another; a failed task does not block the next one. */
function createSerialQueue() {
  let tail: Promise<unknown> = Promise.resolve()
  return {
    run<T>(task: () => Promise<T>) {
      const result = tail.then(task)
      tail = result.catch(() => undefined)
      return result
    },
  }
}
