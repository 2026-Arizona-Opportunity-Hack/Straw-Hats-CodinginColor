// Owner: Aryan. Add routes here; page components live in each owner's folder.
import { createBrowserRouter, Navigate } from 'react-router-dom'
import {
  AdminAnalytics, AdminClasses, AdminHome, AdminSettings, AdminUsers, InstructorRoute, ModulePlayer, PublishedDemo, RolePage, StudentHome,
} from './lazyPages.tsx'
import { LoginPage } from './LoginPage.tsx'
import { AccountPage } from './shared/auth/AccountPage.tsx'
import { AppLayout } from './shared/ui/AppLayout.tsx'

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: <AppLayout />,
    children: [
      { index: true, element: <Navigate to="/login" replace /> },
      {
        path: 'student',
        element: <RolePage roles={['student']} page={StudentHome} />,
      },
      { path: 'student/demo/:moduleId', element: <RolePage roles={['student']} page={PublishedDemo} /> },
      {
        path: 'student/module/:moduleId',
        element: <RolePage roles={['student']} page={ModulePlayer} />,
      },
      {
        path: 'instructor',
        element: <RolePage roles={['instructor', 'admin']} page={InstructorRoute} />,
      },
      {
        path: 'admin',
        element: <RolePage roles={['admin']} page={AdminHome} />,
      },
      {
        path: 'admin/users',
        element: <RolePage roles={['admin']} page={AdminUsers} />,
      },
      {
        path: 'admin/classes',
        element: <RolePage roles={['admin']} page={AdminClasses} />,
      },
      {
        path: 'admin/analytics',
        element: <RolePage roles={['admin']} page={AdminAnalytics} />,
      },
      {
        path: 'admin/settings',
        element: <RolePage roles={['admin']} page={AdminSettings} />,
      },
      {
        path: 'reviewer',
        element: <RolePage roles={['reviewer', 'admin']} page={InstructorRoute} />,
      },
      {
        path: 'account',
        element: <RolePage roles={['student', 'instructor', 'admin', 'reviewer']} page={AccountPage} />,
      },
      { path: '*', element: <p>Page not found.</p> },
    ],
  },
])
