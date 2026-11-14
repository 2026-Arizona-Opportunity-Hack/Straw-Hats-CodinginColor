// Owner: Aryan. Every class across partner schools, who teaches it, and how it's doing.
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, School as SchoolIcon, Search } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../shared/auth/AuthContext.tsx'
import {
  Badge, Button, Card, DataTable, EmptyState, Field, FormStatus, Input, Meter, PageHeader, Select, Td, Th,
} from '../shared/ui/index.tsx'
import { addInstructor, createClass, removeInstructor } from './api.ts'
import { LoadState } from './common.tsx'
import { ORG_KEY, useOrg } from './hooks.ts'
import { analyze, fmtGain, type OrgData } from './metrics.ts'

export function ClassesPage() {
  const { data, isLoading, error } = useOrg()
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const school = params.get('school') ?? ''
  if (!data) return <><PageHeader title="Schools & classes" /><LoadState isLoading={isLoading} error={error} /></>

  const a = analyze(data)
  const stats = new Map(a.byClass.map((s) => [s.id, s]))
  const name = new Map(data.people.map((p) => [p.id, p.display_name]))
  const instructors = data.people.filter((p) => p.role === 'instructor')
  const needle = q.trim().toLowerCase()
  const classes = data.classes.filter(
    (c) => (!school || c.school === school) && (!needle || [c.name, c.join_code, c.school].some((v) => v.toLowerCase().includes(needle))),
  )

  function applyFilters(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const next = new URLSearchParams()
    for (const k of ['q', 'school']) if (f.get(k)) next.set(k, String(f.get(k)))
    setParams(next)
  }

  return (
    <>
      <PageHeader
        title="Schools & classes"
        subtitle="Partner schools, their classes, and who teaches them."
        actions={<a href="#new-class" className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-brand px-4 font-semibold text-white hover:bg-brand-dark"><Plus aria-hidden="true" className="size-4" /> New class</a>}
      />

      <section aria-labelledby="classes-heading" className="mb-10">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <h2 id="classes-heading" className="text-xl">Classes <span className="text-cic-muted">({classes.length})</span></h2>
          <form role="search" onSubmit={applyFilters} className="flex flex-wrap items-end gap-2">
            <label htmlFor="q" className="sr-only">Search classes</label>
            <div className="relative">
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-cic-muted" />
              <Input id="q" name="q" defaultValue={q} placeholder="Search name or join code" className="w-56 pl-9" />
            </div>
            <label htmlFor="school" className="sr-only">Filter by school</label>
            <Select id="school" name="school" defaultValue={school} className="w-56">
              <option value="">All schools</option>
              {a.schoolOptions.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
            <Button type="submit" variant="secondary">Apply</Button>
            {(q || school) && <Button variant="ghost" onClick={() => setParams({})}>Clear</Button>}
          </form>
        </div>

        {classes.length === 0 ? (
          <EmptyState
            icon={<SchoolIcon />}
            title={data.classes.length ? 'No classes match' : 'No classes yet'}
            description={data.classes.length ? 'Try a different search or school.' : 'Create the first class below and share its join code.'}
          />
        ) : (
          <DataTable caption="Classes with instructors, enrollment and progress">
            <thead>
              <tr>
                <Th>Class</Th><Th>School</Th><Th>Instructors</Th><Th className="text-right">Students</Th>
                <Th>Completion</Th><Th className="text-right">Avg gain</Th><Th className="text-right">Need help</Th>
              </tr>
            </thead>
            <tbody>
              {classes.map((c) => {
                const st = stats.get(c.id)
                const mine = data.classInstructors.filter((x) => x.class_id === c.id)
                const help = (st?.stuck ?? 0) + (st?.notStarted ?? 0)
                return (
                  <tr key={c.id} className="align-top">
                    <Td>
                      <p className="font-semibold">{c.name}</p>
                      <p className="text-xs text-cic-muted">Join code <span className="font-mono">{c.join_code}</span></p>
                    </Td>
                    <Td>{c.school}</Td>
                    <Td>
                      <InstructorCell
                        classId={c.id}
                        className={c.name}
                        assigned={mine.map((m) => ({ id: m.instructor_id, name: name.get(m.instructor_id) ?? 'Unknown' }))}
                        available={instructors.filter((i) => !mine.some((m) => m.instructor_id === i.id))}
                      />
                    </Td>
                    <Td className="text-right tabular-nums">{st?.students ?? 0}</Td>
                    <Td><Meter value={st?.completionPct ?? null} label="Completion" /></Td>
                    <Td className="text-right tabular-nums">{fmtGain(st?.avgGain ?? null)}</Td>
                    <Td className="text-right tabular-nums">
                      {help > 0 ? (
                        <Link to={`/admin/analytics?class=${c.id}#attention`} className="font-semibold text-danger underline-offset-2 hover:underline">
                          {help}<span className="sr-only"> students need help in {c.name}</span>
                        </Link>
                      ) : '0'}
                    </Td>
                  </tr>
                )
              })}
            </tbody>
          </DataTable>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card id="new-class" className="lg:col-span-3" title="Create a class" description="The instructor then imports the roster and releases modules from their dashboard.">
          <NewClassForm data={data} schools={a.schoolOptions} />
        </Card>
        <Card className="lg:col-span-2" title="Schools" description={`${a.schoolOptions.length} partner schools`}>
          <ul className="divide-y divide-divider">
            {a.schoolOptions.map((s) => {
              const n = data.classes.filter((c) => c.school === s).length
              return (
                <li key={s} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span className="font-semibold">{s}</span>
                  <Link to={`/admin/classes?school=${encodeURIComponent(s)}`} className="shrink-0 text-brand hover:underline">
                    {n} {n === 1 ? 'class' : 'classes'}
                  </Link>
                </li>
              )
            })}
          </ul>
          <p className="mt-4 text-xs text-cic-muted">A school appears here once it has a class. Type a new school name when creating a class.</p>
        </Card>
      </div>
    </>
  )
}

function InstructorCell({ classId, className, assigned, available }: {
  classId: string
  className: string
  assigned: { id: string; name: string }[]
  available: { id: string; display_name: string }[]
}) {
  const qc = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const add = useMutation({
    mutationFn: (id: string) => addInstructor(classId, id),
    onSuccess: () => { setError(null); return qc.invalidateQueries({ queryKey: ORG_KEY }) },
    onError: (e) => setError(e.message),
  })
  const remove = useMutation({
    mutationFn: (id: string) => removeInstructor(classId, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ORG_KEY }),
    onError: (e) => setError(e.message),
  })
  return (
    <details className="group">
      <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        <span className="flex flex-wrap gap-1">
          {assigned.length ? assigned.map((p) => <Badge key={p.id} tone="brand">{p.name}</Badge>) : <Badge tone="warn">No instructor</Badge>}
        </span>
        <span className="mt-1 block text-xs font-semibold text-brand underline-offset-2 hover:underline group-open:hidden">
          Manage<span className="sr-only"> instructors for {className}</span>
        </span>
      </summary>
      <div className="mt-3 flex w-64 flex-col gap-3 rounded-xl border border-divider bg-canvas p-3">
        {assigned.map((p) => (
          <div key={p.id} className="flex items-center justify-between gap-2 text-sm">
            <span>{p.name}</span>
            <Button
              size="sm"
              variant="ghost"
              disabled={remove.isPending}
              onClick={() => {
                if (window.confirm(`Remove ${p.name} from ${className}? They will lose access to this class's students.`)) remove.mutate(p.id)
              }}
            >
              Remove
            </Button>
          </div>
        ))}
        {available.length ? (
          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              const id = String(new FormData(e.currentTarget).get('instructor') ?? '')
              if (id) add.mutate(id)
            }}
          >
            <label htmlFor={`add-${classId}`} className="text-sm font-semibold">Add an instructor</label>
            <Select id={`add-${classId}`} name="instructor" required defaultValue="">
              <option value="" disabled>Choose an instructor</option>
              {available.map((i) => <option key={i.id} value={i.id}>{i.display_name}</option>)}
            </Select>
            <Button type="submit" size="sm" disabled={add.isPending}>{add.isPending ? 'Assigning…' : 'Assign'}</Button>
          </form>
        ) : (
          <p className="text-xs text-cic-muted">Every instructor already teaches this class.</p>
        )}
        <FormStatus error={error} />
      </div>
    </details>
  )
}

function NewClassForm({ data, schools }: { data: OrgData; schools: string[] }) {
  const qc = useQueryClient()
  const { profile } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const create = useMutation({
    mutationFn: (input: Parameters<typeof createClass>[0]) => createClass(input, profile!.id),
    onSuccess: ({ join_code }, input) => {
      setError(null)
      setSuccess(`Created ${input.name}. Join code: ${join_code}`)
      return qc.invalidateQueries({ queryKey: ORG_KEY })
    },
    onError: (e) => { setSuccess(null); setError(e.message) },
  })

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const f = new FormData(form)
    const name = String(f.get('name') ?? '').trim()
    const school = String(f.get('school') ?? '').trim()
    const join_code = String(f.get('join_code') ?? '').trim().toUpperCase()
    setSuccess(null)
    if (name.length < 2) return setError('Class name needs at least 2 characters.')
    if (school.length < 2) return setError('Enter the school name.')
    if (join_code && !/^[A-Z0-9-]{3,20}$/.test(join_code)) return setError('Join code: 3–20 letters, numbers or dashes.')
    create.mutate(
      { name, school, course_id: String(f.get('course_id')), join_code, instructor_id: String(f.get('instructor_id') ?? '') || undefined },
      { onSuccess: () => form.reset() },
    )
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="class-name" label="Class name">
          <Input id="class-name" name="name" required minLength={2} placeholder="e.g. Maryvale Period 3" />
        </Field>
        <Field id="class-school" label="School" hint="Pick from the list or type a new school.">
          <Input id="class-school" name="school" required list="school-options" aria-describedby="class-school-hint" placeholder="e.g. Maryvale High School" />
          <datalist id="school-options">{schools.map((s) => <option key={s} value={s} />)}</datalist>
        </Field>
        <Field id="class-course" label="Course">
          <Select id="class-course" name="course_id" required>
            {data.courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </Select>
        </Field>
        <Field id="class-instructor" label="Instructor" optional>
          <Select id="class-instructor" name="instructor_id" defaultValue="">
            <option value="">Assign later</option>
            {data.people.filter((p) => p.role === 'instructor').map((p) => <option key={p.id} value={p.id}>{p.display_name}</option>)}
          </Select>
        </Field>
        <Field id="class-code" label="Join code" optional hint="Students type this to join. Leave blank to generate one.">
          <Input id="class-code" name="join_code" aria-describedby="class-code-hint" className="uppercase placeholder:normal-case sm:max-w-xs" placeholder="e.g. MARY-P3" />
        </Field>
      </div>
      <div><Button type="submit" disabled={create.isPending}>{create.isPending ? 'Creating…' : 'Create class'}</Button></div>
      <FormStatus error={error} success={success} />
    </form>
  )
}
