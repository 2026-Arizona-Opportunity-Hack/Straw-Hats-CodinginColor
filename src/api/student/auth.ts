// Student sign-up and sign-in. Owner: Shivraj.
// Database side: supabase/migrations/1003_student_sign_up.sql.
import { supabase } from '../../shared/supabase.ts'

export interface SignUpInput {
  email: string
  password: string
  displayName: string
  school?: string
  classCode?: string
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
  BAD_NAME: 'Please enter your name (up to 100 characters).',
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
  if (/invalid login credentials/i.test(message)) return 'Email or password is incorrect.'
  return message
}

function client() {
  if (!supabase) throw new Error('Sign-in is not available: Supabase is not configured.')
  return supabase
}

/** Creates a student account (optionally joining a class), then signs in. */
export async function signUpStudent(input: SignUpInput): Promise<{ joinedClass: JoinedClass | null }> {
  const c = client()
  const { data, error } = await c.rpc('student_sign_up', {
    p_email: input.email,
    p_password: input.password,
    p_display_name: input.displayName,
    p_school: input.school || null,
    p_class_code: input.classCode || null,
  })
  if (error) throw new Error(friendlyError(error.message))
  const signIn = await c.auth.signInWithPassword({ email: input.email.trim().toLowerCase(), password: input.password })
  if (signIn.error) throw new Error('Your account was created, but signing in failed. Please sign in.')
  return { joinedClass: (data as { class: JoinedClass | null } | null)?.class ?? null }
}

export async function signInStudent(email: string, password: string): Promise<void> {
  const { error } = await client().auth.signInWithPassword({ email: email.trim().toLowerCase(), password })
  if (error) throw new Error(friendlyError(error.message))
}

/** Redirects to Google; Supabase brings the student back to /login signed in. */
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
