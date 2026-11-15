// Admin data functions. Owner: Aryan.
// Same pattern as src/api/*: mock mode (no Supabase keys) uses an in-memory copy of
// src/admin/mocks.ts; otherwise every call runs as the signed-in admin, so RLS decides
// what comes back. Needed policies are listed in README ("Admin pages: database needs").
import { setUserRole } from '../api/instructor/index.ts'
import { isMockMode, supabase } from '../shared/supabase.ts'
import type { Role } from '../shared/types/db.ts'
import type { OrgData } from './metrics.ts'
import { buildMockOrg, MOCK_APPLICATIONS, MOCK_ISSUES } from './mocks.ts'

let mockOrg: OrgData | null = null
const mock = () => (mockOrg ??= buildMockOrg())

interface ApiKeyRow {
  id: string
  label: string
  created_at: string
  revoked_at: string | null
}
let mockKeys: ApiKeyRow[] = []
let mockIssues = MOCK_ISSUES
let mockApplications = MOCK_APPLICATIONS

const db = () => {
  if (!supabase) throw new Error('Supabase is not configured.')
  return supabase
}

/** Turns Postgres/RLS errors into something an admin can act on. */
function friendly(err: { code?: string; message: string }, what: string): Error {
  if (err.code === '42501' || /row-level security|permission denied/i.test(err.message))
    return new Error(`The database didn't allow ${what}. An admin access policy is missing (see README: Admin pages).`)
  if (err.code === '23505') return new Error(`That ${what.replace(/^(creating|adding) /, '')} already exists.`)
  if (['42P01', '42703', 'PGRST204', 'PGRST205'].includes(err.code ?? ''))
    return new Error(`This isn't set up in the database yet, so ${what} isn't available (see README: Admin pages).`)
  return new Error(err.message)
}

/** Updates one row and fails loudly if RLS silently matched nothing. */
async function updateOne(table: string, id: string, values: Record<string, unknown>, what: string) {
  const { data, error } = await db().from(table).update(values).eq('id', id).select('id')
  if (error) throw friendly(error, what)
  if (!data.length) throw new Error(`The database didn't allow ${what}. An admin access policy is missing (see README: Admin pages).`)
}

export async function loadOrgData(): Promise<OrgData> {
  if (isMockMode) return structuredClone(mock())
  const c = db()
  const [classes, courses, ci, enr, cm, mods, acts, att, people] = await Promise.all([
    // '*' so pages keep working before archived_at exists (see README: Admin pages).
    c.from('classes').select('*').order('name'),
    c.from('courses').select('id, title, delivery_mode'),
    c.from('class_instructors').select('class_id, instructor_id'),
    c.from('enrollments').select('class_id, student_id'),
    c.from('class_modules').select('class_id, module_id'),
    c.from('modules').select('id, course_id, title, position, concept, published'),
    c.from('activities').select('id, type, concept, counts_toward_unlock, lesson:lessons!inner(module_id)'),
    c.from('activity_attempts').select('student_id, activity_id, class_id, attempt_no, score, is_correct, submitted_at, time_on_task_ms'),
    c.from('profiles').select('*').order('display_name'),
  ])
  const failed = [classes, courses, ci, enr, cm, mods, acts, att, people].find((r) => r.error)
  if (failed?.error) throw friendly(failed.error, 'reading organization data')
  // RLS hides rows instead of erroring. Attempts without any visible enrollment means the admin
  // read policies on enrollments are missing, and every number would silently read as zero.
  if (att.data!.length > 0 && enr.data!.length === 0)
    throw new Error("Student enrollments aren't visible to admins yet, so these numbers would all read zero. An admin access policy is missing (see README: Admin pages).")
  return {
    classes: classes.data!,
    courses: courses.data!,
    classInstructors: ci.data!,
    enrollments: enr.data!,
    classModules: cm.data!,
    modules: mods.data!,
    activities: acts.data!.map((a) => ({
      id: a.id,
      type: a.type,
      concept: a.concept,
      counts_toward_unlock: a.counts_toward_unlock,
      module_id: (a.lesson as unknown as { module_id: string }).module_id,
    })),
    attempts: att.data!.map((a) => ({ ...a, score: a.score == null ? null : Number(a.score) })),
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
  if (isMockMode) {
    const o = mock()
    if (o.classes.some((c) => c.join_code === join_code)) throw new Error(`Join code ${join_code} is taken. Pick another.`)
    const id = `class-${Date.now()}`
    o.classes.push({ id, name: input.name, school: input.school, course_id: input.course_id, join_code, created_at: new Date().toISOString() })
    if (input.instructor_id) o.classInstructors.push({ class_id: id, instructor_id: input.instructor_id })
    return { join_code }
  }
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
  if (isMockMode) {
    const o = mock()
    if (o.classInstructors.some((x) => x.class_id === classId && x.instructor_id === instructorId))
      throw new Error('They already teach this class.')
    o.classInstructors.push({ class_id: classId, instructor_id: instructorId })
    return
  }
  const { error } = await db().from('class_instructors').insert({ class_id: classId, instructor_id: instructorId })
  if (error) throw error.code === '23505' ? new Error('They already teach this class.') : friendly(error, 'assigning the instructor')
}

export async function removeInstructor(classId: string, instructorId: string): Promise<void> {
  if (isMockMode) {
    const o = mock()
    o.classInstructors = o.classInstructors.filter((x) => !(x.class_id === classId && x.instructor_id === instructorId))
    return
  }
  const { error } = await db().from('class_instructors').delete().match({ class_id: classId, instructor_id: instructorId })
  if (error) throw friendly(error, 'removing the instructor')
}

// ---- People --------------------------------------------------------------

/**
 * Mock mode goes through the shared contract stub (src/api/instructor). Real mode updates the row
 * directly because that stub doesn't call Supabase yet; the "admin manages profiles" policy allows it.
 */
export async function changeRole(userId: string, role: Role, adminId: string): Promise<void> {
  if (userId === adminId && role !== 'admin') throw new Error("You can't remove your own admin access. Ask another admin.")
  if (isMockMode) {
    await setUserRole(userId, role)
    const p = mock().people.find((x) => x.id === userId)
    if (p) p.role = role
    return
  }
  const { data, error } = await db().from('profiles').update({ role }).eq('id', userId).select('id')
  if (error) throw friendly(error, 'changing the role')
  if (!data?.length) throw new Error("The database didn't allow changing the role (no rows updated).")
}

// ---- API keys ------------------------------------------------------------

async function sha256Hex(text: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function listApiKeys(): Promise<ApiKeyRow[]> {
  if (isMockMode) return [...mockKeys]
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
  if (isMockMode) {
    mockKeys = [{ id: `key-${Date.now()}`, label, created_at: new Date().toISOString(), revoked_at: null }, ...mockKeys]
    return key
  }
  const { error } = await db().from('api_keys').insert({ label, key_hash: await sha256Hex(key), created_by: adminId })
  if (error) throw friendly(error, 'creating the API key')
  return key
}

export async function revokeApiKey(id: string): Promise<void> {
  if (isMockMode) {
    mockKeys = mockKeys.map((k) => (k.id === id ? { ...k, revoked_at: new Date().toISOString() } : k))
    return
  }
  const { error } = await db().from('api_keys').update({ revoked_at: new Date().toISOString() }).eq('id', id).is('revoked_at', null)
  if (error) throw friendly(error, 'revoking the API key')
}

// ---- Archiving -----------------------------------------------------------
// Archived rows are kept (history and reports still use them); they just leave the active lists.

export async function setArchived(table: 'classes' | 'profiles', id: string, archived: boolean): Promise<void> {
  const archived_at = archived ? new Date().toISOString() : null
  if (isMockMode) {
    const rows: { id: string; archived_at?: string | null }[] = table === 'classes' ? mock().classes : mock().people
    const row = rows.find((r) => r.id === id)
    if (row) row.archived_at = archived_at
    return
  }
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
  if (isMockMode) return structuredClone(mockIssues)
  const { data, error } = await db().from('instructor_issues').select('*').order('created_at', { ascending: false })
  if (error) throw friendly(error, 'reading instructor issues')
  return data
}

export async function resolveIssue(id: string): Promise<void> {
  if (isMockMode) {
    mockIssues = mockIssues.map((i) => (i.id === id ? { ...i, status: 'resolved' } : i))
    return
  }
  await updateOne('instructor_issues', id, { status: 'resolved', resolved_at: new Date().toISOString() }, 'resolving the issue')
}

export async function listApplications(): Promise<Application[]> {
  if (isMockMode) return structuredClone(mockApplications)
  const { data, error } = await db().from('job_applications').select('*').order('updated_at', { ascending: false })
  if (error) throw friendly(error, 'reading applications')
  return data
}

export async function setApplicationStatus(id: string, status: ApplicationStatus): Promise<void> {
  const updated_at = new Date().toISOString()
  if (isMockMode) {
    mockApplications = mockApplications.map((a) => (a.id === id ? { ...a, status, updated_at } : a))
    return
  }
  await updateOne('job_applications', id, { status, updated_at }, 'updating the application')
}
