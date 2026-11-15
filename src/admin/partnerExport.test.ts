import { describe, expect, it } from 'vitest'
import type { OrgData } from './metrics.ts'
import { partnerImpactCsv } from './partnerExport.ts'

const NOW = new Date().toISOString()

function org(patch: Partial<OrgData> = {}): OrgData {
  return {
    settings: { inactive_days: 3 },
    classModuleSettings: [{ class_id: 'k', module_id: 'm', pass_mark: 0.7, max_posttest_tries: 2 }],
    courseEnrollments: [],
    selfPacedAttempts: [],
    classes: [{ id: 'k', name: 'Private class', school: 'Private school', course_id: 'c', join_code: 'J' }],
    courses: [{ id: 'c', title: 'Python', delivery_mode: 'instructor_led' }],
    classInstructors: [],
    enrollments: [],
    classModules: [{ class_id: 'k', module_id: 'm' }],
    modules: [{ id: 'm', course_id: 'c', title: 'Loops', position: 1, concept: 'loops', published: true }],
    activities: [
      { id: 'pre', module_id: 'm', type: 'pretest', concept: 'loops', counts_toward_unlock: true },
      { id: 'post', module_id: 'm', type: 'posttest', concept: 'loops', counts_toward_unlock: true },
    ],
    attempts: [],
    people: [{ id: 'ana', role: 'student', display_name: 'Private student name', school: null }],
    ...patch,
  }
}

const attempt = (student: string, activity: string, attempt_no: number, score: number) => ({
  student_id: student, activity_id: activity, class_id: 'k', attempt_no, score, is_correct: score === 1,
  submitted_at: NOW, time_on_task_ms: 60_000,
})

describe('partner impact export', () => {
  const header = 'students_reached,module_completion_pct,average_learning_gain_pts\n'

  it('exports one numeric row across active classes without names or group identifiers', () => {
    const base = org()
    const active = Array.from({ length: 10 }, (_, i) => ({ class_id: 'k', student_id: `student-${i}` }))
    const archivedClass = { ...base.classes[0], id: 'archived', name: 'Private class', archived_at: NOW }
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
