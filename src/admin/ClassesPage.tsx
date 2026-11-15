// Owner: Aryan. Every class across partner schools, who teaches it, and how it's doing.
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, Copy, Plus, School as SchoolIcon, Search } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { useAuth } from '../shared/auth/AuthContext.tsx'
import {
  Badge, Button, Card, DataTable, EmptyState, Field, FormStatus, Input, Meter, PageHeader, Select, Td, Th,
} from '../shared/ui/index.tsx'
import { addInstructor, createClass, removeInstructor } from './api.ts'
import { AdminDialog, ArchiveButton, LoadState } from './common.tsx'
import { ORG_KEY, useOrg } from './hooks.ts'
import { analyze, archivedReason, fmtGain, termOf, type OrgData } from './metrics.ts'

export function ClassesPage() {
  const { data, isLoading, error } = useOrg()
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const school = params.get('school') ?? ''
  const showArchived = params.get('archived') === '1'
  if (!data) return <><PageHeader title="Schools & classes" /><LoadState isLoading={isLoading} error={error} /></>

  const a = analyze(data, { includeArchived: true })
  const stats = new Map(a.byClass.map((s) => [s.id, s]))
  const name = new Map(data.people.map((p) => [p.id, p.display_name]))
  const instructors = data.people.filter((p) => p.role === 'instructor' && !p.archived_at)
  const needle = q.trim().toLowerCase()
  const classes = data.classes.filter(
    (c) => Boolean(archivedReason(c)) === showArchived && (!school || c.school === school) && (!needle || [c.name, c.join_code, c.school].some((v) => v.toLowerCase().includes(needle))),
  )

  function applyFilters(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const next = new URLSearchParams()
    for (const k of ['q', 'school']) if (f.get(k)) next.set(k, String(f.get(k)))
    if (showArchived) next.set('archived', '1')
    setParams(next)
  }

  return (
    <>
      <PageHeader
        title="Schools & classes"
        subtitle="Partner schools, their classes, and who teaches them."
        actions={<NewClassDialog data={data} schools={a.schoolOptions} />}
      />

      <section aria-labelledby="classes-heading" className="mb-10">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <h2 id="classes-heading" className="text-xl">
              {showArchived ? 'Archived classes' : 'Active classes'} <span className="text-cic-muted">({classes.length})</span>
            </h2>
            <Link to={showArchived ? '/admin/classes' : '/admin/classes?archived=1'} className="text-sm font-semibold text-brand hover:underline">
              {showArchived ? 'Back to active classes' : 'View archived'}
            </Link>
          </div>
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
            title={showArchived ? 'No archived classes' : data.classes.length ? 'No classes match' : 'No classes yet'}
            description={data.classes.length ? 'Try a different search or school.' : 'Create the first class below and share its join code.'}
          />
        ) : (
          <DataTable caption="Classes with instructors, enrollment and progress">
            <thead>
              <tr>
                <Th>Class</Th><Th>School</Th><Th>Instructors</Th><Th className="text-right">Students</Th>
                <Th>Completion</Th><Th className="text-right">Avg gain</Th><Th className="text-right">Need help</Th>
                <Th><span className="sr-only">Archive</span></Th>
              </tr>
            </thead>
            <tbody>
              {classes.map((c) => {
                const st = stats.get(c.id)
                const mine = data.classInstructors.filter((x) => x.class_id === c.id)
                const help = (st?.stuck ?? 0) + (st?.notStarted ?? 0)
                const reason = archivedReason(c)
                return (
                  <tr key={c.id} className="align-top">
                    <Td>
                      <p className="font-semibold">{c.name}</p>
                      <p className="text-xs text-cic-muted">
                        {c.created_at && `${termOf(c.created_at).label} · `}Join code <span className="font-mono">{c.join_code}</span>
                      </p>
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
                        <Link to={`/admin/analytics?class=${c.id}#students`} className="font-semibold text-danger underline-offset-2 hover:underline">
                          {help}<span className="sr-only"> students need help in {c.name}</span>
                        </Link>
                      ) : '0'}
                    </Td>
                    <Td className="text-right">
                      {reason && <p className="mb-1 whitespace-nowrap text-xs text-cic-muted">{reason}</p>}
                      {(!reason || c.archived_at) && <ArchiveButton table="classes" id={c.id} name={c.name} archived={Boolean(reason)} />}
                    </Td>
                  </tr>
                )
              })}
            </tbody>
          </DataTable>
        )}
      </section>

      <Card className="max-w-xl" title="Schools" description={`${a.schoolOptions.length} partner schools`}>
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
        <p className="mt-4 text-xs text-cic-muted">A school appears here once it has a class.</p>
      </Card>
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

function NewClassDialog({ data, schools }: { data: OrgData; schools: string[] }) {
  const qc = useQueryClient()
  const { profile } = useAuth()
  const { hash } = useLocation()
  const dialog = useRef<HTMLDialogElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ name: string; join_code: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const create = useMutation({
    mutationFn: (input: Parameters<typeof createClass>[0]) => createClass(input, profile!.id),
    onSuccess: ({ join_code }, input) => {
      setDone({ name: input.name, join_code })
      return qc.invalidateQueries({ queryKey: ORG_KEY })
    },
    onError: (e) => setError(e.message),
  })

  // The command bar's "Create a class" links to #new-class.
  useEffect(() => {
    if (hash === '#new-class' && !dialog.current?.open) dialog.current?.showModal()
  }, [hash])

  function reset() {
    setDone(null)
    setError(null)
    setCopied(false)
  }

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const name = String(f.get('name') ?? '').trim()
    const school = String(f.get('school') ?? '').trim()
    const join_code = String(f.get('join_code') ?? '').trim().toUpperCase()
    setError(null)
    if (name.length < 2) return setError('Class name needs at least 2 characters.')
    if (school.length < 2) return setError('Enter the school name.')
    if (join_code && !/^[A-Z0-9-]{3,20}$/.test(join_code)) return setError('Join code: 3–20 letters, numbers or dashes.')
    create.mutate({ name, school, course_id: String(f.get('course_id')), join_code, instructor_id: String(f.get('instructor_id') ?? '') || undefined })
  }

  async function copy(code: string) {
    await navigator.clipboard.writeText(code)
    setCopied(true)
  }

  return (
    <>
      <Button onClick={() => dialog.current?.showModal()}>
        <Plus aria-hidden="true" /> New class
      </Button>
      <AdminDialog dialogRef={dialog} id="new-class-title" title={done ? 'Class created' : 'New class'} onClose={reset}>
        {done ? (
          <div className="flex flex-col gap-5 p-6">
            <div className="rounded-2xl bg-gradient-to-br from-brand to-brand-accent p-px">
              <div className="rounded-[15px] bg-white p-5 text-center">
                <p className="text-lg font-bold">{done.name}</p>
                <p className="mt-4 text-sm text-cic-muted">Students join with</p>
                <p className="font-mono text-3xl font-bold tracking-widest text-brand">{done.join_code}</p>
              </div>
            </div>
            <Button variant="secondary" onClick={() => void copy(done.join_code)}>
              {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />} {copied ? 'Copied' : 'Copy join code'}
            </Button>
            <button type="button" onClick={reset} className="self-center text-sm font-semibold text-brand hover:underline">Create another class</button>
          </div>
        ) : (
          <form onSubmit={submit} noValidate className="flex flex-col gap-4 p-6">
            <Field id="class-name" label="Class name">
              <Input id="class-name" name="name" required minLength={2} placeholder="e.g. Maryvale Period 3" />
            </Field>
            <Field id="class-school" label="School">
              <Input id="class-school" name="school" required list="school-options" placeholder="Pick or type a school" />
              <datalist id="school-options">{schools.map((s) => <option key={s} value={s} />)}</datalist>
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="class-course" label="Course">
                <Select id="class-course" name="course_id" required>
                  {data.courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
                </Select>
              </Field>
              <Field id="class-instructor" label="Instructor" optional>
                <Select id="class-instructor" name="instructor_id" defaultValue="">
                  <option value="">Assign later</option>
                  {data.people.filter((p) => p.role === 'instructor' && !p.archived_at).map((p) => <option key={p.id} value={p.id}>{p.display_name}</option>)}
                </Select>
              </Field>
            </div>
            <Field id="class-code" label="Join code" optional>
              <Input id="class-code" name="join_code" className="font-mono uppercase tracking-wider placeholder:font-sans placeholder:normal-case placeholder:tracking-normal" placeholder="Leave blank to generate one" />
            </Field>
            <FormStatus error={error} />
            <Button type="submit" disabled={create.isPending} className="min-h-12 w-full">
              {create.isPending ? 'Creating…' : 'Create class'}
            </Button>
          </form>
        )}
      </AdminDialog>
    </>
  )
}
