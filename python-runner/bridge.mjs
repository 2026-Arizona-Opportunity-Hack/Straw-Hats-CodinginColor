const parents = new Set([5173, 5176, 4173, 4176].flatMap(port => [`http://localhost:${port}`, `http://127.0.0.1:${port}`]))
let worker
let startup
let timeout
let accepted = false

function tell(origin, body) {
  window.parent.postMessage(body, origin)
}

window.addEventListener('message', event => {
  if (accepted || event.source !== window.parent || !parents.has(event.origin)) return
  const { type, run, code } = event.data ?? {}
  if (type !== 'cic:python-run' || typeof run !== 'string' || typeof code !== 'string' || code.length > 48_000) return
  accepted = true
  const send = body => tell(event.origin, { ...body, run })
  const finish = body => {
    worker?.terminate()
    clearTimeout(startup)
    clearTimeout(timeout)
    send({ type: 'cic:python-result', ...body })
  }
  worker = new Worker('/worker.mjs', { type: 'module' })
  startup = setTimeout(() => finish({ error: 'Python could not load. Try again.' }), 30_000)
  worker.onerror = () => finish({ error: 'Python could not start. Try restarting the local runner.' })
  worker.onmessage = ({ data }) => {
    if (data?.type === 'ready') {
      clearTimeout(startup)
      send({ type: 'cic:python-started' })
      timeout = setTimeout(() => finish({ error: 'Execution stopped after 5 seconds.' }), 5000)
      worker.postMessage(code)
    } else if (data?.type === 'result') {
      finish({ stdout: typeof data.stdout === 'string' ? data.stdout.slice(0, 16_000) : '', error: typeof data.error === 'string' ? data.error.slice(0, 4000) : undefined })
    }
  }
})
