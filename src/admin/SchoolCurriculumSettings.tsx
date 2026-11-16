import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, Card, Field, FormStatus, Input, Select } from '../shared/ui/index.tsx'
import { addSchool, linkClassToSchool, SCHOOL_CURRICULUM_KEY, seedSchoolCurriculum, setSchoolInstructor, type SchoolCurriculumAdminData } from './api.ts'
import { ORG_KEY } from './hooks.ts'
import type { OrgData } from './metrics.ts'

export function SchoolCurriculumSettings({ config, data }: { config: SchoolCurriculumAdminData; data: OrgData }) {
  const qc = useQueryClient()
  const [schoolId, setSchoolId] = useState('')
  const [name, setName] = useState('')
  const [teacherId, setTeacherId] = useState('')
  const [classId, setClassId] = useState('')
  const [globalId, setGlobalId] = useState('')
  const instructors = data.people.filter(person => person.role === 'instructor' && !person.archived_at)
  const members = config.memberships.filter(member => member.school_id === schoolId)
  const templates = config.templates.filter(template => template.school_id === schoolId)
  const source = data.classes.find(group => group.id === classId)
  const change = useMutation({
    mutationFn: (action: () => Promise<unknown>) => action(),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: SCHOOL_CURRICULUM_KEY }),
        qc.invalidateQueries({ queryKey: ORG_KEY }),
      ])
    },
  })

  function selectSchool(id: string) {
    setSchoolId(id)
    setTeacherId('')
    setClassId('')
    setGlobalId('')
    change.reset()
  }

  return <Card title="School curriculum" className="mb-6">
    <form className="flex flex-wrap items-end gap-3" onSubmit={event => {
      event.preventDefault()
      if (name.trim()) change.mutate(async () => {
        setSchoolId(await addSchool(name.trim()))
        setName('')
        setTeacherId('')
        setClassId('')
        setGlobalId('')
      })
    }}>
      <Field id="school-create-name" label="New school name">
        <Input id="school-create-name" value={name} onChange={event => setName(event.target.value)} required maxLength={100} />
      </Field>
      <Button type="submit" variant="secondary" disabled={change.isPending}>Add school</Button>
    </form>
    {!!config.schools.length && <div className="mt-4">
      <Field id="manage-school" label="Manage school">
        <Select id="manage-school" value={schoolId} disabled={change.isPending} onChange={event => selectSchool(event.target.value)}>
          <option value="">Choose a school</option>
          {config.schools.map(school => <option key={school.id} value={school.id}>{school.name}</option>)}
        </Select>
      </Field>
    </div>}
    {schoolId && <div className="mt-5 grid gap-5 lg:grid-cols-2">
      <section className="space-y-3" aria-label="School curriculum access">
        <div className="flex flex-wrap items-end gap-3">
          <Field id="school-instructor" label="Add instructor to school">
            <Select id="school-instructor" value={teacherId} onChange={event => setTeacherId(event.target.value)}>
              <option value="">Choose an instructor</option>
              {instructors.filter(person => !members.some(member => member.instructor_id === person.id))
                .map(person => <option key={person.id} value={person.id}>{person.display_name}</option>)}
            </Select>
          </Field>
          <Button variant="secondary" disabled={!teacherId || change.isPending}
            onClick={() => change.mutate(async () => { await setSchoolInstructor(schoolId, teacherId, true); setTeacherId('') })}>Grant access</Button>
        </div>
        {!!members.length && <ul className="divide-y divide-divider">
          {members.map(member => {
            const person = data.people.find(entry => entry.id === member.instructor_id)
            return <li key={member.instructor_id} className="flex items-center justify-between gap-3 py-1.5 text-sm">
              {person?.display_name ?? 'Instructor'}
              <Button size="sm" variant="ghost" disabled={change.isPending} aria-label={`Remove school access for ${person?.display_name ?? 'instructor'}`}
                onClick={() => change.mutate(() => setSchoolInstructor(schoolId, member.instructor_id, false))}>Remove</Button>
            </li>
          })}
        </ul>}
      </section>
      <section className="space-y-3" aria-label="School curriculum templates">
        <Field id="school-source-class" label="Existing class">
          <Select id="school-source-class" value={classId} onChange={event => setClassId(event.target.value)}>
            <option value="">Choose a class</option>
            {data.classes.filter(group => !group.school_id || group.school_id === schoolId)
              .map(group => <option key={group.id} value={group.id}>{group.name} · {group.school}</option>)}
          </Select>
        </Field>
        <Field id="school-global-original" label="Global original">
          <Select id="school-global-original" value={globalId} onChange={event => setGlobalId(event.target.value)}>
            <option value="">Choose a global template</option>
            {config.globals.filter(course => !templates.some(template => template.global_course_id === course.id))
              .map(course => <option key={course.id} value={course.id}>{course.title}</option>)}
          </Select>
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" disabled={!classId || Boolean(source?.school_id) || change.isPending}
            onClick={() => change.mutate(() => linkClassToSchool(classId, schoolId))}>Link class to school</Button>
          <Button disabled={!classId || !globalId || change.isPending}
            onClick={() => change.mutate(async () => { await seedSchoolCurriculum(schoolId, classId, globalId); setGlobalId('') })}>Create school template</Button>
        </div>
        {!!templates.length && <ul className="space-y-1 text-sm">
          {templates.map(template => <li key={template.course_id}>
            <Link className="font-semibold text-brand underline-offset-2 hover:underline" to={`/instructor#/curriculum/school/${template.course_id}`}>
              {config.courses.find(course => course.id === template.course_id)?.title ?? 'View school template'}
            </Link>
          </li>)}
        </ul>}
      </section>
    </div>}
    <FormStatus error={change.error?.message} />
  </Card>
}
