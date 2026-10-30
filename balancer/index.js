import http from 'node:http'

const servers = process.env.SERVERS.split(',').map((url) => ({ url, alive: false }))
let next = 0

async function checkServers() {
  for (const server of servers) {
    try {
      const res = await fetch(server.url + '/api/health', { signal: AbortSignal.timeout(2000) })
      server.alive = res.ok
    } catch {
      server.alive = false
    }
  }
}

function pickServer() {
  for (let i = 0; i < servers.length; i++) {
    const server = servers[next]
    next = (next + 1) % servers.length
    if (server.alive) return server
  }
  return null
}

http
  .createServer((req, res) => {
    const server = pickServer()
    if (!server) {
      res.writeHead(503, { 'Content-Type': 'application/json' })
      return res.end(JSON.stringify({ error: 'No servers available, try again later' }))
    }

    const proxyReq = http.request(server.url + req.url, { method: req.method, headers: req.headers }, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers)
      proxyRes.pipe(res)
    })

    proxyReq.on('error', () => {
      server.alive = false
      res.writeHead(502, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Server is not responding, try again' }))
    })

    req.pipe(proxyReq)
  })
  .listen(8080, () => console.log('Load balancer started on port 8080, servers: ' + process.env.SERVERS))

checkServers()
setInterval(checkServers, 2000)
