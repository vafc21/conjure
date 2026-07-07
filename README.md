# Conjure ✨

Sketch a UI and watch it materialize as a working single-file web app in a live
preview. Two input modes:

- **Canvas** — draw with mouse/touch (pen / eraser / clear) + a text instruction
  box. "Conjure ✨" button or auto-commit ~2.5s after the last stroke. Phone-friendly.
- **Camera** — point a webcam at paper. A cheap perceptual diff (64px grayscale)
  detects when the drawing changes and holds still, then commits that frame.

Both modes can attach voice notes (Web Speech API, Chrome; degrades gracefully).

The right pane is an iframe of the generated `workspace/app.html`, hot-reloaded
over a WebSocket. Status: **Watching 👁 → Conjuring ✨ → Updated ✓**. Export
downloads the current app; timestamped copies are kept in `workspace/history/`.

## Runtime

The server invokes the **Claude Code CLI** (`claude-sonnet-5`) non-interactively
to edit `app.html` from the newest sketch + notes. The token comes from the
environment (`CLAUDE_CODE_OAUTH_TOKEN`, provided via `EnvironmentFile`).

## Run

```bash
npm install --omit=dev
# token must be in the environment for real generation:
set -a; . /home/vlad/jarvis/.env; set +a
PORT=8091 node server.js
```

Open `http://<host>:8091/`. Base-path agnostic — also works behind a
`/conjure` reverse-proxy mount.

## API

- `GET /` — the Conjure UI.
- `GET /app` — the generated app (no-store, for the preview iframe).
- `GET /app.html` — download the generated app.
- `POST /update` — `{ image: <base64 png|null>, notes: string[] }`. Depth-1
  queue: while a job is in flight only the newest pending request is kept.
- `GET /health` — status JSON.
- `WS` (any path) — server pushes `{type:"reload"}` and `{type:"status",...}`.

## Deploy (Jarvis Pi)

Runs as `conjure.service` (see `conjure.service`), port 8091, node.
Tailscale serve mounts it at `/conjure`.
