// Owner: Aryan. Everyone with an account, what each role can reach, and role changes.
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, Users } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../shared/auth/AuthContext.tsx'
import type { Role } from '../shared/types/db.ts'
import { Button, Card, DataTable, EmptyState, Input, PageHeader, Select, Td, Th } from '../shared/ui/index.tsx'
import { changeRole } from './api.ts'
import { ArchiveButton, LoadState } from './common.tsx'
import { ORG_KEY, useOrg } from './hooks.ts'

const ROLES: Role[] = ['admin', 'instructor', 'student', 'reviewer']
const ROLE_LABEL: Record<Role, string> = { admin: 'CIC Admin', instructor: 'Instructor', student: 'Student', reviewer: 'External Reviewer' }
const ACCESS: Record<Role, { can: string; cannot: string }> = {
  admin: { can: 'Everything: curriculum, classes, all student progress, roles, API keys.', cannot: 'Remove their own admin access.' },
  instructor: { can: 'Their own classes: roster, modules, progress, submissions, learning gain.', cannot: "See other instructors' classes or change roles." },
  student: { can: 'Their assigned modules and their own progress and results.', cannot: 'See other students or anything unassigned.' },
  reviewer: { can: 'Browse and preview all CIC curriculum.', cannot: 'Edit anything or see any student record.' },
}

export function PeoplePage() {
  const { data, isLoading, error } = useOrg()
  const { profile } = useAuth()
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const role = (params.get('role') ?? '') as Role | ''
  const showArchived = params.get('archived') === '1'
  if (!data) return <><PageHeader title="People & roles" /><LoadState isLoading={isLoading} error={error} /></>

  const className = new Map(data.classes.map((c) => [c.id, c.name]))
  const active = data.people.filter((p) => !p.archived_at)
  const archivedCount = data.people.length - active.length
  const counts = Object.fromEntries(ROLES.map((r) => [r, active.filter((p) => p.role === r).length])) as Record<Role, number>
  const needle = q.trim().toLowerCase()
  const list = data.people.filter(
    (p) => !p.archived_at === !showArchived && (!role || p.role === role) && (!needle || p.display_name.toLowerCase().includes(needle)),
  )
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
      <PageHeader title="People & roles" subtitle="Everyone with a CIC Learn account and what they can access." />

      <section aria-labelledby="roles-heading" className="mb-8">
        <h2 id="roles-heading" className="sr-only">Roles and access</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {ROLES.map((r) => (
            <Link
              key={r}
              to={role === r ? '/admin/users' : `/admin/users?role=${r}`}
              aria-current={role === r ? 'true' : undefined}
              className="dot-hover soft-card rounded-2xl border border-divider bg-white p-4 transition-transform hover:-translate-y-0.5 hover:border-brand aria-[current=true]:border-brand aria-[current=true]:bg-brand-tint"
            >
              <p className="flex items-baseline justify-between">
                <span className="font-bold text-brand">{ROLE_LABEL[r]}s</span>
                <span className="text-2xl font-bold tabular-nums">{counts[r]}</span>
              </p>
              <p className="mt-2 text-xs text-cic-muted"><strong className="text-black">Can:</strong> {ACCESS[r].can}</p>
              <p className="mt-1 text-xs text-cic-muted"><strong className="text-black">Cannot:</strong> {ACCESS[r].cannot}</p>
            </Link>
          ))}
        </div>
      </section>

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
                    <Td className="font-semibold">{p.display_name}</Td>
                    <Td>{p.school ?? <span className="text-cic-muted">CIC</span>}</Td>
                    <Td className="max-w-60">{cls.length ? cls.join(', ') : <span className="text-cic-muted">—</span>}</Td>
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

      <Card title="Adding instructors and reviewers" className="max-w-3xl">
        <ol className="list-decimal space-y-1 pl-5 text-sm">
          <li>In the Supabase dashboard, open <strong>Authentication → Users → Add user</strong> and enter their work email.</li>
          <li>They appear in the directory above as a Student. Change their role here.</li>
          <li>Students don't need this: instructors add them with the roster CSV import.</li>
        </ol>
      </Card>
    </>
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
