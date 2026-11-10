const http = require('node:http');
const https = require('node:https');

const TARGET = 'https://himoto.vercel.app';
const PORT = 8082;

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, TARGET);
  const options = {
    hostname: url.hostname,
    port: 443,
    path: url.pathname + url.search,
    method: req.method,
    headers: { ...req.headers, host: url.hostname },
  };
  delete options.headers.origin;
  delete options.headers.referer;

  const proxyReq = https.request(options, (proxyRes) => {
    const headers = { ...proxyRes.headers, 'access-control-allow-origin': '*' };
    res.writeHead(proxyRes.statusCode, headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    res.writeHead(502, { 'Content-Type': 'application/json', 'access-control-allow-origin': '*' });
    res.end(JSON.stringify({ message: err.message, code: 'PROXY_ERROR' }));
  });

  req.pipe(proxyReq);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[Dev Mobile Proxy] Running on http://127.0.0.1:${PORT} -> ${TARGET}`);
});
