import type { Role } from '../types/db.ts'

export function homePathFor(role: Role): string {
  return `/${role}`
}
