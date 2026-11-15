import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { HtmlActivityPreview } from './HtmlActivity'

const page = { html: '<h1>Binary Letters</h1>', reports_score: false }

describe('HtmlActivityPreview', () => {
  it('embeds the page right away when scripts are off (live data)', () => {
    const html = renderToStaticMarkup(<HtmlActivityPreview activity={page} title="Binary" scripts={false} onComplete={() => {}} />)
    expect(html).toContain('<iframe')
    expect(html).not.toContain('Run HTML preview')
    expect(html).toContain('Mark as done')
  })

  it('keeps the explicit run step when authored scripts can run (local demo)', () => {
    const html = renderToStaticMarkup(<HtmlActivityPreview activity={page} title="Binary" scripts />)
    expect(html).not.toContain('<iframe')
    expect(html).toContain('Run HTML preview')
  })
})
