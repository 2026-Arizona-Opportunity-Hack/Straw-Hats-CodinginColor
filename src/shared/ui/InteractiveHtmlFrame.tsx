import { useEffect, useRef } from 'react'
import type { InteractiveCompleteMessage } from '../types/activities.ts'

interface Props {
  html: string
  title: string
  /** Called when the page posts { type: 'cic:complete', score }. */
  onComplete?: (score: number | undefined) => void
  height?: number
}

/**
 * Renders instructor-authored HTML.
 *
 * SECURITY: the sandbox deliberately omits `allow-same-origin`, so the page runs
 * in an opaque origin. It can run scripts and load CDN libraries, but it cannot
 * read the app's cookies, localStorage, Supabase session or DOM. Do not add
 * `allow-same-origin` or `allow-top-navigation`: together with `allow-scripts`
 * that removes the sandbox entirely.
 */
export function InteractiveHtmlFrame({ html, title, onComplete, height = 480 }: Props) {
  const frameRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      // Only accept messages from this exact frame. Origin is "null" for sandboxed frames.
      if (event.source !== frameRef.current?.contentWindow) return
      const data = event.data as Partial<InteractiveCompleteMessage> | null
      if (data?.type !== 'cic:complete') return
      const score =
        typeof data.score === 'number' && data.score >= 0 && data.score <= 1 ? data.score : undefined
      onComplete?.(score)
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [onComplete])

  return (
    <iframe
      ref={frameRef}
      title={title}
      srcDoc={html}
      sandbox="allow-scripts allow-forms"
      referrerPolicy="no-referrer"
      className="w-full rounded-lg border border-slate-300 bg-white"
      style={{ height }}
    />
  )
}
