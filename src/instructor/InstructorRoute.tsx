// Owner: Ken. Mounts the instructor workspace inside the main app layout.
import { useLocation } from 'react-router-dom'
import { useAuth } from '../shared/auth/AuthContext.tsx'
import { InstructorWorkspace } from './InstructorWorkspace.tsx'
import type { StaffRole } from './model.ts'

export function InstructorRoute() {
  const { profile } = useAuth()
  const { hash } = useLocation()
  const role: StaffRole = profile?.role === 'admin' || profile?.role === 'reviewer' ? profile.role : 'instructor'
  return <InstructorWorkspace role={role} hash={hash} authorId={profile?.id} />
}
