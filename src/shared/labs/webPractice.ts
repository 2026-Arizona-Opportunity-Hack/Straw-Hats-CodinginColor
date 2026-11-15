import { parse, type DefaultTreeAdapterTypes } from 'parse5'
import type { LabCheck } from '../types/activities.ts'
import { isolatedHtml } from '../ui/isolatedHtml.ts'
import type { CheckResult } from './checks.ts'

export function linkedStylesheet(source: string) {
  const root = parse(source).childNodes.find(node => node.nodeName === 'html') as DefaultTreeAdapterTypes.Element
  const head = root.childNodes.find(node => node.nodeName === 'head') as DefaultTreeAdapterTypes.Element
  return head.childNodes.some(node => 'tagName' in node && node.tagName === 'link'
    && node.attrs.some(attr => attr.name === 'rel' && attr.value.toLowerCase().split(/\s+/).includes('stylesheet'))
    && node.attrs.some(attr => attr.name === 'href' && attr.value === 'styles.css'))
}

function checkRendered(frame: HTMLIFrameElement, checks: LabCheck[], linked: boolean): CheckResult[] {
  const page = frame.contentDocument
  if (!page?.defaultView) throw new Error('Could not open the lab preview.')
  const usedSheet = linked ? page.head.querySelector<HTMLStyleElement>('style:last-of-type')?.sheet : null
  const rules = [...(usedSheet?.cssRules ?? [])].filter((rule): rule is CSSStyleRule => rule.type === CSSRule.STYLE_RULE)
  const computed = (element: Element) => page.defaultView!.getComputedStyle(element)
  return checks.map(check => {
    let passed = false
    try {
      if (check.kind === 'stylesheet') passed = rules.length > 0
      else {
        const elements = page.querySelectorAll(check.selector ?? '')
        const element = elements[0]
        if (element && elements.length === 1) {
          if (check.kind === 'text') passed = !check.expected || element.textContent?.trim() === check.expected
          if (check.kind === 'padding') {
            const style = computed(element)
            passed = [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft].every(value => value === check.expected)
          }
          if (check.kind === 'color') {
            const other = check.compare && page.querySelector(check.compare)
            passed = rules.some(rule => rule.selectorText === check.selector) && computed(element).color === check.expected
              && (!check.compare || (!!other && computed(other).color !== check.expected))
          }
        }
      }
    } catch { /* Invalid selectors fail only their own practice check. */ }
    return { name: check.name, passed, detail: passed ? undefined : check.hint }
  })
}

export function checkWebPractice(source: string, css: string, checks: LabCheck[], signal: AbortSignal) {
  const linked = !!css.trim() && linkedStylesheet(source)
  const loadSignal = AbortSignal.any([signal, AbortSignal.timeout(8000)])
  return new Promise<CheckResult[]>((resolve, reject) => {
    loadSignal.throwIfAborted()
    const frame = document.createElement('iframe')
    // Same-origin access is used only for computed styles. This hidden frame has scripts disabled.
    frame.setAttribute('sandbox', 'allow-same-origin')
    frame.setAttribute('aria-hidden', 'true')
    frame.inert = true
    frame.tabIndex = -1
    frame.style.cssText = 'position:fixed;left:-10000px;width:360px;height:320px;visibility:hidden'
    function cleanup() {
      loadSignal.removeEventListener('abort', abort)
      frame.remove()
    }
    function abort() {
      cleanup()
      reject(loadSignal.reason)
    }
    frame.onload = () => {
      try { resolve(checkRendered(frame, checks, linked)) } catch (error) { reject(error) } finally { cleanup() }
    }
    loadSignal.addEventListener('abort', abort, { once: true })
    frame.srcdoc = isolatedHtml(source, false, linked ? css : '', false)
    document.body.append(frame)
  })
}
