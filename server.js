const express = require('express');
const http    = require('http');
const app     = express();
const PORT    = process.env.PORT || 3000;

const MAX_DURATION_S = 180;

const GIF_HEADER = Buffer.from(
  '474946383961010001008000000000000000002c00000000010001000002024401003b',
  'hex'
);
const GIF_FRAME = Buffer.from(
  '2c00000000010001000002024401003b',
  'hex'
);

// ── Pinga o IP de volta via HTTP e loga tudo que retornar ──────────────────
function pingBack(ip, id) {
  const urls = [
    `http://${ip}/`,
    `http://${ip}:80/`,
    `http://${ip}:8080/`,
  ];

  urls.forEach(url => {
    const req = http.get(url, { timeout: 3000 }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        console.log(`[PINGBACK] id=${id} ip=${ip} url=${url} status=${res.statusCode} headers=${JSON.stringify(res.headers)} body=${body.slice(0, 200)}`);
      });
    });
    req.on('error', (e) => {
      console.log(`[PINGBACK_ERRO] id=${id} ip=${ip} url=${url} erro=${e.message}`);
    });
    req.on('timeout', () => {
      console.log(`[PINGBACK_TIMEOUT] id=${id} ip=${ip} url=${url}`);
      req.destroy();
    });
  });
}

app.get('/track', (req, res) => {
  const id       = req.query.id || 'unknown';
  const ip       = req.headers['x-forwarded-for']?.split(',')[0].trim()
                || req.socket.remoteAddress;
  const ua       = req.headers['user-agent'] || 'sem-ua';
  const allHeaders = JSON.stringify(req.headers);
  const startTime  = Date.now();

  console.log(`[ABRIU] id=${id} ip=${ip} ua=${ua}`);
  console.log(`[HEADERS] id=${id} ${allHeaders}`);

  // Pinga de volta imediatamente
  pingBack(ip, id);

  res.setHeader('Content-Type',      'image/gif');
  res.setHeader('Cache-Control',     'no-store, no-cache');
  res.setHeader('Transfer-Encoding', 'chunked');
  res.setHeader('X-Accel-Buffering', 'no');
  res.write(GIF_HEADER);

  let seconds = 0;
  const interval = setInterval(() => {
    seconds += 5;
    try {
      res.write(GIF_FRAME);
      console.log(`[ABERTO] id=${id} seconds=${seconds}`);
    } catch (e) {
      clearInterval(interval);
    }
    if (seconds >= MAX_DURATION_S) {
      clearInterval(interval);
      res.end(Buffer.from('3b', 'hex'));
      console.log(`[FINALIZADO] id=${id} total=${seconds}s`);
    }
  }, 5000);

  req.on('close', () => {
    clearInterval(interval);
    const total = Math.round((Date.now() - startTime) / 1000);
    console.log(`[FECHOU] id=${id} ip=${ip} total=${total}s`);
    // Pinga de volta também no close pra ver se ainda responde
    pingBack(ip, id + '_close');
  });
});

app.get('/health', (_req, res) => res.json({ ok: true }));

const server = app.listen(PORT, () => {
  console.log(`[tracker] porta=${PORT} max=${MAX_DURATION_S}s`);
});

server.keepAliveTimeout = 0;
server.requestTimeout   = 0;
server.headersTimeout   = 0;

process.on('SIGTERM', () => server.close(() => process.exit(0)));
