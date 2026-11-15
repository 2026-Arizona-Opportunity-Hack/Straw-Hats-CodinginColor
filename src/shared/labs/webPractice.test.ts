import { expect, it } from 'vitest'
import { linkedStylesheet } from './webPractice.ts'
import { parseWebPracticeChecks } from './webPracticeChecks.ts'
import { isolatedHtml } from '../ui/isolatedHtml.ts'
import { activityContent } from '../../instructor/liveStore.ts'
import { newActivity } from '../../instructor/model.ts'

it('recognizes the relative stylesheet and keeps checked frames scriptless', () => {
  const html = '<head><link rel="stylesheet" href="styles.css"></head><main>Menu</main>'
  expect(linkedStylesheet(html)).toBe(true)
  expect(linkedStylesheet(html.replace('styles.css', 'other.css'))).toBe(false)
  expect(linkedStylesheet('<main><link rel="stylesheet" href="styles.css"></main>')).toBe(false)
  const frame = isolatedHtml(html + '<script>console.log("authored")</script>', false, 'main { padding: 20px }', false)
  expect(frame).toContain("script-src 'none'")
  expect(frame).not.toContain('<script')
  expect(frame).toContain('padding: 20px')
})

it('persists a practice lab and its bounded check definitions', () => {
  const checks = parseWebPracticeChecks([
    { kind: 'stylesheet', name: 'Link the CSS', hint: 'Add the stylesheet link in head.' },
    { kind: 'color', name: 'Style Coffee', selector: '#coffee', compare: '#desserts', expected: 'rgb(60, 30, 10)', hint: 'Use the Coffee ID.' },
    { kind: 'padding', name: 'Space the menu', selector: 'main', expected: '20px', hint: 'Add padding to main.' },
  ])
  if (!checks) throw new Error('Invalid practice fixture')
  expect(activityContent({
    ...newActivity('code'), title: 'Style a menu',
    code: { starter: '<main>Menu</main>', tests: '', solution: '',
      lab: { language: 'web', verifier: 'web-practice-v1', starterCss: 'main {}', checks } },
  })).toMatchObject({ lab: { verifier: 'web-practice-v1', checks } })
  expect(parseWebPracticeChecks([{ ...checks[1], expected: 'rgb(256, 30, 10)' }])).toBeNull()
  expect(parseWebPracticeChecks([{ ...checks[2], kind: 'script' }])).toBeNull()
})
