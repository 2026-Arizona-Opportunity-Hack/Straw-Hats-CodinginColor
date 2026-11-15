import { parse, type DefaultTreeAdapterTypes as Tree } from 'parse5'
import type { DraftReference } from '../../src/shared/curriculum/draft.ts'

const approved = [
  { id: 'mdn-html', title: 'MDN · Structuring content with HTML', url: 'https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Structuring_content', tags: /\b(html|tags|elements|headings|forms|web page)\b/gi },
  { id: 'mdn-css', title: 'MDN · CSS styling basics', url: 'https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Styling_basics', tags: /\b(css|selectors|stylesheet|box model|styling)\b/gi },
  { id: 'mdn-js', title: 'MDN · JavaScript basics', url: 'https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Scripting', tags: /\b(javascript|dom|event listener)\b/gi },
  { id: 'python-basics', title: 'Python · An informal introduction', url: 'https://docs.python.org/3/tutorial/introduction.html', tags: /\b(python|lists|strings|integers)\b/gi },
  { id: 'python-flow', title: 'Python · Control flow', url: 'https://docs.python.org/3/tutorial/controlflow.html', tags: /\b(python|loops|conditionals|range|functions)\b/gi },
  { id: 'wai-images', title: 'W3C WAI · Images tutorial', url: 'https://www.w3.org/WAI/tutorials/images/', tags: /\b(alt text|alternative text|accessibility|image descriptions)\b/gi },
]

function excerpt(node: Tree.Node, inContent = false): string {
  if (node.nodeName === '#text' && inContent) return (node as Tree.TextNode).value
  if (!('childNodes' in node) || ['script', 'style', 'nav', 'footer', 'aside'].includes(node.nodeName)) return ''
  return node.childNodes.map(child => excerpt(child, inContent || node.nodeName === 'main' || node.nodeName === 'article')).join(' ')
}

async function readReference(url: string, signal: AbortSignal) {
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(2800)]) })
  if (!response.ok || !response.body) return ''
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let bytes = 0
  let html = ''
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      bytes += value.byteLength
      if (bytes > 512 * 1024) return ''
      html += decoder.decode(value, { stream: true })
    }
    return excerpt(parse(html + decoder.decode())).replace(/\s+/g, ' ').trim().slice(0, 3100)
  } finally {
    await reader.cancel().catch(() => {})
  }
}

export async function lookupReferences(text: string, signal: AbortSignal) {
  const matches = approved.map(entry => ({ entry, score: [...text.matchAll(entry.tags)].length }))
    .filter(item => item.score > 0).sort((left, right) => right.score - left.score).slice(0, 3)
  const results = await Promise.all(matches.map(async ({ entry }) => {
    const passage = await readReference(entry.url, signal).catch(() => '')
    const ref: DraftReference = { id: entry.id, title: entry.title, url: entry.url }
    return { ...ref, excerpt: passage }
  }))
  return {
    sources: results.filter(item => item.excerpt),
    notes: results.length
      ? results.filter(item => !item.excerpt).map(item => `Could not verify ${item.title}. Check related explanations before publishing.`)
      : ['No approved reference matched this topic. Check any newly drafted explanations before publishing.'],
  }
}
