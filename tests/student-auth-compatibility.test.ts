import { beforeEach, describe, expect, it, vi } from 'vitest'

const client = vi.hoisted(() => ({
  rpc: vi.fn(),
  auth: { signInWithPassword: vi.fn(), setSession: vi.fn() },
  functions: { invoke: vi.fn() },
}))
vi.mock('../src/shared/supabase.ts', () => ({ supabase: client }))
import { signInStudent, signInWithRoster, signUpStudent } from '../src/api/student/auth.ts'

beforeEach(() => vi.resetAllMocks())

describe('username and login-card compatibility', () => {
  it.each([
    [' JSmith1 ', 'jsmith1@students.cic-learn.invalid'],
    [' Existing@Example.invalid ', 'existing@example.invalid'],
  ])('keeps password access for %s', async (login, email) => {
    client.auth.signInWithPassword.mockResolvedValue({ error: null })
    await signInStudent(login, 'password')
    expect(client.auth.signInWithPassword).toHaveBeenCalledWith({ email, password: 'password' })
  })

  it('creates a username account without collecting email or signing in before showing the username', async () => {
    client.rpc.mockResolvedValue({ data: { username: 'jsmith1', class: null }, error: null })
    await expect(signUpStudent({ firstName: 'Jules', lastName: 'Smith', password: 'password' }))
      .resolves.toEqual({ username: 'jsmith1', joinedClass: null })
    expect(client.rpc).toHaveBeenCalledWith('student_create_account', {
      p_first_name: 'Jules', p_last_name: 'Smith', p_password: 'password', p_class_code: null,
    })
    expect(client.auth.signInWithPassword).not.toHaveBeenCalled()
  })

  it('uses the login-card session without converting the passcode into a username/password login', async () => {
    const session = { access_token: 'access', refresh_token: 'refresh' }
    client.functions.invoke.mockResolvedValue({ data: session, error: null })
    client.auth.setSession.mockResolvedValue({ error: null })
    await signInWithRoster(' CLASS-A ', '012345')
    expect(client.functions.invoke).toHaveBeenCalledWith('roster-login', { body: { classCode: 'CLASS-A', passcode: '012345' } })
    expect(client.auth.setSession).toHaveBeenCalledWith(session)
    expect(client.auth.signInWithPassword).not.toHaveBeenCalled()
  })

  it('does not establish a session for a rejected login card', async () => {
    client.functions.invoke.mockResolvedValue({ data: null, error: { context: new Response(null, { status: 401 }) } })
    await expect(signInWithRoster('CLASS-A', '000000')).rejects.toThrow('Check the class code')
    expect(client.auth.setSession).not.toHaveBeenCalled()
  })
})
