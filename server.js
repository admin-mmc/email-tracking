const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

const GIF_HEADER = Buffer.from(
  '474946383961010001008000000000000000002c00000000010001000002024401003b',
  'hex'
);

const GIF_FRAME = Buffer.from(
  '2c00000000010001000002024401003b',
  'hex'
);

app.get('/track', (req, res) => {
  const id = req.query.id || 'unknown';
  const startTime = Date.now();

  console.log(`[ABRIU] id=${id} at=${new Date().toISOString()}`);

  res.setHeader('Content-Type', 'image/gif');
  res.setHeader('Cache-Control', 'no-store, no-cache');
  res.setHeader('Transfer-Encoding', 'chunked');

  // Envia header imediatamente
  res.write(GIF_HEADER);

  // Ping a cada 2s para detectar fechamento mais rápido
  const INTERVAL_MS = 2000;
  let elapsed = 0;
  let closed = false;

  const interval = setInterval(() => {
    if (closed) return clearInterval(interval);

    elapsed += INTERVAL_MS;

    try {
      res.write(GIF_FRAME);

      // Loga só a cada 10s para não poluir
      if (elapsed % 10000 === 0) {
        console.log(`[AINDA ABERTO] id=${id} seconds=${elapsed / 1000}`);
      }
    } catch (e) {
      clearInterval(interval);
    }
  }, INTERVAL_MS);

  req.on('close', () => {
    if (closed) return;
    closed = true;
    clearInterval(interval);

    const total = Math.round((Date.now() - startTime) / 1000);
    const isHuman = total >= 10;

    console.log(`[FECHOU] id=${id} total=${total}s human=${isHuman}`);
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`Email tracker rodando na porta ${PORT}`);
});
