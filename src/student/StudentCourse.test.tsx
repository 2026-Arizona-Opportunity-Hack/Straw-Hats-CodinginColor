import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { ModuleWithContent } from '../api/student/index.ts'
import { MOCK_ACTIVITIES, MOCK_COURSES, MOCK_LESSONS, MOCK_MODULES } from '../api/fixtures.ts'
import { StudentCourse } from './StudentCourse.tsx'

const state = vi.hoisted(() => ({ popover: '' }))
vi.mock('../shared/auth/AuthContext.tsx', () => ({ useAuth: () => ({ profile: { id: 'student' } }) }))
vi.mock('../shared/supabase.ts', () => ({ supabase: null, isMockMode: true, isLocalDemo: true }))
// Seed the open popover for server rendering; all query, routing and link rendering stay real.
vi.mock('react', async (original) => {
  const react = await original<typeof import('react')>()
  return { ...react, useState: (initial: unknown) => react.useState(initial === null ? state.popover : initial) }
})

function renderCourse(selected: string, locked = false) {
  state.popover = selected
  const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } })
  const course = MOCK_COURSES[0]
  const read = MOCK_ACTIVITIES[0]
  const check = MOCK_ACTIVITIES[1]
  const mod: ModuleWithContent = {
    ...MOCK_MODULES[0],
    lessons: [
      { ...MOCK_LESSONS[0], activities: [read, check] },
      { ...MOCK_LESSONS[0], id: 'second-lesson', position: 2, activities: [
        { ...check, id: 'later-done', lesson_id: 'second-lesson', position: 1 },
        { ...check, id: 'unfinished', lesson_id: 'second-lesson', position: 2 },
        { ...read, id: 'locked-reading', lesson_id: 'second-lesson', position: 3 },
      ] },
    ],
  }
  qc.setQueryData(['catalog'], [course])
  qc.setQueryData(['myCourses', 'student'], [{ ...course, source: 'self', class_name: null }])
  qc.setQueryData(['moduleStatus', 'student', course.id], [{ module_id: mod.id, title: mod.title, state: locked ? 'locked' : 'available' }])
  qc.setQueryData(['module', 'student', mod.id], mod)
  qc.setQueryData(['moduleActivities', 'student', mod.id], [
    { activity_id: check.id, submitted: true, best_score: 1 },
    { activity_id: 'later-done', submitted: true, best_score: 1 },
  ])
  const html = renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/student/course/' + course.id]}>
        <Routes><Route path="/student/course/:courseId" element={<StudentCourse />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  qc.clear()
  return html
}

describe('course activity links', () => {
  it('reviews a completed activity in a later lesson instead of the unfinished card', () => {
    const html = renderCourse('later-done')
    expect(html).toContain('href="/student/module/mod-variables?step=3"')
    expect(html).toContain('Review →</a>')
    expect(html).not.toContain('href="/student/module/mod-variables?step=4"')
  })

  it('opens the first reading as step one', () => {
    const html = renderCourse('act-var-text')
    expect(html).toContain('href="/student/module/mod-variables?step=1"')
    expect(html).toContain('Go to content →</a>')
  })

  it('links an unfinished activity to its actual position', () => {
    const html = renderCourse('unfinished')
    expect(html).toContain('href="/student/module/mod-variables?step=4"')
    expect(html).toContain('Go to content →</a>')
  })

  it('passes a later target to the player, which still enforces reachability', () => {
    const html = renderCourse('locked-reading')
    expect(html).toContain('href="/student/module/mod-variables?step=5"')
    expect(html).toContain('Go to content →</a>')
  })

  it('does not expose activity links for a locked module even if content is cached', () => {
    const html = renderCourse('later-done', true)
    expect(html).not.toContain('role="dialog"')
    expect(html).not.toContain('/student/module/mod-variables')
    expect(html).toContain('Opens when you finish the module before.')
  })
})
