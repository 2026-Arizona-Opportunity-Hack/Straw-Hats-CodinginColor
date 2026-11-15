import { parse, parseFragment, serialize, type DefaultTreeAdapterTypes } from 'parse5'

export const maxHtmlBytes = 256 * 1024
// The platform's own script: it reports the page height so the frame can grow to fit and
// never scrolls inside. When authored scripts are off, the policy allows only this exact
// script (by its sha256), so authored <script> tags and inline handlers still never run.
export const heightScript = '(function(){var last=0;function send(){var d=document.documentElement,b=document.body,h=Math.ceil(Math.max(d.scrollHeight,b?b.scrollHeight:0));if(Math.abs(h-last)>1){last=h;parent.postMessage({type:"cic:height",height:h},"*")}}function start(){var o=new ResizeObserver(send);o.observe(document.documentElement);if(document.body)o.observe(document.body);send()}if(document.readyState==="loading")addEventListener("DOMContentLoaded",start);else start();addEventListener("load",send)})()'
export const heightScriptHash = 'sha256-RJQpmkRfUOuGA5LHz7bd5FO2TOs8vnXYT+7DYR9FlhA='
const removedTags = new Set(['base', 'link', 'iframe', 'frame', 'frameset', 'object', 'embed', 'portal', 'fencedframe'])

export function isolatedHtml(source: string, scripts: boolean, css = '') {
  const document = parse(source)
  const root = document.childNodes.find(node => node.nodeName === 'html') as DefaultTreeAdapterTypes.Element
  const head = root.childNodes.find(node => node.nodeName === 'head') as DefaultTreeAdapterTypes.Element
  const policy = [
    "default-src 'none'", "connect-src 'none'", "form-action 'none'", "base-uri 'none'",
    "object-src 'none'", "frame-src 'none'", "worker-src 'none'", "img-src data:",
    "media-src data:", "font-src data:", "style-src 'unsafe-inline'",
    scripts ? "script-src 'unsafe-inline'" : "script-src '" + heightScriptHash + "'",
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
  const height = parseFragment('<script></script>').childNodes[0] as DefaultTreeAdapterTypes.Element
  height.childNodes.push({ nodeName: '#text', value: heightScript, parentNode: height })
  head.childNodes.unshift(...settings.childNodes, height)
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

/** Height reported by the platform script in the active frame, clamped to a sane range. */
export function readFrameHeight(event: Pick<MessageEvent, 'source' | 'origin' | 'data'>, active: Window | null | undefined) {
  const data = event.data as { type?: unknown; height?: unknown } | null
  if (!active || event.source !== active || event.origin !== 'null' || data?.type !== 'cic:height') return null
  return typeof data.height === 'number' && Number.isFinite(data.height) ? Math.min(Math.max(Math.ceil(data.height), 120), 6000) : null
}

export function readFrameCompletion(event: Pick<MessageEvent, 'source' | 'origin' | 'data'>, active: Window | null | undefined) {
  return active && event.source === active && event.origin === 'null' ? readCompletion(event.data) : null
}
