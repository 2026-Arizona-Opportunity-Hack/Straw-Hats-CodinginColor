import { beforeEach, describe, expect, it, vi } from 'vitest'
import { enrollStudent } from './api.ts'

const { rpc, from } = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }))
vi.mock('../shared/supabase.ts', () => ({ supabase: { rpc, from } }))

function record(data: object | null) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data, error: null }),
  }
}

describe('enrollStudent', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    rpc.mockResolvedValue({ error: null })
  })

  it('confirms the membership and the linked roster entry for the selected class', async () => {
    const enrollment = record({ student_id: 'student-1' })
    const roster = record({ profile_id: 'student-1' })
    from.mockReturnValueOnce(enrollment).mockReturnValueOnce(roster)

    await expect(enrollStudent('student-1', 'class-1')).resolves.toBeUndefined()

    expect(rpc).toHaveBeenCalledWith('admin_enroll_student', { p_student: 'student-1', p_class: 'class-1' })
    expect(from.mock.calls).toEqual([['enrollments'], ['class_students']])
    expect(enrollment.eq.mock.calls).toEqual([['class_id', 'class-1'], ['student_id', 'student-1']])
    expect(roster.eq.mock.calls).toEqual([['class_id', 'class-1'], ['profile_id', 'student-1']])
    expect(roster.not).toHaveBeenCalledWith('passcode', 'is', null)
    expect(rpc.mock.invocationCallOrder[0]).toBeLessThan(from.mock.invocationCallOrder[0])
  })

  it.each([
    [null, { profile_id: 'student-1' }],
    [{ student_id: 'student-1' }, null],
  ])('rejects an empty RPC response without both records (%j, %j)', async (membership, linkedRoster) => {
    from.mockReturnValueOnce(record(membership)).mockReturnValueOnce(record(linkedRoster))

    await expect(enrollStudent('student-1', 'class-1')).rejects.toThrow('Could not confirm the enrollment.')
  })

  it('keeps the existing error when the database rejects enrollment', async () => {
    rpc.mockResolvedValue({ error: { message: 'ALREADY_IN_CLASS' } })

    await expect(enrollStudent('student-1', 'class-1')).rejects.toThrow('They are already in that class.')
    expect(from).not.toHaveBeenCalled()
  })
})
