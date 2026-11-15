import { loadPyodide } from '/runtime/pyodide.mjs'

const runtime = await loadPyodide({
  indexURL: '/runtime/',
  jsglobals: Object.create(null),
})

self.onmessage = async ({ data: source }) => {
  let stdout = ''
  let stderr = ''
  const append = (text, line, limit) => (text + line + '\n').slice(0, limit)
  runtime.setStdout({ batched: line => { stdout = append(stdout, line, 16_000) } })
  runtime.setStderr({ batched: line => { stderr = append(stderr, line, 4000) } })
  let error
  try {
    const result = await runtime.runPythonAsync(source)
    result?.destroy?.()
  } catch (failure) {
    error = String(failure).slice(0, 4000)
  }
  self.postMessage({ type: 'result', stdout, error: error || stderr || undefined })
}
self.postMessage({ type: 'ready' })
