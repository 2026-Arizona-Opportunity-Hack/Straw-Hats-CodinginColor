import assert from 'node:assert/strict'
import { test } from 'vitest'
import { checkPython } from '../src/shared/labs/checks.ts'

const lab = { language: 'python', checks: [{ name: 'Print a number', expected: '3' }] }

test('Python compares literal output and tolerates a final newline', () => {
  assert.equal(checkPython(lab, '3\r\n')[0].passed, true)
  assert.equal(checkPython(lab, ' 3\n')[0].passed, false)
  assert.equal(checkPython(lab, '13\n')[0].passed, false)
})

test('runtime errors never pass a check even if stdout matched', () => {
  assert.equal(checkPython(lab, '3\n', 'Error')[0].passed, false)
})
