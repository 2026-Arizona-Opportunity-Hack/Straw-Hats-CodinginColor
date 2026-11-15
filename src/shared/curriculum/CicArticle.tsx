import { useId } from 'react'
import Markdown, { defaultUrlTransform } from 'react-markdown'
import { articleHeadings } from './articleHeadings'
import './article.css'

export function CicArticle({ title, markdown }: { title: string; markdown: string }) {
  const prefix = useId()
  const headings = articleHeadings(markdown)

  return <section className="cic-lesson-article" aria-labelledby={prefix + '-title'}>
    <header><h3 id={prefix + '-title'}>{title}</h3></header>
    <div className="cic-lesson-layout">
      {headings.length > 1 && <nav aria-label="In this lesson">
        <strong>In this lesson</strong>
        <ul>{headings.map(({ text, line }) => <li key={line}><a href={`#${prefix}-section-${line}`} onClick={event => {
          const target = document.getElementById(`${prefix}-section-${line}`)
          if (!target) return
          event.preventDefault()
          target.focus({ preventScroll: true })
          target.scrollIntoView({ block: 'start' })
        }}>{text}</a></li>)}</ul>
      </nav>}
      <div className="cic-lesson-prose">
        <Markdown skipHtml disallowedElements={['img']} urlTransform={(url, key) =>
          key === 'href' && /^https:\/\//i.test(url) ? defaultUrlTransform(url) : ''
        } components={{
          h1: 'h4', h2: ({ children, node }) => <h4 id={`${prefix}-section-${node?.position?.start.line}`} tabIndex={-1}>{children}</h4>,
          h3: 'h5', a: ({ href, children }) => href ? <a href={href} target="_blank" rel="noreferrer">{children}</a> : <span>{children}</span>,
        }}>{markdown}</Markdown>
      </div>
    </div>
  </section>
}
