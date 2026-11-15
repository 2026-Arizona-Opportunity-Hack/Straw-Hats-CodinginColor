import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { GrowthRows } from './impact.tsx'

it('shows matched sample size and rounds gain after subtraction', () => {
  const html = renderToStaticMarkup(<GrowthRows rows={[{ label: 'Variables', pre: 31.6, post: 33.4, pairs: 7 }]} />)
  expect(html).toContain('7 matched pairs')
  expect(html).toContain('+2 pts')
})

it('shows no before/after claim without a matched pair', () => {
  const html = renderToStaticMarkup(<GrowthRows rows={[{ label: 'Variables', pre: null, post: null, pairs: 0 }]} />)
  expect(html).toContain('Shows up once')
  expect(html).not.toContain('role="img"')
})
