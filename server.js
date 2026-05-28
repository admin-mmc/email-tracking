const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// GIF 1x1 transparente — header válido SEM trailer (3b), pois vamos
// manter a conexão aberta enviando frames adicionais
const GIF_HEADER = Buffer.from(
  '47494638396101000100800000' +
  'ffffff000000' +          // paleta: branco + preto
  '21f90401000000002c00000000010001000002024401',
  'hex'
);

// Frame mínimo válido — enviado periodicamente para manter a conexão viva
// e detectar o close rapidamente
const GIF_FRAME = Buffer.from('2c00000000010001000002024401', 'hex');

// Trailer do GIF — só enviado quando o servidor encerra limpo
const GIF_TRAILER = Buffer.from('3b', 'hex');

const FRAME_INTERVAL_MS = 1000; // frame a cada 1s — detecta close em até 1s
const MAX_DURATION_MS   = 60_000;

function log(event, id, extra = '') {
  console.log(`[${new Date().toISOString()}] [${event}] id=${id} ${extra}`);
}

app.get('/track', (req, res) => {
  const id        = req.query.id || 'unknown';
  const startTime = Date.now();
  let   finished  = false;

  log('ABRIU', id);

  // ── Headers anti-buffer ────────────────────────────────────────────────────
  // X-Accel-Buffering: no  →  desliga buffer do nginx/Traefik para esta rota
  res.setHeader('Content-Type',        'image/gif');
  res.setHeader('Cache-Control',       'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma',              'no-cache');
  res.setHeader('Expires',             '0');
  res.setHeader('Transfer-Encoding',   'chunked');
  res.setHeader('Connection',          'keep-alive');
  res.setHeader('X-Accel-Buffering',   'no');   // ← chave pro Traefik/nginx
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.flushHeaders(); // envia headers imediatamente, sem esperar body

  res.write(GIF_HEADER);

  // ── Encerramento idempotente ───────────────────────────────────────────────
  const finish = (reason) => {
    if (finished) return;
    finished = true;
    clearInterval(interval);
    clearTimeout(maxTimer);

    const total = Math.round((Date.now() - startTime) / 1000);
    log(reason === 'timeout' ? 'FINALIZADO' : 'FECHOU', id,
        `total=${total}s motivo=${reason}`);

    if (reason === 'timeout') {
      try { res.end(GIF_TRAILER); } catch (_) {}
    } else {
      try { res.destroy(); } catch (_) {}
    }
  };

  // ── Timeout máximo ─────────────────────────────────────────────────────────
  const maxTimer = setTimeout(() => finish('timeout'), MAX_DURATION_MS);

  // ── Frames periódicos ──────────────────────────────────────────────────────
  let elapsed = 0;
  const interval = setInterval(() => {
    elapsed += FRAME_INTERVAL_MS;

    // Checa socket antes de escrever
    if (finished || res.destroyed || res.socket?.destroyed) {
      finish('socket_morto');
      return;
    }

    const ok = res.write(GIF_FRAME);
    if (!ok) {
      finish('backpressure'); // cliente parou de ler
      return;
    }

    if (elapsed % 10_000 === 0) {
      log('ABERTO', id, `${elapsed / 1000}s`);
    }
  }, FRAME_INTERVAL_MS);

  // ── Detecção de close ──────────────────────────────────────────────────────
  req.on('close',  () => finish(res.writableEnded ? 'server_end' : 'cliente_fechou'));
  res.on('error',  () => finish('res_error'));
  req.socket?.on('error', () => finish('socket_error'));
});

app.get('/health', (_req, res) => res.json({ ok: true, uptime: process.uptime() }));

// ── Servidor ───────────────────────────────────────────────────────────────
const server = app.listen(PORT, () => {
  console.log(`[tracker] porta=${PORT} frame=${FRAME_INTERVAL_MS}ms max=${MAX_DURATION_MS/1000}s`);
});

server.keepAliveTimeout = 0;
server.requestTimeout   = 0;
server.headersTimeout   = 0;

process.on('SIGTERM', () => server.close(() => process.exit(0)));
