// Owner: Aryan. Everyone with an account, role filters and changes, adding people, and putting students and instructors in classes.
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Backpack, Eye, Check, Copy, GraduationCap, Mail, RefreshCw, Search, ShieldCheck, UserPlus, Users } from 'lucide-react'
import { useRef, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../shared/auth/AuthContext.tsx'
import type { Role } from '../shared/types/db.ts'
import { Button, DataTable, EmptyState, Field, FormStatus, Input, PageHeader, Select, Td, Th } from '../shared/ui/index.tsx'
import { addInstructor, addPerson, changeRole, enrollStudent, type NewPerson } from './api.ts'
import { AdminDialog, ArchiveButton, LoadState } from './common.tsx'
import { ORG_KEY, useOrg } from './hooks.ts'
import { archivedReason } from './metrics.ts'

const ROLES: Role[] = ['admin', 'instructor', 'student', 'reviewer']
const ROLE_LABEL: Record<Role, string> = { admin: 'CIC Admin', instructor: 'Instructor', student: 'Student', reviewer: 'External Reviewer' }

export function PeoplePage() {
  const { data, isLoading, error } = useOrg()
  const { profile } = useAuth()
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const role = (params.get('role') ?? '') as Role | ''
  const showArchived = params.get('archived') === '1'
  if (!data) return <><PageHeader title="People & roles" /><LoadState isLoading={isLoading} error={error} /></>

  const className = new Map(data.classes.map((c) => [c.id, c.name]))
  const openClasses = data.classes.filter((c) => !archivedReason(c))
  const active = data.people.filter((p) => !p.archived_at)
  const archivedCount = data.people.length - active.length
  const counts = Object.fromEntries(ROLES.map((r) => [r, active.filter((p) => p.role === r).length])) as Record<Role, number>
  const needle = q.trim().toLowerCase()
  const list = data.people.filter(
    (p) => !p.archived_at === !showArchived && (!role || p.role === role) && (!needle || p.display_name.toLowerCase().includes(needle)),
  )
  const inClass = (id: string, r: Role, classId: string) =>
    r === 'instructor'
      ? data.classInstructors.some((x) => x.class_id === classId && x.instructor_id === id)
      : data.enrollments.some((x) => x.class_id === classId && x.student_id === id)
  const classesFor = (id: string, r: Role) =>
    r === 'instructor'
      ? data.classInstructors.filter((x) => x.instructor_id === id).map((x) => className.get(x.class_id))
      : r === 'student'
        ? data.enrollments.filter((x) => x.student_id === id).map((x) => className.get(x.class_id))
        : []

  function applyFilters(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const next = new URLSearchParams()
    for (const k of ['q', 'role']) if (f.get(k)) next.set(k, String(f.get(k)))
    if (showArchived) next.set('archived', '1')
    setParams(next)
  }

  return (
    <>
      <PageHeader
        title="People & roles"
        subtitle="Everyone with a CIC Learn account."
        actions={<AddPersonDialog classes={openClasses} />}
      />

      <nav aria-label="Filter by role" className="mb-8 flex flex-wrap gap-2">
        {ROLES.map((r) => (
          <Link
            key={r}
            to={role === r ? '/admin/users' : `/admin/users?role=${r}`}
            aria-current={role === r ? 'true' : undefined}
            className="flex items-center gap-2.5 rounded-full border border-divider bg-white py-1.5 pl-4 pr-1.5 text-sm font-semibold transition-colors hover:border-brand aria-[current=true]:border-brand aria-[current=true]:bg-brand aria-[current=true]:text-white"
          >
            {ROLE_LABEL[r]}s
            <span className="min-w-7 rounded-full bg-brand-tint px-2 py-0.5 text-center tabular-nums text-brand">{counts[r]}</span>
          </Link>
        ))}
      </nav>

      <section aria-labelledby="dir-heading" className="mb-10">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <h2 id="dir-heading" className="text-xl">
              {showArchived ? 'Archived people' : 'Directory'} <span className="text-cic-muted">({list.length})</span>
            </h2>
            <Link to={showArchived ? '/admin/users' : '/admin/users?archived=1'} className="text-sm font-semibold text-brand hover:underline">
              {showArchived ? 'Back to active people' : `View archived (${archivedCount})`}
            </Link>
          </div>
          <form role="search" onSubmit={applyFilters} className="flex flex-wrap items-end gap-2">
            <label htmlFor="q" className="sr-only">Search people</label>
            <div className="relative">
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-cic-muted" />
              <Input id="q" name="q" defaultValue={q} placeholder="Search by name" className="w-56 pl-9" />
            </div>
            <label htmlFor="role" className="sr-only">Filter by role</label>
            <Select id="role" name="role" defaultValue={role} className="w-48">
              <option value="">All roles</option>
              {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </Select>
            <Button type="submit" variant="secondary">Apply</Button>
            {(q || role) && <Button variant="ghost" onClick={() => setParams({})}>Clear</Button>}
          </form>
        </div>
        {list.length === 0 ? (
          <EmptyState icon={<Users />} title={showArchived ? 'No archived people' : 'Nobody matches'} description={showArchived ? undefined : 'Try another name or clear the filters.'} />
        ) : (
          <DataTable caption="People, their roles and classes">
            <thead><tr><Th>Name</Th><Th>School</Th><Th>Classes</Th><Th>Role</Th></tr></thead>
            <tbody>
              {list.map((p) => {
                const cls = classesFor(p.id, p.role).filter(Boolean)
                return (
                  <tr key={p.id}>
                    <Td className="font-semibold">{p.display_name}{p.username && <span className="block font-mono text-xs font-normal text-cic-muted">@{p.username}</span>}</Td>
                    <Td>{p.school ?? <span className="text-cic-muted">CIC</span>}</Td>
                    <Td className="max-w-72">
                      <div className="flex flex-col items-start gap-1.5">
                        {cls.length ? cls.join(', ') : <span className="text-cic-muted">—</span>}
                        {(p.role === 'student' || p.role === 'instructor') && !p.archived_at && (
                          <AddToClass personId={p.id} name={p.display_name} role={p.role} classes={openClasses.filter((c) => !inClass(p.id, p.role, c.id))} />
                        )}
                      </div>
                    </Td>
                    <Td>
                      <div className="flex flex-wrap items-center gap-2">
                        {p.role === 'reviewer' || p.archived_at ? (
                          <span className="px-1 text-sm font-semibold">{ROLE_LABEL[p.role]}</span>
                        ) : (
                          <RoleSelect userId={p.id} name={p.display_name} role={p.role} isSelf={p.id === profile?.id} />
                        )}
                        {p.role !== 'admin' && <ArchiveButton table="profiles" id={p.id} name={p.display_name} archived={Boolean(p.archived_at)} />}
                      </div>
                    </Td>
                  </tr>
                )
              })}
            </tbody>
          </DataTable>
        )}
      </section>
    </>
  )
}

/** Readable temporary password: no 0/O or 1/l/I to mix up when read aloud. */
const tempPassword = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('')

/** Opens the admin's mail app with the sign-in details and a reminder to change the password. */
const signInEmail = (p: NewPerson) =>
  `mailto:${p.email}?subject=${encodeURIComponent('Your CIC Learn sign-in')}&body=${encodeURIComponent(
    `Hi ${p.display_name},\n\nYou now have a CIC Learn account.\n\nSign in at: ${window.location.origin}/login\nEmail: ${p.email}\nTemporary password: ${p.password}\n\nAfter signing in, choose "Change password" in the menu to set your own.\n\nCoding in Color`,
  )}`

const ADD_ROLES = [
  { value: 'instructor', label: 'Instructor', icon: GraduationCap },
  { value: 'student', label: 'Student', icon: Backpack },
  { value: 'admin', label: 'Admin', icon: ShieldCheck },
  { value: 'reviewer', label: 'Reviewer', icon: Eye },
] as const

function AddPersonDialog({ classes }: { classes: { id: string; name: string }[] }) {
  const qc = useQueryClient()
  const dialog = useRef<HTMLDialogElement>(null)
  const [role, setRole] = useState<NewPerson['role']>('instructor')
  const [password, setPassword] = useState(tempPassword)
  const [done, setDone] = useState<NewPerson | null>(null)
  const [copied, setCopied] = useState(false)
  const add = useMutation({
    mutationFn: addPerson,
    onSuccess: (username, p) => {
      setDone({ ...p, username: username ?? undefined })
      return qc.invalidateQueries({ queryKey: ORG_KEY })
    },
  })

  function reset() {
    setDone(null)
    setCopied(false)
    setPassword(tempPassword())
    add.reset()
  }

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>
    if (role === 'admin' && !window.confirm(`Make ${f.display_name.trim()} a CIC Admin?\n\nAdmins can see every student record and change anyone's access.`)) return
    add.mutate({ display_name: f.display_name.trim(), email: (f.email ?? '').trim(), password, role, school: f.school.trim(), class_id: f.class_id ?? '' })
  }

  async function copy(p: NewPerson) {
    await navigator.clipboard.writeText(`CIC Learn sign-in\n${window.location.origin}/login\n${p.username ? `Username: ${p.username}` : `Email: ${p.email}`}\nTemporary password: ${p.password}`)
    setCopied(true)
  }

  return (
    <>
      <Button onClick={() => dialog.current?.showModal()}>
        <UserPlus aria-hidden="true" /> Add person
      </Button>
      <AdminDialog dialogRef={dialog} id="add-person-title" title={done ? 'Ready to sign in' : 'Add a person'} onClose={reset}>
        {done ? (
          <div className="flex flex-col gap-5 p-6">
            <div className="rounded-2xl bg-gradient-to-br from-brand to-brand-accent p-px">
              <div className="rounded-[15px] bg-white p-5">
                <p className="text-lg font-bold">{done.display_name}</p>
                <p className="mb-4 text-sm font-semibold text-brand">{ROLE_LABEL[done.role]}</p>
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                  <dt className="text-cic-muted">{done.username ? 'Username' : 'Email'}</dt>
                  <dd className="break-all font-mono">{done.username ?? done.email}</dd>
                  <dt className="text-cic-muted">Password</dt>
                  <dd className="font-mono text-base font-bold tracking-wider">{done.password}</dd>
                </dl>
              </div>
            </div>
            <div className={`grid gap-2 ${done.username ? 'grid-cols-1' : 'grid-cols-2'}`}>
              <Button variant="secondary" onClick={() => void copy(done)}>
                {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />} {copied ? 'Copied' : 'Copy'}
              </Button>
              {!done.username && <a href={signInEmail(done)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-dark">
                <Mail aria-hidden="true" className="size-4" /> Email it
              </a>}
            </div>
            <button type="button" onClick={reset} className="self-center text-sm font-semibold text-brand hover:underline">Add another person</button>
          </div>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-4 p-6">
            <div role="radiogroup" aria-label="Role" className="grid grid-cols-2 gap-2">
              {ADD_ROLES.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={role === value}
                  onClick={() => setRole(value)}
                  className="flex flex-col items-center gap-2 rounded-2xl border-2 border-divider p-3 font-semibold transition-colors hover:border-brand sm:flex-row sm:gap-3 sm:text-left aria-checked:border-brand aria-checked:bg-brand-tint aria-checked:text-brand"
                >
                  <span className="grid size-9 place-items-center rounded-xl bg-brand text-white"><Icon aria-hidden="true" className="size-5" /></span>
                  {label}
                </button>
              ))}
            </div>
            <Field id="add-name" label="Full name">
              <Input id="add-name" name="display_name" required maxLength={100} autoComplete="off" />
            </Field>
            {role === 'student' ? (
              <p className="-mt-2 text-sm text-cic-muted">Students don't need an email. They get a username from their name, like jsmith1.</p>
            ) : (
              <Field id="add-email" label="Email">
                <Input id="add-email" name="email" type="email" required maxLength={254} autoComplete="off" />
              </Field>
            )}
            <Field id="add-password" label="Temporary password">
              <div className="relative">
                <Input id="add-password" required minLength={8} maxLength={72} autoComplete="off" spellCheck={false} value={password} onChange={(e) => setPassword(e.target.value)} className="w-full pr-11 font-mono tracking-wider" />
                <button type="button" onClick={() => setPassword(tempPassword())} aria-label="Generate a new password" className="absolute right-1 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-md text-brand hover:bg-brand-tint">
                  <RefreshCw aria-hidden="true" className="size-4" />
                </button>
              </div>
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="add-school" label="School" optional>
                <Input id="add-school" name="school" maxLength={120} />
              </Field>
              {(role === 'student' || role === 'instructor') && (
                <Field id="add-class" label="Class" optional>
                  <Select id="add-class" name="class_id" defaultValue="">
                    <option value="">None yet</option>
                    {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </Select>
                </Field>
              )}
            </div>
            <FormStatus error={add.error?.message} />
            <Button type="submit" disabled={add.isPending} className="min-h-12 w-full">
              {add.isPending ? 'Creating account…' : `Add ${role}`}
            </Button>
          </form>
        )}
      </AdminDialog>
    </>
  )
}

// Students are enrolled in a class; instructors are assigned to teach it.
const CLASS_ACTION = {
  student: { label: '+ Add to class', done: 'Added to', verb: 'Add', run: (personId: string, classId: string) => enrollStudent(personId, classId) },
  instructor: { label: '+ Assign to class', done: 'Now teaching', verb: 'Assign', run: (personId: string, classId: string) => addInstructor(classId, personId) },
}

/** Class picker on a student's or instructor's row: picking a class adds them right away. */
function AddToClass({ personId, name, role, classes }: { personId: string; name: string; role: keyof typeof CLASS_ACTION; classes: { id: string; name: string }[] }) {
  const qc = useQueryClient()
  const action = CLASS_ACTION[role]
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const add = useMutation({
    mutationFn: (c: { id: string; name: string }) => action.run(personId, c.id),
    onSuccess: (_, c) => {
      setMsg({ ok: true, text: `${action.done} ${c.name}` })
      return qc.invalidateQueries({ queryKey: ORG_KEY })
    },
    onError: (e) => setMsg({ ok: false, text: e.message }),
  })
  if (!classes.length) return null
  const id = `class-${personId}`
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor={id} className="sr-only">{action.verb} {name} to a class</label>
      <Select
        id={id}
        value=""
        disabled={add.isPending}
        onChange={(e) => {
          const c = classes.find((x) => x.id === e.target.value)
          if (c) { setMsg(null); add.mutate(c) }
        }}
        className="h-8 w-40 border-dashed px-2 text-xs font-semibold text-brand"
      >
        <option value="" disabled>{add.isPending ? 'Saving…' : action.label}</option>
        {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </Select>
      <span role="status" className="text-xs">{msg && <span className={msg.ok ? 'text-brand' : 'text-danger'}>{msg.text}</span>}</span>
    </div>
  )
}

function RoleSelect({ userId, name, role, isSelf }: { userId: string; name: string; role: Role; isSelf: boolean }) {
  const qc = useQueryClient()
  const { profile } = useAuth()
  const [value, setValue] = useState<Role>(role)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const save = useMutation({
    mutationFn: () => changeRole(userId, value, profile!.id),
    onSuccess: () => {
      setMsg({ ok: true, text: `${name} is now ${ROLE_LABEL[value]}.` })
      return qc.invalidateQueries({ queryKey: ORG_KEY })
    },
    onError: (e) => { setValue(role); setMsg({ ok: false, text: e.message }) },
  })
  const id = `role-${userId}`
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        if (value === role) return
        const risky = value === 'admin' || role === 'admin'
        const ok = window.confirm(
          `Change ${name} from ${ROLE_LABEL[role]} to ${ROLE_LABEL[value]}?${risky ? '\n\nAdmins can see every student record and change anyone\'s access.' : ''}`,
        )
        if (ok) save.mutate()
        else setValue(role)
      }}
    >
      <label htmlFor={id} className="sr-only">Role for {name}</label>
      <Select id={id} value={value} onChange={(e) => { setMsg(null); setValue(e.target.value as Role) }} disabled={isSelf} className="h-9 w-44">
        {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
      </Select>
      {value !== role && <Button type="submit" size="sm" disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save'}</Button>}
      {isSelf && <span className="text-xs text-cic-muted">That's you</span>}
      <span role="status" className="text-xs">{msg && <span className={msg.ok ? 'text-brand' : 'text-danger'}>{msg.text}</span>}</span>
    </form>
  )
}
