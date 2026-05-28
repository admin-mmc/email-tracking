const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

const MAX_DURATION_S = 180; // ← muda aqui para testar durações diferentes

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
    console.log(`[FECHOU] id=${id} total=${total}s`);
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`[tracker] porta=${PORT} max=${MAX_DURATION_S}s`);
});
