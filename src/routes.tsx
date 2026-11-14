// Owner: Aryan. Add routes here; page components live in each owner's folder.
import { createBrowserRouter, Navigate } from 'react-router-dom'
import { LoginPage } from './LoginPage.tsx'
import { RequireRole } from './shared/auth/RequireRole.tsx'
import { AppLayout } from './shared/ui/AppLayout.tsx'
import { PageHeader } from './shared/ui/index.tsx'
import type { Role } from './shared/types/db.ts'

const ROLES: Role[] = ['student', 'instructor', 'admin', 'reviewer']

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: <AppLayout />,
    children: [
      { index: true, element: <Navigate to="/login" replace /> },
      // Placeholder home per role; replaced by real pages in each owner's folder.
      ...ROLES.map((role) => ({
        path: role,
        element: (
          <RequireRole roles={[role]}>
            <PageHeader title={`${role} home`} subtitle="Coming soon." />
          </RequireRole>
        ),
      })),
      { path: '*', element: <p>Page not found.</p> },
    ],
  },
])
