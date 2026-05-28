const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// Header de um GIF 1x1 transparente válido
const GIF_HEADER = Buffer.from(
  '474946383961010001008000000000000000002c00000000010001000002024401003b',
  'hex'
);

// Frame GIF mínimo válido para continuar a animação
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

  // Envia o header do GIF imediatamente
  res.write(GIF_HEADER);

  let seconds = 0;

  const interval = setInterval(() => {
    seconds += 10;

    try {
      res.write(GIF_FRAME);
      console.log(`[AINDA ABERTO] id=${id} seconds=${seconds}`);
    } catch (e) {
      clearInterval(interval);
    }
  }, 10000);

  req.on('close', () => {
    clearInterval(interval);
    const total = Math.round((Date.now() - startTime) / 1000);
    console.log(`[FECHOU] id=${id} total=${total}s`);
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`Email tracker rodando na porta ${PORT}`);
});
