// Owner: Jacky. Everything the student pages need to list topics, lessons and classes, in one place.
import { useQueries, useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { listModuleStatus, listMyClasses, listMyCourses, type ModuleStatus, type StudentCourse } from '../api/student/index.ts'
import type { Module } from '../instructor/model.ts'
import { useAuth } from '../shared/auth/AuthContext.tsx'
import { isLocalDemo } from '../shared/supabase.ts'
import type { CourseLevel } from '../shared/types/db.ts'
import { joinedClasses, lessonRows, publishedCourses, teacherFor, type LessonRow, type PublishedCourse } from './instructorContent.ts'
import { TOPICS, topicIdForCourse, type Topic } from './topics.ts'

export const LEVEL_LABEL: Record<CourseLevel, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
  expert: 'Expert',
}
const LEVELS = Object.keys(LEVEL_LABEL) as CourseLevel[]

/** A topic plus where its lessons come from (see topics.ts). */
export type ViewTopic = Topic & { local?: PublishedCourse }

export type RowState = 'locked' | 'available' | 'in_progress' | 'completed' | 'soon'
export interface Row {
  key: string
  title: string
  state: RowState
  href: string
  detail?: string
  /** Local demo only: the lesson's activities and which ones are done. */
  module?: Module
  doneIds?: string[]
}

export interface StudentClass {
  id: string
  name: string
  school: string
  teacher: string | null
  courseId: string
}

function buildTopics(courses: StudentCourse[], local: PublishedCourse[]): ViewTopic[] {
  const published = new Set(courses.map((c) => c.id))
  const byId = new Map(local.map((c) => [c.id, c]))
  const catalog = TOPICS.map((t): ViewTopic => {
    const localCourse = t.instructorCourseId ? byId.get(t.instructorCourseId) : undefined
    if (localCourse) return { ...t, courseId: undefined, local: localCourse }
    return t.courseId && !published.has(t.courseId) ? { ...t, courseId: undefined } : t
  })
  const listedLocal = new Set(TOPICS.map((t) => t.instructorCourseId))
  const listedApi = new Set(TOPICS.map((t) => t.courseId))
  const toLevel = (level: string) => (LEVELS.includes(level.toLowerCase() as CourseLevel) ? (level.toLowerCase() as CourseLevel) : 'beginner')
  const glyph = (title: string) => title.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()
  // Courses an instructor made that the catalog doesn't list yet still get a tile.
  const extraLocal = local.filter((c) => !listedLocal.has(c.id)).map((c): ViewTopic => ({
    id: c.id, title: c.title, description: c.description, glyph: glyph(c.title), level: toLevel(c.level), outline: [], local: c,
  }))
  const extraApi = courses.filter((c) => !listedApi.has(c.id)).map((c): ViewTopic => ({
    id: c.id, title: c.title, description: c.description, glyph: glyph(c.title), level: c.level, courseId: c.id, outline: [],
  }))
  return [...catalog, ...extraLocal, ...extraApi]
}

function rowsFor(topic: ViewTopic, apiModules: ModuleStatus[] | undefined, localRows: LessonRow[]): Row[] {
  if (topic.local) {
    return localRows.map(({ module, state, doneSteps, totalSteps, doneIds }) => ({
      key: module.id, title: module.title, state, href: `/student/demo/${module.id}`, module, doneIds,
      detail: state === 'in_progress' || state === 'completed' ? `${doneSteps} of ${totalSteps} steps done` : `${totalSteps} steps`,
    }))
  }
  if (topic.courseId) return (apiModules ?? []).map((m) => ({ key: m.module_id, title: m.title, state: m.state, href: `/student/module/${m.module_id}` }))
  return topic.outline.map((title) => ({ key: title, title, state: 'soon', href: '' }))
}

export function isOpen(topic: ViewTopic) {
  return !!(topic.local || topic.courseId)
}

export function progressText(topic: ViewTopic, rows: Row[], loading: boolean) {
  if (!isOpen(topic)) return `${topic.outline.length} lessons · coming soon`
  if (loading) return 'Loading…'
  if (rows.length === 0) return 'Lessons coming soon'
  const done = rows.filter((r) => r.state === 'completed').length
  return done === 0 ? `${rows.length} lesson${rows.length === 1 ? '' : 's'}` : `${done} of ${rows.length} lessons done`
}

/** The lesson to open next: the one in progress, else the first one available. */
export function nextRow(rows: Row[]) {
  return rows.find((r) => r.state === 'in_progress') ?? rows.find((r) => r.state === 'available')
}

/** Topics with their lesson rows, for the signed-in student. */
export function useStudentCatalog() {
  const { profile } = useAuth()
  const studentId = profile?.id ?? 'guest'
  const courses = useQuery({ queryKey: ['myCourses', profile?.id], queryFn: listMyCourses })
  const local = useMemo(() => publishedCourses(), [])
  const topics = buildTopics(courses.data ?? [], local)
  const statuses = useQueries({
    queries: topics.map((t) => ({
      queryKey: ['moduleStatus', profile?.id, t.courseId],
      queryFn: () => listModuleStatus(t.courseId!),
      enabled: !!t.courseId,
    })),
  })
  const items = topics.map((topic, i) => {
    const status = statuses[i]
    const loading = !!topic.courseId && !!status?.isLoading
    const error = !!topic.courseId && !!status?.isError
    const rows = rowsFor(topic, status?.data, topic.local ? lessonRows(studentId, topic.local) : [])
    return { topic, rows, loading, error }
  })
  return { studentId, items, isLoading: courses.isLoading, isError: courses.isError }
}

/** Classes the student joined: from the instructor workspace (local demo) or Supabase (live). */
export function useMyClasses() {
  const { profile } = useAuth()
  const studentId = profile?.id ?? 'guest'
  return useQuery({
    queryKey: ['myClasses', profile?.id],
    queryFn: async (): Promise<StudentClass[]> => {
      if (isLocalDemo) {
        return joinedClasses(studentId).map((c) => ({ id: c.id, name: c.name, school: c.school, teacher: teacherFor(c.id), courseId: c.courseId }))
      }
      const rows = await listMyClasses()
      return rows.map((c) => ({ id: c.class_id, name: c.class_name, school: '', teacher: null, courseId: c.course_id }))
    },
  })
}

type Item = ReturnType<typeof useStudentCatalog>['items'][number]

/** The topic (and its lessons) a class is working through. */
export function itemForClass(cls: StudentClass, items: Item[]): Item | undefined {
  if (!cls.courseId) return undefined
  return isLocalDemo
    ? items.find((it) => it.topic.local?.id === cls.courseId) ?? items.find((it) => it.topic.id === topicIdForCourse(cls.courseId))
    : items.find((it) => it.topic.courseId === cls.courseId)
}
