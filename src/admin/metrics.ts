// Owner: Aryan. Pure analytics over raw rows (no I/O), so it is easy to test.
//
// Definitions (also shown on the Analytics page — keep in sync):
// - Only SUBMITTED attempts count (submitted_at set). Scores are stored 0–1.
// Thresholds are never constants here: each class's pass mark and post-test tries come from
// class_module_settings, and the inactive days from program_settings (migration 2005).
// - Pretest       = the student's FIRST pretest attempt in a module (their starting point).
// - Post-test     = the student's BEST post-test attempt among the tries that count: the first
//                   max_posttest_tries in a class (like the database's _course_state), all when self-paced.
// - Learning gain = post-test % − pretest %, in percentage points; only when both exist.
// - Module done   = every activity that counts toward unlock is submitted AND, if the module has a
//                   post-test, the counted post-test is at least the class's pass mark for the module.
//                   Self-paced (course_enrollments): every counted activity submitted, as in the database.
// - Modules in scope for a class: self-paced course → all published modules of the class's course;
//   instructor-led → only modules released to the class (class_modules).
// - Completion    = done (student, module) pairs ÷ pairs in scope.
// - Stuck         = started, not done, and either idle more than inactive_days, or below the module's
//                   pass mark on one activity after using its max post-test tries.
// - Not started   = enrolled with no submitted attempts in that class.
import type { ActivityType } from '../shared/types/activities.ts'
import type { StudentProgress } from '../shared/types/db.ts'

export type Status = StudentProgress['status']

type Attempt = {
  student_id: string
  activity_id: string
  attempt_no: number
  score: number | null
  is_correct: boolean | null
  submitted_at: string | null
  time_on_task_ms: number
}

export interface OrgData {
  /** program_settings (migration 2005). */
  settings: { inactive_days: number }
  /** class_module_settings (migration 2005): resolved rules for every module of every class. pass_mark is 0..1. */
  classModuleSettings: { class_id: string; module_id: string; pass_mark: number; max_posttest_tries: number }[]
  /** Students taking a course on their own (1001 course_enrollments). */
  courseEnrollments: { student_id: string; course_id: string }[]
  /** Their work: attempts with no class. */
  selfPacedAttempts: Attempt[]
  classes: { id: string; name: string; school: string; course_id: string; join_code: string; created_at?: string; archived_at?: string | null }[]
  courses: { id: string; title: string; delivery_mode: 'self_paced' | 'instructor_led' }[]
  classInstructors: { class_id: string; instructor_id: string }[]
  enrollments: { class_id: string; student_id: string }[]
  classModules: { class_id: string; module_id: string }[]
  modules: { id: string; course_id: string; title: string; position: number; concept: string; published: boolean }[]
  activities: { id: string; module_id: string; type: ActivityType; concept: string; counts_toward_unlock: boolean }[]
  attempts: (Attempt & { class_id: string })[]
  people: { id: string; role: 'student' | 'instructor' | 'admin' | 'reviewer'; display_name: string; school: string | null; archived_at?: string | null }[]
}

interface StudentModule {
  studentId: string
  classId: string
  moduleId: string
  started: boolean
  done: boolean
  pre: number | null
  post: number | null
  gain: number | null
  activitiesDone: number
  activitiesTotal: number
  timeOnTaskMs: number
}

export interface StudentSummary {
  studentId: string
  name: string
  classId: string
  status: Status
  reason: string
  modulesDone: number
  modulesInScope: number
  avgGain: number | null
  lastActivity: string | null
  timeOnTaskMs: number
}

export interface GroupSummary {
  id: string
  label: string
  students: number
  completionPct: number | null
  avgPre: number | null
  avgPost: number | null
  avgGain: number | null
  stuck: number
  notStarted: number
}

export const mean = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x != null && Number.isFinite(x))
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null
}

/** Modules a class is working on (see definitions above), in course order. */
export function modulesInScope(d: OrgData, classId: string): string[] {
  const cls = d.classes.find((c) => c.id === classId)
  if (!cls) return []
  const course = d.courses.find((c) => c.id === cls.course_id)
  const released = new Set(d.classModules.filter((cm) => cm.class_id === classId).map((cm) => cm.module_id))
  return d.modules
    .filter((m) => m.course_id === cls.course_id && m.published)
    .filter((m) => course?.delivery_mode !== 'instructor_led' || released.has(m.id))
    .sort((a, b) => a.position - b.position)
    .map((m) => m.id)
}

/** The pass mark (0-100) and counted post-test tries for one module of one class. */
export function ruleFor(d: OrgData, classId: string, moduleId: string) {
  const row = d.classModuleSettings.find((r) => r.class_id === classId && r.module_id === moduleId)
  if (!row) throw new Error(`No class_module_settings row for class ${classId}, module ${moduleId}.`)
  return { passPct: row.pass_mark * 100, maxTries: row.max_posttest_tries }
}

type Rule = { passPct: number; maxTries: number } | null

/** The score (0-100) that counts for one activity, by the database's rules. `rule` null = self-paced. */
function countedScore(type: ActivityType, tries: Attempt[], rule: Rule): number | null {
  const sorted = tries.slice().sort((x, y) => x.attempt_no - y.attempt_no)
  if (type === 'pretest') return sorted[0]?.score == null ? null : sorted[0].score * 100
  const pool = type === 'posttest' && rule ? sorted.filter((x) => x.attempt_no <= rule.maxTries) : sorted
  const scores = pool.map((x) => x.score).filter((x): x is number => x != null)
  return scores.length ? Math.max(...scores) * 100 : null
}

/** One student's progress in one module. `rule` null = self-paced course. */
function studentModule(acts: OrgData['activities'], triesFor: (activityId: string) => Attempt[], rule: Rule) {
  let done = 0
  let required = 0
  let requiredDone = 0
  let time = 0
  const pres: number[] = []
  let post: number | null = null
  let hasPost = false
  for (const a of acts) {
    const t = triesFor(a.id)
    if (a.counts_toward_unlock) required++
    if (a.type === 'posttest') hasPost = true
    if (!t.length) continue
    done++
    if (a.counts_toward_unlock) requiredDone++
    time += t.reduce((s, x) => s + x.time_on_task_ms, 0)
    const score = countedScore(a.type, t, rule)
    if (a.type === 'pretest' && score != null) pres.push(score)
    if (a.type === 'posttest' && score != null && (post == null || score > post)) post = score
  }
  const pre = mean(pres)
  const allDone = required > 0 && requiredDone === required
  return {
    started: done > 0,
    done: rule ? allDone && (!hasPost || (post != null && post >= rule.passPct)) : allDone,
    pre,
    post,
    gain: pre != null && post != null ? post - pre : null,
    activitiesDone: done,
    activitiesTotal: acts.length,
    timeOnTaskMs: time,
  }
}

function groupBy<T>(rows: T[], key: (row: T) => string) {
  const map = new Map<string, T[]>()
  for (const row of rows) map.set(key(row), [...(map.get(key(row)) ?? []), row])
  return map
}

function computeStudentModules(d: OrgData): StudentModule[] {
  const actsByModule = groupBy(d.activities, (a) => a.module_id)
  const tries = groupBy(d.attempts.filter((a) => a.submitted_at), (a) => `${a.class_id}|${a.student_id}|${a.activity_id}`)
  const scope = new Map(d.classes.map((c) => [c.id, modulesInScope(d, c.id)]))

  const out: StudentModule[] = []
  for (const e of d.enrollments) {
    for (const moduleId of scope.get(e.class_id) ?? []) {
      const progress = studentModule(
        actsByModule.get(moduleId) ?? [],
        (activityId) => tries.get(`${e.class_id}|${e.student_id}|${activityId}`) ?? [],
        ruleFor(d, e.class_id, moduleId),
      )
      out.push({ studentId: e.student_id, classId: e.class_id, moduleId, ...progress })
    }
  }
  return out
}

/** Self-paced learners (course_enrollments): progress in every published module of their course. */
export function selfPacedProgress(d: OrgData) {
  const actsByModule = groupBy(d.activities, (a) => a.module_id)
  const tries = groupBy(d.selfPacedAttempts.filter((a) => a.submitted_at), (a) => `${a.student_id}|${a.activity_id}`)
  const rows = d.courseEnrollments.flatMap((e) =>
    d.modules
      .filter((m) => m.course_id === e.course_id && m.published)
      .map((m) => studentModule(actsByModule.get(m.id) ?? [], (activityId) => tries.get(`${e.student_id}|${activityId}`) ?? [], null)),
  )
  return {
    students: new Set(d.courseEnrollments.map((e) => e.student_id)).size,
    modulesDone: rows.filter((r) => r.done).length,
    completionPct: rows.length ? (rows.filter((r) => r.done).length / rows.length) * 100 : null,
    avgGain: mean(rows.map((r) => r.gain)),
    timeOnTaskMs: rows.reduce((s, r) => s + r.timeOnTaskMs, 0),
  }
}

const ACTIVITY_NOUN: Partial<Record<ActivityType, string>> = {
  code: 'coding exercise',
  worksheet: 'worksheet',
  check: 'check question',
  exit: 'exit question',
  pretest: 'pretest',
  posttest: 'post-test',
}

function computeStudentSummaries(d: OrgData, sm: StudentModule[], now = Date.now()): StudentSummary[] {
  const names = new Map(d.people.map((p) => [p.id, p.display_name]))
  const actById = new Map(d.activities.map((a) => [a.id, a]))
  return d.enrollments.map((e) => {
    const mine = sm.filter((x) => x.studentId === e.student_id && x.classId === e.class_id)
    const attempts = d.attempts.filter((a) => a.student_id === e.student_id && a.class_id === e.class_id && a.submitted_at)
    const last = attempts.reduce<string | null>((m, a) => (!m || a.submitted_at! > m ? a.submitted_at : m), null)
    const doneCount = mine.filter((x) => x.done).length
    const base = {
      studentId: e.student_id,
      name: names.get(e.student_id) ?? 'Unknown student',
      classId: e.class_id,
      modulesDone: doneCount,
      modulesInScope: mine.length,
      avgGain: mean(mine.map((x) => x.gain)),
      lastActivity: last,
      timeOnTaskMs: mine.reduce((s, x) => s + x.timeOnTaskMs, 0),
    }
    if (!attempts.length) return { ...base, status: 'not_started' as const, reason: "Hasn't started yet" }
    if (mine.length && doneCount === mine.length) return { ...base, status: 'done' as const, reason: 'Finished every module' }

    // Stuck on an activity: below the module's pass mark after using its max post-test tries.
    const inScope = new Set(mine.map((x) => x.moduleId))
    for (const [actId, t] of groupBy(attempts, (a) => a.activity_id)) {
      const a = actById.get(actId)
      // Pretests only record a starting point, so retaking one is never being stuck.
      if (!a || a.type === 'pretest' || !inScope.has(a.module_id)) continue
      const rule = ruleFor(d, e.class_id, a.module_id)
      const score = countedScore(a.type, t, rule)
      if (t.length >= rule.maxTries && score != null && score < rule.passPct) {
        const what = `the ${a.concept} ${ACTIVITY_NOUN[a.type] ?? 'activity'}`
        return { ...base, status: 'stuck' as const, reason: `${t.length} tries on ${what}, best ${Math.round(score)}%` }
      }
    }
    const idle = last ? Math.floor((now - new Date(last).getTime()) / 86_400_000) : 0
    if (idle > d.settings.inactive_days) return { ...base, status: 'stuck' as const, reason: `No activity for ${idle} days` }
    return { ...base, status: 'on_track' as const, reason: 'Working through modules' }
  })
}

/** Roll rows up into one summary per group (class, school or module). */
function summarize(
  groups: { id: string; label: string }[],
  inGroup: (groupId: string, row: { classId: string; moduleId?: string }) => boolean,
  sm: StudentModule[],
  students: StudentSummary[],
): GroupSummary[] {
  return groups.map((g) => {
    const rows = sm.filter((r) => inGroup(g.id, r))
    const studs = students.filter((s) => inGroup(g.id, s))
    return {
      id: g.id,
      label: g.label,
      students: new Set([...rows.map((r) => `${r.classId}|${r.studentId}`), ...studs.map((s) => `${s.classId}|${s.studentId}`)]).size,
      completionPct: rows.length ? (rows.filter((r) => r.done).length / rows.length) * 100 : null,
      avgPre: mean(rows.map((r) => r.pre)),
      avgPost: mean(rows.map((r) => r.post)),
      avgGain: mean(rows.map((r) => r.gain)),
      stuck: studs.filter((s) => s.status === 'stuck').length,
      notStarted: studs.filter((s) => s.status === 'not_started').length,
    }
  })
}

interface Filters {
  school?: string
  classId?: string
  /** Include archived classes (manually archived or past their term). */
  includeArchived?: boolean
}

/** School term a date falls in: Spring Jan–May, Summer Jun–Jul, Fall Aug–Dec. */
export function termOf(iso: string) {
  const d = new Date(iso)
  const y = d.getFullYear()
  const m = d.getMonth()
  const [season, endMonth] = m <= 4 ? ['Spring', 5] : m <= 6 ? ['Summer', 7] : ['Fall', 12]
  return { label: `${season} ${y}`, ends: new Date(y, endMonth, 1) }
}

/** Why a class is archived, or null if active. Classes archive themselves once their term ends. */
export function archivedReason(c: OrgData['classes'][number], now = Date.now()): string | null {
  if (c.archived_at) return 'Archived by admin'
  if (c.created_at && termOf(c.created_at).ends.getTime() <= now) return `${termOf(c.created_at).label} term ended`
  return null
}

/** Everything the admin pages show, computed from one snapshot of org data. */
export function analyze(raw: OrgData, f: Filters = {}) {
  const classes = raw.classes.filter(
    (c) => (f.includeArchived || !archivedReason(c)) && (!f.school || c.school === f.school) && (!f.classId || c.id === f.classId),
  )
  const keep = new Set(classes.map((c) => c.id))
  const d: OrgData = {
    ...raw,
    classes,
    enrollments: raw.enrollments.filter((e) => keep.has(e.class_id)),
    attempts: raw.attempts.filter((a) => keep.has(a.class_id)),
  }
  // Self-paced learners belong to no school or class, so they only count in the unfiltered view.
  const selfPaced = f.school || f.classId ? null : selfPacedProgress(raw)
  const studentModules = computeStudentModules(d)
  const students = computeStudentSummaries(d, studentModules)
  const classOf = new Map(raw.classes.map((c) => [c.id, c]))
  const schools = [...new Set(classes.map((c) => c.school))].sort()
  const moduleIds = new Set(studentModules.map((r) => r.moduleId))
  const modules = raw.modules.filter((m) => moduleIds.has(m.id)).sort((a, b) => a.position - b.position)

  return {
    classes,
    classOf,
    selfPaced,
    schoolOptions: [...new Set(raw.classes.map((c) => c.school))].sort(),
    studentModules,
    students,
    overall: summarize([{ id: 'all', label: 'All' }], () => true, studentModules, students)[0],
    byClass: summarize(classes.map((c) => ({ id: c.id, label: c.name })), (id, r) => r.classId === id, studentModules, students),
    bySchool: summarize(schools.map((s) => ({ id: s, label: s })), (id, r) => classOf.get(r.classId)?.school === id, studentModules, students),
    byModule: summarize(
      modules.map((m) => ({ id: m.id, label: m.title })),
      (id, r) => r.moduleId === id,
      studentModules,
      [],
    ),
  }
}

export const fmtPct = (v: number | null) => (v == null ? '—' : `${Math.round(v)}%`)
/** "+12 pts", "−3 pts", "0 pts"; "—" without paired data. Signed after rounding so −0.4 reads "0 pts". */
export const fmtGain = (v: number | null) => {
  if (v == null) return '—'
  const r = Math.round(v)
  return `${r > 0 ? '+' : r < 0 ? '−' : ''}${Math.abs(r)} pts`
}
export const fmtMinutes = (ms: number) => {
  const m = Math.round(ms / 60000)
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`
}
export function timeAgo(iso: string | null, now = Date.now()) {
  if (!iso) return 'never'
  const m = Math.round((now - new Date(iso).getTime()) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} h ago`
  const days = Math.round(h / 24)
  return days === 1 ? 'yesterday' : `${days} days ago`
}

/** "3 days ago" for recent dates, a short date after a month. */
export function timeAgoOrDate(iso: string, now = Date.now()) {
  const days = (now - new Date(iso).getTime()) / 86_400_000
  return days < 30 ? timeAgo(iso, now) : new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const WEEK = 7 * 86_400_000

/** Submissions and distinct active learners per week, oldest first, ending now. */
export function weeklyActivity(attempts: OrgData['attempts'], weeks = 6, now = Date.now()) {
  return Array.from({ length: weeks }, (_, i) => {
    const end = now - (weeks - 1 - i) * WEEK
    const inWeek = attempts.filter((a) => a.submitted_at && +new Date(a.submitted_at) > end - WEEK && +new Date(a.submitted_at) <= end)
    return { submissions: inWeek.length, learners: new Set(inWeek.map((a) => a.student_id)).size }
  })
}


export function greeting(now = new Date()) {
  const h = now.getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}
