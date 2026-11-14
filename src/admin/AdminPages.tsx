// Owner: Aryan. Admin command center pages; routes in src/routes.tsx.
// Lazy-loaded so students and instructors on Chromebooks never download the admin code or chart library.
import { lazy, Suspense, type ComponentType } from 'react'

function lazyPage(load: () => Promise<{ default: ComponentType }>) {
  const Page = lazy(load)
  return function AdminPage() {
    return (
      <Suspense fallback={<p role="status" className="text-cic-muted">Loading…</p>}>
        <Page />
      </Suspense>
    )
  }
}

export const AdminHome = lazyPage(() => import('./OverviewPage.tsx').then((m) => ({ default: m.OverviewPage })))
export const AdminUsers = lazyPage(() => import('./PeoplePage.tsx').then((m) => ({ default: m.PeoplePage })))
export const AdminClasses = lazyPage(() => import('./ClassesPage.tsx').then((m) => ({ default: m.ClassesPage })))
export const AdminAnalytics = lazyPage(() => import('./AnalyticsPage.tsx').then((m) => ({ default: m.AnalyticsPage })))
export const AdminSettings = lazyPage(() => import('./SettingsPage.tsx').then((m) => ({ default: m.SettingsPage })))
