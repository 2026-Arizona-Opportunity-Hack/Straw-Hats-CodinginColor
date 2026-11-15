// Owner: Aryan. Sidebar on desktop, collapsible menu on phones. Brand: CIC Dark Green navigation.
import { useState } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  BarChart3,
  BookOpen,
  GraduationCap,
  Home,
  KeyRound,
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
import { StudentCourseNav } from '../../student/StudentCourseNav.tsx'
import { useAuth } from '../auth/AuthContext.tsx'
import { homePathFor } from '../auth/paths.ts'
import { isMockMode } from '../supabase.ts'
import type { Role } from '../types/db.ts'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  /** Section inside a hash-routed page (the instructor workspace), e.g. 'curriculum'. */
  section?: string
  /** This section is shown when the URL has no hash. */
  defaultSection?: boolean
}

const NAV: Record<Role, NavItem[]> = {
  student: [
    { to: '/student', label: 'Home', icon: Home },
    { to: '/student/courses', label: 'My courses', icon: GraduationCap },
    { to: '/student/classroom', label: 'My classroom', icon: School },
  ],
  instructor: [
    { to: '/instructor', section: 'classes', defaultSection: true, label: 'Classes', icon: LayoutDashboard },
    { to: '/instructor', section: 'curriculum', label: 'Curriculum', icon: BookOpen },
    { to: '/instructor', section: 'library', label: 'CIC Library', icon: Library },
  ],
  admin: [
    { to: '/admin', label: 'Overview', icon: LayoutDashboard },
    { to: '/admin/classes', label: 'Schools & classes', icon: School },
    { to: '/instructor', section: 'curriculum', label: 'Curriculum', icon: BookOpen },
    { to: '/instructor', section: 'library', label: 'CIC Library', icon: Library },
    { to: '/admin/users', label: 'People & roles', icon: Users },
    { to: '/admin/analytics', label: 'Impact & learning', icon: BarChart3 },
    { to: '/admin/settings', label: 'Settings & API', icon: Settings },
  ],
  reviewer: [{ to: '/reviewer', section: 'review', defaultSection: true, label: 'Curriculum', icon: BookOpen }],
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
      <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-lg bg-white p-1">
        <img src="/cic-logo.png" alt="" width={32} height={32} className="size-8 object-contain" />
      </span>
      <span className="flex flex-col leading-tight">
        <span className="text-lg font-bold">CIC Learn</span>
        <span className="text-xs font-semibold text-sidebar-muted">by Coding in Color</span>
      </span>
    </Link>
  )
}

export function AppLayout() {
  const { profile, signOut, realRole, previewRole, setPreviewRole } = useAuth()
  const navigate = useNavigate()
  const preview = (role: Role | null) => {
    setPreviewRole(role)
    setOpen(false)
    navigate(homePathFor(role ?? 'admin'))
  }
  const [open, setOpen] = useState(false)
  const home = profile ? homePathFor(profile.role) : '/login'
  const location = useLocation()
  const currentSection = location.hash.replace(/^#\/?/, '').split('/')[0]
  /** Top-level pages (/admin) match exactly; nested ones (/admin/classes) match their subtree. */
  const isItemActive = (item: NavItem) => {
    const { pathname } = location
    if (item.section) {
      if (pathname !== item.to) return false
      return currentSection ? currentSection === item.section : Boolean(item.defaultSection)
    }
    return item.to.split('/').length <= 2 ? pathname === item.to : pathname.startsWith(item.to)
  }

  const nav = (
    <nav aria-label="Main" className="flex flex-col gap-1">
      <p className="mb-1 px-3 text-[11px] font-bold uppercase tracking-widest text-sidebar-muted">Menu</p>
      {profile &&
        NAV[profile.role].map((item) => {
          const { to, label, icon: Icon, section } = item
          const isActive = isItemActive(item)
          return (
            <Link
              key={to + (section ?? '')}
              to={section ? { pathname: to, hash: '#/' + section } : to}
              onClick={() => setOpen(false)}
              aria-current={isActive ? 'page' : undefined}
              className={`dot-hover flex items-center gap-3 rounded-lg px-3 py-2.5 text-[15px] font-semibold ${
                isActive
                  ? 'bg-white text-brand shadow-[0_4px_14px_-6px_rgb(0_0_0/0.35)] [--dot:rgb(0_122_61/0.16)]'
                  : 'text-sidebar-muted [--dot:rgb(255_255_255/0.22)] hover:bg-white/5 hover:text-white'
              }`}
            >
              <Icon aria-hidden="true" className="size-4" />
              <span className="flex-1">{label}</span>
              {isActive && <span aria-hidden="true" className="size-2 rounded-full bg-brand-accent motion-safe:animate-pulse" />}
            </Link>
          )
        })}
    </nav>
  )

  /** Rendered in both the desktop sidebar and the phone menu, so ids get a per-place suffix. */
  const footer = (where: 'side' | 'menu') => profile && (
    <div className="mt-auto border-t border-white/20 pt-4">
      {isMockMode && (
        <p className="mb-3 inline-block rounded bg-warn-soft px-2 py-0.5 text-xs font-semibold text-warn">Mock data</p>
      )}
      {realRole === 'admin' && !previewRole && (
        <div className="mb-4">
          <label htmlFor={`preview-role-${where}`} className="mb-1 block text-xs font-bold uppercase tracking-widest text-sidebar-muted">Preview as</label>
          <select
            id={`preview-role-${where}`}
            value=""
            onChange={(e) => preview(e.target.value as Role)}
            className="h-10 w-full rounded-lg border border-white/30 bg-white/10 px-2 text-sm font-semibold text-white [&>option]:text-black"
          >
            <option value="" disabled>Choose a role…</option>
            <option value="student">Student</option>
            <option value="instructor">Instructor</option>
            <option value="reviewer">External Reviewer</option>
          </select>
        </div>
      )}
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-full bg-white/15 text-sm font-bold text-white ring-2 ring-white/30">
          {profile.display_name.replace(/\(.*?\)/g, '').match(/\p{L}+/gu)?.map((w) => w[0]).join('').slice(0, 2).toUpperCase()}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">{profile.display_name}</p>
          <p className="text-xs text-sidebar-muted">{ROLE_LABEL[profile.role]}{previewRole && ' (preview)'}</p>
        </div>
      </div>
      <Link
        to="/account"
        onClick={() => setOpen(false)}
        className="dot-hover mt-3 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-semibold text-sidebar-muted [--dot:rgb(255_255_255/0.22)] hover:text-white"
      >
        <KeyRound aria-hidden="true" className="size-4" /> Change password
      </Link>
      <button
        type="button"
        onClick={() => void signOut()}
        className="dot-hover flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-semibold text-sidebar-muted [--dot:rgb(255_255_255/0.22)] hover:text-white"
      >
        <LogOut aria-hidden="true" className="size-4" /> Sign out
      </button>
    </div>
  )

  return (
    <div className="min-h-screen bg-canvas text-black lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-white focus:px-4 focus:py-2 focus:font-semibold focus:text-brand focus:shadow"
      >
        Skip to content
      </a>

      <aside className="brand-panel sticky top-0 hidden h-screen flex-col gap-8 p-4 lg:flex [&_:focus-visible]:outline-white">
        <Brand to={home} onClick={() => setOpen(false)} />
        {nav}
        {profile?.role === 'student' && <StudentCourseNav />}
        {footer('side')}
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
          {profile?.role === 'student' && <StudentCourseNav onNavigate={() => setOpen(false)} />}
          {footer('menu')}
        </div>
      )}

      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
        {previewRole && (
          <div role="status" className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warn bg-warn-soft px-4 py-3 text-sm">
            <p>
              <strong>Previewing as {ROLE_LABEL[previewRole]}.</strong> You're still signed in as an admin, so data and permissions are yours.
            </p>
            <button type="button" onClick={() => preview(null)} className="rounded-lg bg-brand px-3 py-1.5 font-semibold text-white hover:bg-brand-dark">
              Exit preview
            </button>
          </div>
        )}
        <Outlet />
      </main>
    </div>
  )
}
