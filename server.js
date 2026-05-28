const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// GIF89a 1x1 header com loop infinito
const GIF_HEADER = Buffer.from(
  '474946383961' + // GIF89a
  '0100 0100'    + // 1x1
  '80 00 00'     + // GCT flag, background, pixel aspect
  'ffffff'       + // cor 0: branco
  '000000'       + // cor 1: preto
  '21ff0b'       + // Application Extension (NETSCAPE — loop)
  '4e45545343415045322e30' + // "NETSCAPE2.0"
  '03 01 0000 00', // loop infinito
  'hex'
);

// Frame 1x1 transparente com delay 500ms (0x32 0x00 = 50 centésimos = 500ms)
// Pode ajustar: 0x0a 0x00 = 100ms, 0x14 0x00 = 200ms
const makeFrame = (delayCs = 50) => {
  const delayLo = delayCs & 0xff;
  const delayHi = (delayCs >> 8) & 0xff;
  return Buffer.from(
    '21f904'               + // Graphic Control Extension
    `04 00 ${delayLo.toString(16).padStart(2,'0')} ${delayHi.toString(16).padStart(2,'0')} 00 00` +
    '2c 00000000 01000100 00' + // Image descriptor 1x1
    '02 02 4c 01 00',           // LZW image data mínimo
    'hex'
  );
};

const GIF_TRAILER = Buffer.from('3b', 'hex');

// Delay entre frames em ms — quanto menor, mais rápido detecta o close
// 500ms é bom equilíbrio: detecta fechar em até 500ms, sem flood de logs
const FRAME_INTERVAL_MS = 500;

// Tempo máximo de rastreamento
const MAX_DURATION_MS = 60_000;

// Frame pré-computado
const GIF_FRAME = makeFrame(FRAME_INTERVAL_MS / 10); // centésimos de segundo

// Estado por ID (opcional — útil para deduplicar re-aberturas)
const sessions = new Map();

function logEvent(event, id, extra = '') {
  const ts = new Date().toISOString();
  console.log(`[${ts}] [${event.padEnd(10)}] id=${id} ${extra}`);
}

app.get('/track', (req, res) => {
  const id = req.query.id || 'unknown';
  const startTime = Date.now();
  let closed = false;
  let closeReason = 'timeout'; // default: estouro de tempo

  logEvent('ABRIU', id);

  // Headers que evitam qualquer buffering intermediário
  res.setHeader('Content-Type', 'image/gif');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Transfer-Encoding', 'chunked');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');   // nginx
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.flushHeaders();

  // Escreve o header do GIF
  if (!res.write(GIF_HEADER)) {
    // backpressure imediata — cliente já fechou
    logEvent('ERRO_WRITE', id, 'header rejeitado');
    return;
  }

  // ─── Função de encerramento ────────────────────────────────────────────────
  const finish = (reason) => {
    if (closed) return;   // garante idempotência
    closed = true;
    closeReason = reason;
    clearInterval(interval);
    clearTimeout(maxTimer);

    const total = Math.round((Date.now() - startTime) / 1000);

    if (reason === 'timeout') {
      // Manda o trailer do GIF para encerrar limpo
      try { res.end(GIF_TRAILER); } catch (_) {}
      logEvent('FINALIZADO', id, `total=${total}s motivo=timeout`);
    } else {
      // Cliente fechou: não tem sentido escrever mais nada
      try { res.destroy(); } catch (_) {}
      logEvent('FECHOU', id, `total=${total}s motivo=${reason}`);
    }
  };

  // ─── Timer máximo ──────────────────────────────────────────────────────────
  const maxTimer = setTimeout(() => finish('timeout'), MAX_DURATION_MS);

  // ─── Intervalo de frames ───────────────────────────────────────────────────
  let elapsed = 0;
  const interval = setInterval(() => {
    elapsed += FRAME_INTERVAL_MS;

    // Detecta socket morto antes de tentar escrever
    if (closed || res.destroyed || res.socket?.destroyed) {
      finish('socket_morto');
      return;
    }

    const ok = res.write(GIF_FRAME);
    if (!ok) {
      // Backpressure = cliente não está mais lendo
      finish('backpressure');
      return;
    }

    if (elapsed % 5000 === 0) {
      // Log a cada 5s para não poluir (ajuste conforme necessário)
      logEvent('ABERTO', id, `${elapsed / 1000}s`);
    }
  }, FRAME_INTERVAL_MS);

  // ─── Detecção de close pelo cliente ───────────────────────────────────────
  // req 'close' dispara quando o cliente encerra a conexão
  req.on('close', () => {
    if (closed) return;
    // Distingue: se res ainda não terminou, foi o humano/app que fechou
    const reason = res.writableEnded ? 'server_end' : 'cliente_fechou';
    finish(reason);
  });

  // 'error' no socket também indica desconexão
  req.socket?.on('error', () => finish('socket_error'));
  res.on('error', () => finish('res_error'));
});

// ─── Healthcheck ────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ ok: true, uptime: process.uptime() }));

// ─── Servidor ───────────────────────────────────────────────────────────────
const server = app.listen(PORT, () => {
  console.log(`[tracker] rodando na porta ${PORT}`);
  console.log(`[tracker] frame_interval=${FRAME_INTERVAL_MS}ms  max_duration=${MAX_DURATION_MS / 1000}s`);
});

// Sem timeouts fixos no servidor — o MAX_DURATION_MS por requisição já controla
server.keepAliveTimeout = 0;
server.requestTimeout = 0;
server.headersTimeout = 0;

// Graceful shutdown
process.on('SIGTERM', () => server.close(() => process.exit(0)));
