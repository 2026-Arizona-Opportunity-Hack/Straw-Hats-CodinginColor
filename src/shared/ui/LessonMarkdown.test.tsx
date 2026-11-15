import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { LessonMarkdown } from './LessonMarkdown'
import { leadingHeading, readMinutes } from './lessonContent'

const render = (markdown: string, title?: string) => renderToStaticMarkup(<LessonMarkdown markdown={markdown} title={title} />)

describe('LessonMarkdown', () => {
  it('turns a labelled blockquote into a callout and removes the label from the text', () => {
    const html = render('> **Key idea:** Computers follow instructions.')
    expect(html).toContain('class="cic-callout cic-callout--key"')
    expect(html).toContain('role="note"')
    expect(html).toContain('Key idea</p>')
    expect(html).toContain('<p class="cic-md-p">Computers follow instructions.</p>')
    expect(html).not.toContain('<strong>')
  })

  it('recognises every callout label, with or without a colon, and a label on its own line', () => {
    expect(render('> **Did you know?** Cats.')).toContain('cic-callout--fact')
    expect(render('> **Try it:** Click.')).toContain('cic-callout--try')
    expect(render('> **Watch out**: Bugs.')).toContain('cic-callout--warn')
    expect(render('> **Remember:**\n> Save often.')).toContain('cic-callout--remember')
    expect(render('> **Think about it:** Why?')).toContain('cic-callout--think')
  })

  it('keeps other blockquotes as plain quotes', () => {
    const html = render('> **Fun:** not a callout label\n\n> Just a quote.')
    expect(html).not.toContain('cic-callout')
    expect(html.match(/class="cic-quote"/g)).toHaveLength(2)
  })

  it('drops a leading heading that repeats the card title, case-insensitively', () => {
    const html = render('#  welcome to AI academy \n\nHello.', 'Welcome to AI Academy')
    expect(html).not.toContain('welcome to AI academy')
    expect(html).toContain('Hello.')
    expect(render('## Something else\n\nHello.', 'Welcome')).toContain('Something else')
    expect(render('### Welcome\n\nHello.', 'Welcome')).toContain('Welcome</h5>')
  })

  it('nests Markdown headings under the card title', () => {
    const html = render('## Section\n\n### Detail')
    expect(html).toContain('<h4 class="cic-md-h2">Section</h4>')
    expect(html).toContain('<h5 class="cic-md-h3">Detail</h5>')
  })

  it('renders GitHub tables inside their own scrolling region', () => {
    const html = render('| Year | Computer |\n|---|---|\n| 1946 | ENIAC |')
    expect(html).toContain('<div class="cic-table-wrap" role="region" aria-label="Table" tabindex="0"><table>')
    expect(html).toContain('<th>Year</th>')
    expect(html).toContain('<td>ENIAC</td>')
  })

  it('skips raw HTML and unsafe links', () => {
    const html = render('<script>alert(1)</script>\n\n[x](javascript:alert(1))')
    expect(html).not.toContain('<script')
    expect(html).not.toContain('javascript:')
  })
})

describe('lesson helpers', () => {
  it('estimates reading time at about 200 words a minute', () => {
    expect(readMinutes('word '.repeat(50))).toBe(1)
    expect(readMinutes('word '.repeat(700))).toBe(4)
  })

  it('reads a leading heading as a fallback title', () => {
    expect(leadingHeading('\n## **Variables**\nText')).toBe('Variables')
    expect(leadingHeading('Text first\n# Late heading')).toBeUndefined()
  })
})
