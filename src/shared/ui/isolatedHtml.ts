import { parse, parseFragment, serialize, type DefaultTreeAdapterTypes } from 'parse5'

export const maxHtmlBytes = 256 * 1024
const removedTags = new Set(['base', 'link', 'iframe', 'frame', 'frameset', 'object', 'embed', 'portal', 'fencedframe'])

export function isolatedHtml(source: string, scripts: boolean, css = '') {
  const document = parse(source)
  const root = document.childNodes.find(node => node.nodeName === 'html') as DefaultTreeAdapterTypes.Element
  const head = root.childNodes.find(node => node.nodeName === 'head') as DefaultTreeAdapterTypes.Element
  const policy = [
    "default-src 'none'", "connect-src 'none'", "form-action 'none'", "base-uri 'none'",
    "object-src 'none'", "frame-src 'none'", "worker-src 'none'", "img-src data:",
    "media-src data:", "font-src data:", "style-src 'unsafe-inline'",
    scripts ? "script-src 'unsafe-inline'" : "script-src 'none'",
  ].join('; ')
  const settings = parseFragment(
    '<meta http-equiv="Content-Security-Policy" content="' + policy + '">' +
    '<meta name="referrer" content="no-referrer"><meta name="viewport" content="width=device-width, initial-scale=1">',
  )

  function strip(node: DefaultTreeAdapterTypes.ParentNode) {
    node.childNodes = node.childNodes.filter(child => {
      if (!('tagName' in child)) return true
      if (removedTags.has(child.tagName) || (!scripts && child.tagName === 'script')) return false
      if (child.tagName === 'meta' && child.attrs.some(attr => attr.name === 'http-equiv')) return false
      if (child.tagName === 'a' || child.tagName === 'area') {
        child.attrs = child.attrs.filter(attr => !['href', 'target', 'ping', 'download'].includes(attr.name))
      }
      strip(child)
      if ('content' in child) strip((child as DefaultTreeAdapterTypes.Template).content)
      return true
    })
  }

  strip(root)
  head.childNodes.unshift(...settings.childNodes)
  if (css) {
    const style = parseFragment('<style></style>').childNodes[0] as DefaultTreeAdapterTypes.Element
    style.childNodes.push({ nodeName: '#text', value: css.replace(/<\/style/gi, '<\\/style'), parentNode: style })
    head.childNodes.push(style)
  }
  return serialize(document)
}

export function readCompletion(data: unknown): { score?: number } | null {
  if (typeof data !== 'object' || data === null || !('type' in data) || data.type !== 'cic:complete') return null
  if (!('score' in data) || data.score === undefined) return {}
  return typeof data.score === 'number' && Number.isFinite(data.score) && data.score >= 0 && data.score <= 1
    ? { score: data.score }
    : null
}
