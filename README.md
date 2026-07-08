# Conjure

Sketch a UI and watch it materialize as a working single-file web app in a live
preview. Two input modes:

- **Canvas** — draw with mouse/touch. A 4-color marker palette (black / red / blue /
  green) + eraser + clear, plus a text instruction box. "Build it" or auto-commit
  ~2.5s after the last stroke. Colors carry meaning (a red annotation reads as an
  instruction). Phone-friendly.
- **Camera** — point a webcam at paper. A cheap perceptual diff (64px grayscale)
  detects when the drawing changes and holds still, then commits that frame.

Both modes can attach voice notes (Web Speech API, Chrome; degrades gracefully).

The right pane is an iframe of the current project's generated app, hot-reloaded
over a WebSocket. Export downloads the current app; timestamped copies are kept per
project in `history/`.

## v2 features

- **Projects** — named, isolated canvases under `workspace/projects/<slug>/`
  (`app.html`, `history/`, `frames/`). Create / rename / delete (delete = move to
  `workspace/.trash`, never removed). The default `scratchpad` migrates the legacy
  single-workspace files. WS events and `/app` are scoped per project.
- **Live terminal** — an optional dark terminal panel streams the Claude Code run
  (thinking / text / tool calls / results) with per-kind colors, via
  `--output-format stream-json`. Off by default; the toggle persists in localStorage.
- **Clarifying questions** — if a sketch is critically ambiguous the model may ask
  instead of guessing; the UI shows the question plus a cropped view of the region
  it's asking about, and your answer auto-resubmits the same sketch.
- **Concurrency** — a global 2-slot semaphore with per-project latest-wins queues,
  so multiple simultaneous demo users can't overload the box.
- **Mobile flow** — first visit asks "Is your camera set up?"; after a build the app
  goes fullscreen with a slim back-arrow bar. Touch targets ≥ 44px.
- **Passphrase gate** — a signed httpOnly cookie (30 days) protects every route and
  the WebSocket upgrade.

## Runtime

The server invokes the **Claude Code CLI** (`claude-sonnet-5`) non-interactively to
edit the project's `app.html` from the newest sketch + notes. The token comes from
the environment (`CLAUDE_CODE_OAUTH_TOKEN`, provided via `EnvironmentFile`). The
runtime prompt bakes in [docs/design-tells.md](docs/design-tells.md) (avoid the
AI-slop look) and [docs/web-factors.md](docs/web-factors.md) (real front-end craft).

## Config (`conjure/.env`, read at startup — no dotenv dep)

```
CONJURE_PASSPHRASE=three-word-phrase     # gate; if unset the gate is DISABLED (dev)
CONJURE_COOKIE_SECRET=<random hex>        # HMAC secret for the auth cookie
CONJURE_MAX_CONCURRENT=2                  # global semaphore size (default 2)
```

## Run

```bash
npm install --omit=dev
set -a; . /home/vlad/jarvis/.env; set +a   # provides CLAUDE_CODE_OAUTH_TOKEN
PORT=8091 node server.js
```

Open `http://<host>:8091/`. Base-path agnostic — also works behind a `/conjure`
reverse-proxy mount.

## API (all gated by the passphrase cookie)

- `GET /` — the Conjure UI (unauthenticated requests get the gate page).
- `POST /auth` — `passphrase=…` form; sets the auth cookie on success.
- `GET /projects` · `POST /projects` `{name}` · `POST /projects/:slug/rename` `{name}`
  · `DELETE /projects/:slug` (→ trash).
- `GET /app?project=slug` — the generated app (no-store, for the preview iframe).
- `GET /app.html?project=slug` — download the generated app.
- `GET /frames/:slug/:file` — a submitted sketch frame (for the question crop view).
- `POST /update` — `{ project, image: <base64 png|null>, notes: string[] }`. Per
  project only the newest pending request is kept (latest-wins stale-drop).
- `GET /health` — status JSON.
- `WS ?project=slug` — server pushes `reload`, `status`, `term`, and `question` events.

## Deploy (Jarvis Pi)

Runs as `conjure.service` (see `conjure.service`), port 8091, node. Reached on the
LAN at `:8091` and publicly at `https://conjure.vlad-p.com` via a Cloudflare Tunnel
(`cloudflared`, see `cloudflared.service`). No longer mounted on the tailnet.
