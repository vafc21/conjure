'use strict';

/*
 * Conjure server (v2)
 * -------------------
 * Sketch-to-live-app. Accepts sketch frames (webcam or digital canvas) plus
 * optional notes, invokes the Claude Code CLI (claude-sonnet-5) to maintain a
 * single-file web app, and hot-reloads any connected iframe over a WebSocket.
 *
 * v2 adds: named multi-project workspaces, a global 2-slot semaphore with
 * per-project latest-wins queues, a live terminal stream of the Claude run
 * (stream-json → compact WS events), clarifying questions, drawing colors, an
 * iPhone-friendly onboarding/fullscreen flow, and a passphrase gate covering
 * every route and the WebSocket upgrade.
 *
 * Deps: express + ws only. No native/compiled modules.
 */

const express = require('express');
const http = require('http');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const WS_DIR = path.join(ROOT, 'workspace');
const PROJECTS_DIR = path.join(WS_DIR, 'projects');
const TRASH_DIR = path.join(WS_DIR, '.trash');

// ---------------------------------------------------------------------------
// Env: systemd already loads jarvis/.env; also load a local conjure/.env
// (passphrase + cookie secret live there) without adding a dotenv dependency.
// ---------------------------------------------------------------------------
function loadEnvFile(p) {
  try {
    const txt = fs.readFileSync(p, 'utf8');
    for (const line of txt.split('\n')) {
      const m = line.match(/^\s*(?:export\s+)?([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (!m) continue;
      let v = m[2];
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (process.env[m[1]] === undefined) process.env[m[1]] = v;
    }
  } catch (_) { /* file may not exist locally */ }
}
loadEnvFile(path.join(ROOT, '.env'));

const PORT = process.env.PORT || 8091;
const HOST = '0.0.0.0';
const MODEL = process.env.CONJURE_MODEL || 'claude-sonnet-5';
// Build watchdog: we do NOT hard-kill a long build. As long as the model keeps
// streaming output it runs. Only after IDLE_MS of total silence do we probe the
// runtime with a cheap Haiku call; if Haiku answers, the runtime is healthy and
// the (quiet) Sonnet build is left alive; if it fails, the runtime is broken and
// we stop. HARD_MAX_MS is a last-resort ceiling against a truly wedged process.
const IDLE_MS = parseInt(process.env.CONJURE_IDLE_MS || process.env.CONJURE_TIMEOUT_MS || '150000', 10);
const HARD_MAX_MS = parseInt(process.env.CONJURE_MAX_BUILD_MS || '1800000', 10); // 30 min
const WATCH_TICK_MS = parseInt(process.env.CONJURE_WATCH_TICK_MS || '15000', 10);
const PROBE_MODEL = process.env.CONJURE_PROBE_MODEL || 'haiku';
const MAX_CONCURRENT = parseInt(process.env.CONJURE_MAX_CONCURRENT || '2', 10);

const PASSPHRASE = process.env.CONJURE_PASSPHRASE || '';
const COOKIE_SECRET = process.env.CONJURE_COOKIE_SECRET
  || crypto.randomBytes(24).toString('hex'); // ephemeral fallback (dev only)
const COOKIE_NAME = 'conjure_auth';
const COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const IS_PROD = process.env.NODE_ENV === 'production';
const ALLOW_OPEN = process.env.CONJURE_ALLOW_OPEN === '1';
const AUTH_RATE_MAX = parseInt(process.env.CONJURE_AUTH_RATE_MAX || '5', 10);
const AUTH_RATE_WINDOW_MS = parseInt(process.env.CONJURE_AUTH_RATE_WINDOW_MS || String(15 * 60 * 1000), 10);
const UPDATE_RATE_MAX = parseInt(process.env.CONJURE_UPDATE_RATE_MAX || '10', 10);
const UPDATE_RATE_WINDOW_MS = parseInt(process.env.CONJURE_UPDATE_RATE_WINDOW_MS || String(60 * 60 * 1000), 10);
const HEALTH_CACHE_MS = parseInt(process.env.CONJURE_HEALTH_CACHE_MS || '60000', 10);

if (!PASSPHRASE) {
  if (IS_PROD && !ALLOW_OPEN) {
    console.error('[auth] CONJURE_PASSPHRASE is required in production. Set it in conjure/.env or use CONJURE_ALLOW_OPEN=1 to override.');
    process.exit(1);
  }
  console.warn('[auth] CONJURE_PASSPHRASE not set — gate DISABLED (open access). Set it in conjure/.env for production.');
}
if (!process.env.CONJURE_COOKIE_SECRET) {
  if (IS_PROD && PASSPHRASE) {
    console.error('[auth] CONJURE_COOKIE_SECRET is required in production when the gate is enabled.');
    process.exit(1);
  }
  console.warn('[auth] CONJURE_COOKIE_SECRET not set — using an ephemeral secret (sessions drop on restart).');
}
if (!process.env.CLAUDE_CODE_OAUTH_TOKEN) {
  console.warn('[health] CLAUDE_CODE_OAUTH_TOKEN not set — builds will fail until the token is provided.');
}

for (const d of [WS_DIR, PROJECTS_DIR, TRASH_DIR]) fs.mkdirSync(d, { recursive: true });

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------
function slugify(name) {
  return String(name || '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'project';
}
function projectDir(slug) { return path.join(PROJECTS_DIR, slug); }
function appFile(slug) { return path.join(projectDir(slug), 'app.html'); }
function framesDir(slug) { return path.join(projectDir(slug), 'frames'); }
function historyDir(slug) { return path.join(projectDir(slug), 'history'); }
function metaFile(slug) { return path.join(projectDir(slug), 'meta.json'); }

function projectExists(slug) {
  return /^[a-z0-9-]+$/.test(slug) && fs.existsSync(metaFile(slug));
}

function ensureProject(slug, name, ownerId) {
  fs.mkdirSync(projectDir(slug), { recursive: true });
  fs.mkdirSync(framesDir(slug), { recursive: true });
  fs.mkdirSync(historyDir(slug), { recursive: true });
  if (!fs.existsSync(metaFile(slug))) {
    fs.writeFileSync(metaFile(slug), JSON.stringify({
      slug, name: name || slug, created: new Date().toISOString(),
      ownerId: ownerId || null,
    }, null, 2));
  }
  if (!fs.existsSync(appFile(slug))) fs.writeFileSync(appFile(slug), seedApp());
  return slug;
}

function createProject(name, ownerId) {
  const base = slugify(name);
  let slug = base, i = 2;
  while (fs.existsSync(projectDir(slug))) slug = `${base}-${i++}`;
  ensureProject(slug, name && name.trim() ? name.trim() : slug, ownerId || null);
  return readProject(slug);
}

function readProject(slug) {
  let meta = {};
  try { meta = JSON.parse(fs.readFileSync(metaFile(slug), 'utf8')); } catch (_) {}
  let updated = 0;
  try { updated = fs.statSync(appFile(slug)).mtimeMs; } catch (_) {}
  return {
    slug, name: meta.name || slug, created: meta.created || null, updated,
    ownerId: meta.ownerId || null, built: !!meta.built,
  };
}

// Mark a project as having produced at least one real (non-seed) app build.
// Client uses this to decide sketch (bootstrap) vs markup (annotate-over-app).
function markBuilt(slug) {
  try {
    const meta = JSON.parse(fs.readFileSync(metaFile(slug), 'utf8'));
    if (!meta.built) { meta.built = true; fs.writeFileSync(metaFile(slug), JSON.stringify(meta, null, 2)); }
  } catch (_) {}
}

// ---------------------------------------------------------------------------
// Ownership: an anonymous per-browser id (localStorage) partitions projects.
// This is NOT a security boundary (the passphrase gate is) — it just keeps each
// visitor's project list separate. A caller may only see/touch projects whose
// meta.ownerId equals their id.
// ---------------------------------------------------------------------------
function ownerOf(slug) {
  try { return JSON.parse(fs.readFileSync(metaFile(slug), 'utf8')).ownerId || null; }
  catch (_) { return null; }
}
function ownsProject(slug, uid) {
  return !!uid && projectExists(slug) && ownerOf(slug) === uid;
}

// A caller's projects only (empty when no/unknown uid). Legacy/unowned projects
// are intentionally invisible here — the sweep relocates them to .trash.
function listProjects(uid) {
  if (!uid) return [];
  let dirs = [];
  try { dirs = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true }); } catch (_) {}
  return dirs
    .filter((d) => d.isDirectory() && projectExists(d.name))
    .map((d) => readProject(d.name))
    .filter((p) => p.ownerId === uid)
    .sort((a, b) => b.updated - a.updated);
}

// Count every project on disk (diagnostic only — not owner-scoped).
function countProjects() {
  let dirs = [];
  try { dirs = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true }); } catch (_) {}
  return dirs.filter((d) => d.isDirectory() && projectExists(d.name)).length;
}

// One-time migration: legacy single-workspace files → projects/scratchpad.
function migrateLegacy() {
  const legacyApp = path.join(WS_DIR, 'app.html');
  const scratch = projectDir('scratchpad');
  if (fs.existsSync(scratch)) return; // already migrated / created
  ensureProject('scratchpad', 'Scratchpad');
  try {
    if (fs.existsSync(legacyApp)) {
      fs.copyFileSync(legacyApp, appFile('scratchpad'));
      fs.rmSync(legacyApp, { force: true });
    }
    for (const [srcName, destDir] of [['history', historyDir('scratchpad')], ['frames', framesDir('scratchpad')]]) {
      const src = path.join(WS_DIR, srcName);
      if (!fs.existsSync(src)) continue;
      for (const f of fs.readdirSync(src)) {
        if (f.startsWith('.')) continue;
        try { fs.renameSync(path.join(src, f), path.join(destDir, f)); } catch (_) {}
      }
    }
  } catch (e) { console.error('[migrate] ', e && e.message); }
}
migrateLegacy();
// No global default project anymore: each visitor gets their own owned
// "Scratchpad" created client-side on first load (projects are per-owner now).

// ---------------------------------------------------------------------------
// Non-destructive sweep: relocate orphaned (no ownerId) and stale (untouched
// 30+ days) projects to workspace/.trash — NEVER delete. Runs on start + daily.
// ---------------------------------------------------------------------------
const STALE_MS = 30 * 24 * 60 * 60 * 1000;
function trashProject(slug, reason) {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = path.join(TRASH_DIR, `${ts}-${slug}`);
  try {
    fs.renameSync(projectDir(slug), dest);
  } catch (e) {
    console.error(`[sweep] could not trash ${slug}:`, e && e.message);
    return false;
  }
  queues.delete(slug); statusByProject.delete(slug); runningBuilds.delete(slug);
  console.log(`[sweep] ${slug} → .trash/${path.basename(dest)} (${reason})`);
  return true;
}
function sweepProjects() {
  let dirs = [];
  try { dirs = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true }); } catch (_) {}
  const now = Date.now();
  let trashed = 0;
  for (const d of dirs) {
    if (!d.isDirectory() || !projectExists(d.name)) continue;
    const slug = d.name;
    const st = queues.get(slug);
    if (st && (st.running || st.pending)) continue; // never trash active work
    const owner = ownerOf(slug);
    let updated = 0;
    try { updated = fs.statSync(appFile(slug)).mtimeMs; } catch (_) {}
    if (!owner) { if (trashProject(slug, 'no ownerId')) trashed++; continue; }
    if (updated && (now - updated) > STALE_MS) { if (trashProject(slug, 'stale 30d+')) trashed++; }
  }
  console.log(trashed
    ? `[sweep] relocated ${trashed} project(s) to .trash`
    : '[sweep] nothing to relocate');
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
<body data-conjure-seed="1"><div class="wrap">
  <svg class="mark" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.4"
    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M12.5 2.5l3 3-8.5 8.5-3.7 .7 .7-3.7 8.5-8.5z"/><path d="M10.7 4.3l3 3"/>
  </svg>
  <h1>Nothing built yet</h1>
  <p>Turn on <code>✎ Markup</code> and draw the UI you want right here — or point the
     camera at a paper sketch. Add a note if you like, then press <code>Build</code>.
     This panel becomes your working app.</p>
</div></body></html>`;
}

// Shown in the preview iframe when the requested project isn't the caller's.
function notFoundApp() {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Not found</title>
<style>html,body{height:100%;margin:0;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
display:flex;align-items:center;justify-content:center;background:#e7e0d2;color:#7c7566;text-align:center}
p{max-width:320px;line-height:1.5;font-size:.9rem}</style></head>
<body><p>This project isn't in your workspace. Pick one from the project menu or create a new one.</p></body></html>`;
}

// ---------------------------------------------------------------------------
// Per-project status + concurrency (global 2-slot semaphore, latest-wins queue)
// ---------------------------------------------------------------------------
const statusByProject = new Map(); // slug -> {state, ts, detail}
const queues = new Map();          // slug -> {pending, running}
const runningBuilds = new Map();   // slug -> { cancel(err?) }
let active = 0;

function setStatus(slug, state, detail) {
  const s = { state, ts: Date.now(), detail: detail || '' };
  statusByProject.set(slug, s);
  broadcastProject(slug, { type: 'status', state, detail: s.detail });
}
function getStatus(slug) {
  return statusByProject.get(slug) || { state: 'idle', ts: Date.now(), detail: 'ready' };
}
function projState(slug) {
  if (!queues.has(slug)) queues.set(slug, { pending: null, running: false });
  return queues.get(slug);
}
function enqueue(slug, job) {
  const st = projState(slug);
  if (st.pending) broadcastProject(slug, { type: 'term', kind: 'note', label: 'queue', snippet: 'newer request superseded a queued one' });
  st.pending = job; // latest wins (stale-drop, per project)
  schedule();
}
function schedule() {
  for (const [slug, st] of queues) {
    if (active >= MAX_CONCURRENT) break;
    if (st.pending && !st.running) {
      const job = st.pending;
      st.pending = null;
      st.running = true;
      active++;
      runUpdate(slug, job)
        .catch((err) => {
          const msg = String(err && err.message ? err.message : err);
          if (/cancelled/i.test(msg)) {
            console.log(`[update ${slug}] cancelled`);
            setStatus(slug, 'idle', 'cancelled');
            broadcastProject(slug, { type: 'term', kind: 'note', label: 'cancel', snippet: 'build cancelled' });
            return;
          }
          console.error(`[update ${slug}] failed:`, msg);
          setStatus(slug, 'error', msg.slice(0, 200));
        })
        .finally(() => { st.running = false; active--; schedule(); });
    }
  }
}

// ---------------------------------------------------------------------------
// A single update run
// ---------------------------------------------------------------------------
async function runUpdate(slug, job) {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  let frameName = null, framePath = null;
  if (job.image && job.image.length) {
    frameName = `${ts}.png`;
    framePath = path.join(framesDir(slug), frameName);
    fs.writeFileSync(framePath, job.image);
  }

  const current = fs.existsSync(appFile(slug)) ? fs.readFileSync(appFile(slug), 'utf8') : '';
  const prompt = buildPrompt(current, job.notes || [], frameName, job.kind, job.view);

  setStatus(slug, 'conjuring', framePath ? (job.kind === 'markup' ? 'reading your markup…' : 'interpreting sketch…') : 'applying notes…');
  console.log(`[update ${slug}] ${ts} image=${!!framePath} notes=${(job.notes || []).length}`);

  const term = makeTermEmitter(slug);
  const raw = await runClaudeStream(slug, prompt, term);
  term.end();

  // Clarifying question path: the model may ask instead of guessing.
  const q = detectQuestion(raw);
  if (q) {
    console.log(`[update ${slug}] model asked a clarifying question`);
    broadcastProject(slug, {
      type: 'question',
      project: slug,
      question: q.question,
      bbox: q.bbox || null,
      frameFile: frameName,
      frameUrl: frameName ? `frames/${slug}/${frameName}` : null,
    });
    setStatus(slug, 'question', 'waiting on your answer');
    broadcastProject(slug, { type: 'term', kind: 'done', label: 'question', snippet: q.question });
    return;
  }

  // The model edits app.html in place — read the result from disk. Fall back to
  // stdout-printed HTML if the file didn't change (e.g. it printed instead).
  const validHtml = (s) => s && s.length > 60 && /<(?:!doctype html|html[\s>])/i.test(s);
  let after = '';
  try { after = fs.existsSync(appFile(slug)) ? fs.readFileSync(appFile(slug), 'utf8') : ''; } catch (_) {}
  let html = null;
  if (after && after !== current && validHtml(after)) {
    html = after; // edited or created in place — app.html already holds it
  } else {
    const printed = extractHtml(raw);
    if (printed) { html = printed; fs.writeFileSync(appFile(slug), html); }
  }
  if (!html) {
    try { fs.writeFileSync(path.join(projectDir(slug), 'last_error_raw.txt'), raw || '(empty)'); } catch (_) {}
    console.error(`[update ${slug}] no change produced (raw ${raw ? raw.length : 0}b, disk ${after.length}b); keeping previous.`);
    setStatus(slug, 'error', (after && after === current) ? 'no changes were made' : 'model did not produce valid HTML; kept previous version');
    return;
  }

  fs.writeFileSync(path.join(historyDir(slug), `${ts}.html`), html);
  markBuilt(slug);
  console.log(`[update ${slug}] ${ts} wrote app.html (${html.length} bytes, in-place=${html === after})`);
  broadcastProject(slug, { type: 'term', kind: 'done', label: 'done', snippet: `wrote ${html.length} bytes` });
  setStatus(slug, 'updated', 'app updated');
  broadcastProject(slug, { type: 'reload' });
}

function cancelBuild(slug) {
  const st = projState(slug);
  let cancelled = false;
  if (st.pending) {
    st.pending = null;
    cancelled = true;
    broadcastProject(slug, { type: 'term', kind: 'note', label: 'queue', snippet: 'queued build cancelled' });
  }
  const run = runningBuilds.get(slug);
  if (run) {
    run.cancel(new Error('cancelled by user'));
    cancelled = true;
  }
  if (!cancelled && !st.running) setStatus(slug, 'idle', 'ready');
  return cancelled;
}

function safeHistoryFile(file) {
  return typeof file === 'string' && /^[\w.-]+\.html$/.test(file) && !file.includes('..');
}

function listHistory(slug) {
  let files = [];
  try { files = fs.readdirSync(historyDir(slug)).filter((f) => f.endsWith('.html')); } catch (_) {}
  return files
    .map((file) => {
      let mtime = 0, size = 0;
      try {
        const st = fs.statSync(path.join(historyDir(slug), file));
        mtime = st.mtimeMs;
        size = st.size;
      } catch (_) {}
      return { file, mtime, size };
    })
    .sort((a, b) => b.mtime - a.mtime);
}

function restoreHistory(slug, file) {
  const src = path.join(historyDir(slug), file);
  if (!fs.existsSync(src)) throw new Error('snapshot not found');
  const html = fs.readFileSync(src, 'utf8');
  if (!/<(?:!doctype|html)/i.test(html)) throw new Error('not an HTML document');
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  if (fs.existsSync(appFile(slug))) {
    fs.copyFileSync(appFile(slug), path.join(historyDir(slug), `${ts}-pre-restore.html`));
  }
  fs.writeFileSync(appFile(slug), html);
  markBuilt(slug);
  return html.length;
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------
function buildPrompt(current, notes, frameName, kind, view) {
  const noteBlock = notes && notes.length
    ? notes.map((n, i) => `  ${i + 1}. ${n}`).join('\n')
    : '  (none)';

  const viewBits = view ? [
    view.route ? `route "${String(view.route).slice(0, 80)}"` : null,
    view.title ? `title "${String(view.title).slice(0, 80)}"` : null,
    view.heading ? `heading "${String(view.heading).slice(0, 80)}"` : null,
  ].filter(Boolean) : [];
  const viewLine = viewBits.length
    ? `\nCURRENT PAGE THE USER IS VIEWING: ${viewBits.join(', ')}. The screenshot/markup and the requested changes apply to THIS page/view. Edit THIS page; leave the other pages' content intact, except shared navigation/header/footer which must stay consistent across every page.\n`
    : '';

  const imgLine = frameName
    ? (kind === 'markup'
      ? `A new image is on disk at:\n  frames/${frameName}\nUse your Read tool to view it. It is a SCREENSHOT of the CURRENT running app with the user's hand-drawn markup drawn directly ON TOP of it (pen strokes, circles, arrows, fills, and written words). Treat the markup as edit instructions applied to the app shown beneath it: ONLY a clear X, slashes, or a back-and-forth cross-out struck THROUGH an element means DELETE it; COLOURING or FILLING an element in with a colour (shading inside its shape/outline) means RE-COLOUR that element to that colour — it is NOT a delete, keep the element; a circle or arrow points at what to change, add, or move; written words are new labels/text or instructions about the thing they sit next to. When unsure between "coloured in" and "crossed out", treat a solid even fill as a colour change and reserve delete for an unmistakable X or cross-out. Apply those marked changes to the CURRENT app.html below and preserve everything that was NOT marked.`
      : `A new sketch image is on disk at:\n  frames/${frameName}\nUse your Read tool to view that image file. It is the newest sketch/photo describing the desired UI.`)
    : `There is no new sketch image this time — apply ONLY the notes below.`;

  return `You maintain a single-file web app (app.html) whose specification is a sketch (a photo of paper OR a digital drawing) plus optional typed/spoken notes.

${imgLine}
${viewLine}
Notes from the user (typed and/or voice-transcribed):
${noteBlock}

The current app is the file app.html in your working directory (it may be a placeholder). FIRST use your Read tool to read app.html so you can see exactly what is there, THEN edit it.

RULES:
- Interpret sketches generously: boxes are containers, scribbled words are text/labels, arrows imply flow/order. Only a clear X, slashes, or a cross-out struck THROUGH an element means DELETE it — filling/shading an element in is NOT a delete (see the colour rule).
- COLOR CARRIES MEANING: the drawing may use several marker colors. Ink in a DIFFERENT color from the main drawing is usually an annotation/instruction (e.g. a red arrow + "make this bigger"). COLOURING/FILLING an element in (an even shade inside its bounds) means set THAT element's colour/background to that colour — keep the element, just recolour it. Read color intent, don't ignore it.
- Change ONLY what changed in the sketch or was requested in the notes. Preserve all other existing features, structure, and styling.
- Everything must actually work: buttons click and do something, charts render with plausible fake data, inputs validate, nav switches views.
- MULTI-PAGE: this one file may hold several pages/views. Implement page switching with hash routes (#home, #about, …) so each page is directly linkable and the browser URL reflects the current page, and show/hide the matching view. Include ONE persistent, consistent site navigation on EVERY page that links all pages together, with a clear Home link. Preserve ALL existing pages and their content on every build — never drop a page.
- When the notes ask to ADD a page, create it as a new hash-routed view, add its link to the navigation on every page, keep the shared header/nav/footer consistent, and make it the shown page. When editing an existing page, change only the CURRENT page (named above) plus shared chrome.
- Single self-contained file. Inline CSS and JS only. No external network calls, no CDN links, no external fonts.
- Persist meaningful app state in localStorage so a reload does not lose user data.

CLARIFYING QUESTION — only when you GENUINELY cannot proceed:
- If the sketch/notes are so ambiguous that any build would be a blind guess (e.g. a nearly-empty sketch with a note like "make it like the other one" referencing something you cannot see), DO NOT guess.
- Instead output EXACTLY this and NOTHING else (no HTML, no prose): QUESTION:{"question":"<your one specific question>","bbox":{"x":0,"y":0,"w":0,"h":0}}
- bbox is the percent region (0-100) of the sketch you are asking about; include it only if a specific region is unclear, otherwise use {"x":0,"y":0,"w":100,"h":100}.
- Use this sparingly — prefer the most reasonable interpretation whenever one plausibly exists.

DESIGN
The user's drawn/written style ALWAYS wins — follow their colors, mood, and layout exactly. When style is unspecified, design like a skilled human with restrained, deliberate taste — never the generic "AI look":
- BANNED: purple/violet/indigo accents (no #7c5cff / indigo-500 family); purple→blue/teal gradients; glassmorphism; neon/colored glow shadows; gradient-filled text; floating gradient orbs; emoji as headings, buttons, bullets, or decoration; "magic/sparkle" filler copy; centered-hero pill badges and three-identical-icon-card rows unless explicitly requested.
- Palette: honest neutrals (or clean true-dark) plus AT MOST ONE confident non-purple accent. Color signals function, never mere decoration; never state by color alone.
- Type: system font stack or ONE common family. Hierarchy via size/weight/spacing only. Base ≥16px, line-height ~1.5, body lines 45–75ch.
- Surfaces: modest 4–8px radius; hairline borders over heavy shadows.
- Layout: one clear primary action per view; group related items on a shared grid; 4/8px spacing scale — whitespace is structural.
- Accessibility: body text contrast ≥4.5:1; controls and focus indicators ≥3:1; visible :focus-visible outline; real <label>s.
- Responsive: no horizontal scroll ever; single-column reflow on mobile; touch targets ≥44px; inputs ≥16px font.
- States & content: handle empty, loading, and error states; instant feedback; no layout shift; real plausible content, never lorem ipsum.
- Forms: label above field; inline validation on blur; preserve entered data on error; one obvious primary submit.

HOW TO APPLY CHANGES (this matters for speed — do it exactly):
- Make your changes by EDITING app.html IN PLACE with your Edit / MultiEdit tool. Change only the specific lines that must change and leave the rest of the file byte-for-byte identical. Do NOT rewrite the whole file, and do NOT print the HTML to stdout.
- Prefer several small, targeted edits over one big replacement. On a large file this is dramatically faster than re-emitting everything.
- ONLY if app.html is the empty "Nothing built yet" placeholder (or is missing) may you create the whole file fresh with your Write tool.
- When you finish, app.html on disk MUST be a complete, valid, self-contained HTML document starting with <!doctype html>. Never leave it half-edited or broken.
- Touch ONLY app.html in your current working directory (and, when mentioned, Read the sketch image under frames/). Do NOT list, glob, or search the filesystem, do NOT open or create any other file, and never use a path outside this folder.
- Print NOTHING to stdout — no prose, no HTML, no summary. The ONLY thing you may ever print is a single QUESTION:{...} line, and only in the genuine can't-proceed case described above (when asking, do not edit the file).`;
}

// ---------------------------------------------------------------------------
// Claude runtime — stream-json → compact terminal events over WS
// ---------------------------------------------------------------------------
function makeTermEmitter(slug) {
  const buf = { thinking: '', text: '' };
  let timer = null;
  function flush() {
    for (const kind of ['thinking', 'text']) {
      if (buf[kind]) {
        broadcastProject(slug, { type: 'term', kind, label: kind, snippet: buf[kind] });
        buf[kind] = '';
      }
    }
    timer = null;
  }
  return {
    delta(kind, txt) {
      buf[kind] += txt;
      if (buf[kind].length > 160) flush();
      else if (!timer) timer = setTimeout(flush, 140);
    },
    event(kind, label, snippet) {
      flush();
      broadcastProject(slug, { type: 'term', kind, label, snippet: (snippet || '').slice(0, 240) });
    },
    end() { if (timer) { clearTimeout(timer); timer = null; } flush(); },
  };
}

function compactInput(input) {
  if (!input) return '';
  if (input.file_path) return input.file_path;
  try { return JSON.stringify(input).slice(0, 180); } catch (_) { return ''; }
}
function toolResultSnippet(content) {
  try {
    if (typeof content === 'string') return content.slice(0, 180);
    if (Array.isArray(content)) {
      const txt = content.map((c) => (c && c.type === 'text' ? c.text : (c && c.text) || '')).join(' ').trim();
      return (txt || JSON.stringify(content)).slice(0, 180);
    }
    return JSON.stringify(content).slice(0, 180);
  } catch (_) { return ''; }
}

// Cheap liveness probe: is the Claude CLI/runtime answering at all? Used only
// when a build has gone silent, to tell "long build" apart from "runtime broken".
function claudeHealthy(timeoutMs = 30000) {
  return new Promise((resolve) => {
    let done = false, out = '';
    let child;
    try {
      child = spawn('claude', ['-p', '--model', PROBE_MODEL], { env: process.env, stdio: ['pipe', 'pipe', 'ignore'] });
    } catch (_) { resolve(false); return; }
    const to = setTimeout(() => { if (done) return; done = true; try { child.kill('SIGKILL'); } catch (_) {} resolve(false); }, timeoutMs);
    child.stdout.on('data', (d) => { out += d.toString(); });
    child.on('error', () => { if (done) return; done = true; clearTimeout(to); resolve(false); });
    child.on('close', (code) => { if (done) return; done = true; clearTimeout(to); resolve(code === 0 && out.trim().length > 0); });
    try { child.stdin.write('Reply with the single word OK.'); child.stdin.end(); } catch (_) {}
  });
}

function runClaudeStream(slug, prompt, term) {
  return new Promise((resolve, reject) => {
    // Read/Write/Edit/MultiEdit are ENABLED so the model edits app.html in place
    // (emitting only the changed lines) instead of re-printing the whole file —
    // small edits on a large app go from minutes to seconds. Exec / network /
    // agent tools stay disabled so it can't run commands or reach the internet.
    // Filesystem EXPLORATION tools (Glob/Grep/LS) are also disabled: the model
    // only needs to Read/Edit app.html and Read the given frame image, and letting
    // it browse the tree causes "outside allowed folders" errors in the terminal.
    const args = [
      '-p', '--model', MODEL,
      '--add-dir', projectDir(slug),
      '--output-format', 'stream-json', '--verbose', '--include-partial-messages',
      '--permission-mode', 'bypassPermissions',
      '--disallowedTools', 'NotebookEdit', 'Bash', 'WebFetch', 'WebSearch', 'Task', 'Glob', 'Grep', 'LS',
    ];
    const child = spawn('claude', args, {
      cwd: projectDir(slug), env: process.env, stdio: ['pipe', 'pipe', 'pipe'],
    });

    let buf = '';
    let resultText = '';
    let assembledText = '';
    let err = '';
    let done = false;

    // Activity-aware watchdog (see IDLE_MS/HARD_MAX_MS notes above). We never kill
    // a build that is still streaming; a silent build is health-checked with Haiku
    // and only stopped if the runtime itself is unresponsive.
    const started = Date.now();
    let lastActivity = Date.now();
    let probing = false;
    function finish(err2) {
      if (done) return; done = true;
      clearInterval(watchdog);
      runningBuilds.delete(slug);
      try { child.kill('SIGKILL'); } catch (_) {}
      reject(err2);
    }
    runningBuilds.set(slug, {
      cancel: (err) => finish(err || new Error('cancelled by user')),
    });
    const watchdog = setInterval(async () => {
      if (done) return;
      const now = Date.now();
      if (now - started > HARD_MAX_MS) {
        term.event('error', 'watchdog', `build exceeded the ${Math.round(HARD_MAX_MS / 60000)}-min ceiling — stopping`);
        finish(new Error(`build exceeded hard ceiling ${HARD_MAX_MS}ms`));
        return;
      }
      if (probing || now - lastActivity < IDLE_MS) return;
      probing = true;
      const quietS = Math.round((now - lastActivity) / 1000);
      term.event('note', 'watchdog', `no output for ${quietS}s — checking the runtime with ${PROBE_MODEL}…`);
      const ok = await claudeHealthy();
      if (done) return;
      if (ok) {
        term.event('note', 'watchdog', `runtime healthy (${PROBE_MODEL} answered) — the build is still working, keeping it alive`);
        lastActivity = Date.now(); // grant another quiet window
        probing = false;
      } else {
        term.event('error', 'watchdog', `runtime not responding (${PROBE_MODEL} probe failed) — stopping this build`);
        finish(new Error(`claude runtime unresponsive (health probe failed after ${quietS}s of silence)`));
      }
    }, WATCH_TICK_MS);

    function route(ev) {
      if (!ev || !ev.type) return;
      if (ev.type === 'stream_event' && ev.event) {
        const e = ev.event;
        if (e.type === 'content_block_delta' && e.delta) {
          if (e.delta.type === 'text_delta' && e.delta.text) term.delta('text', e.delta.text);
          else if (e.delta.type === 'thinking_delta' && e.delta.thinking) term.delta('thinking', e.delta.thinking);
        }
      } else if (ev.type === 'assistant' && ev.message && Array.isArray(ev.message.content)) {
        for (const b of ev.message.content) {
          if (b.type === 'tool_use') term.event('tool_use', b.name || 'tool', compactInput(b.input));
          else if (b.type === 'text' && b.text) assembledText += b.text;
        }
      } else if (ev.type === 'user' && ev.message && Array.isArray(ev.message.content)) {
        for (const b of ev.message.content) {
          if (b.type === 'tool_result') {
            const snip = toolResultSnippet(b.content);
            if (b.is_error) { console.warn(`[update ${slug}] tool error: ${snip}`); term.event('note', 'note', 'a tool call was skipped; continuing'); }
            else term.event('tool_result', 'result', snip);
          }
        }
      } else if (ev.type === 'result') {
        if (typeof ev.result === 'string') resultText = ev.result;
      }
    }
    function handleLine(line) {
      line = line.trim();
      if (!line) return;
      let ev; try { ev = JSON.parse(line); } catch (_) { return; }
      try { route(ev); } catch (_) {}
    }

    child.stdout.on('data', (d) => {
      lastActivity = Date.now(); // any output = the model is working
      buf += d.toString();
      let idx;
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx);
        buf = buf.slice(idx + 1);
        handleLine(line);
      }
    });
    child.stderr.on('data', (d) => { err += d.toString(); lastActivity = Date.now(); });
    child.on('error', (e) => { if (done) return; done = true; clearInterval(watchdog); runningBuilds.delete(slug); reject(e); });
    child.on('close', (code) => {
      if (done) return;
      done = true;
      clearInterval(watchdog);
      runningBuilds.delete(slug);
      if (buf.trim()) handleLine(buf); // flush any trailing partial line
      const out = resultText || assembledText;
      if (code !== 0 && !out.trim()) {
        return reject(new Error(`claude exited ${code}: ${err.slice(0, 300)}`));
      }
      resolve(out);
    });

    child.stdin.write(prompt);
    child.stdin.end();
  });
}

// Detect a clarifying-question response: QUESTION:{...json...}
function detectQuestion(raw) {
  if (!raw) return null;
  const m = raw.match(/QUESTION:\s*(\{[\s\S]*\})/);
  if (!m) return null;
  // Trim to the first balanced JSON object after QUESTION:
  let s = m[1];
  let depth = 0, endIdx = -1;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '{') depth++;
    else if (s[i] === '}') { depth--; if (depth === 0) { endIdx = i; break; } }
  }
  if (endIdx !== -1) s = s.slice(0, endIdx + 1);
  try {
    const obj = JSON.parse(s);
    if (obj && typeof obj.question === 'string' && obj.question.trim()) {
      return { question: obj.question.trim(), bbox: obj.bbox && typeof obj.bbox === 'object' ? obj.bbox : null };
    }
  } catch (_) {}
  return null;
}

// Pull a full HTML document out of the model's stdout. Robust against code
// fences and leading/trailing chatter. Returns null if nothing usable.
function extractHtml(raw) {
  if (!raw) return null;
  let s = raw.trim();
  const fence = s.match(/```(?:html)?\s*([\s\S]*?)```/i);
  if (fence && fence[1] && /<(?:!doctype|html)/i.test(fence[1])) s = fence[1].trim();
  const m = s.match(/<!doctype html>|<!DOCTYPE html>|<html[\s>]/i);
  if (!m) return null;
  let html = s.slice(m.index).trim();
  const end = html.toLowerCase().lastIndexOf('</html>');
  if (end !== -1) html = html.slice(0, end + '</html>'.length);
  if (html.length < 40) return null;
  return html;
}

// ---------------------------------------------------------------------------
// Auth (passphrase gate) — signed httpOnly cookie, covers HTTP + WS upgrade
// ---------------------------------------------------------------------------
function signToken(issuedMs) {
  const payload = String(issuedMs);
  const sig = crypto.createHmac('sha256', COOKIE_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}
function verifyToken(tok) {
  if (!tok || typeof tok !== 'string') return false;
  const i = tok.lastIndexOf('.');
  if (i < 0) return false;
  const payload = tok.slice(0, i);
  const sig = tok.slice(i + 1);
  const expect = crypto.createHmac('sha256', COOKIE_SECRET).update(payload).digest('base64url');
  const a = Buffer.from(sig), b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  const issued = parseInt(payload, 10);
  if (!issued || Date.now() - issued > COOKIE_MAX_AGE_MS) return false;
  return true;
}
function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}
function isAuthed(req) {
  if (!PASSPHRASE) return true; // gate disabled when no passphrase configured
  const cookies = parseCookies(req.headers.cookie);
  return verifyToken(cookies[COOKIE_NAME]);
}

// ---------------------------------------------------------------------------
// Rate limiting (in-memory, per IP — no extra deps)
// ---------------------------------------------------------------------------
function clientIp(req) {
  const xf = req.headers['x-forwarded-for'];
  if (xf) return String(Array.isArray(xf) ? xf[0] : xf).split(',')[0].trim();
  return req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : 'unknown';
}

function createRateLimiter(windowMs, max, keyFn, onLimit) {
  const buckets = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const key = keyFn(req);
    let b = buckets.get(key);
    if (!b || now >= b.resetAt) {
      b = { count: 0, resetAt: now + windowMs };
      buckets.set(key, b);
    }
    b.count++;
    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, max - b.count)));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(b.resetAt / 1000)));
    if (b.count > max) {
      const retrySec = Math.max(1, Math.ceil((b.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retrySec));
      if (typeof onLimit === 'function') return onLimit(req, res, retrySec);
      return res.status(429).json({ ok: false, error: 'rate limit exceeded', retryAfter: retrySec });
    }
    next();
  };
}

const rateLimitAuth = createRateLimiter(AUTH_RATE_WINDOW_MS, AUTH_RATE_MAX, clientIp, (req, res, retrySec) => {
  res.status(429).type('html').send(gatePage(basePath(req), false, retrySec));
});
const rateLimitUpdate = createRateLimiter(UPDATE_RATE_WINDOW_MS, UPDATE_RATE_MAX, clientIp);

// ---------------------------------------------------------------------------
// Runtime health (cached Claude probe for /health?deep=1)
// ---------------------------------------------------------------------------
let healthCache = { at: 0, token: false, claude: false, ok: false };

async function probeRuntimeHealth(force) {
  const now = Date.now();
  if (!force && healthCache.at && (now - healthCache.at) < HEALTH_CACHE_MS) return healthCache;
  const token = !!process.env.CLAUDE_CODE_OAUTH_TOKEN;
  let claude = false;
  if (token) claude = await claudeHealthy(15000);
  healthCache = { at: now, token, claude, ok: token && claude };
  return healthCache;
}

// The anonymous owner id: an "X-Conjure-Uid" header (fetch/XHR) or a "uid" query
// param (iframe src, download links, image loads, WS upgrade). Constrained to a
// safe charset so it can never influence a filesystem path.
function callerUid(req) {
  let uid = req.headers && req.headers['x-conjure-uid'];
  if (Array.isArray(uid)) uid = uid[0];
  if (!uid) {
    try { uid = new URL(req.url, 'http://localhost').searchParams.get('uid'); } catch (_) {}
  }
  uid = String(uid || '').trim();
  return /^[A-Za-z0-9_-]{8,64}$/.test(uid) ? uid : '';
}

function gatePage(base, error, rateLimitSec) {
  const errMsg = rateLimitSec
    ? `Too many attempts — try again in ${rateLimitSec}s.`
    : (error ? 'Incorrect passphrase — try again.' : '');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Conjure — locked</title>
<link rel="icon" href="/brand/favicon.svg" type="image/svg+xml">
<link rel="alternate icon" href="/brand/favicon-16.svg" sizes="16x16">
<style>
  :root{--paper:#e7e0d2;--panel2:#f8f4ec;--sheet:#fdfbf6;--line:#d3c8b4;--line2:#c3b79e;
    --ink:#26231d;--muted:#7c7566;--accent:#b2482b;--accent-ink:#8f3820;--danger:#a3372a;
    --mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
    --sans:system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
  *{box-sizing:border-box}
  html,body{height:100%;margin:0;background:var(--paper);color:var(--ink);font-family:var(--sans);
    display:flex;align-items:center;justify-content:center}
  form{background:var(--panel2);border:1px solid var(--line);border-radius:8px;padding:1.6rem;
    width:min(92vw,360px);box-shadow:0 1px 0 #fff inset}
  .logo{display:flex;color:var(--accent);margin-bottom:.7rem}
  h1{font-size:1.05rem;margin:0 0 .2rem}
  p{color:var(--muted);font-size:.82rem;line-height:1.5;margin:0 0 1rem}
  label{display:block;font-family:var(--mono);font-size:.66rem;letter-spacing:.05em;
    text-transform:uppercase;color:var(--muted);margin:0 0 .35rem}
  input{width:100%;background:var(--sheet);border:1px solid var(--line2);border-radius:6px;
    padding:.7rem;font:inherit;font-size:16px;color:var(--ink)}
  input:focus{outline:none;border-color:var(--accent)}
  button{margin-top:.9rem;width:100%;min-height:44px;background:var(--accent);color:#fdfbf6;
    border:1px solid var(--accent-ink);border-radius:6px;font:inherit;font-weight:600;cursor:pointer}
  button:hover{background:var(--accent-ink)}
  .err{color:var(--danger);font-size:.78rem;margin-top:.6rem;font-family:var(--mono);min-height:1em}
</style></head>
<body>
  <form method="POST" action="${base}auth">
    <span class="logo" aria-hidden="true">
      <svg width="22" height="22" viewBox="0 0 96 96" fill="none">
        <path d="M30 78 L24 78 A8 8 0 0 1 16 70 L16 26 A8 8 0 0 1 24 18 L72 18 A8 8 0 0 1 80 26 L80 50" stroke="currentColor" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M24 18 L72 18 A8 8 0 0 1 80 26 L80 30 L16 30 L16 26 A8 8 0 0 1 24 18 Z" fill="currentColor"/>
        <g stroke="currentColor" stroke-width="6.5" stroke-linecap="round">
          <path d="M30 78 L46 78" opacity=".9"/><path d="M55 78 L64 78" opacity=".48"/><path d="M80 58 L80 67" opacity=".42"/>
        </g>
      </svg>
    </span>
    <h1>Conjure</h1>
    <p>This workshop is passphrase-protected. Enter the phrase to continue.</p>
    <label for="p">Passphrase</label>
    <input id="p" name="passphrase" type="password" autocomplete="current-password" autofocus placeholder="three-word phrase">
    <button type="submit">Unlock</button>
    <div class="err">${errMsg}</div>
  </form>
</body></html>`;
}

// ---------------------------------------------------------------------------
// HTTP + WebSocket
// ---------------------------------------------------------------------------
const app = express();
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: false }));

// Compute the base path for links/redirects (tolerate a /conjure prefix mount).
function basePath(req) {
  const p = req.originalUrl.split('?')[0];
  if (p.startsWith('/conjure')) return '/conjure/';
  return '/';
}

// Base-path tolerance: normalize a /conjure prefix away so routes work at both
// "/" and "/conjure/".
app.use((req, res, next) => {
  if (req.url === '/conjure') req.url = '/';
  else if (req.url.startsWith('/conjure/')) req.url = req.url.slice('/conjure'.length);
  else if (req.url.startsWith('/conjure?')) req.url = '/?' + req.url.slice('/conjure?'.length);
  next();
});

function authCookieFlags(req) {
  const proto = req && req.headers && req.headers['x-forwarded-proto'];
  return (proto === 'https' || (req && req.secure)) ? '; Secure' : '';
}

function clearAuthCookie(res, req) {
  res.setHeader('Set-Cookie',
    `${COOKIE_NAME}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax${authCookieFlags(req)}`);
}

// Auth endpoint (must be reachable while unauthenticated).
app.post('/auth', rateLimitAuth, (req, res) => {
  const base = basePath(req);
  const given = (req.body && req.body.passphrase) || '';
  if (PASSPHRASE && given === PASSPHRASE) {
    const tok = signToken(Date.now());
    res.setHeader('Set-Cookie',
      `${COOKIE_NAME}=${tok}; HttpOnly; Path=/; Max-Age=${Math.floor(COOKIE_MAX_AGE_MS / 1000)}; SameSite=Lax${authCookieFlags(req)}`);
    return res.redirect(base);
  }
  res.status(401).type('html').send(gatePage(base, true));
});

// Sign out and return to the public homepage (ungated).
app.get('/logout', (req, res) => {
  clearAuthCookie(res, req);
  res.redirect('/welcome');
});

// Public marketing homepage (ungated). Its "Start drawing" links to /enter.
function sendHome(res) {
  const f = path.join(ROOT, 'site', 'index.html');
  if (!fs.existsSync(f)) return res.status(404).type('text').send('no homepage');
  res.type('html'); res.set('Cache-Control', 'public, max-age=60');
  fs.createReadStream(f).pipe(res);
}
app.get(['/welcome', '/home'], (req, res) => sendHome(res));

// Public static assets for the homepage (e.g. /assets/hero.png), ungated.
app.use('/assets', express.static(path.join(ROOT, 'site'), { maxAge: '1h' }));
// Brand assets (favicons, logos) are public so the homepage + gate page show them.
app.use('/brand', express.static(path.join(ROOT, 'public', 'brand'), { maxAge: '1h' }));

// Bare domain: signed-in users get the app UI; visitors get the public homepage.
app.get('/', (req, res) => {
  if (isAuthed(req)) {
    const app0 = path.join(ROOT, 'public', 'index.html');
    if (fs.existsSync(app0)) { res.type('html'); return fs.createReadStream(app0).pipe(res); }
  }
  return sendHome(res);
});

// Passphrase entry (ungated) — where the homepage's "Start drawing" sends you.
app.get('/enter', (req, res) => {
  if (isAuthed(req)) return res.redirect(basePath(req));
  res.type('html').send(gatePage(basePath(req), false));
});

// Gate middleware: everything below requires a valid cookie.
app.use((req, res, next) => {
  if (isAuthed(req)) return next();
  const base = basePath(req);
  const wantsHtml = req.method === 'GET' && (req.headers.accept || '').indexOf('text/html') >= 0;
  if (wantsHtml) return res.status(401).type('html').send(gatePage(base, false));
  return res.status(401).json({ ok: false, error: 'unauthorized' });
});

// ---- authed routes ----
app.get(['/health', '/api/health'], async (req, res) => {
  const deep = req.query.deep === '1' || req.query.check === 'claude';
  const token = !!process.env.CLAUDE_CODE_OAUTH_TOKEN;
  let runtime = { token, claude: null };
  if (deep) {
    const h = await probeRuntimeHealth(req.query.force === '1');
    runtime = { token: h.token, claude: h.claude };
  }
  const ok = token && (!deep || runtime.claude === true);
  res.status(ok ? 200 : 503).json({
    ok,
    model: MODEL,
    active,
    maxConcurrent: MAX_CONCURRENT,
    projects: countProjects(),
    gate: !!PASSPHRASE,
    runtime,
  });
});

app.get('/projects', (req, res) => res.json({ ok: true, projects: listProjects(callerUid(req)) }));

app.post('/projects', (req, res) => {
  const uid = callerUid(req);
  if (!uid) return res.status(400).json({ ok: false, error: 'missing user id' });
  const name = (req.body && req.body.name) || '';
  if (!name.trim()) return res.status(400).json({ ok: false, error: 'name required' });
  const p = createProject(name, uid);
  res.json({ ok: true, project: p });
});

app.post('/projects/:slug/rename', (req, res) => {
  const slug = req.params.slug;
  const name = ((req.body && req.body.name) || '').trim();
  if (!ownsProject(slug, callerUid(req))) return res.status(404).json({ ok: false, error: 'no such project' });
  if (!name) return res.status(400).json({ ok: false, error: 'name required' });
  try {
    const meta = JSON.parse(fs.readFileSync(metaFile(slug), 'utf8'));
    meta.name = name;
    fs.writeFileSync(metaFile(slug), JSON.stringify(meta, null, 2));
  } catch (e) { return res.status(500).json({ ok: false, error: 'rename failed' }); }
  res.json({ ok: true, project: readProject(slug) });
});

app.delete('/projects/:slug', (req, res) => {
  const slug = req.params.slug;
  if (!ownsProject(slug, callerUid(req))) return res.status(404).json({ ok: false, error: 'no such project' });
  cancelBuild(slug);
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  try {
    fs.renameSync(projectDir(slug), path.join(TRASH_DIR, `${ts}-${slug}`)); // never rm
  } catch (e) { return res.status(500).json({ ok: false, error: 'delete failed' }); }
  queues.delete(slug); statusByProject.delete(slug); runningBuilds.delete(slug);
  // No global fallback project: the client recreates a Scratchpad if this was
  // the caller's last project.
  res.json({ ok: true });
});

app.get('/status', (req, res) => {
  const slug = req.query.project;
  if (!ownsProject(slug, callerUid(req))) return res.status(404).json({ state: 'idle', detail: 'no such project' });
  const st = getStatus(slug);
  const q = projState(slug);
  res.json(Object.assign({}, st, { running: !!q.running, queued: !!q.pending }));
});

app.get('/projects/:slug/history', (req, res) => {
  const slug = req.params.slug;
  if (!ownsProject(slug, callerUid(req))) return res.status(404).json({ ok: false, error: 'no such project' });
  res.json({ ok: true, history: listHistory(slug) });
});

app.get('/projects/:slug/history/:file', (req, res) => {
  const { slug, file } = req.params;
  if (!ownsProject(slug, callerUid(req)) || !safeHistoryFile(file)) {
    return res.status(404).json({ ok: false, error: 'not found' });
  }
  const p = path.join(historyDir(slug), file);
  if (!p.startsWith(historyDir(slug)) || !fs.existsSync(p)) {
    return res.status(404).json({ ok: false, error: 'not found' });
  }
  res.set('Content-Disposition', `attachment; filename="${file}"`);
  res.type('html');
  fs.createReadStream(p).pipe(res);
});

app.post('/projects/:slug/restore', (req, res) => {
  const slug = req.params.slug;
  const file = ((req.body && req.body.file) || '').trim();
  if (!ownsProject(slug, callerUid(req))) return res.status(404).json({ ok: false, error: 'no such project' });
  if (!safeHistoryFile(file)) return res.status(400).json({ ok: false, error: 'invalid snapshot' });
  const q = projState(slug);
  if (q.running || q.pending) return res.status(409).json({ ok: false, error: 'wait for the current build to finish' });
  try {
    const bytes = restoreHistory(slug, file);
    console.log(`[restore ${slug}] restored ${file} (${bytes} bytes)`);
    setStatus(slug, 'updated', `restored ${file}`);
    broadcastProject(slug, { type: 'reload' });
    res.json({ ok: true, file, bytes });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e && e.message ? e.message : e) });
  }
});

app.post('/projects/:slug/cancel', (req, res) => {
  const slug = req.params.slug;
  if (!ownsProject(slug, callerUid(req))) return res.status(404).json({ ok: false, error: 'no such project' });
  const cancelled = cancelBuild(slug);
  res.json({ ok: true, cancelled });
});

// The generated app, per project, served cache-busted for the preview iframe.
app.get('/app', (req, res) => {
  const slug = req.query.project;
  if (!ownsProject(slug, callerUid(req))) return res.status(404).type('html').send(notFoundApp());
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.type('html');
  fs.createReadStream(appFile(slug)).pipe(res);
});

// Raw download for the Export button.
app.get('/app.html', (req, res) => {
  const slug = req.query.project;
  if (!ownsProject(slug, callerUid(req))) return res.status(404).json({ ok: false, error: 'no such project' });
  res.set('Content-Disposition', 'attachment; filename="app.html"');
  res.type('html');
  fs.createReadStream(appFile(slug)).pipe(res);
});

// Serve a submitted sketch frame (for the clarifying-question crop view).
app.get('/frames/:slug/:file', (req, res) => {
  const { slug, file } = req.params;
  if (!ownsProject(slug, callerUid(req)) || !/^[\w.-]+\.png$/.test(file)) return res.status(404).end();
  const p = path.join(framesDir(slug), file);
  if (!p.startsWith(framesDir(slug)) || !fs.existsSync(p)) return res.status(404).end();
  res.type('png');
  fs.createReadStream(p).pipe(res);
});

// Import a user-supplied HTML file as the project's current app (draw-mode
// "Import HTML"). Backs up the current app to history first.
app.post('/import', (req, res) => {
  const body = req.body || {};
  const slug = body.project;
  if (!ownsProject(slug, callerUid(req))) return res.status(404).json({ ok: false, error: 'no such project' });
  let html = (body && body.html) || '';
  if (typeof html !== 'string' || !/<(?:!doctype|html)/i.test(html)) {
    return res.status(400).json({ ok: false, error: 'not an HTML document' });
  }
  if (html.length > 5 * 1024 * 1024) html = html.slice(0, 5 * 1024 * 1024);
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  try {
    if (fs.existsSync(appFile(slug))) {
      fs.copyFileSync(appFile(slug), path.join(historyDir(slug), `${ts}-preimport.html`));
    }
    fs.writeFileSync(appFile(slug), html);
    fs.writeFileSync(path.join(historyDir(slug), `${ts}.html`), html);
  } catch (e) { return res.status(500).json({ ok: false, error: 'import failed' }); }
  console.log(`[import ${slug}] wrote app.html (${html.length} bytes)`);
  setStatus(slug, 'updated', 'imported HTML');
  broadcastProject(slug, { type: 'reload' });
  res.json({ ok: true });
});

app.post('/update', rateLimitUpdate, (req, res) => {
  const body = req.body || {};
  const slug = body.project;
  if (!ownsProject(slug, callerUid(req))) return res.status(404).json({ ok: false, error: 'no such project' });
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
  const kind = body.kind === 'markup' ? 'markup' : 'sketch';
  let view = null;
  if (body.view && typeof body.view === 'object') {
    const v = body.view;
    view = {
      route: typeof v.route === 'string' ? v.route.slice(0, 120) : '',
      title: typeof v.title === 'string' ? v.title.slice(0, 120) : '',
      heading: typeof v.heading === 'string' ? v.heading.slice(0, 120) : '',
    };
  }
  enqueue(slug, { image: imageBuf, notes, kind, view });
  res.json({ ok: true, queued: true, project: slug });
});

app.use(express.static(path.join(ROOT, 'public')));

const server = http.createServer(app);

// WebSocket: scoped per project, gated by the same auth cookie.
const wss = new WebSocketServer({ noServer: true });
server.on('upgrade', (req, socket, head) => {
  if (!isAuthed(req)) {
    socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
    socket.destroy();
    return;
  }
  const uid = callerUid(req);
  let project = null;
  try {
    const u = new URL(req.url, 'http://localhost');
    const q = u.searchParams.get('project');
    if (ownsProject(q, uid)) project = q;
  } catch (_) {}
  wss.handleUpgrade(req, socket, head, (ws) => {
    ws.uid = uid;
    ws.project = project; // may be null until a valid subscribe arrives
    wss.emit('connection', ws, req);
  });
});
wss.on('connection', (ws) => {
  if (ws.project) {
    const st = getStatus(ws.project);
    try { ws.send(JSON.stringify({ type: 'status', state: st.state, detail: st.detail })); } catch (_) {}
  }
  ws.on('message', (data) => {
    let msg; try { msg = JSON.parse(data.toString()); } catch (_) { return; }
    if (msg && msg.type === 'subscribe' && ownsProject(msg.project, ws.uid)) {
      ws.project = msg.project;
      const s = getStatus(msg.project);
      try { ws.send(JSON.stringify({ type: 'status', state: s.state, detail: s.detail })); } catch (_) {}
    }
  });
});

function broadcastProject(slug, obj) {
  const msg = JSON.stringify(obj);
  for (const client of wss.clients) {
    if (client.readyState === 1 && client.project === slug) {
      try { client.send(msg); } catch (_) {}
    }
  }
}

server.listen(PORT, HOST, () => {
  console.log(`Conjure v2 listening on http://${HOST}:${PORT}  (model: ${MODEL}, gate: ${PASSPHRASE ? 'on' : 'OFF'})`);
  sweepProjects(); // relocate orphaned/stale projects on start …
  setInterval(sweepProjects, 24 * 60 * 60 * 1000); // … and once a day
  probeRuntimeHealth(true).then((h) => {
    console.log(`[health] token=${h.token ? 'yes' : 'NO'} claude=${h.claude ? 'ok' : 'FAILED'}`);
  }).catch((e) => console.warn('[health] startup probe error:', e && e.message));
});
