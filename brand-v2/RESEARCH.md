# Conjure Brand Identity — Research Report

## 1. Developer-Tool Brand Autopsy

### Vercel
- **Mark:** A geometric triangle/chevron (the "V"). Simple enough to draw in one stroke, memorable at 16px.
- **Colors:** Black + white + electric blue accent. The blue is used sparingly (links, buttons), making it feel deliberate.
- **Spacing:** Extremely generous. Their logo lockup has more whitespace than many brands have content.
- **Takeaway:** The Vercel mark works because it's not trying to depict anything (a cloud, a server). It's purely abstract-geometric, which gives it flexibility. It reads as "premium dev tool" instantly.

### Linear
- **Mark:** A stylized "L" made of two rounded rectangles. That's it.
- **Colors:** Slate gray, white, a single accent (blue or orange in their UI). No noise.
- **Fonts:** Inter — but the key is tracking (letter-spacing). Linear's text has noticeably more breathing room than default Inter.
- **Takeaway:** Linear proves you can have zero illustration skill and make a world-class brand mark. The "L" is literally two shapes. What makes it work is precision in the geometry — the radius matches, the gaps are equal, the proportions are exactly right.

### Supabase
- **Mark:** The infinity-ish shape made of two overlapping circles.
- **Colors:** A warm green (not grass green, not emerald — very specific "postgres green"). Paired with deep navy.
- **Takeaway:** The mark is ambitious (curves, overlap, negative space) but pulls it off because the geometry is mathematically clean. At 16px it blurs into a blob — but the recognition is already established.

### Figma
- **Mark:** A square with rounded corners, divided diagonally, three colored quadrants.
- **Colors:** Orange, pink, purple, green, black. Rare example of multi-color working in a dev tool because the logo literally *is* the product metaphor (a canvas divided into frames).
- **Takeaway:** When the logo is the literal product interface, you can break rules. Works because the simplicity of a split square means it still functions at 16px as a blob of color.

### Sentry
- **Mark:** A bug (insect) made of geometric shapes — hexagon body, angled wings.
- **Colors:** Dark red accent. Everything else is gray-to-black.
- **Takeaway:** A representational mark (a bug) for a debugging tool is clever conceptually, but the Sentry mark struggles at small sizes (the legs vanish). Their wordmark does the heavy lifting.

### Raycast
- **Mark:** A rounded square with a command symbol (`⌘`) extracted as negative space.
- **Colors:** Almost monochrome. Red accent for their Raycast Pro tier.
- **Takeaway:** The command symbol is perfect for a dev tool — it's already a recognized icon in the audience's brain. Raycast simply borrowed it. Great shortcut when you can find the right cultural symbol.

### Tailwind
- **Mark:** A stylized "wind" swoosh — negative space forming a leaf/wing shape between two gradient curves.
- **Colors:** The gradient is specific (cyan via indigo via purple). Very recognizable.
- **Takeaway:** Gradients are risky in a logo (they complicate replication). Tailwind gets away with it because the gradient IS the brand — it references their utility-class pattern and "layers" concept.

### Stripe
- **Mark:** A nested blue gradient square with rounded corners. A smaller lighter square inside.
- **Colors:** A dark blue gradient (that's literally the entire palette for the mark).
- **Takeaway:** Stripe's logo is aggressively simple. It's a gradient rectangle. But the *proportions* are exactly right — the inner square's gutter width matches the corner radius. Every measurement is intentional.

### Clerk
- **Mark:** A horizontal aperture shape (slightly trapezoidal) — evoking a camera shutter or keyhole.
- **Colors:** Deep purple-black. Typography-heavy brand.
- **Takeaway:** Clerk's mark is abstract enough to not mean anything literally, but the "aperture" reads as "authentication/access/security" subconsciously. Clever semantic play.

### VSCode
- **Mark:** The infinity-blue angled window shape. Just a skewed square with a gap.
- **Colors:** Blue — but never the same blue. Their brand blue has shifted multiple times.
- **Takeaway:** VSCode's logo is iconic but not because it's beautiful. It's iconic because of massive repeated exposure. At small sizes it's indistinguishable from any other blue window icon.

### Cross-Cutting Findings

| Factor | What Works | What Doesn't |
|--------|-----------|--------------|
| **Simplicity** | Can draw in 3 strokes | More than 5 distinct elements |
| **Small-size test** | Recognizable at 16px without outline | Depends on thin lines or tiny details |
| **Color restraint** | 1-2 colors max for the mark | Gradients, multiple hues |
| **Geometric precision** | Matched radii, equal gaps, golden-ratioish proportions | "Close enough" alignment |
| **Conceptual fit** | Logo references the product domain | Logo that could be any SaaS (generic globe, abstract swoosh, generic puzzle piece) |

## 2. Minimal Brand Design Principles

### What separates a good simple logo from a forgettable one

1. **Intentional proportion.** A simple logo fails when the shapes are "just placed." Vercel's triangle works because the angle is exactly right — not too acute, not too obtuse. Linear's L works because the corner radius matches the gap width. Measure everything.

2. **A single hook.** The best simple logos have one surprising element — one twist that makes you look twice. For Vercel, it's the negative-space gap in the triangle. For Figma, it's the three colors. For Conjure, the hook could be the "dissolving corner" where the frame transitions into dots/code.

3. **No decoration.** If it doesn't serve recognition or concept, cut it. Decorative flourishes, extra strokes, drop shadows, bevels — all noise.

4. **Bold shapes > thin lines.** A thick solid shape survives every context. Thin lines disappear at small sizes, require stroke-weight compensation, and look fragile.

5. **Silhouette test.** A good logo should be recognizable as a silhouette in a single color. If the silhouette is boring or unrecognizable, the logo has a shape problem.

### Minimum Viable Logo Checklist (from research)
- [ ] Recognizable at 16×16px
- [ ] Works in single color (no gradients, no fills)
- [ ] Silhouette is distinct from competitors
- [ ] Can be drawn from memory after 3 seconds of looking
- [ ] No more than 3 visual elements
- [ ] All radii and gaps are intentional (not default SVG values)

## 3. Small-Size Icon Design

### Constraints at 16×16px
- You have ~14 usable pixels (1px margin each side)
- 2px-thick lines work; 1px lines disappear
- Curves need generous radii (sharp corners alias badly)
- Avoid: gaps smaller than 1px, diagonal lines thinner than 2px, text (renders as mud)
- Work at: 3-5 bold shapes max

### Favicon best practices
- Pure shape, no text
- Single color on transparent (or a single solid-color square with cutout)
- 2px minimum stroke, 3px+ for outer bounds
- High contrast against both light and dark browser chrome
- For SVG favicons: `viewBox="0 0 16 16"`, no external stylesheets, no `<style>` blocks

### 24×24px (app icon) constraints
- 3px lines are comfortable
- Can handle 2-3 distinct shapes
- Can handle a thin accent if it's 2px and high-contrast
- Still too small for readable text

## 4. Color Psychology for Developer/Creative Tools

### What colors say in this context

| Color | Signals | Best For | Examples |
|-------|---------|----------|----------|
| **Black / Near-black** | Power, seriousness, premium | Text, main identity | Vercel (black), Linear (#1a1a1a) |
| **Warm neutrals (beige, cream, paper)** | Craft, handmade, organic | Backgrounds, warmth | Conjure's current palette (#e7e0d2) |
| **Clay / Terracotta / Rust** | Grounded, earthy, maker | Accents ("this is a tool") | Conjure's #b2482b |
| **Dark ink (#26231d)** | Readable, serious, not cold | Typography | Conjure's current dark |
| **Cool blues** | Trust, code, enterprise | Generic SaaS feel | Every B2B company (use sparingly) |
| **Green** | Growth, data, "go" | Postgres (Supabase), Shopify | Niche, not right here |
| **Purple** | Creative, magic, premium | Clerk, Stripe's Drippy | _Specifically ruled out_ |
| **White** | Clean, minimal, lots of room | Backgrounds | Linear, Notion |

### The Conjure context
Conjure's palette is unusual in developer tools — warm and paper-based rather than cold and technical. This is a **strength** that differentiates it. The paper background + clay accent positions it as a "workshop" tool, not a "cloud dashboard." Stay in this lane.

**Heuristic:** The brand should feel like something you'd find in a well-organized maker's workshop — not a San Francisco SaaS company. The colors support this. Don't dilute it.

## 5. Typeface Selection

### Why Inter dominates developer tools
- Designed specifically for screens (tall x-height, open apertures)
- Neutral but warm — doesn't add personality, doesn't subtract either
- Zero licensing friction
- Reads well at every size
- The "Inter look" has become the visual language of developer tools — it signals "serious software"

### When to break away
- **Linear uses Inter** but modifies spacing to create personality
- **Vercel uses custom geometric** (close to Inter but subtly wider)
- **Stripe uses custom** — a modified rounded sans that's theirs alone
- **Notion uses a custom variant** of Sans Serif

### Recommendation for Conjure
**Primary: Inter** — it's the safe bet and fits the "developer tool" context. The warmth comes from the color palette and spacing, not the font choice. If a custom font is in the budget later, a slightly wider, slightly softer Inter derivative would be ideal.

**Headings:** Inter Bold or SemiBold, letter-spacing tracking slightly tighter than default (-0.02em).
**Body:** Inter Regular, generous line-height (1.5–1.6).

**Fallback stack:** `Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`

## 6. "AI Generated" vs "Crafted" — A Meta Concern

This is critical because Conjure IS an AI tool. The risk is that it looks like every other AI tool (gradient-purple, glassmorphism, sparkle-adjacent).

### Signals of "AI Generated" (avoid)
- Gradients — especially purple-to-pink or blue-to-teal
- Glassmorphism (frosted glass, blurred backgrounds)
- Sparkle/sparkle-adjacent icons (stars, magic wands)
- "Floating" elements with large drop shadows
- Sans-serif that's too round (looks like Midjourney-era branding)
- Abstract smooth blobs (the "goopy organic" look)

### Signals of "Crafted" (pursue)
- Sharp, precise geometry
- Deliberate color choices (not just "the AI palette")
- Clear visual hierarchy
- Intentional negative space
- Consistent stroke weights and radii
- Texture that reads as deliberate, not decorative

### The Challenge
Conjure literally conjures apps from sketches — it IS magic. The brand needs to acknowledge the "conjuring" without falling into AI-branding clichés. The solution: frame it as **craft** rather than **magic**. A workshop tool, not a magic wand. The "conjuring" is the result of skill + tool, not a mystical incantation.

**Tone:** "This is what you make. You draw, we build." — not "✨ AI POWERED MAGIC ✨"

## 7. The Materializing Frame Concept — Evaluation

### Current logo diagnosis
The "app window materializing from ink dashes" concept is strong:

**What works:**
- The conceptual metaphor is perfect for Conjure (sketch → app in front of your eyes)
- It's conceptually distinct — no other dev tool uses "materialization" as a concept
- The window frame is universally recognized

**What needs work:**
- If the bottom-right "fading ink dashes" are too intricate, they'll vanish at 16px
- The "fading" effect (opacity gradient or dash-length gradient) needs to be bold enough to survive small sizes
- The window frame itself needs precise proportions (avoiding "generic app window" shape)
- The transition from "solid frame" to "dashes" should be sharper — code-like rather than paint-like

**Improvement directions:**
1. Make the window frame simpler (outline-only, no filled header — it's cleaner)
2. Replace "ink dashes" with something more dev-tool appropriate — code dots, pixel grid, or bracket fragments that read as "turning into code"
3. Use exactly one dash weight (not variable) for the dissolving corner — treat it as a dot matrix with equal spacing
4. Consider making the "dissolving" effect bolder — a larger missing chunk with code-like elements rather than tiny dashes

### Potential Replacements for the Dissolving Corner
- **Pixel grid** — the frame breaks into individual squares (pixels), referencing the screen/code output
- **Code brackets** — `{ }` or `<>` fragments replacing the dashed area
- **Sharp dashed pattern** — geometric dashes at precise 45° angles, like a circuit trace
- **Step fade** — the frame doesn't gradually fade; it snaps from solid to broken (reads as deliberate)

---

## Key Takeaways for Design

1. **Keep the warm paper + clay palette** — it's the strongest differentiator
2. **Make every measurement intentional** — matched radii, equal gaps, deliberate proportions
3. **The logo must work at 16px** — test ruthlessly
4. **No AI clichés** — no purple, gradients, glassmorphism, or sparkles
5. **"Workshop" over "SaaS"** — the brand should feel like a maker space, not a dashboard
6. **The dissolving corner is the hook** — make it sharp and code-like, not soft and paint-like
7. **Single-color mode** — everything must work in one color against any background
