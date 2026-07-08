# Conjure — Brand & Logo

Conjure turns a drawing into a working web app. You sketch a UI on paper (webcam) or on
the screen; a real app materializes as your ink fades away. The identity has to hold that
one moment — **sketch → app** — without a single "AI magic" cliché (see
[`docs/design-tells.md`](../docs/design-tells.md): no purple, no gradients-as-identity, no
✨/🪄, no glassmorphism, no generic blob mark).

---

## Chosen direction — "The Materializing Frame"

The mark is an **app window** that has come to life — a crisp rounded frame with a solid
clay-red **header bar** — while the **bottom-right corner is still fading**, drawn as a
rhythm of shortening, lightening ink dashes. That is the product in one glyph: the
interface is real (frame + header), and the last of your ink is dissolving out of the
corner. It reads instantly as "an app," and the fade gives it the specific meaning nothing
generic carries.

Why it wins: it survives at 24px (the header size) and as a favicon, where the two rejected
directions fell apart; the window silhouette is universally legible; and the sketch/fade
idea is carried by *one* deliberate detail instead of decoration. It sits naturally in the
existing drafting-table UI (warm paper, ink, one clay-red accent).

**Rejected directions** (kept in `explorations/`): *02 — Stroke → Components* (an ink
downstroke dispersing into UI blocks) had the nicest motion but collapsed into ambiguous
specks below ~32px and lost all meaning at favicon size. *03 — Gesture → Window* (a single
ink curl squaring off into a frame) was the most expressive large, but the curl turned to
mud at small sizes and read as a magnifier/thumbprint — too risky for a mark that must live
at 24px.

---

## Colors

Reuse the product's existing tokens — the mark is built from them, nothing new.

| Role | Light | Dark |
|------|-------|------|
| Ink / frame / wordmark | `#26231d` | `#efe9dd` |
| Paper / background | `#e7e0d2` | `#211d17` (warm charcoal — **not** navy) |
| Clay-red header / accent | `#b2482b` | `#c65a39` (lifted for contrast on charcoal) |
| Accent shadow (hover/press) | `#8f3820` | `#8f3820` |

Favicon tile (inverted "app chip"): tile `#26231d`, frame `#efe9dd`, header `#c0512f`.

The frame and fade use `currentColor`, so the header mark auto-adapts between light and dark
just by setting the container's `color`; only the header bar is a fixed accent. Contrast:
ink-on-paper and light-on-charcoal both clear WCAG AA for graphical objects (≥3:1).

## Clear space & minimum size

- **Clear space:** keep free space equal to the height of the red header bar (≈ ⅕ of the
  mark's height) on all four sides of the mark or the full lockup.
- **Mark (`mark.svg`):** minimum **24px**. It's verified legible there. Below ~20px, switch
  to `favicon-16.svg` (heavier stroke, fade dropped, open corner).
- **Lockup (`logo.svg`):** minimum **22px** tall; below that the wordmark crowds — use the
  mark alone.
- Never recolor the header bar off-accent, add a glow/shadow, rotate the mark, or "finish"
  the fading corner — the open corner is the point.

## Typography

Wordmark is **Hanken Grotesk, SemiBold (600)**, outlined to paths (no font dependency),
tracking +0.06em, optically centered to the mark. A sturdy humanist grotesque — deliberately
*not* Inter / Space Grotesk (both flagged as AI tells) — that stays legible at header size
and echoes the app's honest system-sans chrome. Wordmark is monochrome ink for versatility;
color lives only in the mark.

## Tagline

Proposed: **1) "Draw it. Watch it run."**  · 2) "Ink becomes interface."  · 3) "Sketch it,
then use it." — **Chosen: "Draw it. Watch it run."** Plain, confident, action-led; names the
draw → working-software leap and the come-alive moment without a whiff of "magic/AI-powered."

---

## Assets

| File | Use |
|------|-----|
| `logo.svg` | Full lockup (mark + wordmark), light bg |
| `logo-dark.svg` | Full lockup, **transparent** — drop on warm charcoal |
| `mark.svg` | Mark alone (ink on transparent) — app header, ≥24px |
| `wordmark.svg` | "Conjure" wordmark alone (paths, ink) |
| `favicon.svg` | Favicon, ink tile + light frame (scalable, ≥20px) |
| `favicon-16.svg` | Simplified favicon for 16px (no fade, open corner) |
| `social-card.svg` | 1200×630 OG/social preview with tagline |
| `explorations/*` | The three concept directions (01 is the chosen, refined) |

All SVGs are hand-authored, self-contained (no external refs/fonts), and XML-validated.

---

## Integration snippet (app header)

Replaces the plain pen-nib block in `public/index.html` (currently the `<div class="brand">`
at lines ~182–190). The mark inherits `--ink` via `currentColor`, so **dark mode needs no
SVG swap** — just retheme the CSS vars. Keeps the wordmark as live, fast system-ui text
(honest per design-tells); swap in `wordmark.svg`/`logo.svg` if you want the exact Hanken
letterforms.

```html
<div class="brand">
  <span class="logo" aria-hidden="true">
    <svg width="22" height="22" viewBox="0 0 96 96" fill="none">
      <path d="M30 78 L24 78 A8 8 0 0 1 16 70 L16 26 A8 8 0 0 1 24 18 L72 18 A8 8 0 0 1 80 26 L80 50"
            stroke="currentColor" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M24 18 L72 18 A8 8 0 0 1 80 26 L80 30 L16 30 L16 26 A8 8 0 0 1 24 18 Z"
            fill="var(--accent)"/>
      <g stroke="currentColor" stroke-width="6.5" stroke-linecap="round">
        <path d="M30 78 L46 78" opacity=".9"/>
        <path d="M55 78 L64 78" opacity=".48"/>
        <path d="M80 58 L80 67" opacity=".42"/>
      </g>
    </svg>
  </span>
  <h1>Conjure</h1>
  <span class="sub">sketch → app</span>
</div>
```

```css
/* additions/overrides for the brand block */
.brand .logo{display:flex;color:var(--ink)}      /* frame + fade follow the ink token   */
.brand h1{font-size:.98rem;margin:0;font-weight:700;letter-spacing:.2px}
/* dark mode: set --ink to #efe9dd (frame flips automatically); --accent to #c65a39 */
```

Favicon (in `<head>`):

```html
<link rel="icon" href="/brand/favicon.svg" type="image/svg+xml">
<link rel="alternate icon" href="/brand/favicon-16.svg" sizes="16x16">
```

### Watch out for
- The `<path fill="var(--accent)">` needs the SVG **inline** (not an `<img src>`) for the CSS
  var and `currentColor` to resolve. `mark.svg` on disk hardcodes `#b2482b`/`#26231d` for
  standalone/`<img>` use — that's intentional; use the inline snippet above in the header.
- Assets assume they're served at `/brand/…`. If `public/` is the web root, copy or symlink
  `brand/` under it (a later task's call — this deliverable only writes to `brand/`).
- Bump the mark to **22–24px** (current header was 18px and read as too bare).
- The open/fading corner is deliberate — don't let a linter "close the path."
</content>
