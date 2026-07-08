# Web Quality Factors

The factors that separate a well-developed website from a generic one. This is the
reference the Conjure runtime prompt distills so **generated apps** follow real craft,
not just "valid HTML." Pairs with [design-tells.md](./design-tells.md) (which bans the
AI-slop look); this file is the positive checklist.

Sources: W3C WAI / WCAG 2.1 & 2.2 (Target Size 2.5.5 AAA = 44px, 2.5.8 AA = 24px;
Contrast 1.4.3/1.4.11), Nielsen Norman Group form & performance guidance, common
type-scale and spacing-system practice.

---

## 1. Visual hierarchy
The eye should land in a deliberate order. Establish it with **size, weight, color,
and position** — not decoration.
- One clear primary action per view; secondary/tertiary actions visibly quieter.
- Biggest/boldest = most important. Don't make five things all shout.
- Group related things; separate unrelated things (proximity = relationship).
- Use an F- or Z-reading path: important content top-left / top-center.

## 2. Spacing & alignment systems
- Use a consistent spacing scale (e.g. 4/8px base: 4, 8, 12, 16, 24, 32, 48…). Never
  ad-hoc `13px` / `27px` gaps.
- **Whitespace is structural**, not wasted — it groups, separates, and calms.
- Everything aligns to a shared grid/edge. Ragged left edges and off-by-a-few
  padding are the #1 "amateur" tell.
- Consistent gutters; content max-width ~60–75ch for readable prose.

## 3. Contrast & accessibility (WCAG)
- Body text ≥ **4.5:1** against its background; large text (≥18.66px bold / ≥24px) ≥ **3:1**.
- UI components & focus indicators (borders, icons, form outlines) ≥ **3:1**.
- Never rely on color alone to convey meaning (add text/icon/shape).
- Visible keyboard `:focus-visible` state on every interactive element.
- Real labels on inputs (`<label for>`), semantic elements (`button`, `nav`, `main`),
  alt text on meaningful images.

## 4. Responsive behavior
- Mobile-first: single-column, reflowing layout that never needs horizontal scroll.
- `<meta name="viewport" content="width=device-width, initial-scale=1">` always.
- Fluid widths (%, `fr`, `minmax`, `clamp()`) over fixed px; breakpoints where the
  content breaks, not at device names.
- Test 320px → 1440px. Nothing clipped, overlapping, or overflowing.

## 5. Touch targets & input ergonomics
- Interactive targets **≥ 44×44px** (WCAG 2.5.5 AAA; 24px is the 2.5.8 AA floor). Aim 44.
- ≥ 8px spacing between adjacent targets so fingers don't mis-tap.
- Place primary actions within thumb reach on phones (bottom half).
- Inputs get correct `type`/`inputmode` (email, tel, number, `inputmode="numeric"`)
  so mobile keyboards match; `font-size ≥ 16px` on inputs to stop iOS auto-zoom.

## 6. Typography scale
- A deliberate modular scale (e.g. 1.2–1.25 ratio): 12 · 14 · 16 · 20 · 25 · 31…
  Don't use ten arbitrary sizes.
- Base body **16px+**; line-height **1.4–1.6** for body, tighter for headings.
- Limit to 1–2 families; build hierarchy with size/weight/spacing, not new fonts.
- Line length 45–75 characters. Left-aligned body text (not justified/centered blocks).

## 7. Perceived performance
- Show something immediately: content/skeleton first, never a blank frozen screen.
- Instant feedback (< 100ms) on every interaction — pressed states, spinners, optimistic UI.
- Don't block the first paint; avoid layout shift (reserve space for dynamic content).
- Keep it light: no unnecessary work, animations that stay 60fps, no jank on scroll.

## 8. Form UX
- One column; label above field; logical order; group related fields.
- Validate inline and **on blur**, not only on submit; show the specific fix.
- Keep errors next to their field, in words + color + icon (not color alone).
- Sensible defaults, autofocus the first field, don't disable paste, show password toggle.
- Primary submit is obvious; destructive actions are visually distinct and confirmed.
- Preserve entered data on error — never wipe the form.

## 9. Meaningful use of color
- Color signals **function**: primary action, success, warning, danger, selected state.
- One confident accent + neutrals beats a rainbow. Reuse the same semantic colors.
- Ensure state colors still pass contrast and are distinguishable to color-blind users.

## 10. Consistency & polish
- Reuse the same components, radii, shadows, and spacing everywhere — one system.
- Handle **empty, loading, and error states**, not just the happy path.
- Real, plausible content over lorem ipsum / placeholder rectangles.
- Alignment, consistent casing in labels, and matching border-radii read as "designed."
