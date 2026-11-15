export function articleHeadings(markdown: string) {
  let fence = ''
  return markdown.split('\n').flatMap((line, index) => {
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1]
    if (marker) {
      if (!fence) fence = marker
      else if (marker[0] === fence[0] && marker.length >= fence.length) fence = ''
      return []
    }
    const text = !fence && /^ {0,3}##\s+(.+?)\s*#*\s*$/.exec(line)?.[1]
    return text ? [{ text, line: index + 1 }] : []
  })
}
