// Lesson text renderer shared by the student player and the instructor previews.
// Raw HTML is skipped; instructor-authored HTML only ever renders in InteractiveHtmlFrame.
import { createElement, type ReactNode } from 'react'
import Markdown, { defaultUrlTransform, type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Bookmark, Lightbulb, MessageCircle, Pointer, Sparkles, TriangleAlert, type LucideIcon } from 'lucide-react'
import './lesson.css'

/** Minimal shape shared by mdast and hast nodes, so no extra type packages are needed. */
type MdNode = {
  type: string
  tagName?: string
  depth?: number
  value?: string
  children?: MdNode[]
  properties?: Record<string, unknown>
}

type CalloutKind = 'key' | 'fact' | 'try' | 'warn' | 'remember' | 'think'

/** Bold labels that turn a blockquote into a callout. Content authors write exactly these. */
const callouts: Record<CalloutKind, { label: string; icon: LucideIcon }> = {
  key: { label: 'Key idea', icon: Lightbulb },
  fact: { label: 'Did you know?', icon: Sparkles },
  try: { label: 'Try it', icon: Pointer },
  warn: { label: 'Watch out', icon: TriangleAlert },
  remember: { label: 'Remember', icon: Bookmark },
  think: { label: 'Think about it', icon: MessageCircle },
}

const labelKey = (text: string) => text.trim().replace(/:$/, '').trim().toLowerCase()
const calloutByLabel = new Map(Object.entries(callouts).map(([kind, { label }]) => [labelKey(label), kind as CalloutKind]))

const textOf = (node: MdNode): string => node.value ?? (node.children ?? []).map(textOf).join('')
const normalize = (text: string) => text.replace(/\s+/g, ' ').trim().toLowerCase()

/** Removes a leading # or ## heading that repeats the card title. */
function remarkDropTitle(options: { title?: string }) {
  return (tree: MdNode) => {
    const first = tree.children?.[0]
    if (!options.title || first?.type !== 'heading' || (first.depth ?? 9) > 2) return
    if (normalize(textOf(first)) === normalize(options.title)) tree.children!.shift()
  }
}

/** Marks `> **Key idea:** ...` blockquotes as callouts and removes the label from the text. */
function rehypeCallouts() {
  const walk = (node: MdNode) => {
    if (node.tagName === 'blockquote') markCallout(node)
    node.children?.forEach(walk)
  }
  return walk
}

function markCallout(quote: MdNode) {
  const elements = (quote.children ?? []).filter(child => child.type === 'element')
  const paragraph = elements[0]
  const strong = paragraph?.tagName === 'p' ? paragraph.children?.[0] : undefined
  if (!paragraph || strong?.tagName !== 'strong') return
  const kind = calloutByLabel.get(labelKey(textOf(strong)))
  if (!kind) return
  const rest = paragraph.children!.slice(1)
  if (rest[0]?.type === 'text') rest[0] = { ...rest[0], value: rest[0].value!.replace(/^:?\s*/, '') }
  if (rest[0]?.type === 'text' && !rest[0].value) rest.shift()
  // A label alone on its first line becomes `strong, br`; drop the line break too.
  if (rest[0]?.tagName === 'br') rest.shift()
  if (rest[0]?.type === 'text') rest[0] = { ...rest[0], value: rest[0].value!.replace(/^\s+/, '') }
  paragraph.children = rest
  if (!rest.length) quote.children = quote.children!.filter(child => child !== paragraph)
  quote.properties = { ...quote.properties, dataCallout: kind }
}

/** Allows small inline images pasted as data URLs; everything else goes through the default safe check. */
function safeUrl(url: string, key: string) {
  if (key === 'src' && /^data:image\/(png|jpeg|webp|gif);base64,[a-z0-9+/=]+$/i.test(url)) return url
  return defaultUrlTransform(url)
}

/** Plain text with `code` spans, for question prompts and choices (no other Markdown). */
export function InlineText({ text }: { text: string }) {
  return <>{text.split(/(`[^`\n]+`)/).map((part, index) => index % 2
    ? <code key={index} className="cic-inline-code">{part.slice(1, -1)}</code> : part)}</>
}

type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6

function makeComponents(headingBase: HeadingLevel): Components {
  // Markdown # and ## sit one level under the card title, ### two, deeper ones three; visual size follows the Markdown level.
  const heading = (offset: number, look: 2 | 3 | 4) => ({ children }: { children?: ReactNode }) =>
    createElement('h' + Math.min(6, headingBase + offset), { className: 'cic-md-h' + look }, children)
  return {
    h1: heading(1, 2), h2: heading(1, 2), h3: heading(2, 3), h4: heading(3, 4), h5: heading(3, 4), h6: heading(3, 4),
    p: ({ children }) => <p className="cic-md-p">{children}</p>,
    pre: ({ children }) => <pre className="cic-md-pre">{children}</pre>,
    a: ({ href, children }) => /^https?:/i.test(href ?? '')
      ? <a className="cic-md-a" href={href} target="_blank" rel="noreferrer">{children}<span className="cic-sr-only"> (opens in a new tab)</span></a>
      : <a className="cic-md-a" href={href}>{children}</a>,
    img: ({ src, alt }) => <img className="cic-md-img" src={typeof src === 'string' ? src : undefined} alt={alt || ''} loading="lazy" />,
    table: ({ children }) => <div className="cic-table-wrap" role="region" aria-label="Table" tabIndex={0}><table>{children}</table></div>,
    blockquote: ({ node, children }) => {
      const kind = node?.properties?.dataCallout as CalloutKind | undefined
      if (!kind || !callouts[kind]) return <blockquote className="cic-quote">{children}</blockquote>
      const { label, icon: Icon } = callouts[kind]
      return <div className={'cic-callout cic-callout--' + kind} role="note" aria-label={label}>
        <p className="cic-callout-label"><Icon aria-hidden="true" size={18} strokeWidth={2.25} />{label}</p>
        <div className="cic-callout-body">{children}</div>
      </div>
    },
  }
}

const componentCache = new Map<HeadingLevel, Components>()

/**
 * Styled, sanitized lesson Markdown (GitHub tables, callouts).
 * `title` is the card title shown above, so a leading heading that repeats it is dropped.
 * `headingBase` is the level of that card title, so Markdown headings nest under it.
 */
export function LessonMarkdown({ markdown, title, headingBase = 3 }: { markdown: string; title?: string; headingBase?: HeadingLevel }) {
  let components = componentCache.get(headingBase)
  if (!components) componentCache.set(headingBase, components = makeComponents(headingBase))
  return <div className="cic-prose">
    <Markdown skipHtml urlTransform={safeUrl} components={components}
      remarkPlugins={[remarkGfm, [remarkDropTitle, { title }]]} rehypePlugins={[rehypeCallouts]}>{markdown}</Markdown>
  </div>
}
