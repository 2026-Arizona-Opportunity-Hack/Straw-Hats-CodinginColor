// Owner: Shivraj. Sidebar outline of the course a student is in: one dropdown per module,
// listing its steps with check marks. Locked modules show a lock and don't expand
// (the database doesn't send their content until they unlock).
import { useQuery } from '@tanstack/react-query'
import { Check, ChevronDown, Lock } from 'lucide-react'
import { useState } from 'react'
import { Link, matchPath, useLocation, useSearchParams } from 'react-router-dom'
import { getModule, listActivityStatus, listModuleStatus, listMyCourses, type ModuleStatus } from '../api/student/index.ts'
import { useAuth } from '../shared/auth/AuthContext.tsx'
import { stepTitle, STEP_LABEL } from './steps.ts'

function ModuleSteps({ module, studentId, currentStep, onNavigate }: {
  module: ModuleStatus; studentId?: string; currentStep: number | null; onNavigate?: () => void
}) {
  const { data: mod } = useQuery({ queryKey: ['module', studentId, module.module_id], queryFn: () => getModule(module.module_id) })
  const { data: statuses = [] } = useQuery({
    queryKey: ['moduleActivities', studentId, module.module_id], queryFn: () => listActivityStatus(module.module_id), enabled: !!mod,
  })
  if (!mod) return <p className="px-3 py-1 text-xs text-sidebar-muted">Loading…</p>
  const done = new Set(statuses.filter((s) => s.submitted).map((s) => s.activity_id))
  const steps = mod.lessons.flatMap((l) => l.activities)
  return (
    <ol className="ml-3 mt-1 space-y-0.5 border-l border-white/20 pl-2">
      {steps.map((a, i) => {
        const finished = a.type === 'content' || done.has(a.id)
        const here = currentStep === i
        return (
          <li key={a.id}>
            <Link to={`/student/module/${module.module_id}?step=${i + 1}`} onClick={onNavigate}
              aria-current={here ? 'step' : undefined}
              className={`flex items-center gap-2 rounded-md px-2 py-1 text-[13px] ${here ? 'bg-white/15 font-semibold text-white' : 'text-sidebar-muted hover:bg-white/5 hover:text-white'}`}>
              <span aria-hidden="true" className={`grid size-4 shrink-0 place-items-center rounded-full ${finished ? 'bg-brand-accent text-white' : 'border border-white/40'}`}>
                {finished && <Check className="size-3" />}
              </span>
              <span className="min-w-0 flex-1 truncate">{stepTitle(a)}</span>
              <span className="sr-only">({STEP_LABEL[a.type]}{finished ? ', done' : ''})</span>
            </Link>
          </li>
        )
      })}
    </ol>
  )
}

export function StudentCourseNav({ onNavigate }: { onNavigate?: () => void }) {
  const { profile } = useAuth()
  const { pathname } = useLocation()
  const [params] = useSearchParams()
  const studentId = profile?.id
  const courseMatch = matchPath('/student/course/:courseId', pathname)
  const moduleMatch = matchPath('/student/module/:moduleId', pathname)
  const moduleId = moduleMatch?.params.moduleId
  const { data: openMod } = useQuery({
    queryKey: ['module', studentId, moduleId], queryFn: () => getModule(moduleId!), enabled: !!moduleId,
  })
  const courseId = courseMatch?.params.courseId ?? openMod?.course_id
  const { data: courses = [] } = useQuery({ queryKey: ['myCourses', studentId], queryFn: listMyCourses, enabled: !!courseId })
  const course = courses.find((c) => c.id === courseId)
  const { data: modules = [] } = useQuery({
    queryKey: ['moduleStatus', studentId, courseId], queryFn: () => listModuleStatus(courseId!), enabled: !!course,
  })
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  if (!course || !modules.length) return null
  const stepParam = Number(params.get('step'))
  return (
    <nav aria-label={`${course.title} modules`} className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
      <p className="mb-1 px-3 text-[11px] font-bold uppercase tracking-widest text-sidebar-muted">This course</p>
      <Link to={`/student/course/${course.id}`} onClick={onNavigate} className="mb-2 block rounded-lg px-3 py-1.5 font-semibold text-white hover:bg-white/5">{course.title}</Link>
      <ul className="space-y-1">
        {modules.map((m, i) => {
          const locked = m.state === 'locked'
          const isOpen = expanded[m.module_id] ?? m.module_id === moduleId
          const label = `${i + 1}. ${m.title}`
          return (
            <li key={m.module_id}>
              {locked ? (
                <p className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-sidebar-muted/70">
                  <Lock aria-hidden="true" className="size-3.5 shrink-0" /><span className="truncate">{label}</span><span className="sr-only">(locked)</span>
                </p>
              ) : (
                <>
                  <button type="button" aria-expanded={isOpen} onClick={() => setExpanded((e) => ({ ...e, [m.module_id]: !isOpen }))}
                    className={`flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm font-semibold ${m.module_id === moduleId ? 'text-white' : 'text-sidebar-muted hover:text-white'} hover:bg-white/5`}>
                    {m.state === 'completed'
                      ? <Check aria-hidden="true" className="size-3.5 shrink-0 text-brand-accent" />
                      : <span aria-hidden="true" className="size-3.5 shrink-0 rounded-full border-2 border-brand-accent" />}
                    <span className="min-w-0 flex-1 truncate">{label}</span>
                    {m.state === 'completed' && <span className="sr-only">(completed)</span>}
                    <ChevronDown aria-hidden="true" className={`size-4 shrink-0 transition ${isOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {isOpen && <ModuleSteps module={m} studentId={studentId} onNavigate={onNavigate}
                    currentStep={m.module_id === moduleId && stepParam > 0 ? stepParam - 1 : null} />}
                </>
              )}
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
