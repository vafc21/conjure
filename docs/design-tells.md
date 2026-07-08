# Design Tells: How to Not Look AI-Generated

A checklist for Conjure's own UI **and** for the apps Conjure generates. The goal is
work that reads as *deliberately designed by a human*, not as the statistical median of
a model's training data.

Why this happens: LLMs return the median of what they were trained on, and the median
web design since ~2019 is Tailwind's default palette (indigo-500) plus a handful of
copied SaaS-landing-page conventions. Every generation that ships purple gradients feeds
the next model more purple gradients. Distinctiveness comes from *making* a decision
instead of inheriting the default.

Sources: [925 Studios — AI Slop Fonts & Gradients](https://www.925studios.co/blog/ai-slop-design-tells),
[Developers Digest — 16 AI Design Slop Patterns](https://www.developersdigest.tech/blog/ai-design-slop-and-how-to-spot-it),
[Why Your AI Keeps Building the Same Purple Gradient Website](https://prg.sh/ramblings/Why-Your-AI-Keeps-Building-the-Same-Purple-Gradient-Website),
[Tailwind indigo-500 / DEV](https://dev.to/alanwest/why-every-ai-built-website-looks-the-same-blame-tailwinds-indigo-500-3h2p).

---

## The tells (verified)

### Color
- **"VibeCode purple."** Lavender / violet / indigo accents (`#7c5cff`, indigo-500 `#6366f1`)
  — the single loudest signal. Anything in that hue family reads as AI.
- **Purple→blue and purple→teal gradients.** Especially on hero backgrounds, buttons, and
  as text fills. Cyan-on-dark is the same family.
- **Floating gradient "orbs" / glows** behind a hero.
- **Big colored glow box-shadows** (`box-shadow:0 6px 18px rgba(124,92,255,.35)`).
- **Dark-navy-purple palettes** with medium-grey body text that fails WCAG AA contrast.

### Typography
- **Inter everywhere** (or the Space Grotesk / Geist / Instrument Serif cycle) with no
  deliberate pairing — a strong signal the type was never chosen.
- **Gradient-filled hero text.**
- **A single serif-italic "accent word"** dropped into an otherwise-sans hero.
- **ALL-CAPS section labels** on everything.

### Layout / components
- **Centered hero + a pill "badge" above the H1.**
- **Three identical icon-topped feature cards** in a row, evenly spaced, soft shadow.
- **A thick colored border on one edge (top/left) of a rounded card** — a top individual tell.
- **Glassmorphism**: blurred translucent frosted cards over a gradient, everywhere.
- **Oversized border-radius** (16–24px) on everything.
- **Numbered "1 · 2 · 3" step rows** and **stat-banner rows** of big numbers.
- **Sidebars/nav with emoji icons.**

### Chrome / copy / iconography
- **Emoji as decoration** in UI chrome: ✨ 🚀 🎨 👁 🪄 in titles, buttons, section heads.
- **"Magic / conjuring / sparkle" microcopy** and sparkle iconography.
- **Weightless generic copy**: "Build faster. Ship smarter.", "Supercharge your workflow."
- **Placeholder-grade visuals** and generic icons that could illustrate any product.

---

## DO / DON'T

### DON'T
- ❌ Use purple/violet/indigo as an accent, or purple→blue / purple→teal gradients.
- ❌ Fill text with a gradient; add colored neon glow shadows.
- ❌ Frost everything with glassmorphism / backdrop-blur.
- ❌ Decorate chrome with emoji or sparkles, or lean on "magic/conjure" microcopy in UI.
- ❌ Default to Inter-with-no-pairing, oversized radii, or the 3-identical-cards grid.
- ❌ Ship the model's first generic pass as finished.

### DO
- ✅ Pick **one confident accent that is not purple** (a clay red, ink blue, forest,
  ochre…) and use color **semantically** — to signal function, not to decorate.
- ✅ Lean on **neutrals**: warm paper / off-white / honest greys, or a clean true dark.
  Keep body text at AA+ contrast.
- ✅ Choose type on purpose: a solid **system stack** is honest and fast; a single
  distinctive family (or a mono for technical chrome) adds character. Build hierarchy
  with size/weight/spacing, not gradients.
- ✅ Prefer **hairline borders and crisp, modest radii (4–8px)** over heavy shadows.
- ✅ Give a tool a **utilitarian, workshop feel** — dense, functional, labelled — rather
  than a marketing-landing-page feel.
- ✅ Commit to **one strong layout primitive** and repeat it; let real content, not
  filler, drive the design.
- ✅ **Honor the user's stated style** (their sketch, colors, mood) above every default here.

---

## Applied in Conjure

- **Conjure's own UI** (`public/index.html`): warm-paper "drafting table" palette, one clay-red
  accent, mono chrome for the technical bits, no emoji/sparkle/shimmer. The "working" state
  is an honest indeterminate progress bar, not a purple gradient sweep.
- **Generated apps** (`server.js` runtime prompt): an explicit VISUAL STYLE block bans the
  tells above and asks for a restrained, sketch-appropriate palette — while deferring to any
  style the user actually drew or wrote.
