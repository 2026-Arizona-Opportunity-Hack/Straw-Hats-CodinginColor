import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { isMockMode, supabase } from '../supabase.ts'
import type { Profile, Role } from '../types/db.ts'

interface AuthState {
  profile: Profile | null
  loading: boolean
  /** Mock mode only: pretend to be a user with this role. */
  signInAsMock: (role: Role) => void
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

const MOCK_PROFILES: Record<Role, Profile> = {
  student: { id: 'mock-student', role: 'student', display_name: 'Maya (student)', school: 'Maryvale HS' },
  instructor: { id: 'mock-instructor', role: 'instructor', display_name: 'Mr. Lopez (instructor)', school: 'Maryvale HS' },
  admin: { id: 'mock-admin', role: 'admin', display_name: 'CIC Admin', school: null },
  reviewer: { id: 'mock-reviewer', role: 'reviewer', display_name: 'District Reviewer', school: null },
}

const MOCK_ROLE_KEY = 'cic-mock-role'

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
    .select('id, role, display_name, school')
    .eq('id', userId)
    .single()
  if (error) {
    console.error('Failed to load profile', error)
    return null
  }
  return data as Profile
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(readMockProfile)
  const [loading, setLoading] = useState(!isMockMode)

  useEffect(() => {
    if (!supabase) return
    const client = supabase
    client.auth.getSession().then(async ({ data }) => {
      setProfile(data.session ? await loadProfile(data.session.user.id) : null)
      setLoading(false)
    })
    const { data: sub } = client.auth.onAuthStateChange(async (_event, session) => {
      setProfile(session ? await loadProfile(session.user.id) : null)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const value: AuthState = {
    profile,
    loading,
    signInAsMock: (role) => {
      if (!isMockMode) return
      writeMockRole(role)
      setProfile(MOCK_PROFILES[role])
    },
    signOut: async () => {
      if (supabase) await supabase.auth.signOut()
      writeMockRole(null)
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
