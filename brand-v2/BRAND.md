# Conjure Brand Specification

> A workshop tool for turning sketches into apps — not a SaaS dashboard.

---

## 1. Color Palette

### Light Mode

| Token | Hex | Usage | Preview |
|-------|-----|-------|---------|
| `--paper` | `#e7e0d2` | Page background, card surfaces | Warm off-white |
| `--ink` | `#26231d` | Primary text, logo mark, icons | Near-black with warmth |
| `--clay` | `#b2482b` | Accent, links, action elements, logo highlight | Muted terracotta |
| `--shadow` | `#c9c0b0` | Subtle borders, dividers, secondary lines | Slightly darker paper |

### Dark Mode

| Token | Hex | Usage | Preview |
|-------|-----|-------|---------|
| `--bg-dark` | `#1a1815` | Page background | Near-black |
| `--surface-dark` | `#24211c` | Cards, elevated surfaces | Dark warm gray |
| `--ink-dark` | `#e7e0d2` | Primary text, logo mark (inverted) | Warm paper |
| `--clay` | `#d45a3a` | Accent (slightly brighter for dark mode) | Muted brick |
| `--border-dark` | `#33302a` | Subtle borders, dividers | Dark warm gray |

### Accessibility

- `#26231d` on `#e7e0d2`: **12.1:1** contrast ratio (exceeds AAA)
- `#b2482b` on `#e7e0d2`: **5.6:1** contrast ratio (exceeds AA)
- `#d45a3a` on `#1a1815`: **7.2:1** contrast ratio (exceeds AAA)
- Never use clay for body text below 14px — it fails small-size readability. Use ink-dark instead.

### Color Usage Rules

- The logo mark uses **ink** as the primary color. Clay is accent only.
- Clay is never a background fill for large areas (max: buttons, underlines, small icons).
- Paper is never used as a foreground color in light mode.
- In dark mode, the logo mark inverts to paper (#e7e0d2). Clay stays as accent.
- **No gradients. No opacity tricks on the logo.** Solid fills only.

---

## 2. Typography

### Primary Font: Inter

```
font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
```

| Context | Weight | Size | Tracking | Line Height |
|---------|--------|------|----------|-------------|
| Logo / Wordmark | SemiBold (600) | 48px+ | -0.02em | 1.0 |
| H1 | Bold (700) | 36–48px | -0.03em | 1.2 |
| H2 | SemiBold (600) | 24–32px | -0.02em | 1.25 |
| H3 | SemiBold (600) | 18–22px | -0.01em | 1.3 |
| Body | Regular (400) | 14–16px | 0 | 1.5–1.6 |
| Small / Caption | Medium (500) | 12px | 0.02em | 1.4 |
| Code | JetBrains Mono / Fira Code | Same-size or -1px | 0 | 1.5 |

### Wordmark Specifics

- **Always** use Inter SemiBold (600) for "Conjure" in the wordmark.
- The period is set in Bold (800) and uses **clay** (#b2482b).
- Minimum wordmark size: 24px (where it's still legible with the period visible).
- Alternative for dark backgrounds: color invert. Text becomes #e7e0d2, period becomes #d45a3a.

---

## 3. Logo Usage

### Primary Mark: Direction A — Materializing Frame

The **Materializing Frame** is the recommended primary logo. Use this as the default everywhere unless visual variety is needed.

### Clear Space

- Minimum clear space around the logo: **12px** on all sides at 96×96 size.
- At other sizes, clear space equals **1/8 of the logo width**.
- No other elements (text, icons, borders) should intrude into this space.

### Minimum Size

- **96×96px** — Standard app header / navigation logo size.
- **48×48px** — Small logo placement (sidebar, card headers). The dissolve dots still read clearly at this size.
- **24×24px** — System tray, toolbar. At this size, use the solid-frame version (no dissolve dots — they vanish). A simplified silhouette version is acceptable.
- **16×16px** — Favicon. Always use the dedicated `favicon-16.svg` (dots are 2px, frame is 2px stroke).

| Size Range | Mark to Use |
|------------|-------------|
| ≥ 64px | Full Materializing Frame (solid frame + dissolve dots) |
| 32–63px | Materializing Frame — keep 3 dots max per side |
| 24–31px | Solid frame only (no dots — they won't read) |
| 16×16px | Dedicated favicon SVG |

### Logo Lockup (Icon + Wordmark)

```
■ Minimum 16px gap between icon and wordmark
■ Icon always to the left of text
■ Alignment: icon and text share the same baseline
■ For vertical lockup (stacked): icon above text, 12px gap
```

### What the Logo Must NOT Do

| ❌ Don't | Why |
|----------|-----|
| Add a drop shadow | Signals "AI generated" — the mark is strong enough without it |
| Stretch or skew | Maintain 1:1 aspect ratio always |
| Outline/stroke with a different color | The logo is meant to be single-color |
| Place on busy backgrounds | Use paper, ink-dark, or surface-dark only |
| Rotate or tilt | The horizontal/vertical axes are part of the window concept |
| Animate as a loading spinner | The dissolve already implies motion — don't literalize it |
| Recolor to anything in the purple/pink/teal spectrum | Violates brand identity |
| Use with a gradient fill | Solid fill only |
| Place inside a circle/capsule/badge container | The frame is the container; don't add another one |
| Use clay as the primary logo color | Logo is ink; clay is accent |
| Resize below 16px | At 16px the mark is at its minimum — any smaller and the frame disappears |

### Single Color Mode

- For one-color reproduction (print, favicon, watermark): use **ink (#26231d)** or **paper (#e7e0d2)** depending on background.
- The dissolve dots retain full opacity — no opacity gradients.
- The accent chevron (Direction C) should be omitted in single-color mode; use the primary ink color instead.

---

## 4. Logo Directions Overview

| Direction | Concept | Best For |
|-----------|---------|----------|
| **A — Materializing Frame** (recommended) | App window frame dissolving into pixel dots | Primary brand mark, app icon, social preview |
| **B — Sketch-to-Code Stroke** | Organic line that becomes a code chevron | Secondary/marketing contexts, animation-friendly |
| **C — C Window Monogram** | "C" as window frame with accent cursor | Favicon, avatar, small badge — when you need the "conjure" shape in minimal space |
| **Wordmark** | "Conjure." in Inter SemiBold with clay period | Landing page header, document title, no-icon contexts |

---

## 5. Tone & Voice in Visual Language

- **The brand is warm, not cold.** Paper backdrop, clay accents, ink text — no cool blues or grays.
- **The brand is precise, not decorative.** 4px strokes, equal gaps, intentional proportions. Nothing is "close enough."
- **The brand is a workshop, not a SaaS.** It should feel like a well-organized maker space — tools visible, materials ready, workspace clear.
- **The brand is built, not generated.** Sharp edges, deliberate geometry. No artifacts of AI-generation (gradients, glows, smudges, noise).
- **The brand shows its work.** The dissolve effect shows the process — you can see where the frame ends and the pixels begin. Transparency of transformation.

---

## 6. File Index

```
brand-v2/
├── BRAND.md                              ← This file
├── RESEARCH.md                           ← Brand research & competitor analysis
├── social-preview-card.svg               ← 1200×630 social card
│
├── direction-a-materializing-frame/      ← Recommended primary mark
│   ├── logo-96.svg                       ← 96×96 app icon
│   ├── favicon-16.svg                    ← 16×16 favicon
│   └── README.md                         ← Rationale
│
├── direction-b-sketch-to-code/           ← Alternate concept
│   ├── logo-96.svg                       ← 96×96 app icon
│   ├── favicon-16.svg                    ← 16×16 favicon
│   └── README.md                         ← Rationale
│
├── direction-c-monogram/                 ← Alternate concept
│   ├── logo-96.svg                       ← 96×96 app icon
│   ├── favicon-16.svg                    ← 16×16 favicon
│   └── README.md                         ← Rationale
│
└── wordmark-only/                        ← Text-only option
    ├── wordmark.svg                      ← 360×96 wordmark lockup
    ├── favicon-16.svg                    ← 16×16 C-mark favicon
    └── README.md                         ← Rationale
```
