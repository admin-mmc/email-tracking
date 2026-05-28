const express = require('express');
const app = express();

const PORT = process.env.PORT || 3000;

const GIF_HEADER = Buffer.from(
  '474946383961010001008000000000000000002c0000000001000100000202440100',
  'hex'
);

const GIF_FRAME = Buffer.from(
  '2c0000000001000100000202440100',
  'hex'
);

app.get('/track', (req, res) => {
  const id = req.query.id || 'unknown';
  const startTime = Date.now();

  console.log(`[ABRIU] ${id}`);

  res.setHeader('Content-Type', 'image/gif');
  res.setHeader('Cache-Control', 'no-store, no-cache');
  res.setHeader('Transfer-Encoding', 'chunked');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  res.flushHeaders();

  res.write(GIF_HEADER);

  let seconds = 0;

  const interval = setInterval(() => {
    seconds += 2;

    if (res.destroyed) {
      clearInterval(interval);
      return;
    }

    console.log(`[ABERTO] ${id} ${seconds}s`);

    res.write(GIF_FRAME);

    // encerra após 60s
    if (seconds >= 60) {
      clearInterval(interval);

      // trailer final do GIF
      res.end(Buffer.from('3b', 'hex'));

      console.log(`[FINALIZADO] ${id}`);
    }
  }, 2000);

  req.on('close', () => {
    clearInterval(interval);

    const total = Math.round((Date.now() - startTime) / 1000);

    console.log(`[FECHOU] ${id} total=${total}s`);
  });
});

const server = app.listen(PORT, () => {
  console.log(`rodando ${PORT}`);
});

server.keepAliveTimeout = 0;
server.requestTimeout = 0;
server.headersTimeout = 0;
