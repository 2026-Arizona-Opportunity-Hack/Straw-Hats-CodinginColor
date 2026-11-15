import type { LabCheck } from '../types/activities.ts'

export const webPracticeKinds = ['stylesheet', 'text', 'color', 'padding'] as const

export function parseWebPracticeChecks(input: unknown): LabCheck[] | null {
  if (!Array.isArray(input) || !input.length || input.length > 4) return null
  const checks: LabCheck[] = []
  for (const value of input) {
    if (!value || typeof value !== 'object') return null
    const { kind, name, selector, compare, expected, hint } = value as Partial<LabCheck>
    if (!kind || !webPracticeKinds.includes(kind) || typeof name !== 'string' || !name.trim() || name.length > 100
      || typeof hint !== 'string' || !hint.trim() || hint.length > 300) return null
    if (kind === 'stylesheet') {
      checks.push({ kind, name, hint, expected: '' })
      continue
    }
    if (typeof selector !== 'string' || !selector.trim() || selector.length > 100
      || typeof expected !== 'string' || expected.length > 250) return null
    if (kind === 'color' && (!/^rgb\(\d{1,3}, \d{1,3}, \d{1,3}\)$/.test(expected)
      || expected.match(/\d+/g)!.some(channel => Number(channel) > 255)
      || (compare !== undefined && (typeof compare !== 'string' || compare.length > 100 || compare === selector)))) return null
    if (kind === 'padding' && (!/^[1-9]\d{0,2}px$/.test(expected) || parseInt(expected, 10) > 120)) return null
    checks.push({ kind, name, selector: selector.trim(), expected, hint, ...(kind === 'color' && compare?.trim() ? { compare: compare.trim() } : {}) })
  }
  return checks
}
