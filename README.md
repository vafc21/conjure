# Conjure

**Sketch a UI and watch it materialize into a working, single-file web app in a live
preview.** Draw a rough layout (or drop in a screenshot), add a note or two, and
Conjure uses the Claude Code CLI to build — and then incrementally edit — a real,
self-contained `app.html` in the pane next to your canvas.

> **About this project** — Conjure was built as a **group hackathon project** for the
> **University of Pittsburgh TLI program**. It's a team effort; the commit history
> reflects contributions from multiple members. Shared here for demo, learning, and
> reference. It runs entirely on your own machine against your own Claude account.

## How it works

Two input modes, both of which can attach voice notes (Web Speech API, Chrome; degrades
gracefully):

- **Canvas** — draw with mouse/touch. A 4-color marker palette (black / red / blue /
  green) + eraser + clear, plus a text instruction box. Hit **Build it** or let it
  auto-commit ~2.5s after your last stroke. Colors carry meaning (a red annotation reads
  as an instruction). Phone-friendly.
- **Add image** — drop a screenshot, logo, or mockup onto the markup (the `Image`
  button). It's composited into what you send, so Conjure builds from your reference.

The right pane is an iframe of the current project's generated app, hot-reloaded over a
WebSocket. Export downloads the current app; timestamped copies are kept per project in
`history/`.

---

## Quick start (run it locally)

### Prerequisites

- **Node.js 18+**
- **The Claude Code CLI, authenticated.** Conjure shells out to `claude` to do the
  actual building, so you need it installed and logged in with your Anthropic account
  (Claude Pro/Max subscription or API credits):

  ```bash
  npm install -g @anthropic-ai/claude-code
  claude            # first run walks you through login
  ```

  Verify it works on its own before running Conjure: `claude -p "say hi"`.

### Run

```bash
git clone https://github.com/vafc21/conjure.git
cd conjure
npm install --omit=dev
node server.js
```

Then open **http://localhost:8091**. That's it — locally the passphrase gate is
**disabled by default**, so you go straight to the canvas. Draw something and hit Build.

> **Auth note.** If the CLI login above worked, Conjure inherits it automatically — no
> token needed. If you'd rather use an explicit token (e.g. on a headless server), run
> `claude setup-token` and export it before starting:
>
> ```bash
> export CLAUDE_CODE_OAUTH_TOKEN=...   # from `claude setup-token`
> node server.js
> ```
>
> Without a working `claude` login **or** token, the UI loads but builds will fail.

### Change the port

```bash
PORT=3000 node server.js     # then open http://localhost:3000
```

---

## Configuration

Conjure reads a plain `conjure/.env` at startup (no `dotenv` dependency). Copy the
template and edit as needed — **none of it is required for local use**:

```bash
cp .env.example .env
```

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `8091` | HTTP port. |
| `CONJURE_MODEL` | `claude-sonnet-5` | Model the runtime passes to `claude -p`. |
| `CONJURE_PASSPHRASE` | _(unset)_ | If set, gates every route behind a passphrase. Leave unset for open local use. |
| `CONJURE_COOKIE_SECRET` | _(random)_ | HMAC secret for the auth cookie (required in production when gated). |
| `CONJURE_ALLOW_OPEN` | `0` | Dev-only escape hatch to run without a passphrase even when `NODE_ENV=production`. |
| `CONJURE_MAX_CONCURRENT` | `2` | Global build semaphore size. |
| `CONJURE_AUTH_RATE_MAX` / `CONJURE_AUTH_RATE_WINDOW_MS` | `5` / `900000` | `/auth` rate limit (per IP). |
| `CONJURE_UPDATE_RATE_MAX` / `CONJURE_UPDATE_RATE_WINDOW_MS` | `10` / `3600000` | `/update` rate limit (per IP). |

**Local vs. exposed:** with no `NODE_ENV=production` and no `CONJURE_PASSPHRASE`, the
gate auto-disables (open access) — perfect for `localhost`. If you ever put Conjure on a
public URL, set `NODE_ENV=production`, a `CONJURE_PASSPHRASE`, and a random
`CONJURE_COOKIE_SECRET`, so only people with the phrase can drive your Claude account.

---

## Features

- **Projects** — named, isolated canvases under `workspace/projects/<slug>/`
  (`app.html`, `history/`, `frames/`). Create / rename / delete (delete = move to
  `workspace/.trash`, never hard-removed). WS events and `/app` are scoped per project.
- **In-place edits** — after the first build the runtime reads `app.html` and edits it
  in place, emitting only changed lines, so iterative tweaks are fast.
- **Live terminal** — an optional dark panel streams the Claude Code run (thinking /
  text / tool calls / results) via `--output-format stream-json`. Off by default; the
  toggle persists in localStorage.
- **Clarifying questions** — if a sketch is critically ambiguous the model may ask
  instead of guessing; the UI shows the question plus a crop of the region it's asking
  about, and your answer auto-resubmits the same sketch.
- **Concurrency** — a global 2-slot semaphore with per-project latest-wins queues, so
  simultaneous users can't overload the machine.
- **Mobile flow** — a first-run tutorial walks new users through markup/build; after a
  build the app goes fullscreen with a slim back-arrow bar. Touch targets ≥ 44px.
- **Passphrase gate** — optional signed httpOnly cookie (30 days) protecting every route
  and the WebSocket upgrade (see Configuration).
- **Presenter mode** — append `?present=1` to auto-open the build terminal; `?starter=todo`
  (etc.) kicks off a starter after load. **⌘/Ctrl+Enter** triggers Build.

## Runtime & design

The server invokes the **Claude Code CLI** non-interactively to edit each project's
`app.html` from the newest sketch + notes. The runtime prompt bakes in
[docs/design-tells.md](docs/design-tells.md) (avoid the AI-slop look) and
[docs/web-factors.md](docs/web-factors.md) (real front-end craft), so generated apps
lean clean and professional rather than the usual purple-gradient-glassmorphism default.

## API

When a passphrase is set, all routes are gated by the auth cookie; locally they're open.

- `GET /` — the Conjure UI (unauthenticated requests get the gate page when gated).
- `POST /auth` — `passphrase=…` form; sets the auth cookie on success.
- `GET /projects` · `POST /projects` `{name}` · `POST /projects/:slug/rename` `{name}`
  · `DELETE /projects/:slug` (→ trash).
- `GET /projects/:slug/history` · `GET /projects/:slug/history/:file` ·
  `POST /projects/:slug/restore` `{file}` · `POST /projects/:slug/cancel`.
- `GET /app?project=slug` — the generated app (no-store, for the preview iframe).
- `GET /app.html?project=slug` — download the generated app.
- `GET /frames/:slug/:file` — a submitted sketch frame (for the question crop view).
- `POST /update` — `{ project, image: <base64 png|null>, notes: string[] }`. Per
  project only the newest pending request is kept (latest-wins stale-drop). Rate-limited.
- `GET /health` · `GET /health?deep=1` — status JSON; `deep=1` probes the Claude runtime.
- `WS ?project=slug` — server pushes `reload`, `status`, `term`, and `question` events.

## Troubleshooting

- **Builds fail / "runtime not healthy"** — run `claude -p "hi"` yourself. If that fails,
  fix your CLI login (`claude`) or set `CLAUDE_CODE_OAUTH_TOKEN`. `GET /health?deep=1`
  probes the runtime.
- **Port already in use** — start with `PORT=3000 node server.js`.
- **Stuck at a passphrase page** — you have `CONJURE_PASSPHRASE` set (or `NODE_ENV=production`).
  Unset it for open local use.

## Deploying it yourself (optional)

Conjure is a single Node process; anything that runs Node works. The repo includes
example unit files — [`conjure.service`](conjure.service) (systemd) and
[`cloudflared.service`](cloudflared.service) (a Cloudflare Tunnel for a public URL) —
from the author's Raspberry Pi setup. If you expose it publicly, **set a passphrase**
(see Configuration): the server drives your Claude account, so open public access = an
open door to your usage.

## License

No formal license yet — this is a shared University of Pittsburgh TLI hackathon project.
It's published for demo, learning, and reference. If you want to reuse it beyond that,
open an issue and ask the team.
