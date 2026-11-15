import { analyze, mean, type OrgData } from './metrics.ts'

export const PARTNER_MIN_STUDENTS = 5

/** A fixed, program-wide export for active classes, independent of the report's UI filters. */
export function partnerImpactCsv(data: OrgData): string {
  const { students, studentModules, overall } = analyze(data)
  const reached = new Set(students.map((row) => row.studentId))
  const complete = new Set<string>()
  const incomplete = new Set<string>()
  const gainsByStudent = new Map<string, number[]>()

  for (const row of studentModules) {
    const participants = row.done ? complete : incomplete
    participants.add(row.studentId)
    if (row.gain == null) continue
    const gains = gainsByStudent.get(row.studentId) ?? []
    gains.push(row.gain)
    gainsByStudent.set(row.studentId, gains)
  }

  // Suppress both small result groups and their complements. A rare outcome can
  // still be inferred from a percentage when the overall cohort is large.
  const completion = complete.size >= PARTNER_MIN_STUDENTS && incomplete.size >= PARTNER_MIN_STUDENTS
    ? overall.completionPct
    : null
  const gain = gainsByStudent.size >= PARTNER_MIN_STUDENTS
    ? mean([...gainsByStudent.values()].map(mean))
    : null

  const header = 'students_reached,module_completion_pct,average_learning_gain_pts'
  const values = [
    reached.size >= PARTNER_MIN_STUDENTS ? reached.size : '',
    completion == null ? '' : Math.round(completion),
    gain == null ? '' : Math.round(gain),
  ]
  return `${header}\n${values.join(',')}\n`
}
