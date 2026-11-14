import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.tsx'
import { isMockMode } from '../supabase.ts'
import type { Role } from '../types/db.ts'
import { Button } from './index.tsx'

const NAV: Record<Role, { to: string; label: string }[]> = {
  student: [{ to: '/student', label: 'My courses' }],
  instructor: [
    { to: '/instructor', label: 'My classes' },
    { to: '/instructor/library', label: 'Course library' },
  ],
  admin: [
    { to: '/admin', label: 'Overview' },
    { to: '/admin/users', label: 'Users' },
  ],
  reviewer: [{ to: '/reviewer', label: 'Curriculum' }],
}

export function AppLayout() {
  const { profile, signOut } = useAuth()

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:bg-white focus:p-2">
        Skip to content
      </a>
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 py-3">
          <span className="text-lg font-bold text-brand">CIC Learn</span>
          {isMockMode && (
            <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">Mock data</span>
          )}
          <nav aria-label="Main" className="flex flex-1 gap-1">
            {profile &&
              NAV[profile.role].map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end
                  className={({ isActive }) =>
                    `rounded-md px-3 py-2 text-sm font-medium ${isActive ? 'bg-slate-100 text-brand' : 'text-slate-700 hover:bg-slate-50'}`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
          </nav>
          {profile && (
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-600">{profile.display_name}</span>
              <Button variant="secondary" onClick={() => void signOut()}>
                Sign out
              </Button>
            </div>
          )}
        </div>
      </header>
      <main id="main" className="mx-auto max-w-6xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  )
}
