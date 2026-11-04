# Design

The visual identity of the docs site, the logo and the README artwork. The source of truth for tokens is `packages/docs/src/.vitepress/theme/style.css` (`--ch-*` variables); this page records the decisions behind them so new pages, diagrams and assets stay consistent.

## Direction

"Glacier": a light sky blue on deep navy. Dark mode is the reference look; light mode is a deeper sky on blue-tinted white. Sky is a signal colour (primary actions, the running status, links, the logo), not a fill for large areas. The failed status is red (`#c1272d` / `#d23a3f`) and never a brand colour.

## Tokens

| Token | Light | Dark |
|---|---|---|
| Hero surface | `#eef5fa` | `#0a1620` |
| Fixed-dark surfaces (footer, code blocks) | `#0a1620` | `#0a1620` / `#06111a` (code) |
| Page | `#ffffff` | `#0e1d28` |
| Ink | `#0b2233` | `#e2f0f8` |
| Muted ink | `#4a5e6d` | `#9db2c2` |
| Line | `#dce6ee` | `#1e3242` |
| Chip | `#e9f1f7` | `#172a38` |
| Accent (running status, chips) | `#1479b0` | `#9ad8f5` |
| Primary button (white text, 4.8:1) | `#1479b0` | `#1479b0` |
| Accent text (links, eyebrows) | `#0b5e8c` | `#b5e3f8` |
| Logo sky / seal fill (`--ch-logo`, `--ch-logo-seal` in the UI) | `#4db3e6` / `#e6f4fb` | `#9ad8f5` / `#0e1d28` |
| Code ink / keyword / string / comment | `#dce9f2` / `#8fd0f2` / `#e7c58c` / `#7f95a6` | same |

The logo sky `#4db3e6` is lighter than the UI accent on purpose: it is never text, while the UI accent must carry white button text and chip labels.

Keep text contrast at 4.5:1 or more; the primary button and code comment colours were chosen for that.

## Type and shape

- Display: **Instrument Sans** 600, letter-spacing -0.015em, hero line height 1.02 (hero, section headings, doc H1/H2, dashboard headings and figures). Tighter tracking or 700 crowds the letters at hero size.
- Body: **Instrument Sans**. Code and labels: **JetBrains Mono**.
- Both are self-hosted as variable fonts (`@fontsource-variable/instrument-sans`, `@fontsource-variable/jetbrains-mono`) in the docs and the dashboard; no Google Fonts, and every weight is a real one (no faux bold).
- Corners: 4px radius everywhere, except square corners (0) for status chips and approval callouts, which read as "signed".

## Logo and artwork

- The logo is an approval seal (scalloped edge, dotted inner ring) around one arched chamber, the run, holding its checkpointed steps bottom up: done (ink), pending (grey), running (sky). The seal stands for durable approvals, the chamber for a run that survives restarts.
- The seal has a solid fill of its own (`#e6f4fb` light, `#0e1d28` dark), so the mark reads in every scheme and page combination (npm shows the dark scheme on a white page). A transparent seal disappears there.
- `logo-small.svg` is the mark for 32 px and below (the docs favicon `public/logo.svg`, the dashboard's `BrandLogo.vue`): no dotted ring, fewer scallops, a bigger chamber and one lit step, since three steps blur at favicon size. `logo-test-kit.svg` puts a check mark in the chamber; `logo-organisation.svg` is the seal on a full-bleed square.
- The SVGs are generated from one geometry; edit them together, never one alone.
- `.github/assets/*.svg` are theme-aware through a `prefers-color-scheme` style block inside the SVG. The docs use fixed `logo-light.svg` / `logo-dark.svg` (and the lifecycle diagram variants) switched by the site's colour mode, because an SVG in an `<img>` follows the OS setting, not the site toggle.
- GitHub org avatar and repo social preview are PNG renders kept in `.github/assets/`: `avatar.png` (1000×1000, the dark seal on a solid navy `#0a1620` square), `avatar-light.png` (the light seal on white) and `social-preview.png` (1280×640, navy card with the seal, name, pitch and `chamvi.dev`). GitHub has no API for either, so upload them in the web UI (org settings, profile picture; repo settings, social preview) and regenerate them when the logo changes.

## Landing page

Sections in order: hero (eyebrow "Self-hosted agents", headline "Agents that keep the keys.", README pitch, typechecked `defineModelAgent` sample) → feature row → how a run flows (lifecycle diagram) → packages (shipped vs planned) → closing call to action → site-wide dark footer. The nav is transparent over the hero at the top of the page.

## Alternative palette: Violet (parked)

Glacier is the brand. Violet is the one alternative the owner wants to keep switchable (chosen 2026-10-21 against Slate, Terminal and Ochre in the dashboard mockups): plum-tinted neutrals with a vivid violet accent. Status colours stay as they are (amber waiting, green completed); only `failed` changes, from solid ink to red, since the accent is not red.

Everything needed to switch lives in `.github/assets/palettes/violet/`:

- `tokens.css`: the docs site's `--ch-*` values (drop-in for `theme/style.css`) and the full `@chamvi/ui` token set, light and dark.
- Violet copies of every SVG that carries a brand colour: `logo.svg`, `logo-small.svg`, `logo-test-kit.svg`, `logo-organisation.svg`, `run-lifecycle.svg`, and the docs copies as `docs-*.svg` (`logo`, `logo-light`, `logo-dark`, `run-lifecycle-light`, `run-lifecycle-dark`).
- `../recolor.py <repo> <out-dir>` regenerates them from the current Glacier SVGs with its mapping; it fails on any colour it has no mapping for, so a new asset colour cannot slip through.

| Glacier | Violet | Role |
|---|---|---|
| `#1479b0` | `#7c3aed` | Accent and primary button (white text 5.7:1) |
| `#9ad8f5` | `#a78bfa` | Dark accent (primary button stays `#7c3aed` in dark mode) |
| `#4db3e6` / `#e6f4fb` | `#8b5cf6` / `#f1eafd` | Logo sky / light seal fill |
| `#0b2233` / `#e2f0f8` | `#1a1523` / `#ece6f5` | Ink, light / dark |
| `#4a5e6d` / `#9db2c2` | `#5c546a` / `#a79db9` | Muted ink, light / dark |
| `#eef5fa` / `#0a1620` | `#f2f0f6` / `#15111b` | Hero and fixed-dark surfaces |
| `#0e1d28`, `#1e3242` | `#1c1724`, `#2e2639` | Dark page and dark seal fill, line |
| `#dce6ee` | `#e5e0ed` | Light line |
| `#9bb0bf` / `#5f7a8c` | `#9a93a8` / `#7a7189` | Pending step pill, light / dark |

Switching means: replace the token values (docs `style.css`, the UI token file), copy the SVGs over their Glacier originals, re-render `avatar.png`, `avatar-light.png` and `social-preview.png` from the new logo (GitHub has no API, upload by hand), update the code-block keyword colour in `packages/docs/src/.vitepress/shiki-theme.ts` (`#8fd0f2` to `#c4a5ff`) and this page's token table, and move Glacier into this section.
