// Owner: Aryan.
import { useQuery } from '@tanstack/react-query'
import { listUsers } from '../api/instructor/index.ts'
import { Card, PageHeader, TodoPanel } from '../shared/ui/index.tsx'

export function AdminHome() {
  return (
    <>
      <PageHeader title="Overview" subtitle="Every class, completion and learning gain." />
      <TodoPanel
        owner="Aryan"
        items={[
          'Funder stats: learning gain by concept / class / cohort, CSV export',
          'All classes list',
          'API key management (create, revoke)',
        ]}
      />
    </>
  )
}

export function AdminUsers() {
  const { data: users = [] } = useQuery({ queryKey: ['users'], queryFn: listUsers })
  return (
    <>
      <PageHeader title="Users" subtitle="Add and edit instructors and students." />
      <Card>
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Users</caption>
          <thead>
            <tr className="border-b border-slate-200">
              <th scope="col" className="py-2">Name</th>
              <th scope="col">Role</th>
              <th scope="col">School</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-slate-100">
                <td className="py-2">{u.display_name}</td>
                <td className="capitalize">{u.role}</td>
                <td>{u.school ?? 'CIC'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  )
}
