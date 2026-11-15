// Admin data functions. Owner: Aryan.
// Every call runs against Supabase as the signed-in admin, so RLS decides what comes back.
// Needed policies are listed in README ("Admin pages: database needs").
import type { PostgrestError } from '@supabase/supabase-js'
import { supabase } from '../shared/supabase.ts'
import { loadStaffProgress } from '../shared/staffProgress.ts'
import type { Role } from '../shared/types/db.ts'
import type { OrgData } from './metrics.ts'

interface ApiKeyRow {
  id: string
  label: string
  created_at: string
  revoked_at: string | null
}

const db = () => {
  if (!supabase) throw new Error('Supabase is not configured.')
  return supabase
}

/** Turns Postgres/RLS errors into something an admin can act on. */
function friendly(err: { code?: string; message: string }, what: string): Error {
  if (err.code === '42501' || /row-level security|permission denied/i.test(err.message))
    return new Error(`The database didn't allow ${what}. An admin access policy is missing (see README: Admin pages).`)
  if (err.code === '23505') return new Error(`That ${what.replace(/^(creating|adding) /, '')} already exists.`)
  if (['42P01', '42703', 'PGRST202', 'PGRST204', 'PGRST205'].includes(err.code ?? ''))
    return new Error(`This isn't set up in the database yet, so ${what} isn't available (see README: Admin pages).`)
  return new Error(err.message)
}

/** Database functions raise codes like EMAIL_TAKEN; show the matching sentence, else a generic one. */
function rpcError(err: { code?: string; message: string }, messages: Record<string, string>, what: string): Error {
  const code = Object.keys(messages).find((c) => err.message.includes(c))
  return code ? new Error(messages[code]) : friendly(err, what)
}

/** Updates one row and fails loudly if RLS silently matched nothing. */
async function updateOne(table: string, id: string, values: Record<string, unknown>, what: string) {
  const { data, error } = await db().from(table).update(values).eq('id', id).select('id')
  if (error) throw friendly(error, what)
  if (!data.length) throw new Error(`The database didn't allow ${what}. An admin access policy is missing (see README: Admin pages).`)
}

/** PostgREST returns at most 1000 rows per request (max_rows); read every page in a stable order. */
const PAGE = 1000
async function selectAll<T>(table: string, columns: string, orderBy: string[]): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE) {
    let query = db().from(table).select(columns)
    for (const column of orderBy) query = query.order(column)
    const { data, error } = await query.range(from, from + PAGE - 1)
    if (error) throw tableError(error, table)
    rows.push(...(data as T[]))
    if (data.length < PAGE) return rows
  }
}

/** Names the table or view when the database does not have it yet (an unapplied migration). */
function tableError(err: PostgrestError, table: string): Error {
  if (['42P01', 'PGRST205'].includes(err.code))
    return new Error(`The database has no ${table} yet, so these numbers can't be calculated. Apply the latest migrations in supabase/migrations.`)
  return friendly(err, 'reading organization data')
}

type AttemptRow = OrgData['selfPacedAttempts'][number] & { class_id: string | null }

export async function loadOrgData(): Promise<OrgData> {
  const c = db()
  const [classes, courses, ci, enr, cm, mods, acts, people, settings, courseEnrollments, rules, attempts, progress] = await Promise.all([
    // '*' so pages keep working before archived_at exists (see README: Admin pages).
    c.from('classes').select('*').order('name'),
    c.from('courses').select('id, title, delivery_mode'),
    c.from('class_instructors').select('class_id, instructor_id'),
    selectAll<OrgData['enrollments'][number]>('enrollments', 'class_id, student_id', ['class_id', 'student_id']),
    selectAll<OrgData['classModules'][number]>('class_modules', 'class_id, module_id', ['class_id', 'module_id']),
    c.from('modules').select('id, course_id, title, position, concept, published'),
    selectAll<{ id: string; type: OrgData['activities'][number]['type']; concept: string; counts_toward_unlock: boolean; lesson: { module_id: string } }>(
      'activities', 'id, type, concept, counts_toward_unlock, lesson:lessons!inner(module_id)', ['id']),
    c.from('profiles').select('*').order('display_name'),
    c.from('program_settings').select('inactive_days'),
    selectAll<OrgData['courseEnrollments'][number]>('course_enrollments', 'student_id, course_id', ['student_id', 'course_id']),
    selectAll<{ class_id: string; module_id: string; pass_mark: number | string; max_posttest_tries: number }>(
      'class_module_settings', 'class_id, module_id, pass_mark, max_posttest_tries', ['class_id', 'module_id']),
    selectAll<AttemptRow>('activity_attempts', 'id, student_id, activity_id, class_id, attempt_no, score, is_correct, submitted_at, time_on_task_ms', ['id']),
    loadStaffProgress(c),
  ])
  for (const [result, table] of [[classes, 'classes'], [courses, 'courses'], [ci, 'class_instructors'], [mods, 'modules'], [people, 'profiles'], [settings, 'program_settings']] as const)
    if (result.error) throw tableError(result.error, table)
  if (!settings.data!.length) throw new Error('program_settings has no row, so these numbers can\'t be calculated. Apply supabase/migrations/2006_program_settings_and_rules.sql.')
  // RLS hides rows instead of erroring. Attempts without any visible enrollment means the admin
  // read policies on enrollments are missing, and every number would silently read as zero.
  if (attempts.some((a) => a.class_id) && enr.length === 0)
    throw new Error("Student enrollments aren't visible to admins yet, so these numbers would all read zero. An admin access policy is missing (see README: Admin pages).")
  const withScore = (a: AttemptRow) => ({
    student_id: a.student_id, activity_id: a.activity_id, attempt_no: a.attempt_no, score: a.score == null ? null : Number(a.score),
    is_correct: a.is_correct, submitted_at: a.submitted_at, time_on_task_ms: a.time_on_task_ms,
  })
  return {
    progress,
    settings: { inactive_days: Number(settings.data![0].inactive_days) },
    classModuleSettings: rules.map((r) => ({ ...r, pass_mark: Number(r.pass_mark) })),
    courseEnrollments,
    selfPacedAttempts: attempts.filter((a) => !a.class_id).map(withScore),
    classes: classes.data!,
    courses: courses.data!,
    classInstructors: ci.data!,
    enrollments: enr,
    classModules: cm,
    modules: mods.data!,
    activities: acts.map((a) => ({
      id: a.id,
      type: a.type,
      concept: a.concept,
      counts_toward_unlock: a.counts_toward_unlock,
      module_id: a.lesson.module_id,
    })),
    attempts: attempts.filter((a) => a.class_id).map((a) => ({ ...withScore(a), class_id: a.class_id! })),
    people: people.data!,
  }
}

// ---- Classes -------------------------------------------------------------

interface NewClass {
  name: string
  school: string
  course_id: string
  join_code?: string
  instructor_id?: string
}

/** e.g. "Maryvale Period 3" → "MP3-482". Students type this to join. */
function makeJoinCode(name: string) {
  const letters =
    name.toUpperCase().replace(/[^A-Z0-9 ]/g, '').split(/\s+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 4) || 'CIC'
  return `${letters}-${100 + (crypto.getRandomValues(new Uint16Array(1))[0] % 900)}`
}

export async function createClass(input: NewClass, adminId: string): Promise<{ join_code: string }> {
  const join_code = (input.join_code?.trim() || makeJoinCode(input.name)).toUpperCase()
  const { data, error } = await db()
    .from('classes')
    .insert({ name: input.name, school: input.school, course_id: input.course_id, join_code, created_by: adminId })
    .select('id')
    .single()
  if (error) throw error.code === '23505' ? new Error(`Join code ${join_code} is taken. Pick another.`) : friendly(error, 'creating the class')
  if (input.instructor_id) await addInstructor(data.id, input.instructor_id)
  return { join_code }
}

export async function addInstructor(classId: string, instructorId: string): Promise<void> {
  const { error } = await db().from('class_instructors').insert({ class_id: classId, instructor_id: instructorId })
  if (error) throw error.code === '23505' ? new Error('They already teach this class.') : friendly(error, 'assigning the instructor')
}

export async function removeInstructor(classId: string, instructorId: string): Promise<void> {
  const { error } = await db().from('class_instructors').delete().match({ class_id: classId, instructor_id: instructorId })
  if (error) throw friendly(error, 'removing the instructor')
}

// ---- People --------------------------------------------------------------

/** Updates the profile row directly; the "admin manages profiles" policy allows it. */
export async function changeRole(userId: string, role: Role, adminId: string): Promise<void> {
  if (userId === adminId && role !== 'admin') throw new Error("You can't remove your own admin access. Ask another admin.")
  const { data, error } = await db().from('profiles').update({ role }).eq('id', userId).select('id')
  if (error) throw friendly(error, 'changing the role')
  if (!data?.length) throw new Error("The database didn't allow changing the role (no rows updated).")
}

export interface NewPerson {
  display_name: string
  /** Staff only. Students get a generated username instead (1013). */
  email: string
  /** Filled in after adding a student. */
  username?: string
  password: string
  role: 'student' | 'instructor' | 'admin' | 'reviewer'
  school: string
  class_id: string
}

const ADD_ERRORS: Record<string, string> = {
  EMAIL_TAKEN: 'Someone already has an account with that email.',
  BAD_EMAIL: "That email address doesn't look right.",
  BAD_PASSWORD: 'The password needs 8 to 72 characters.',
  BAD_NAME: 'Enter a name (up to 100 characters).',
  BAD_SCHOOL: 'The school name is too long (up to 120 characters).',
}

/** Creates a sign-in account (migrations 3002, 3003); students are enrolled in the class, instructors teach it.
 * Students have no email: they get a username like jsmith1 (1013), which is returned. */
export async function addPerson(p: NewPerson): Promise<string | null> {
  if (p.role === 'student') {
    const [first, ...rest] = p.display_name.trim().split(/\s+/)
    const { data, error } = await db().rpc('admin_create_student', {
      p_first_name: first ?? '', p_last_name: rest.join(' '), p_password: p.password, p_class_id: p.class_id || null,
    })
    if (error) throw rpcError(error, ADD_ERRORS, 'adding the student')
    return (data as { username: string }).username
  }
  const { error } = await db().rpc('admin_create_user', {
    p_email: p.email,
    p_password: p.password,
    p_display_name: p.display_name,
    p_role: p.role,
    p_school: p.school || null,
    p_class_id: p.class_id || null,
  })
  if (error) throw rpcError(error, ADD_ERRORS, 'adding the person')
  return null
}

const ENROLL_ERRORS: Record<string, string> = {
  ALREADY_IN_CLASS: 'They are already in that class.',
  COURSE_ALREADY_IN_ANOTHER_CLASS: "They're already taking that course in another class.",
  STUDENTS_ONLY: 'Only students can be added to a class this way.',
}

/** Enrolls an existing student (migration 3004), with the same rules as joining by class code. */
export async function enrollStudent(studentId: string, classId: string): Promise<void> {
  const { error } = await db().rpc('admin_enroll_student', { p_student: studentId, p_class: classId })
  if (error) throw rpcError(error, ENROLL_ERRORS, 'adding them to the class')
}

// ---- API keys ------------------------------------------------------------

async function sha256Hex(text: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function listApiKeys(): Promise<ApiKeyRow[]> {
  const { data, error } = await db().from('api_keys').select('id, label, created_at, revoked_at').order('created_at', { ascending: false })
  if (error) throw friendly(error, 'reading API keys')
  return data
}

/**
 * Generates a key in the browser (Web Crypto), stores only its SHA-256 hash, and returns the
 * plaintext once for the admin to copy. The read API hashes incoming keys and compares.
 */
export async function createApiKey(label: string, adminId: string): Promise<string> {
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  const key = `cic_live_${btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, (c) => ({ '+': '-', '/': '_', '=': '' })[c]!)}`
  const { error } = await db().from('api_keys').insert({ label, key_hash: await sha256Hex(key), created_by: adminId })
  if (error) throw friendly(error, 'creating the API key')
  return key
}

export async function revokeApiKey(id: string): Promise<void> {
  const { error } = await db().from('api_keys').update({ revoked_at: new Date().toISOString() }).eq('id', id).is('revoked_at', null)
  if (error) throw friendly(error, 'revoking the API key')
}

// ---- Archiving -----------------------------------------------------------
// Archived rows are kept (history and reports still use them); they just leave the active lists.

export async function setArchived(table: 'classes' | 'profiles', id: string, archived: boolean): Promise<void> {
  const archived_at = archived ? new Date().toISOString() : null
  await updateOne(table, id, { archived_at }, archived ? 'archiving' : 'restoring')
}

// ---- Instructor issues and hiring ----------------------------------------

export interface Issue {
  id: string
  instructor_name: string
  contact_email: string
  class_name: string | null
  subject: string
  message: string
  status: 'open' | 'resolved'
  created_at: string
}

export type ApplicationStatus = 'new' | 'interviewing' | 'offer' | 'hired' | 'not_selected'
export interface Application {
  id: string
  name: string
  email: string
  role: string
  school: string | null
  status: ApplicationStatus
  applied_at: string
  updated_at: string
}

export async function listIssues(): Promise<Issue[]> {
  const { data, error } = await db().from('instructor_issues').select('*').order('created_at', { ascending: false })
  if (error) throw friendly(error, 'reading instructor issues')
  return data
}

export async function resolveIssue(id: string): Promise<void> {
  await updateOne('instructor_issues', id, { status: 'resolved', resolved_at: new Date().toISOString() }, 'resolving the issue')
}

export async function listApplications(): Promise<Application[]> {
  const { data, error } = await db().from('job_applications').select('*').order('updated_at', { ascending: false })
  if (error) throw friendly(error, 'reading applications')
  return data
}

export async function setApplicationStatus(id: string, status: ApplicationStatus): Promise<void> {
  const updated_at = new Date().toISOString()
  await updateOne('job_applications', id, { status, updated_at }, 'updating the application')
}
