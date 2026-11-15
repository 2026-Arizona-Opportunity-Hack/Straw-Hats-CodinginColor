import { useQueryClient } from '@tanstack/react-query'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { isMockMode, supabase } from '../supabase.ts'
import type { Profile, Role } from '../types/db.ts'

interface AuthState {
  /** The signed-in profile. While an admin previews another role, `role` is that role. */
  profile: Profile | null
  /** The account's actual role, unaffected by preview. */
  realRole: Role | null
  /** Admin only: the role being previewed, or null. UI only; data access stays the admin's (RLS). */
  previewRole: Role | null
  setPreviewRole: (role: Role | null) => void
  loading: boolean
  /** Mock mode only: pretend to be a user with this role. */
  signInAsMock: (role: Role) => void
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

const MOCK_PROFILES: Record<Role, Profile> = {
  student: { id: 'mock-student', role: 'student', display_name: 'Maya (student)', school: 'Maryvale HS', username: 'mstudent1' },
  instructor: { id: 'mock-instructor', role: 'instructor', display_name: 'Mr. Lopez (instructor)', school: 'Maryvale HS' },
  admin: { id: 'mock-admin', role: 'admin', display_name: 'CIC Admin', school: null },
  reviewer: { id: 'mock-reviewer', role: 'reviewer', display_name: 'District Reviewer', school: null },
}

const MOCK_ROLE_KEY = 'cic-mock-role'
const PREVIEW_KEY = 'cic-preview-role'
const PROFILE_RECHECK_MS = 15_000

function readPreview(): Role | null {
  try {
    const role = sessionStorage.getItem(PREVIEW_KEY) as Role | null
    return role && role in MOCK_PROFILES && role !== 'admin' ? role : null
  } catch {
    return null
  }
}

/** Mock mode only: keep the picked role across page reloads (per tab). */
function readMockProfile(): Profile | null {
  if (!isMockMode) return null
  try {
    const role = sessionStorage.getItem(MOCK_ROLE_KEY) as Role | null
    return role && role in MOCK_PROFILES ? MOCK_PROFILES[role] : null
  } catch {
    return null
  }
}

function writeMockRole(role: Role | null) {
  try {
    if (role) sessionStorage.setItem(MOCK_ROLE_KEY, role)
    else sessionStorage.removeItem(MOCK_ROLE_KEY)
  } catch {
    // Storage blocked: mock role just won't survive a reload.
  }
}

async function loadProfile(userId: string): Promise<Profile | null> {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('profiles')
    .select('id, role, display_name, school, username')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw error
  return data as Profile | null
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [profile, setProfile] = useState<Profile | null>(readMockProfile)
  const [loading, setLoading] = useState(!isMockMode)
  const [previewRole, setPreview] = useState<Role | null>(readPreview)
  const canPreview = profile?.role === 'admin'
  const setPreviewRole = (role: Role | null) => {
    try {
      if (role) sessionStorage.setItem(PREVIEW_KEY, role)
      else sessionStorage.removeItem(PREVIEW_KEY)
    } catch {
      // Storage blocked: preview just won't survive a reload.
    }
    setPreview(role)
  }

  useEffect(() => {
    if (!supabase) return
    const client = supabase
    let userId: string | null = null
    let request = 0
    let pending: number | undefined
    let hadAccess = false

    async function recheckProfile() {
      const currentRequest = ++request
      try {
        const nextProfile = userId ? await loadProfile(userId) : null
        if (currentRequest !== request) return
        if (hadAccess && !nextProfile) queryClient.clear()
        hadAccess = Boolean(nextProfile)
        setProfile(nextProfile)
      } catch (error) {
        if (currentRequest === request) console.error('Failed to load profile', error)
      } finally {
        if (currentRequest === request) setLoading(false)
      }
    }

    const { data: sub } = client.auth.onAuthStateChange((_event, session) => {
      const nextUserId = session?.user.id ?? null
      if (userId !== nextUserId) {
        request++
        if (hadAccess) queryClient.clear()
        hadAccess = false
        setProfile(null)
        setLoading(Boolean(nextUserId))
        userId = nextUserId
      }
      // Make requests after the auth callback returns.
      window.clearTimeout(pending)
      pending = window.setTimeout(() => void recheckProfile(), 0)
    })
    const recheckWhenVisible = () => {
      if (userId && document.visibilityState === 'visible') void recheckProfile()
    }
    const interval = window.setInterval(recheckWhenVisible, PROFILE_RECHECK_MS)
    document.addEventListener('visibilitychange', recheckWhenVisible)
    return () => {
      request++
      window.clearTimeout(pending)
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', recheckWhenVisible)
      sub.subscription.unsubscribe()
    }
  }, [queryClient])

  const activePreview = canPreview ? previewRole : null
  const value: AuthState = {
    profile: profile && activePreview ? { ...profile, role: activePreview } : profile,
    realRole: profile?.role ?? null,
    previewRole: activePreview,
    setPreviewRole: (role) => canPreview && setPreviewRole(role),
    loading,
    signInAsMock: (role) => {
      if (!isMockMode) return
      writeMockRole(role)
      setProfile(MOCK_PROFILES[role])
    },
    signOut: async () => {
      if (supabase) await supabase.auth.signOut()
      writeMockRole(null)
      setPreviewRole(null)
      setProfile(null)
    },
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// oxlint-disable-next-line react/only-export-components
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
