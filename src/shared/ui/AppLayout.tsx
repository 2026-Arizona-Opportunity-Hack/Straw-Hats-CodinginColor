// Owner: Aryan. Sidebar on desktop, collapsible menu on phones. Brand: CIC Dark Green navigation.
import { useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import {
  BarChart3,
  BookOpen,
  GraduationCap,
  LayoutDashboard,
  Library,
  LogOut,
  Menu,
  School,
  Settings,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useAuth } from '../auth/AuthContext.tsx'
import { homePathFor } from '../auth/paths.ts'
import { isMockMode } from '../supabase.ts'
import type { Role } from '../types/db.ts'

const NAV: Record<Role, { to: string; label: string; icon: LucideIcon }[]> = {
  student: [{ to: '/student', label: 'My courses', icon: GraduationCap }],
  instructor: [
    { to: '/instructor', label: 'My classes', icon: LayoutDashboard },
    { to: '/instructor/library', label: 'Course library', icon: Library },
  ],
  admin: [
    { to: '/admin', label: 'Overview', icon: LayoutDashboard },
    { to: '/admin/classes', label: 'Schools & classes', icon: School },
    { to: '/admin/users', label: 'People & roles', icon: Users },
    { to: '/admin/analytics', label: 'Impact & learning', icon: BarChart3 },
    { to: '/admin/settings', label: 'Settings & API', icon: Settings },
  ],
  reviewer: [{ to: '/reviewer', label: 'Curriculum', icon: BookOpen }],
}

const ROLE_LABEL: Record<Role, string> = {
  student: 'Student',
  instructor: 'Instructor',
  admin: 'CIC Admin',
  reviewer: 'External Reviewer',
}

/** Logo; links to the signed-in person's home page. */
function Brand({ to, onClick }: { to: string; onClick?: () => void }) {
  return (
    <Link to={to} onClick={onClick} aria-label="CIC Learn home" className="dot-hover -m-1.5 flex items-center gap-2.5 rounded-lg p-1.5 text-white [--dot:rgb(255_255_255/0.22)]">
      <span aria-hidden="true" className="grid size-9 place-items-center rounded-lg bg-white text-sm font-bold text-brand">
        {'</>'}
      </span>
      <span className="flex flex-col leading-tight">
        <span className="text-lg font-bold">CIC Learn</span>
        <span className="text-xs font-semibold text-sidebar-muted">by Coding in Color</span>
      </span>
    </Link>
  )
}

export function AppLayout() {
  const { profile, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const home = profile ? homePathFor(profile.role) : '/login'

  const nav = (
    <nav aria-label="Main" className="flex flex-col gap-1">
      <p className="mb-1 px-3 text-[11px] font-bold uppercase tracking-widest text-sidebar-muted">Menu</p>
      {profile &&
        NAV[profile.role].map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to.split('/').length <= 2}
            onClick={() => setOpen(false)}
            className={({ isActive }) =>
              `dot-hover flex items-center gap-3 rounded-lg px-3 py-2.5 text-[15px] font-semibold ${
                isActive
                  ? 'bg-white text-brand shadow-[0_4px_14px_-6px_rgb(0_0_0/0.35)] [--dot:rgb(0_122_61/0.16)]'
                  : 'text-sidebar-muted [--dot:rgb(255_255_255/0.22)] hover:bg-white/5 hover:text-white'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Icon aria-hidden="true" className="size-4" />
                <span className="flex-1">{label}</span>
                {isActive && <span aria-hidden="true" className="size-2 rounded-full bg-brand-accent motion-safe:animate-pulse" />}
              </>
            )}
          </NavLink>
        ))}
    </nav>
  )

  const footer = profile && (
    <div className="mt-auto border-t border-white/20 pt-4">
      {isMockMode && (
        <p className="mb-3 inline-block rounded bg-warn-soft px-2 py-0.5 text-xs font-semibold text-warn">Mock data</p>
      )}
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-full bg-white/15 text-sm font-bold text-white ring-2 ring-white/30">
          {profile.display_name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">{profile.display_name}</p>
          <p className="text-xs text-sidebar-muted">{ROLE_LABEL[profile.role]}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => void signOut()}
        className="dot-hover mt-3 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-semibold text-sidebar-muted [--dot:rgb(255_255_255/0.22)] hover:text-white"
      >
        <LogOut aria-hidden="true" className="size-4" /> Sign out
      </button>
    </div>
  )

  return (
    <div className="min-h-screen bg-canvas text-black lg:grid lg:grid-cols-[248px_1fr]">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-white focus:px-4 focus:py-2 focus:font-semibold focus:text-brand focus:shadow"
      >
        Skip to content
      </a>

      <aside className="brand-panel sticky top-0 hidden h-screen flex-col gap-8 p-4 lg:flex [&_:focus-visible]:outline-white">
        <Brand to={home} onClick={() => setOpen(false)} />
        {nav}
        {footer}
      </aside>

      <header className="brand-panel sticky top-0 z-30 flex items-center justify-between px-4 py-3 lg:hidden [&_:focus-visible]:outline-white">
        <Brand to={home} onClick={() => setOpen(false)} />
        {profile && (
          <button
            type="button"
            aria-expanded={open}
            aria-controls="mobile-nav"
            onClick={() => setOpen((o) => !o)}
            className="grid size-11 place-items-center rounded-lg text-white hover:bg-white/10"
          >
            {open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
            <span className="sr-only">{open ? 'Close menu' : 'Open menu'}</span>
          </button>
        )}
      </header>
      {open && (
        <div id="mobile-nav" className="brand-panel sticky top-16 z-20 flex flex-col gap-4 p-4 shadow-lg lg:hidden [&_:focus-visible]:outline-white">
          {nav}
          {footer}
        </div>
      )}

      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
        <Outlet />
      </main>
    </div>
  )
}
