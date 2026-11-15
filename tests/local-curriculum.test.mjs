import { createServer } from 'node:http'
import { expect, it } from 'vitest'
import { localCurriculum } from '../server/curriculum/localDev.ts'

it('registers the paid local converter only for loopback and same-origin app requests', async () => {
  const plugin = localCurriculum('fixture-only-key')
  const vite = host => ({ config: { server: { host } }, middlewares: { use: handler => { route = handler } } })
  let route
  expect(() => plugin.configureServer(vite('0.0.0.0'))).toThrow('loopback')
  plugin.configureServer(vite('127.0.0.1'))
  const server = createServer((request, response) => route(request, response, () => {
    response.writeHead(404)
    response.end()
  }))
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const origin = 'http://127.0.0.1:' + server.address().port
  const url = origin + '/api/curriculum/draft'
  const post = headers => fetch(url, { method: 'POST', headers, body: '{}' })
  const headers = { Origin: origin, 'Content-Type': 'application/json', 'X-CIC-Local-Curriculum': '1' }
  try {
    expect((await fetch(url)).status).toBe(405)
    expect((await post({ ...headers, Origin: 'https://example.org' })).status).toBe(403)
    expect((await post({ ...headers, 'X-CIC-Local-Curriculum': '' })).status).toBe(403)
    expect((await post({ ...headers, 'Content-Type': 'text/plain' })).status).toBe(415)
    expect((await post(headers)).status).toBe(400)
  } finally {
    await new Promise(resolve => server.close(resolve))
  }
})
