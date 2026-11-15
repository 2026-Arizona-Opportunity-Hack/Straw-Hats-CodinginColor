import { describe, expect, it } from 'vitest'
import { analyze, fmtGain, ruleFor, selfPacedProgress, type OrgData } from './metrics.ts'
import { partnerImpactCsv } from './partnerExport.ts'

const NOW = Date.now()
const ago = (days: number) => new Date(NOW - days * 86_400_000).toISOString()

/** One instructor-led class (two students) on a one-module course with a pretest and a post-test. */
function org(patch: Partial<OrgData> = {}): OrgData {
  return {
    settings: { inactive_days: 3 },
    classModuleSettings: [{ class_id: 'k', module_id: 'm', pass_mark: 0.7, max_posttest_tries: 2 }],
    courseEnrollments: [],
    selfPacedAttempts: [],
    classes: [{ id: 'k', name: 'P3', school: 'S', course_id: 'c', join_code: 'J', created_at: new Date(NOW).toISOString() }],
    courses: [{ id: 'c', title: 'Python', delivery_mode: 'instructor_led' }],
    classInstructors: [],
    enrollments: [{ class_id: 'k', student_id: 'ana' }, { class_id: 'k', student_id: 'ben' }],
    classModules: [{ class_id: 'k', module_id: 'm' }],
    modules: [{ id: 'm', course_id: 'c', title: 'Loops', position: 1, concept: 'loops', published: true }],
    activities: [
      { id: 'pre', module_id: 'm', type: 'pretest', concept: 'loops', counts_toward_unlock: true },
      { id: 'post', module_id: 'm', type: 'posttest', concept: 'loops', counts_toward_unlock: true },
    ],
    attempts: [],
    people: [
      { id: 'ana', role: 'student', display_name: 'Ana', school: null },
      { id: 'ben', role: 'student', display_name: 'Ben', school: null },
    ],
    ...patch,
  }
}

const attempt = (student: string, activity: string, attempt_no: number, score: number, daysAgo = 0) => ({
  student_id: student, activity_id: activity, class_id: 'k', attempt_no, score, is_correct: score === 1, submitted_at: ago(daysAgo), time_on_task_ms: 60_000,
})

describe('analyze uses the class rules from the database', () => {
  // Ana: pretest 40%, post-test tries 50%, 60%, then 95% on a third (practice) try.
  const anaWork = [attempt('ana', 'pre', 1, 0.4), attempt('ana', 'post', 1, 0.5), attempt('ana', 'post', 2, 0.6), attempt('ana', 'post', 3, 0.95)]

  it('counts only the first max_posttest_tries post-test tries, like the database', () => {
    const ana = analyze(org({ attempts: anaWork })).studentModules.find((r) => r.studentId === 'ana')!
    expect(ana.post).toBeCloseTo(60)
    expect(ana.gain).toBeCloseTo(20)
    expect(ana.done).toBe(false)
    const more = org({ attempts: anaWork, classModuleSettings: [{ class_id: 'k', module_id: 'm', pass_mark: 0.7, max_posttest_tries: 3 }] })
    expect(analyze(more).studentModules.find((r) => r.studentId === 'ana')).toMatchObject({ post: 95, done: true })
  })

  it('completes a module against the class pass mark for that module', () => {
    const lenient = org({ attempts: anaWork, classModuleSettings: [{ class_id: 'k', module_id: 'm', pass_mark: 0.55, max_posttest_tries: 2 }] })
    expect(analyze(lenient).studentModules.find((r) => r.studentId === 'ana')?.done).toBe(true)
  })

  it('marks a student stuck after the max tries below the pass mark, or inactive past inactive_days', () => {
    const students = analyze(org({ attempts: [...anaWork.slice(0, 3), attempt('ben', 'pre', 1, 0.5, 4)] })).students
    expect(students.find((s) => s.studentId === 'ana')).toMatchObject({ status: 'stuck', reason: '2 tries on the loops post-test, best 60%' })
    expect(students.find((s) => s.studentId === 'ben')).toMatchObject({ status: 'stuck', reason: 'No activity for 4 days' })
    const patient = analyze(org({ settings: { inactive_days: 7 }, attempts: [attempt('ben', 'pre', 1, 0.5, 4)] })).students
    expect(patient.find((s) => s.studentId === 'ben')?.status).toBe('on_track')
  })

  it('fails loudly when a class module has no rule instead of guessing one', () => {
    expect(() => ruleFor(org({ classModuleSettings: [] }), 'k', 'm')).toThrow(/class_module_settings/)
  })
})

describe('self-paced learners', () => {
  it('counts course_enrollments students and their class-less work, all tries counting', () => {
    const d = org({
      courseEnrollments: [{ student_id: 'cy', course_id: 'c' }],
      selfPacedAttempts: [
        { student_id: 'cy', activity_id: 'pre', attempt_no: 1, score: 0.3, is_correct: false, submitted_at: ago(1), time_on_task_ms: 120_000 },
        { student_id: 'cy', activity_id: 'post', attempt_no: 4, score: 0.8, is_correct: false, submitted_at: ago(1), time_on_task_ms: 60_000 },
      ],
    })
    expect(selfPacedProgress(d)).toMatchObject({ students: 1, modulesDone: 1, completionPct: 100, timeOnTaskMs: 180_000 })
    expect(selfPacedProgress(d).avgGain).toBeCloseTo(50)
    expect(analyze(d).selfPaced?.students).toBe(1)
    expect(analyze(d, { school: 'S' }).selfPaced).toBeNull()
  })
})

describe('fmtGain', () => {
  it('signs gains after rounding and shows a dash without paired data', () => {
    expect([fmtGain(12.4), fmtGain(-3.2), fmtGain(-0.4), fmtGain(0), fmtGain(null)]).toEqual(['+12 pts', '−3 pts', '0 pts', '0 pts', '—'])
  })
})

describe('partner impact export', () => {
  const header = 'students_reached,module_completion_pct,average_learning_gain_pts\n'

  it('exports one numeric row across active classes without names or group identifiers', () => {
    const base = org()
    const active = Array.from({ length: 10 }, (_, i) => ({ class_id: 'k', student_id: `student-${i}` }))
    const archivedClass = { ...base.classes[0], id: 'archived', name: 'Private class', archived_at: ago(1) }
    const data = org({
      classes: [...base.classes, archivedClass],
      enrollments: [...active, { class_id: archivedClass.id, student_id: 'archived-student' }],
      attempts: active.flatMap(({ student_id }, i) => [
        attempt(student_id, 'pre', 1, 0.4),
        attempt(student_id, 'post', 1, i < 5 ? 0.9 : 0.5),
      ]),
    })
    expect(partnerImpactCsv(data)).toBe(header + '10,50,30\n')
  })

  it('does not count one student across multiple classes toward the privacy threshold', () => {
    const base = org()
    const classes = Array.from({ length: 5 }, (_, i) => ({ ...base.classes[0], id: `class-${i}` }))
    const data = org({
      classes,
      classModules: classes.map(({ id }) => ({ class_id: id, module_id: 'm' })),
      classModuleSettings: classes.map(({ id }) => ({ ...base.classModuleSettings[0], class_id: id })),
      enrollments: classes.map(({ id }) => ({ class_id: id, student_id: 'ana' })),
      attempts: classes.flatMap(({ id }) => [
        { ...attempt('ana', 'pre', 1, 0.4), class_id: id },
        { ...attempt('ana', 'post', 1, 0.9), class_id: id },
      ]),
    })
    expect(partnerImpactCsv(data)).toBe(header + ',,\n')
  })

  it('suppresses small outcome groups and a small set of paired assessments', () => {
    const enrollments = Array.from({ length: 6 }, (_, i) => ({ class_id: 'k', student_id: `student-${i}` }))
    const attempts = enrollments.slice(0, 4).flatMap(({ student_id }, i) => [
      attempt(student_id, 'pre', 1, 0.4),
      attempt(student_id, 'post', 1, i === 0 ? 0.9 : 0.5),
    ])
    expect(partnerImpactCsv(org({ enrollments, attempts }))).toBe(header + '6,,\n')
  })
})
