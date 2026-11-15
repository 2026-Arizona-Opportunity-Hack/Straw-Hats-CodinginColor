export type PythonResult = { stdout: string; error?: string }

export function runPython(code: string, signal: AbortSignal, onStart: () => void): Promise<PythonResult> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException('Stopped', 'AbortError'))
    // Cookies are scoped by host, so using only a different port would share them.
    const runnerHost = window.location.hostname === '127.0.0.1' ? 'localhost' : '127.0.0.1'
    const runnerOrigin = 'http://' + runnerHost + ':5178'
    const run = crypto.randomUUID()
    const frame = document.createElement('iframe')
    frame.title = 'Python execution runtime'
    frame.hidden = true
    frame.sandbox.add('allow-scripts', 'allow-same-origin')
    frame.referrerPolicy = 'no-referrer'
    const finish = (result?: PythonResult) => {
      clearTimeout(timer)
      window.removeEventListener('message', receive)
      signal.removeEventListener('abort', stop)
      frame.remove()
      if (result) resolve(result)
      else reject(new DOMException('Stopped', 'AbortError'))
    }
    const stop = () => finish()
    let sent = false
    function requestRun() {
      if (sent || !frame.contentWindow) return
      sent = true
      frame.contentWindow.postMessage({ type: 'cic:python-run', run, code }, runnerOrigin)
    }
    function receive(event: MessageEvent) {
      if (event.origin !== runnerOrigin || event.source !== frame.contentWindow) return
      const { type, run: responseRun, stdout, error } = event.data ?? {}
      if (responseRun !== run) return
      if (type === 'cic:python-started') onStart()
      if (type === 'cic:python-result') finish({
        stdout: typeof stdout === 'string' ? stdout.slice(0, 16_000) : '',
        error: typeof error === 'string' ? error.slice(0, 4000) : undefined,
      })
    }
    const timer = window.setTimeout(() => finish({ stdout: '', error: 'Python runner unavailable. Start it with npm run dev:runner and retry.' }), 37_000)
    window.addEventListener('message', receive)
    signal.addEventListener('abort', stop, { once: true })
    // A load event is enough to initialize the listener. No referrer or identity is required.
    frame.addEventListener('load', requestRun, { once: true })
    frame.src = runnerOrigin + '/'
    document.body.append(frame)
  })
}
