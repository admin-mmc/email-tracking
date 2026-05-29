const express = require('express');
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

// ── Steps: cada um segura a conexão por `delay` ms antes de redirecionar ──
const STEPS = [
  { step: 1, delay: 4000,  label: 'abriu'   },  //  0s
  { step: 2, delay: 4000,  label: 'scan'    },  //  4s
  { step: 3, delay: 5000,  label: 'leu'     },  //  8s
  { step: 4, delay: 5000,  label: 'engajou' },  // 13s → entra no GIF
];

function ts() {
  return new Date().toISOString();
}

// ── Redirects temporizados ────────────────────────────────────────────────
app.get('/t/:step', (req, res) => {
  const id      = req.query.id || 'unknown';
  const stepNum = parseInt(req.params.step);
  const ip      = req.headers['x-forwarded-for']?.split(',')[0].trim()
               || req.socket.remoteAddress;

  const current = STEPS.find(s => s.step === stepNum);
  const next    = STEPS.find(s => s.step === stepNum + 1);

  if (!current) {
    return res.redirect(307, `/track?id=${id}`);
  }

  const stepStart = Date.now();
  console.log(`${ts()} [STEP:${current.label.toUpperCase()}] id=${id} step=${stepNum} ip=${ip}`);

  const timer = setTimeout(() => {
    if (res.writableEnded) return;
    res.setHeader('Cache-Control', 'no-store, no-cache');
    res.redirect(307, next ? `/t/${next.step}?id=${id}` : `/track?id=${id}`);
  }, current.delay);

  req.on('close', () => {
    clearTimeout(timer);
    const spent = ((Date.now() - stepStart) / 1000).toFixed(2);
    // só loga como abandono se o timer ainda não tinha disparado
    if (!res.writableEnded) {
      console.log(`${ts()} [ABANDONOU] id=${id} step=${stepNum} label=${current.label} tempo_no_step=${spent}s`);
    }
  });
});

// ── GIF infinito — mede tempo real aberto ────────────────────────────────
app.get('/track', (req, res) => {
  const id        = req.query.id || 'unknown';
  const ip        = req.headers['x-forwarded-for']?.split(',')[0].trim()
                 || req.socket.remoteAddress;
  const ua        = req.headers['user-agent'] || 'sem-ua';
  const startTime = Date.now();

  console.log(`${ts()} [GIF:INICIO] id=${id} ip=${ip}`);
  console.log(`${ts()} [GIF:UA]     id=${id} ua=${ua}`);

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
      console.log(`${ts()} [GIF:PULSO]  id=${id} aberto=${seconds}s`);
    } catch {
      clearInterval(interval);
    }
    if (seconds >= MAX_DURATION_S) {
      clearInterval(interval);
      res.end(Buffer.from('3b', 'hex'));
      console.log(`${ts()} [GIF:LIMITE] id=${id} atingiu max=${MAX_DURATION_S}s`);
    }
  }, 5000);

  req.on('close', () => {
    clearInterval(interval);
    const total = ((Date.now() - startTime) / 1000).toFixed(2);
    // último pulso registrado + tempo exato de fechamento
    const ultimoPulso = seconds;
    console.log(`${ts()} [GIF:FECHOU] id=${id} ip=${ip} ultimo_pulso=${ultimoPulso}s tempo_real=${total}s`);
  });
});

// ── Health ────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ ok: true }));

// ── Start ─────────────────────────────────────────────────────────────────
const server = app.listen(PORT, () => {
  console.log(`${ts()} [SERVER] porta=${PORT} max=${MAX_DURATION_S}s`);
});

server.keepAliveTimeout = 0;
server.requestTimeout   = 0;
server.headersTimeout   = 0;

process.on('SIGTERM', () => server.close(() => process.exit(0)));
