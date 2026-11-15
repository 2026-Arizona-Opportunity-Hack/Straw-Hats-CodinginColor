import type { CodingLabSettings } from '../types/activities.ts'

export type CheckResult = { name: string; passed: boolean; detail?: string }

const cleanOutput = (value: string) => value.replace(/\r\n/g, '\n').trimEnd()

export function checkPython(lab: CodingLabSettings, stdout: string, error?: string): CheckResult[] {
  return lab.checks.map(check => ({
    name: check.name,
    passed: !error && cleanOutput(stdout) === cleanOutput(check.expected),
    detail: error ? 'Fix the Python error and try again.' : cleanOutput(stdout) !== cleanOutput(check.expected) ? 'The printed output differs from the expected output.' : undefined,
  }))
}

export function checkWeb(lab: CodingLabSettings, source: string): CheckResult[] {
  // Template contents stay inert and are never inserted into the application document.
  const template = document.createElement('template')
  template.innerHTML = source
  return lab.checks.map(check => {
    let element
    try {
      element = template.content.querySelector(check.selector ?? '')
    } catch {
      return { name: check.name, passed: false, detail: 'The check has an invalid CSS selector.' }
    }
    if (!element) return { name: check.name, passed: false, detail: 'The expected element is missing.' }
    const passed = !check.expected.trim() || element.textContent?.trim() === check.expected.trim()
    return { name: check.name, passed, detail: passed ? undefined : 'The element text differs from the expected text.' }
  })
}
