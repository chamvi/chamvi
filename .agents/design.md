# Design

The visual identity of the docs site, the logo and the README artwork. The source of truth for tokens is `packages/docs/src/.vitepress/theme/style.css` (`--ch-*` variables); this page records the decisions behind them so new pages, diagrams and assets stay consistent.

## Direction

"Crimson": a wax-seal crimson on charcoal. Dark mode is the reference look; light mode is crimson on cool white (no sand, no teal). Crimson is a signal colour (primary actions, the running status, links, the logo), not a fill for large areas, so warnings and errors never read as branding.

## Tokens

| Token | Light | Dark |
|---|---|---|
| Hero surface | `#f4f4f5` | `#19171a` |
| Fixed-dark surfaces (footer, code blocks) | `#19171a` | `#19171a` / `#121012` (code) |
| Page | `#ffffff` | `#201d1f` |
| Ink | `#1b1a1c` | `#efe8e6` |
| Muted ink | `#5c5b60` | `#b0a5a4` |
| Line | `#e6e6e9` | `#332e30` |
| Chip | `#f0f0f2` | `#2c2729` |
| Accent (running status, chips) | `#c8303b` | `#e04652` |
| Primary button (white text, 5.3:1) | `#c8303b` | `#c8303b` |
| Accent text (links, eyebrows) | `#b02a34` | `#ff7b84` |
| Code ink / keyword / string / comment | `#e6dfde` / `#ff7b84` / `#e7c58c` / `#958a8b` | same |

Keep text contrast at 4.5:1 or more; the primary button and code comment colours were chosen for that.

## Type and shape

- Display: **Instrument Sans** 600, letter-spacing -0.015em, hero line height 1.02 (hero, section headings, doc H1/H2, dashboard headings and figures). Tighter tracking or 700 crowds the letters at hero size.
- Body: **Instrument Sans**. Code and labels: **JetBrains Mono**.
- Both are self-hosted as variable fonts (`@fontsource-variable/instrument-sans`, `@fontsource-variable/jetbrains-mono`) in the docs and the dashboard; no Google Fonts, and every weight is a real one (no faux bold).
- Corners: 4px radius everywhere, except square corners (0) for status chips and approval callouts, which read as "signed".

## Logo and artwork

- The logo is three arched chambers on one floor, one per agent, each holding the steps its run has checkpointed; the middle chamber is the running one.
- Colours: the arches use the crimson accent, the floor and step pills use the ink (`#1b1a1c` light, `#ede6e3` dark), the pending step pill a warm grey.
- `.github/assets/*.svg` are theme-aware through a `prefers-color-scheme` style block inside the SVG. The docs use fixed `logo-light.svg` / `logo-dark.svg` (and the lifecycle diagram variants) switched by the site's colour mode, because an SVG in an `<img>` follows the OS setting, not the site toggle.
- GitHub org avatar and repo social preview are PNG renders kept in `.github/assets/`: `avatar.png` (1000×1000, the dark logo tile with a solid charcoal fill and transparent corners outside the rounded border), `avatar-light.png` (the same render of the light tile on a solid white fill) and `social-preview.png` (1280×640, charcoal card with logo, name, pitch and `chamvi.dev`). GitHub has no API for either, so upload them in the web UI (org settings, profile picture; repo settings, social preview) and regenerate them when the logo changes.

## Landing page

Sections in order: hero (eyebrow "Self-hosted agents", headline "Agents that keep the keys.", README pitch, typechecked `defineModelAgent` sample) → feature row → how a run flows (lifecycle diagram) → packages (shipped vs planned) → closing call to action → site-wide dark footer. The nav is transparent over the hero at the top of the page.

## Alternative palette: Violet (parked)

Crimson stays the brand. Violet is the one alternative the owner wants to keep switchable (chosen 2026-10-21 against Slate, Terminal and Ochre in the dashboard mockups): plum-tinted neutrals with a vivid violet accent. Status colours stay as they are (amber waiting, green completed); only `failed` changes, from solid ink to red, since the accent is not red.

Everything needed to switch lives in `.github/assets/palettes/violet/`:

- `tokens.css`: the docs site's `--ch-*` values (drop-in for `theme/style.css`) and the full `@chamvi/ui` token set, light and dark.
- Violet copies of every SVG that carries a brand colour: `logo.svg`, `logo-test-kit.svg`, `logo-organisation.svg`, `run-lifecycle.svg`, and the docs copies as `docs-*.svg` (`logo`, `logo-light`, `logo-dark`, `run-lifecycle-light`, `run-lifecycle-dark`).
- `../recolor.py <repo> <out-dir>` regenerates them from the current Crimson SVGs with the mapping below; it fails on any colour it has no mapping for, so a new asset colour cannot slip through.

| Crimson | Violet | Role |
|---|---|---|
| `#c8303b` | `#7c3aed` | Accent and primary button (white text 5.7:1) |
| `#e04652` | `#a78bfa` | Dark accent (primary button stays `#7c3aed` in dark mode) |
| `#b02a34` / `#ff7b84` | `#6d28d9` / `#c4b5fd` | Accent text, light / dark |
| `#1b1a1c` / `#efe8e6` (`#ede6e3` in logos) | `#1a1523` / `#ece6f5` | Ink, light / dark |
| `#5c5b60` / `#b0a5a4` | `#5c546a` / `#a79db9` | Muted ink, light / dark |
| `#f4f4f5` / `#19171a` | `#f2f0f6` / `#15111b` | Hero and fixed-dark surfaces |
| `#201d1f`, `#2c2729`, `#332e30`, `#121012` | `#1c1724`, `#2a2236`, `#2e2639`, `#0a0710` | Dark page, chip, line, code |
| `#e6e6e9`, `#f0f0f2` | `#e5e0ed`, `#efecf4` | Light line, chip |
| `#9a9396` / `#7d7375` | `#9a93a8` / `#7a7189` | Pending step pill, light / dark |

Switching means: replace the token values (docs `style.css`, the UI token file), copy the SVGs over their Crimson originals, re-render `avatar.png`, `avatar-light.png` and `social-preview.png` from the new logo (GitHub has no API, upload by hand), update the code-block keyword colour in `packages/docs/src/.vitepress/shiki-theme.ts` (`#ff7b84` to `#c4a5ff`) and this page's token table, and move Crimson into this section.
