// Owner: Aryan. Add routes here; page components live in each owner's folder.
import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AdminAnalytics, AdminClasses, AdminHome, AdminSettings, AdminUsers } from './admin/AdminPages.tsx'
import { InstructorRoute } from './instructor/InstructorRoute.tsx'
import { LoginPage } from './LoginPage.tsx'
import { RequireRole } from './shared/auth/RequireRole.tsx'
import { AppLayout } from './shared/ui/AppLayout.tsx'
import { ModulePlayer } from './student/ModulePlayer.tsx'
import { PublishedDemo } from './student/PublishedDemo.tsx'
import { StudentHome } from './student/StudentHome.tsx'

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: <AppLayout />,
    children: [
      { index: true, element: <Navigate to="/login" replace /> },
      {
        path: 'student',
        element: <RequireRole roles={['student']}><StudentHome /></RequireRole>,
      },
      { path: 'student/demo/:moduleId', element: <RequireRole roles={['student']}><PublishedDemo /></RequireRole> },
      {
        path: 'student/module/:moduleId',
        element: <RequireRole roles={['student']}><ModulePlayer /></RequireRole>,
      },
      {
        path: 'instructor',
        element: <RequireRole roles={['instructor', 'admin']}><InstructorRoute /></RequireRole>,
      },
      {
        path: 'admin',
        element: <RequireRole roles={['admin']}><AdminHome /></RequireRole>,
      },
      {
        path: 'admin/users',
        element: <RequireRole roles={['admin']}><AdminUsers /></RequireRole>,
      },
      {
        path: 'admin/classes',
        element: <RequireRole roles={['admin']}><AdminClasses /></RequireRole>,
      },
      {
        path: 'admin/analytics',
        element: <RequireRole roles={['admin']}><AdminAnalytics /></RequireRole>,
      },
      {
        path: 'admin/settings',
        element: <RequireRole roles={['admin']}><AdminSettings /></RequireRole>,
      },
      {
        path: 'reviewer',
        element: <RequireRole roles={['reviewer', 'admin']}><InstructorRoute /></RequireRole>,
      },
      { path: '*', element: <p>Page not found.</p> },
    ],
  },
])
