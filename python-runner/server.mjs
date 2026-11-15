import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'

const assets = new Map([
  ['/', ['index.html', 'text/html']],
  ['/bridge.mjs', ['bridge.mjs', 'text/javascript']],
  ['/worker.mjs', ['worker.mjs', 'text/javascript']],
  ...[
    ['pyodide.mjs', 'text/javascript'], ['pyodide.asm.mjs', 'text/javascript'],
    ['pyodide.asm.wasm', 'application/wasm'], ['pyodide-lock.json', 'application/json'],
    ['python_stdlib.zip', 'application/zip'],
  ].map(([name, type]) => ['/runtime/' + name, ['../node_modules/pyodide/' + name, type]]),
])
const allowedParents = [5173, 5176, 4173, 4176].flatMap(port => [`http://localhost:${port}`, `http://127.0.0.1:${port}`])

createServer(async (request, response) => {
  const file = request.method === 'GET' && assets.get(request.url)
  if (!file) { response.writeHead(404).end(); return }
  const [path, contentType] = file
  const isWorker = path === 'worker.mjs'
  try {
    const body = await readFile(new URL(path, import.meta.url))
    response.writeHead(200, {
      'Content-Type': contentType,
      'Content-Security-Policy': [
        "default-src 'none'", "base-uri 'none'", "form-action 'none'", "object-src 'none'",
        isWorker ? "script-src 'self' 'wasm-unsafe-eval'" : "script-src 'self'",
        isWorker ? "connect-src 'self'" : "connect-src 'none'",
        isWorker ? "worker-src 'none'" : "worker-src 'self'",
        'frame-ancestors ' + allowedParents.join(' '),
      ].join('; '),
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
      'Cache-Control': path.startsWith('../') ? 'public, max-age=3600' : 'no-store',
    }).end(body)
  } catch {
    response.writeHead(500).end('Python runner assets are missing. Run npm ci.')
  }
}).listen(5178, '127.0.0.1', () => console.log('CIC Python runner: http://127.0.0.1:5178'))
