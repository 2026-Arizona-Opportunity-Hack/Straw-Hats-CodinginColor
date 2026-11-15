// Student sign-up and sign-in. Owner: Shivraj.
// Database side: supabase/migrations/1003_student_sign_up.sql and 1013_student_usernames.sql.
// Students have no email: they sign in with a generated username (jsmith1). Supabase Auth
// stores each account under a hidden, undeliverable address built from that username.
import { supabase } from '../../shared/supabase.ts'

export interface SignUpInput {
  firstName: string
  lastName: string
  password: string
  classCode?: string
}

/** Hidden auth address for a username. Must match 1013 (_create_student). */
export const studentAuthEmail = (login: string) => {
  const id = login.trim().toLowerCase()
  return id.includes('@') ? id : `${id}@students.cic-learn.invalid`
}

export interface JoinedClass {
  class_id: string
  class_name: string
  course_id: string
}

/** Turns a database error code into a sentence a student can act on. */
const MESSAGES: Record<string, string> = {
  BAD_EMAIL: 'That email address doesn’t look right. Check it and try again.',
  BAD_PASSWORD: 'Your password needs 8 to 72 characters.',
  BAD_NAME: 'Please enter your first name (and last name), up to 50 characters each.',
  BAD_SCHOOL: 'School name is too long (up to 120 characters).',
  BAD_CLASS_CODE: 'We couldn’t find a class with that code. Ask your teacher to check it.',
  EMAIL_TAKEN: 'An account with this email already exists. Try signing in instead.',
  ALREADY_IN_CLASS: 'You’re already in this class.',
  COURSE_ALREADY_IN_ANOTHER_CLASS: 'You’re already taking this course in another class.',
  STUDENTS_ONLY: 'Only student accounts can join a class.',
}

export function friendlyError(message: string | undefined | null): string {
  if (!message) return 'Something went wrong. Please try again.'
  const code = Object.keys(MESSAGES).find((c) => message.includes(c))
  if (code) return MESSAGES[code]
  if (/invalid login credentials/i.test(message)) return 'Username or password is incorrect.'
  return message
}

function client() {
  if (!supabase) throw new Error('Sign-in is not available: Supabase is not configured.')
  return supabase
}

/** Creates a student account (optionally joining a class). Returns the new username;
 * the caller shows it, then signs in with signInStudent. */
export async function signUpStudent(input: SignUpInput): Promise<{ username: string; joinedClass: JoinedClass | null }> {
  const { data, error } = await client().rpc('student_create_account', {
    p_first_name: input.firstName,
    p_last_name: input.lastName,
    p_password: input.password,
    p_class_code: input.classCode || null,
  })
  if (error) throw new Error(friendlyError(error.message))
  const result = data as { username: string; class: JoinedClass | null }
  return { username: result.username, joinedClass: result.class ?? null }
}

/** Username (or, for older accounts, email) + password. */
export async function signInStudent(login: string, password: string): Promise<void> {
  const { error } = await client().auth.signInWithPassword({ email: studentAuthEmail(login), password })
  if (error) throw new Error(friendlyError(error.message))
}

/** K-12 educators: redirects to Google; a new Google account becomes a reviewer (1013). */
export async function signInWithGoogle(): Promise<void> {
  const { error } = await client().auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${window.location.origin}/login` },
  })
  if (error) throw new Error(friendlyError(error.message))
}

/** Join a class later, from the student home page. */
export async function joinClass(code: string): Promise<JoinedClass> {
  const { data, error } = await client().rpc('join_class', { p_code: code })
  if (error) throw new Error(friendlyError(error.message))
  return data as JoinedClass
}
