type HtmlNode = {
  nodeName: string
  namespaceURI?: string
  value?: string
  attrs?: { name: string; value: string }[]
  childNodes?: HtmlNode[]
}

const skip = new Set(['head', 'script', 'style', 'template', 'noscript'])
function text(root: HtmlNode) {
  const parts: string[] = []
  const pending = [root]
  while (pending.length) {
    const node = pending.pop()!
    if (skip.has(node.nodeName) || node.attrs?.some(attr => attr.name === 'hidden')) continue
    if (node.nodeName === '#text') parts.push(node.value ?? '')
    const children = node.childNodes ?? []
    for (let i = children.length - 1; i >= 0; i--) pending.push(children[i])
  }
  return parts.join('')
}

export function catPhotoElements(root: HtmlNode) {
  const result: HtmlNode[] = []
  const pending = [root]
  while (pending.length) {
    const node = pending.pop()!
    if (skip.has(node.nodeName) || node.attrs?.some(attr => attr.name === 'hidden')) continue
    if (node.namespaceURI === 'http://www.w3.org/1999/xhtml') result.push(node)
    if (node.childNodes) for (const child of node.childNodes) pending.push(child)
  }
  return result
}

export function catPhotoChecks(root: HtmlNode) {
  const nodes = catPhotoElements(root)
  const has = (tag: string, predicate: (node: HtmlNode) => boolean) =>
    nodes.some(node => node.nodeName === tag && predicate(node))
  const check = (name: string, passed: boolean, detail: string) => ({ name, passed, detail: passed ? undefined : detail })
  return [
    check('Page heading', has('h1', node => /^cat\s*photo\s*app$/i.test(text(node).trim())), 'Put Cat Photo App inside an h1 element.'),
    check('Cat introduction', has('p', node => !!text(node).trim()), 'Write a sentence about your cat inside a p element.'),
    check('Photo description', has('img', node =>
      node.attrs?.some(attr => attr.name === 'src' && attr.value === 'cat.jpg') === true &&
      node.attrs.some(attr => attr.name === 'alt' && !!attr.value.trim())), 'Use cat.jpg and describe the photo in the alt attribute.'),
  ]
}
