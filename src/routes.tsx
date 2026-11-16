// Owner: Aryan. Add routes here; page components live in each owner's folder.
import { Suspense } from 'react'
import { createBrowserRouter, Outlet } from 'react-router-dom'
import {
  AdminAnalytics, AdminClasses, AdminHome, AdminSettings, AdminUsers, DemoWalkthrough, InstructorRoute, ModulePlayer, PublishedDemo, RolePage, StarterQuiz, StudentClassroom, StudentCourse, StudentCourses, StudentExplore, StudentHome, StudentQuiz,
} from './lazyPages.tsx'
import { AuthPage } from './AuthPage.tsx'
import { HomePage } from './home/HomePage.tsx'
import { AccountPage } from './shared/auth/AccountPage.tsx'
import { AuthProvider } from './shared/auth/AuthContext.tsx'
import { AppLayout } from './shared/ui/AppLayout.tsx'

// Keep the public walkthrough outside the authenticated application tree.
export const router = createBrowserRouter([
  { path: '/demo', element: <Suspense fallback={<p className="p-6" role="status">Loading the walkthrough…</p>}><DemoWalkthrough /></Suspense> },
  { element: <AuthProvider><Outlet /></AuthProvider>, children: [
  { path: '/', element: <HomePage /> },
  { path: '/login', element: <AuthPage key="login" /> },
  { path: '/signup', element: <AuthPage key="signup" signup /> },
  {
    element: <AppLayout />,
    children: [
      {
        path: 'student',
        element: <RolePage roles={['student']} page={StudentHome} />,
      },
      { path: 'student/course/:courseId', element: <RolePage roles={['student']} page={StudentCourse} /> },
      { path: 'student/explore', element: <RolePage roles={['student']} page={StudentExplore} /> },
      { path: 'student/start', element: <RolePage roles={['student']} page={StarterQuiz} /> },
      { path: 'student/courses', element: <RolePage roles={['student']} page={StudentCourses} /> },
      { path: 'student/classroom', element: <RolePage roles={['student']} page={StudentClassroom} /> },
      { path: 'student/quiz/:quizId', element: <RolePage roles={['student']} page={StudentQuiz} /> },
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
  ] },
])
