import { parse, type DefaultTreeAdapterTypes as Tree } from 'parse5'
import type { DraftReference } from '../../src/shared/curriculum/draft.ts'

type ReferenceEntry = DraftReference & { tags: RegExp; summary?: string }
const approved: ReferenceEntry[] = [
  { id: 'mdn-html', title: 'MDN · Structuring content with HTML', url: 'https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Structuring_content', tags: /\b(html|tags|elements|headings|forms|web page)\b/gi },
  { id: 'mdn-css', title: 'MDN · CSS styling basics', url: 'https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Styling_basics', tags: /\b(css|selectors|stylesheet|box model|styling)\b/gi },
  { id: 'mdn-js', title: 'MDN · JavaScript basics', url: 'https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Scripting', tags: /\b(javascript|dom|event listener)\b/gi },
  { id: 'python-basics', title: 'Python · An informal introduction', url: 'https://docs.python.org/3/tutorial/introduction.html', tags: /\b(python|lists|strings|integers)\b/gi },
  { id: 'python-flow', title: 'Python · Control flow', url: 'https://docs.python.org/3/tutorial/controlflow.html', tags: /\b(python|loops|conditionals|range|functions)\b/gi },
  { id: 'wai-images', title: 'W3C WAI · Images tutorial', url: 'https://www.w3.org/WAI/tutorials/images/', tags: /\b(alt text|alternative text|accessibility|image descriptions)\b/gi },
]

// Reviewed summaries keep the approved pages usable on hosts where the pages block automated fetching.
const w3schools: ReferenceEntry[] = [
  { id: 'w3schools-selectors', title: 'W3Schools · CSS Selectors', url: 'https://www.w3schools.com/css/css_selectors.asp',
    tags: /\b(selectors?|classes|css_selectors)\b/gi,
    summary: 'CSS selectors determine which elements receive a rule. An element selector uses a tag name, a class selector starts with a dot and can match several elements, and an ID selector starts with # and targets an element with that ID. An ID should be unique within the document.' },
  { id: 'w3schools-box-model', title: 'W3Schools · CSS Box Model', url: 'https://www.w3schools.com/css/css_boxmodel.asp',
    tags: /\b(box model|padding|margins?|borders?|css_boxmodel)\b/gi,
    summary: 'A rendered CSS box has content, padding, border, and margin in that order from inside to outside. Padding separates content from the border. Margin is space outside the border.' },
  { id: 'w3schools-html', title: 'W3Schools · Introduction to HTML', url: 'https://www.w3schools.com/html/html_intro.asp',
    tags: /\b(html|tags|elements|headings|paragraphs?|web pages?|html_intro)\b/gi,
    summary: 'HTML gives a page structure. A basic document contains a head with information such as the browser tab title, and a body with visible elements such as a heading and paragraph. Some elements, such as br, have no closing tag.' },
  { id: 'w3schools-css', title: 'W3Schools · CSS Introduction', url: 'https://www.w3schools.com/css/css_intro.asp',
    tags: /\b(css|stylesheet|styling|css_intro)\b/gi,
    summary: 'CSS controls how HTML looks. A separate stylesheet allows pages to share presentation rules. Editing a shared stylesheet changes the appearance of the pages that use it.' },
  { id: 'w3schools-js', title: 'W3Schools · JavaScript Introduction', url: 'https://www.w3schools.com/js/js_intro.asp',
    tags: /\b(javascript|dom|js_intro)\b/gi,
    summary: 'JavaScript can change an HTML document after it loads. The tutorial shows selecting an element by its ID and changing its content, an attribute, or a style.' },
  { id: 'w3schools-python', title: 'W3Schools · Python Introduction', url: 'https://www.w3schools.com/python/python_intro.asp',
    tags: /\b(python|indentation|python_intro)\b/gi,
    summary: 'The tutorial uses Python 3 and introduces running a simple print statement. Python uses indentation to group the statements in blocks such as loops or functions.' },
]

function requestedW3Schools(instructions: string) {
  return /\bw3schools\b/i.test(instructions)
    && !/\b(?:avoid|skip|exclude|without|instead of|never|don['’]t|do not|no)\b[^,.!?;\n]{0,36}\bw3schools\b/i.test(instructions)
}

function excerpt(node: Tree.Node, inContent = false): string {
  if (node.nodeName === '#text' && inContent) return (node as Tree.TextNode).value
  if (!('childNodes' in node) || ['script', 'style', 'nav', 'footer', 'aside'].includes(node.nodeName)) return ''
  const main = 'attrs' in node && node.attrs.some(attr => attr.name === 'role' && attr.value === 'main')
  return node.childNodes.map(child => excerpt(child, inContent || main || node.nodeName === 'main' || node.nodeName === 'article')).join(' ')
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

export async function lookupReferences(text: string, signal: AbortSignal, instructions = '') {
  const preferW3Schools = requestedW3Schools(instructions)
  const catalog = preferW3Schools ? [...w3schools, ...approved] : approved
  const topic = text + '\n' + instructions
  const matches = catalog.map(entry => ({ entry, score: [...topic.matchAll(entry.tags)].length }))
    .filter(item => item.score > 0)
    .sort((left, right) => Number(!!right.entry.summary) - Number(!!left.entry.summary) || right.score - left.score)
    .slice(0, 3)
  const results = await Promise.all(matches.map(async ({ entry }) => {
    const passage = entry.summary ?? await readReference(entry.url, signal).catch(() => '')
    const ref: DraftReference = { id: entry.id, title: entry.title, url: entry.url }
    return { ...ref, excerpt: passage }
  }))
  const notes = results.filter(item => !item.excerpt).map(item => `Could not verify ${item.title}. Check related explanations before publishing.`)
  if (preferW3Schools && !matches.some(({ entry }) => entry.summary)) notes.push('No approved W3Schools page matched this topic.')
  else if (!results.length) notes.push('No approved reference matched this topic. Check any newly drafted explanations before publishing.')
  return { sources: results.filter(item => item.excerpt), notes }
}
