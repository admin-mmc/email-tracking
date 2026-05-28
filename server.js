const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// GIF 1x1 completo e válido — resposta instantânea, sem streaming
const GIF_STATIC = Buffer.from(
  '47494638396101000100800000ffffff000000' +
  '21f90400000000002c00000000010001000002024401003b',
  'hex'
);

function log(event, id, extra = '') {
  console.log(`[${new Date().toISOString()}] [${event}] id=${id} ${extra}`);
}

// ── Rota 1: pixel de abertura — responde imediatamente ─────────────────────
app.get('/open', (req, res) => {
  const id = req.query.id || 'unknown';
  log('ABRIU', id);
  res.setHeader('Content-Type',  'image/gif');
  res.setHeader('Cache-Control', 'no-store, no-cache');
  res.setHeader('X-Accel-Buffering', 'no');
  res.end(GIF_STATIC);
});

// ── Rota 2: pixel de fim — recusa a conexão (não responde) ─────────────────
// Se o Google buscou essa URL, chegou ao fim do HTML
app.get('/end', (req, res) => {
  const id = req.query.id || 'unknown';
  log('CHEGOU_FIM', id);
  // Responde também com GIF válido pra não quebrar o email
  // mas loga que chegou até aqui
  res.setHeader('Content-Type',  'image/gif');
  res.setHeader('Cache-Control', 'no-store, no-cache');
  res.setHeader('X-Accel-Buffering', 'no');
  res.end(GIF_STATIC);
});

// ── Rota 3: pixel de seção — uma por seção do email ────────────────────────
app.get('/section', (req, res) => {
  const id  = req.query.id  || 'unknown';
  const sec = req.query.sec || '?';
  log('SECAO', id, `sec=${sec}`);
  res.setHeader('Content-Type',  'image/gif');
  res.setHeader('Cache-Control', 'no-store, no-cache');
  res.setHeader('X-Accel-Buffering', 'no');
  res.end(GIF_STATIC);
});

app.get('/health', (_req, res) => res.json({ ok: true }));

const server = app.listen(PORT, () => {
  console.log(`[tracker] porta=${PORT}`);
});

server.keepAliveTimeout = 0;
server.requestTimeout   = 0;
server.headersTimeout   = 0;

process.on('SIGTERM', () => server.close(() => process.exit(0)));
