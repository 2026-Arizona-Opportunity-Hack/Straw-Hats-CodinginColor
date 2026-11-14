import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import type { Role } from '../types/db.ts'
import { useAuth } from './AuthContext.tsx'
import { homePathFor } from './paths.ts'

/**
 * UI guard only. Real enforcement is Row Level Security in Postgres:
 * never rely on this component to protect data.
 */
export function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { profile, loading } = useAuth()
  if (loading) return <p className="p-6">Loading…</p>
  if (!profile) return <Navigate to="/login" replace />
  if (!roles.includes(profile.role)) return <Navigate to={homePathFor(profile.role)} replace />
  return <>{children}</>
}

