import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { isolatedHtml, readFrameCompletion, readFrameHeight } from './isolatedHtml.ts'
import './lesson.css'

interface Props {
  html: string
  css?: string
  title: string
  allowScripts?: boolean
  onComplete?: (score: number | undefined) => void
  /** Starting height; the frame then grows or shrinks to fit the page so it never scrolls inside. */
  height?: number
  /** Wraps the frame in a small browser-window look, used on lesson cards. */
  device?: boolean
}

export function InteractiveHtmlFrame({ html, css, title, allowScripts = false, onComplete, height = 640, device = false }: Props) {
  const srcDoc = useMemo(() => isolatedHtml(html, allowScripts, css), [html, css, allowScripts])
  // A new document needs a new browsing context so late messages from a prior run are rejected.
  const frame = <IsolatedFrame key={srcDoc} srcDoc={srcDoc} title={title} allowScripts={allowScripts} onComplete={onComplete} height={height} />
  if (!device) return frame
  return <div className="cic-device">
    <div className="cic-device-bar" aria-hidden="true">
      <span className="cic-device-dot" /><span className="cic-device-dot" /><span className="cic-device-dot" />
      <span className="cic-device-title">{title}</span>
    </div>
    {frame}
  </div>
}

function IsolatedFrame({ srcDoc, title, allowScripts, onComplete, height }: {
  srcDoc: string; title: string; allowScripts: boolean; height: number; onComplete?: Props['onComplete']
}) {
  const frame = useRef<HTMLIFrameElement>(null)
  const completed = useRef(false)
  const [fitted, setFitted] = useState<number | null>(null)

  useLayoutEffect(() => {
    function resize(event: MessageEvent) {
      const next = readFrameHeight(event, frame.current?.contentWindow)
      if (next !== null) setFitted(next)
    }
    window.addEventListener('message', resize)
    return () => window.removeEventListener('message', resize)
  }, [])

  useLayoutEffect(() => {
    if (!onComplete || !allowScripts) return
    function receive(event: MessageEvent) {
      if (completed.current) return
      const result = readFrameCompletion(event, frame.current?.contentWindow)
      if (!result) return
      completed.current = true
      onComplete?.(result.score)
    }
    window.addEventListener('message', receive)
    return () => window.removeEventListener('message', receive)
  }, [allowScripts, onComplete])

  return <iframe ref={frame} title={title} srcDoc={srcDoc} sandbox="allow-scripts"
    referrerPolicy="no-referrer" allow="camera 'none'; microphone 'none'; geolocation 'none'; payment 'none'; clipboard-read 'none'; clipboard-write 'none'"
    className="w-full rounded-lg border border-slate-300 bg-white" style={{ width: '100%', height: fitted ?? height, display: 'block' }} />
}
