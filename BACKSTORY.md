# Why Conjure?

Conjure started as a dumb-simple question during the University of Pittsburgh TLI
program: *why can't I just **draw** the app I want and have it exist?*

Every no-code tool we'd tried made you learn its own vocabulary — drag this widget,
bind that field, wrestle a prompt into submission. None of them let you do the most
natural thing in the world: sketch a box, point at it, and say "make this a button."
So we spent a weekend building the thing we actually wanted.

## The weekend

Four of us, a table, and a lot of cold coffee. We split the work into three moving
parts and passed them back and forth until they met in the middle:

- the **canvas** — draw on paper through a webcam, on a digital canvas, or right on top
  of the running app;
- the **runtime** — the Claude Code CLI turning each sketch into a real, self-contained
  `app.html`;
- the **deploy** — getting it live so we could demo from a phone.

By Sunday, "sketch → live app" actually worked end to end.

## What we learned

- **Editing beats regenerating.** The first version rewrote the entire file on every
  change, which was slow and lost detail. Teaching the model to *edit in place* — emit
  only the lines that change — made iterative tweaks roughly **7× faster** and was the
  single biggest quality jump.
- **Fighting the "AI look" is a real feature.** Left alone, models default to
  purple gradients, glassmorphism, and emoji chrome. We wrote design guidance
  ([docs/design-tells.md](docs/design-tells.md)) straight into the runtime prompt so the
  output reads like something a designer shipped, not something a bot generated.
- **Ambiguity should ask, not guess.** When a sketch is genuinely unclear, the model
  pauses and asks — with a crop of the exact region it's unsure about — instead of
  confidently building the wrong thing.

Conjure is shared for demo, learning, and reference. It runs entirely on your own
machine against your own Claude account.
