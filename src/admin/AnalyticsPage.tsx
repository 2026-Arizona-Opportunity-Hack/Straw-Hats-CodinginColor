// Owner: Aryan. Impact & learning analytics: what CIC shows donors and uses itself.
// Story first (headline numbers, reach, growth, instructors, student progress), detail after.
import { BarChart3, Download, HeartHandshake } from 'lucide-react'
import { type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Button, Card, DataTable, EmptyState, Meter, PageHeader, Select, Td, Th } from '../shared/ui/index.tsx'
import { GainChart } from './charts.tsx'
import { LoadState, StatusBadge } from './common.tsx'
import { useOrg } from './hooks.ts'
import { GrowthRows, ImpactNumber, JourneyLegend, JourneyPips, OverallProgress, StatusBar, StatusLegend, type Pip } from './impact.tsx'
import {
  analyze, fmtGain, fmtMinutes, fmtPct, mean, modulesInScope, timeAgo,
  type GroupSummary, type OrgData, type Status, type StudentSummary,
} from './metrics.ts'

const GROUPS = { class: 'Class', school: 'School', module: 'Module' } as const
type GroupBy = keyof typeof GROUPS

const SECTIONS = [
  ['impact', 'Impact'],
  ['overall', 'Overall progress'],
  ['reach', 'Where support goes'],
  ['growth', 'Learning growth'],
  ['instructors', 'Instructors'],
  ['progress', 'Student progress'],
  ['students', 'Every student'],
] as const

/** Quote every cell and neutralize spreadsheet formulas (CSV injection). */
const cell = (v: unknown) => {
  const s = v == null ? '' : String(v)
  return `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`
}

function countStatuses(list: StudentSummary[]): Record<Status, number> {
  const c: Record<Status, number> = { done: 0, on_track: 0, not_started: 0, stuck: 0 }
  for (const s of list) c[s.status]++
  return c
}

/** Per-student, per-module rows for the current filters, downloaded as a CSV file. */
function exportCsv(a: ReturnType<typeof analyze>, modTitle: Map<string, string>) {
  const statusOf = new Map(a.students.map((s) => [`${s.classId}|${s.studentId}`, s]))
  const header = ['student', 'school', 'class', 'module', 'started', 'complete', 'pretest_pct', 'posttest_pct', 'learning_gain_pts', 'activities_done', 'activities_total', 'time_on_task_min', 'status']
  const round = (v: number | null) => (v == null ? '' : Math.round(v))
  const lines = a.studentModules.map((r) => {
    const c = a.classOf.get(r.classId)
    const s = statusOf.get(`${r.classId}|${r.studentId}`)
    return [s?.name, c?.school, c?.name, modTitle.get(r.moduleId), r.started, r.done, round(r.pre), round(r.post), round(r.gain), r.activitiesDone, r.activitiesTotal, Math.round(r.timeOnTaskMs / 60000), s?.status].map(cell).join(',')
  })
  const url = URL.createObjectURL(new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' }))
  const link = Object.assign(document.createElement('a'), { href: url, download: `CIC_ImpactReport_${new Date().toISOString().slice(0, 10)}.csv` })
  link.click()
  URL.revokeObjectURL(url)
}

export function AnalyticsPage() {
  const { data, isLoading, error } = useOrg()
  const [params, setParams] = useSearchParams()
  const filters = { school: params.get('school') || undefined, classId: params.get('class') || undefined, includeArchived: params.get('archived') === '1' }
  const by: GroupBy = (params.get('by') as GroupBy) in GROUPS ? (params.get('by') as GroupBy) : 'class'
  if (!data) return <><PageHeader title="Impact & learning" /><LoadState isLoading={isLoading} error={error} /></>

  const a = analyze(data, filters)
  const filtered = Boolean(filters.school || filters.classId || filters.includeArchived)
  const modTitle = new Map(data.modules.map((m) => [m.id, m.title]))

  function applyFilters(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const next = new URLSearchParams({ by })
    for (const k of ['school', 'class', 'archived']) if (f.get(k)) next.set(k, String(f.get(k)))
    setParams(next)
  }

  return (
    <>
      <PageHeader
        title="Impact & learning"
        subtitle="What students are learning in Coding in Color classrooms, ready to share with donors and partners."
        actions={<Button variant="secondary" onClick={() => exportCsv(a, modTitle)} disabled={!a.studentModules.length}><Download aria-hidden="true" /> Export CSV</Button>}
      />

      <form onSubmit={applyFilters} aria-label="Filter the report" className="soft-card mb-4 flex flex-wrap items-end gap-3 rounded-2xl border border-divider bg-white p-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="f-school" className="text-sm font-semibold">School</label>
          <Select id="f-school" name="school" defaultValue={filters.school ?? ''} className="w-64">
            <option value="">All schools</option>
            {a.schoolOptions.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="f-class" className="text-sm font-semibold">Class</label>
          <Select id="f-class" name="class" defaultValue={filters.classId ?? ''} className="w-60">
            <option value="">All classes</option>
            {data.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </div>
        <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
          <input type="checkbox" name="archived" value="1" defaultChecked={filters.includeArchived} className="size-4 accent-brand" />
          Include archived classes
        </label>
        <Button type="submit">Apply filters</Button>
        {filtered && <Button variant="ghost" onClick={() => setParams({ by })}>Clear</Button>}
      </form>

      <nav aria-label="Jump to section" className="sticky top-16 z-10 -mx-1 mb-8 flex gap-2 overflow-x-auto bg-canvas/90 px-1 py-2 backdrop-blur lg:top-0">
        {SECTIONS.map(([id, label]) => (
          <a key={id} href={`#${id}`} className="dot-hover soft-card shrink-0 rounded-full border border-divider bg-white px-3.5 py-1.5 text-sm font-semibold text-brand hover:border-brand">
            {label}
          </a>
        ))}
      </nav>

      {a.overall.students === 0 ? (
        <EmptyState icon={<BarChart3 />} title="No students in this view" description={filtered ? 'Nothing matches these filters. Try clearing them.' : 'This report fills in once classes have students.'} />
      ) : (
        <Report data={data} a={a} by={by} setBy={(g) => { const n = new URLSearchParams(params); n.set('by', g); setParams(n) }} />
      )}
    </>
  )
}

function Report({ data, a, by, setBy }: { data: OrgData; a: ReturnType<typeof analyze>; by: GroupBy; setBy: (g: GroupBy) => void }) {
  const keep = new Set(a.classes.map((c) => c.id))
  const name = new Map(data.people.map((p) => [p.id, p.display_name]))
  const courseTitle = new Map(data.courses.map((c) => [c.id, c.title]))
  const attempts = data.attempts.filter((x) => keep.has(x.class_id) && x.submitted_at)
  const hours = attempts.reduce((s, x) => s + x.time_on_task_ms, 0) / 3_600_000
  const modulesCompleted = a.studentModules.filter((r) => r.done).length
  const instructorIds = [...new Set(data.classInstructors.filter((x) => keep.has(x.class_id)).map((x) => x.instructor_id))]
  const statusAll = countStatuses(a.students)

  // Reach per school
  const schools = [...new Set(a.classes.map((c) => c.school))].sort().map((school) => {
    const classIds = new Set(a.classes.filter((c) => c.school === school).map((c) => c.id))
    const sm = a.studentModules.filter((r) => classIds.has(r.classId))
    return {
      school,
      classes: classIds.size,
      students: a.students.filter((s) => classIds.has(s.classId)).length,
      instructors: new Set(data.classInstructors.filter((x) => classIds.has(x.class_id)).map((x) => x.instructor_id)).size,
      hours: attempts.filter((x) => classIds.has(x.class_id)).reduce((s, x) => s + x.time_on_task_ms, 0) / 3_600_000,
      completion: sm.length ? (sm.filter((r) => r.done).length / sm.length) * 100 : null,
      gain: mean(sm.map((r) => r.gain)),
    }
  })
  const maxStudents = Math.max(1, ...schools.map((s) => s.students))

  const rows: GroupSummary[] = { class: a.byClass, school: a.bySchool, module: a.byModule }[by]
  const students = [...a.students].sort((x, y) => x.name.localeCompare(y.name))
  const pipsFor = (s: StudentSummary): { title: string; state: Pip }[] =>
    modulesInScope(data, s.classId).map((mid) => {
      const r = a.studentModules.find((x) => x.studentId === s.studentId && x.classId === s.classId && x.moduleId === mid)
      return { title: data.modules.find((m) => m.id === mid)?.title ?? 'Module', state: r?.done ? 'done' : r?.started ? 'in_progress' : 'not_started' }
    })

  return (
    <div className="flex flex-col gap-10">
      {/* 1. Impact at a glance */}
      <section id="impact" aria-labelledby="impact-h" className="brand-panel soft-card scroll-mt-32 rounded-2xl p-6 sm:p-8">
        <div className="mb-6 flex items-center gap-3">
          <HeartHandshake aria-hidden="true" className="size-7 text-brand-accent" />
          <h2 id="impact-h" className="text-2xl !text-white">Impact at a glance</h2>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
          <ImpactNumber value={a.overall.students} label="Students reached" hint="Enrolled in a CIC class" />
          <ImpactNumber value={a.schoolOptions.filter((s) => a.classes.some((c) => c.school === s)).length} label="Partner schools" hint={`${a.classes.length} ${a.classes.length === 1 ? 'class' : 'classes'}`} />
          <ImpactNumber value={instructorIds.length} label="Instructors" hint="Teaching CIC courses" />
          <ImpactNumber value={hours} label="Hours of learning" hint="Time students spent on lessons" />
          <ImpactNumber value={modulesCompleted} label="Modules completed" hint={`${fmtPct(a.overall.completionPct)} of modules started`} />
          <ImpactNumber value={a.overall.avgGain ?? 0} label="Avg learning gain" hint={a.overall.avgGain == null ? 'Needs students with a pretest and a post-test' : `${fmtPct(a.overall.avgPre)} → ${fmtPct(a.overall.avgPost)} · ${a.overall.assessmentPairs} matched student/module pairs`} format={(v) => (a.overall.avgGain == null ? '—' : fmtGain(v))} />
        </div>
        {a.selfPaced && a.selfPaced.students > 0 && (
          <p className="mt-5 text-sm text-white">
            Plus {a.selfPaced.students} self-paced {a.selfPaced.students === 1 ? 'learner' : 'learners'} taking courses on their own: {a.selfPaced.modulesDone} {a.selfPaced.modulesDone === 1 ? 'module' : 'modules'} completed ({fmtPct(a.selfPaced.completionPct)}), {fmtMinutes(a.selfPaced.timeOnTaskMs)} of learning, average gain {fmtGain(a.selfPaced.avgGain)}.
          </p>
        )}
        <p className="mt-5 text-sm text-sidebar-muted">Every number is calculated from real student work in CIC Learn. Nothing is entered by hand.</p>
      </section>

      {/* Overall progress */}
      <section id="overall" className="scroll-mt-32">
        <Card title="Overall progress" description="Where every student stands, and how far through their modules they are.">
          <OverallProgress
            students={statusAll}
            modules={{
              done: modulesCompleted,
              inProgress: a.studentModules.filter((r) => r.started && !r.done).length,
              notStarted: a.studentModules.filter((r) => !r.started).length,
            }}
          />
        </Card>
      </section>

      {/* 2. Where support goes */}
      <section id="reach" aria-labelledby="reach-h" className="scroll-mt-32">
        <h2 id="reach-h" className="text-2xl">Where support goes</h2>
        <p className="mb-4 mt-1 text-cic-muted">The schools CIC serves, and what students there are getting out of it.</p>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {schools.map((s) => (
            <article key={s.school} className="dot-hover soft-card rounded-2xl border border-divider bg-white p-5 transition-transform hover:-translate-y-0.5 hover:border-brand">
              <h3 className="text-lg">{s.school}</h3>
              <div className="mt-3 flex items-center gap-2" role="img" aria-label={`${s.students} students`}>
                <div className="h-3 flex-1 overflow-hidden rounded-full bg-divider">
                  <div className="h-full rounded-full bg-brand-accent" style={{ width: `${(s.students / maxStudents) * 100}%` }} />
                </div>
                <span className="text-sm font-bold tabular-nums">{s.students} students</span>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <div><dt className="text-cic-muted">Classes</dt><dd className="text-lg font-bold">{s.classes}</dd></div>
                <div><dt className="text-cic-muted">Instructors</dt><dd className="text-lg font-bold">{s.instructors}</dd></div>
                <div><dt className="text-cic-muted">Hours of learning</dt><dd className="text-lg font-bold">{Math.round(s.hours)}</dd></div>
                <div><dt className="text-cic-muted">Learning gain</dt><dd className="text-lg font-bold text-brand">{fmtGain(s.gain)}</dd></div>
              </dl>
              <div className="mt-3"><Meter value={s.completion} label="Module completion" /></div>
            </article>
          ))}
        </div>
        <p className="mt-3 text-xs text-cic-muted">Funding amounts aren't tracked in CIC Learn, so this shows what support produces: students reached, hours of learning and growth.</p>
      </section>

      {/* 3. Learning growth */}
      <section id="growth" aria-labelledby="growth-h" className="scroll-mt-32">
        <h2 id="growth-h" className="text-2xl">Learning growth</h2>
        <p className="mb-4 mt-1 text-cic-muted">How far students moved from the pretest (before) to the post-test (after) in each module.</p>
        <div className="grid gap-6 lg:grid-cols-5">
          <Card className="lg:col-span-3" title="Before → after, by module">
            <GrowthRows rows={a.byModule.map((m) => ({ label: m.label, pre: m.avgPre, post: m.avgPost, pairs: m.assessmentPairs }))} />
          </Card>
          <Card className="lg:col-span-2" title="Learning gain by class" description="Average percentage-point gain.">
            {a.byClass.some((r) => r.avgGain != null) ? (
              <GainChart title="Average learning gain by class" data={a.byClass.map((r) => ({ label: r.label, gain: r.avgGain }))} />
            ) : (
              <EmptyState title="No learning gain yet" description="Needs students with both a pretest and a post-test." />
            )}
          </Card>
        </div>
      </section>

      {/* 4. Instructors & their courses */}
      <section id="instructors" aria-labelledby="instructors-h" className="scroll-mt-32">
        <h2 id="instructors-h" className="text-2xl">Instructors and their courses</h2>
        <p className="mb-4 mt-1 text-cic-muted">Who is teaching what, and how their students are doing.</p>
        {instructorIds.length === 0 ? (
          <EmptyState title="No instructors assigned" description="Assign instructors to classes on the Schools & classes page." />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {instructorIds.map((id) => {
              const classIds = data.classInstructors.filter((x) => x.instructor_id === id && keep.has(x.class_id)).map((x) => x.class_id)
              const studs = a.students.filter((s) => classIds.includes(s.classId))
              const sm = a.studentModules.filter((r) => classIds.includes(r.classId))
              const counts = countStatuses(studs)
              return (
                <article key={id} className="dot-hover soft-card rounded-2xl border border-divider bg-white p-5 transition-transform hover:-translate-y-0.5 hover:border-brand">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span aria-hidden="true" className="grid size-10 place-items-center rounded-full bg-brand-tint font-bold text-brand">
                        {(name.get(id) ?? '?').split(' ').map((w) => w[0]).join('').slice(0, 2)}
                      </span>
                      <div>
                        <h3 className="text-lg leading-tight">{name.get(id)}</h3>
                        <p className="text-sm text-cic-muted">{studs.length} students · {classIds.length} {classIds.length === 1 ? 'class' : 'classes'}</p>
                      </div>
                    </div>
                    <span className="rounded-full bg-brand-tint px-2.5 py-1 text-sm font-bold text-brand">{fmtGain(mean(sm.map((r) => r.gain)))}</span>
                  </div>
                  <ul className="mt-4 flex flex-col gap-1.5 text-sm">
                    {classIds.map((cid) => {
                      const c = a.classOf.get(cid)!
                      return (
                        <li key={cid} className="flex flex-wrap justify-between gap-x-3 rounded-lg bg-brand-subtle px-3 py-2">
                          <span><strong>{courseTitle.get(c.course_id) ?? 'Course'}</strong> · {c.name}</span>
                          <span className="text-cic-muted">{c.school}</span>
                        </li>
                      )
                    })}
                  </ul>
                  <div className="mt-4 flex flex-col gap-2">
                    <StatusBar counts={counts} label={`${name.get(id)}'s students`} />
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-cic-muted">Module completion</span>
                      <Meter value={sm.length ? (sm.filter((r) => r.done).length / sm.length) * 100 : null} label="Module completion" />
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        )}
        <div className="mt-3"><StatusLegend /></div>
      </section>

      {/* 5. Student progress by class */}
      <section id="progress" aria-labelledby="progress-h" className="scroll-mt-32">
        <h2 id="progress-h" className="text-2xl">Student progress</h2>
        <p className="mb-4 mt-1 text-cic-muted">Where every student in each class stands right now.</p>
        <Card>
          <div className="mb-5"><StatusLegend counts={statusAll} /></div>
          <ul className="flex flex-col gap-4">
            {a.classes.map((c) => {
              const studs = a.students.filter((s) => s.classId === c.id)
              const st = a.byClass.find((x) => x.id === c.id)
              return (
                <li key={c.id} className="grid gap-2 sm:grid-cols-[14rem_1fr_6rem] sm:items-center">
                  <div>
                    <p className="font-semibold">{c.name}</p>
                    <p className="text-xs text-cic-muted">{courseTitle.get(c.course_id)} · {studs.length} students</p>
                  </div>
                  <StatusBar counts={countStatuses(studs)} label={c.name} />
                  <p className="text-sm font-bold text-brand sm:text-right">{fmtGain(st?.avgGain ?? null)}</p>
                </li>
              )
            })}
          </ul>
        </Card>
      </section>

      {/* 6. Detailed breakdown */}
      <section aria-labelledby="breakdown-h">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 id="breakdown-h" className="text-2xl">Breakdown</h2>
          <div role="group" aria-label="Group results by" className="flex gap-1 rounded-lg bg-brand-tint p-1">
            {(Object.keys(GROUPS) as GroupBy[]).map((g) => (
              <button key={g} type="button" aria-pressed={g === by} onClick={() => setBy(g)}
                className={`rounded-md px-3 py-1.5 text-sm font-semibold ${g === by ? 'bg-white text-brand shadow-sm' : 'text-black hover:text-brand'}`}>
                By {GROUPS[g].toLowerCase()}
              </button>
            ))}
          </div>
        </div>
        <DataTable caption={`Completion and learning gain by ${GROUPS[by].toLowerCase()}`}>
          <thead>
            <tr>
              <Th>{GROUPS[by]}</Th><Th className="text-right">Students</Th><Th>Completion</Th>
              <Th className="text-right">Matched pairs</Th><Th className="text-right">Pretest</Th><Th className="text-right">Post-test</Th><Th className="text-right">Gain</Th>
              {by !== 'module' && <><Th className="text-right">Stuck</Th><Th className="text-right">Not started</Th></>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <Td className="font-semibold">
                  {by === 'class' ? <Link className="hover:underline" to={`/admin/analytics?class=${r.id}&by=class`}>{r.label}</Link> : r.label}
                </Td>
                <Td className="text-right tabular-nums">{r.students}</Td>
                <Td><Meter value={r.completionPct} label="Completion" /></Td>
                <Td className="text-right tabular-nums">{r.assessmentPairs}</Td>
                <Td className="text-right tabular-nums">{fmtPct(r.avgPre)}</Td>
                <Td className="text-right tabular-nums">{fmtPct(r.avgPost)}</Td>
                <Td className="text-right font-semibold tabular-nums">{fmtGain(r.avgGain)}</Td>
                {by !== 'module' && <><Td className="text-right tabular-nums">{r.stuck}</Td><Td className="text-right tabular-nums">{r.notStarted}</Td></>}
              </tr>
            ))}
          </tbody>
        </DataTable>
      </section>

      {/* 7. Every student */}
      <section id="students" aria-labelledby="students-h" className="scroll-mt-32">
        <h2 id="students-h" className="text-2xl">Every student <span className="text-cic-muted">({students.length})</span></h2>
        <div className="mb-4 mt-2"><JourneyLegend /></div>
        <DataTable caption="Per-student progress, module journey and learning gain">
          <thead><tr><Th>Student</Th><Th>Class</Th><Th>Modules</Th><Th>Status</Th><Th className="text-right">Avg gain</Th><Th className="text-right">Time on task</Th><Th>Last active</Th></tr></thead>
          <tbody>
            {students.map((s) => (
              <tr key={`${s.classId}-${s.studentId}`}>
                <Td className="font-semibold">{s.name}</Td>
                <Td>{a.classOf.get(s.classId)?.name}</Td>
                <Td>
                  <div className="flex items-center gap-2">
                    <JourneyPips modules={pipsFor(s)} />
                    <span className="text-xs tabular-nums text-cic-muted">{s.modulesDone}/{s.modulesInScope}</span>
                  </div>
                </Td>
                <Td><StatusBadge status={s.status} /></Td>
                <Td className="text-right tabular-nums">{fmtGain(s.avgGain)}</Td>
                <Td className="text-right tabular-nums">{fmtMinutes(s.timeOnTaskMs)}</Td>
                <Td className="text-cic-muted">{timeAgo(s.lastActivity)}</Td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </section>

      <details className="soft-card rounded-2xl border border-divider bg-white p-4 text-sm">
        <summary className="cursor-pointer font-semibold text-brand">How these numbers are calculated</summary>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-cic-muted">
          <li><strong className="text-black">Pretest</strong>: the student's first pretest attempt in a module. <strong className="text-black">Post-test</strong>: their best post-test attempt.</li>
          <li><strong className="text-black">Learning gain</strong>: post-test % minus pretest %, in percentage points. Pretest, post-test and gain averages all use the same matched student/module pairs. A student contributes one pair for each module with both scores; unmatched scores are excluded. Matched pairs shows that sample size.</li>
          <li><strong className="text-black">Module completed</strong>: every activity that counts toward unlocking is submitted, and the post-test (best of the tries that count) meets the pass mark the class set for that module.</li>
          <li><strong className="text-black">Stuck</strong>: below a module's pass mark after using all of its post-test tries, or no activity for more than {data.settings.inactive_days} days.</li>
          <li><strong className="text-black">Self-paced learners</strong>: students taking a course on their own, outside any class. A module counts as completed once every activity that counts toward unlocking is submitted.</li>
          <li><strong className="text-black">Hours of learning</strong>: total time students spent on submitted activities.</li>
          <li><strong className="text-black">Modules in progress</strong>: self-paced courses count every published module; instructor-led courses count modules released to the class.</li>
        </ul>
      </details>
    </div>
  )
}
