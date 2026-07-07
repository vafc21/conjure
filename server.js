'use strict';

/*
 * Conjure server
 * --------------
 * Sketch-to-live-app. Accepts sketch frames (webcam or digital canvas) plus
 * optional notes, invokes the Claude Code CLI (claude-sonnet-5) to maintain a
 * single-file web app at workspace/app.html, and hot-reloads any connected
 * iframe over a WebSocket.
 *
 * Deps: express + ws only. No native/compiled modules.
 */

const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8091;
const HOST = '0.0.0.0';
const ROOT = __dirname;
const WS_DIR = path.join(ROOT, 'workspace');
const FRAMES_DIR = path.join(WS_DIR, 'frames');
const HISTORY_DIR = path.join(WS_DIR, 'history');
const APP_FILE = path.join(WS_DIR, 'app.html');
const MODEL = process.env.CONJURE_MODEL || 'claude-sonnet-5';
const CLAUDE_TIMEOUT_MS = parseInt(process.env.CONJURE_TIMEOUT_MS || '240000', 10);

for (const d of [WS_DIR, FRAMES_DIR, HISTORY_DIR]) {
  fs.mkdirSync(d, { recursive: true });
}

// Seed a placeholder app if none exists yet.
if (!fs.existsSync(APP_FILE)) {
  fs.writeFileSync(APP_FILE, seedApp());
}

function seedApp() {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Your app</title>
<style>
  html,body{height:100%;margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
    display:flex;align-items:center;justify-content:center;
    background:radial-gradient(circle at 30% 20%,#1b1b2f,#0d0d16);color:#e8e8f0;text-align:center}
  .wrap{max-width:520px;padding:2rem}
  h1{font-weight:700;letter-spacing:.5px;margin:0 0 .5rem}
  p{opacity:.7;line-height:1.5}
  .spark{font-size:3rem;animation:f 3s ease-in-out infinite}
  @keyframes f{0%,100%{transform:translateY(0) rotate(-4deg)}50%{transform:translateY(-8px) rotate(4deg)}}
</style></head>
<body><div class="wrap">
  <div class="spark">✨</div>
  <h1>Start conjuring</h1>
  <p>Sketch a UI on paper (point the camera at it) or draw on the canvas, add a note,
     and this panel will become your working app.</p>
</div></body></html>`;
}

// ---------------------------------------------------------------------------
// Update queue: single in-flight job, keep only the newest pending request.
// ---------------------------------------------------------------------------
let inFlight = false;
let pending = null; // { image: Buffer|null, notes: string[] }
let lastStatus = { state: 'idle', ts: Date.now(), detail: 'ready' };

function setStatus(state, detail) {
  lastStatus = { state, ts: Date.now(), detail: detail || '' };
  broadcast({ type: 'status', state, detail: detail || '' });
}

function enqueue(job) {
  pending = job; // depth-1 queue: newest wins
  if (!inFlight) drain();
}

async function drain() {
  if (inFlight) return;
  const job = pending;
  pending = null;
  if (!job) return;
  inFlight = true;
  try {
    await runUpdate(job);
  } catch (err) {
    console.error('[update] failed:', err && err.message ? err.message : err);
    setStatus('error', String(err && err.message ? err.message : err).slice(0, 200));
  } finally {
    inFlight = false;
    if (pending) drain(); // a newer request landed while we worked
  }
}

async function runUpdate(job) {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  let framePath = null;
  if (job.image && job.image.length) {
    framePath = path.join(FRAMES_DIR, `${ts}.png`);
    fs.writeFileSync(framePath, job.image);
  }

  const current = fs.existsSync(APP_FILE) ? fs.readFileSync(APP_FILE, 'utf8') : '';
  const prompt = buildPrompt(current, job.notes || [], framePath);

  setStatus('conjuring', framePath ? 'interpreting sketch…' : 'applying notes…');
  console.log(`[update] ${ts} image=${!!framePath} notes=${(job.notes || []).length}`);

  const raw = await callClaude(prompt);
  const html = extractHtml(raw);

  if (!html) {
    console.error('[update] no valid HTML produced; keeping previous version');
    setStatus('error', 'model did not return valid HTML; kept previous version');
    return;
  }

  fs.writeFileSync(APP_FILE, html);
  fs.writeFileSync(path.join(HISTORY_DIR, `${ts}.html`), html);
  console.log(`[update] ${ts} wrote app.html (${html.length} bytes)`);
  setStatus('updated', 'app updated');
  broadcast({ type: 'reload' });
}

function buildPrompt(current, notes, framePath) {
  const noteBlock = notes && notes.length
    ? notes.map((n, i) => `  ${i + 1}. ${n}`).join('\n')
    : '  (none)';

  const imgLine = framePath
    ? `A new sketch image is on disk at:\n  ${path.relative(WS_DIR, framePath)}\nUse your Read tool to view that image file. It is the newest sketch/photo describing the desired UI.`
    : `There is no new sketch image this time — apply ONLY the notes below.`;

  return `You maintain a single-file web app (app.html) whose specification is a sketch (a photo of paper OR a digital drawing) plus optional typed/spoken notes.

${imgLine}

Notes from the user (typed and/or voice-transcribed):
${noteBlock}

Here is the CURRENT app.html (may be a placeholder). Modify it in place — do not start from scratch unless it is the placeholder:
<<<CURRENT_APP_HTML
${current}
CURRENT_APP_HTML

RULES:
- Interpret sketches generously: boxes are containers, scribbled words are text/labels, arrows imply flow/order, and an X or scribble struck THROUGH an element means DELETE that element.
- Change ONLY what changed in the sketch or was requested in the notes. Preserve all other existing features, structure, and styling.
- Everything must actually work: buttons click and do something, charts render with plausible fake data, inputs validate, nav switches views.
- Single self-contained file. Inline CSS and JS only. No external network calls, no CDN links, no external fonts.
- Persist meaningful app state in localStorage so a reload does not lose user data.
- If the sketch is ambiguous, choose the most impressive reasonable interpretation.
- Output ONLY the complete updated HTML file, starting with <!doctype html>. No explanations, no markdown fences.`;
}

function callClaude(prompt) {
  return new Promise((resolve, reject) => {
    const args = ['-p', '--model', MODEL, '--permission-mode', 'bypassPermissions'];
    const child = spawn('claude', args, {
      cwd: WS_DIR,
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let out = '';
    let err = '';
    let done = false;

    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      try { child.kill('SIGKILL'); } catch (_) {}
      reject(new Error(`claude timed out after ${CLAUDE_TIMEOUT_MS}ms`));
    }, CLAUDE_TIMEOUT_MS);

    child.stdout.on('data', (d) => { out += d.toString(); });
    child.stderr.on('data', (d) => { err += d.toString(); });
    child.on('error', (e) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      reject(e);
    });
    child.on('close', (code) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (code !== 0 && !out.trim()) {
        return reject(new Error(`claude exited ${code}: ${err.slice(0, 300)}`));
      }
      resolve(out);
    });

    child.stdin.write(prompt);
    child.stdin.end();
  });
}

// Pull a full HTML document out of the model's stdout. Robust against code
// fences and leading/trailing chatter. Returns null if nothing usable.
function extractHtml(raw) {
  if (!raw) return null;
  let s = raw.trim();

  // Strip a single wrapping code fence if the whole thing is fenced.
  const fence = s.match(/```(?:html)?\s*([\s\S]*?)```/i);
  if (fence && fence[1] && /<(?:!doctype|html)/i.test(fence[1])) {
    s = fence[1].trim();
  }

  const m = s.match(/<!doctype html>|<!DOCTYPE html>|<html[\s>]/i);
  if (!m) return null;
  let html = s.slice(m.index).trim();

  // Trim anything after the final </html> if present.
  const end = html.toLowerCase().lastIndexOf('</html>');
  if (end !== -1) html = html.slice(0, end + '</html>'.length);

  if (html.length < 40) return null;
  return html;
}

// ---------------------------------------------------------------------------
// HTTP + WebSocket
// ---------------------------------------------------------------------------
const app = express();
app.use(express.json({ limit: '25mb' }));

// Base-path tolerance: whether tailscale serve strips the /conjure prefix or
// not, normalize it away so all routes work at "/" and "/conjure/".
app.use((req, res, next) => {
  if (req.url === '/conjure') { req.url = '/'; }
  else if (req.url.startsWith('/conjure/')) { req.url = req.url.slice('/conjure'.length); }
  next();
});

app.get(['/health', '/api/health'], (req, res) => {
  res.json({ ok: true, status: lastStatus, inFlight, model: MODEL });
});

app.get('/status', (req, res) => res.json(lastStatus));

// The generated app, served cache-busted for the preview iframe.
app.get('/app', (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.type('html');
  fs.createReadStream(APP_FILE).pipe(res);
});

// Raw download for the Export button.
app.get('/app.html', (req, res) => {
  res.set('Content-Disposition', 'attachment; filename="app.html"');
  res.type('html');
  fs.createReadStream(APP_FILE).pipe(res);
});

app.post('/update', (req, res) => {
  const body = req.body || {};
  let imageBuf = null;
  if (body.image && typeof body.image === 'string') {
    const b64 = body.image.replace(/^data:image\/\w+;base64,/, '');
    try { imageBuf = Buffer.from(b64, 'base64'); } catch (_) { imageBuf = null; }
  }
  const notes = Array.isArray(body.notes)
    ? body.notes.filter((n) => typeof n === 'string' && n.trim()).map((n) => n.trim())
    : [];

  if ((!imageBuf || !imageBuf.length) && notes.length === 0) {
    return res.status(400).json({ ok: false, error: 'need an image or at least one note' });
  }

  enqueue({ image: imageBuf, notes });
  res.json({ ok: true, queued: true, inFlight });
});

app.use(express.static(path.join(ROOT, 'public')));

const server = http.createServer(app);

// Accept WS upgrades on ANY path (handles /ws and /conjure/ws transparently).
const wss = new WebSocketServer({ noServer: true });
server.on('upgrade', (req, socket, head) => {
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req);
  });
});
wss.on('connection', (ws) => {
  try { ws.send(JSON.stringify({ type: 'status', state: lastStatus.state, detail: lastStatus.detail })); } catch (_) {}
});

function broadcast(obj) {
  const msg = JSON.stringify(obj);
  for (const client of wss.clients) {
    if (client.readyState === 1) {
      try { client.send(msg); } catch (_) {}
    }
  }
}

server.listen(PORT, HOST, () => {
  console.log(`Conjure listening on http://${HOST}:${PORT}  (model: ${MODEL})`);
});
