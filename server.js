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
  html,body{height:100%;margin:0;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
    display:flex;align-items:center;justify-content:center;
    background:#e7e0d2;color:#26231d;text-align:center}
  .wrap{max-width:480px;padding:2rem}
  .mark{width:34px;height:34px;margin:0 auto 1rem;color:#b2482b}
  h1{font-weight:700;font-size:1.35rem;margin:0 0 .5rem}
  p{color:#7c7566;line-height:1.55;font-size:.95rem}
  code{font-family:ui-monospace,Menlo,Consolas,monospace;background:#f8f4ec;
    border:1px solid #d3c8b4;border-radius:4px;padding:.05rem .35rem;color:#26231d}
</style></head>
<body><div class="wrap">
  <svg class="mark" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.4"
    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M12.5 2.5l3 3-8.5 8.5-3.7 .7 .7-3.7 8.5-8.5z"/><path d="M10.7 4.3l3 3"/>
  </svg>
  <h1>Nothing built yet</h1>
  <p>Point the camera at a paper sketch or draw on the canvas, add a note if you like,
     and press <code>Build it</code>. This panel becomes your working app.</p>
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
    try { fs.writeFileSync(path.join(WS_DIR, 'last_error_raw.txt'), raw || '(empty)'); } catch (_) {}
    console.error('[update] no valid HTML produced (raw ' + (raw ? raw.length : 0) +
      ' bytes); keeping previous version. head: ' + JSON.stringify((raw || '').slice(0, 160)));
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
- If the sketch is ambiguous, choose the most reasonable interpretation.

VISUAL STYLE — the user's drawn/written intent ALWAYS wins; when they specify colors, mood, or a style, follow it. Otherwise, when style is unspecified, design like a thoughtful human and DO NOT produce the generic "AI-generated" look. Concretely:
- DO NOT default to purple/violet/indigo accents (no #7c5cff / indigo-500 family) and DO NOT use purple→blue or purple→teal gradients anywhere (backgrounds, buttons, or text fills).
- No glassmorphism (blurred translucent frosted cards), no big colored glow/neon box-shadows, no gradient-filled headline text, no floating gradient "orbs".
- No emoji used as headings, buttons, bullets, or decoration. No "magic/sparkle/conjure" filler copy. No pill "badge" floating above a centered hero, no row of three identical icon-topped cards unless the sketch actually shows that.
- Choose a restrained palette that fits what was sketched: mostly honest neutrals (white / off-white / paper / greys, or a clean true dark with AA-contrast text) plus AT MOST ONE confident accent color that is NOT purple. Use color to signal function, not to decorate.
- Typography: a plain system font stack (system-ui, -apple-system, "Segoe UI", Roboto, sans-serif) or ONE deliberate common family; build hierarchy with size/weight/spacing. Modest border-radius (4-8px). Prefer hairline borders over heavy shadows.
- Aim for a clean, purposeful, slightly utilitarian feel appropriate to the app's function — not a marketing landing page.

- Output ONLY the complete updated HTML file, starting with <!doctype html>. No explanations, no markdown fences.`;
}

function callClaude(prompt) {
  return new Promise((resolve, reject) => {
    // Disallow every file-mutating / exec / network / agent tool so the model
    // has no choice but to PRINT the finished file to stdout. (Left enabled:
    // Read — needed so it can view the sketch image on disk.) Without this the
    // agent tends to Write app.html itself and print only a prose summary,
    // which both breaks stdout parsing and clobbers the live file.
    const args = [
      '-p', '--model', MODEL, '--permission-mode', 'bypassPermissions',
      '--disallowedTools', 'Write', 'Edit', 'MultiEdit', 'NotebookEdit',
      'Bash', 'WebFetch', 'WebSearch', 'Task',
    ];
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
