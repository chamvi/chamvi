# Design

The visual identity of the docs site, the logo and the README artwork. The source of truth for tokens is `packages/docs/src/.vitepress/theme/style.css` (`--ch-*` variables); this page records the decisions behind them so new pages, diagrams and assets stay consistent.

## Direction

"Cobalt": one saturated cobalt on near-neutral graphite. Light mode is the reference look (white page, cool grey hero), dark mode is graphite with a lighter cobalt. Cobalt is a signal colour (primary actions, the running status, links, the logo), not a fill for large areas; the neutrals carry almost no hue so the accent does all the work. The failed status is red (`#c1272d` / `#d23a3f`) and never a brand colour.

## Tokens

| Token | Light | Dark |
|---|---|---|
| Hero surface | `#f4f5f8` | `#0c0d10` |
| Fixed-dark surfaces (footer, code blocks) | `#0c0d10` | `#0c0d10` / `#08090b` (code) |
| Page | `#ffffff` | `#121418` |
| Ink | `#121419` | `#ececf0` |
| Muted ink | `#555b67` | `#9a9fab` |
| Line | `#e2e4ea` | `#25282f` |
| Chip | `#eef0f4` | `#1c1f25` |
| Accent (running status, chips) | `#2f55e4` | `#7f9cff` |
| Primary button (white text, 5.9:1) | `#2f55e4` | `#2f55e4` |
| Accent text (links, eyebrows) | `#2243c2` | `#a9bcff` |
| Logo cobalt / seal fill (`--ch-logo`, `--ch-logo-seal` in the UI) | `#4a6ff0` / `#eef2fe` | `#7f9cff` / `#121418` |
| Code ink / keyword / string / comment | `#e3e5ea` / `#8ea7ff` / `#e7c58c` / `#80858f` | same |

The logo cobalt `#4a6ff0` is lighter than the UI accent on purpose: it is never text, while the UI accent must carry white button text and chip labels. The dashboard's full token set (canvas, sunken, tints, the vuecs primary scale) is in `packages/ui-kit/src/shell/style.css`.

Keep text contrast at 4.5:1 or more; the primary button and code comment colours were chosen for that.

## Type and shape

- Display: **Geist** 600, letter-spacing -0.03em, hero line height 1.02 (hero, section headings, doc H1/H2, dashboard headings and figures).
- Body: **Geist**. Code and labels: **Geist Mono** (ligatures off in code samples).
- Both are self-hosted as variable fonts (`@fontsource-variable/geist`, `@fontsource-variable/geist-mono`) in the docs and the dashboard; no Google Fonts, and every weight is a real one (no faux bold).
- Corners: 4px radius everywhere, except square corners (0) for status chips and approval callouts, which read as "signed".

## Logo and artwork

- The logo is an approval seal (scalloped edge, dotted inner ring) around one arched chamber, the run, holding its checkpointed steps bottom up: done (ink), pending (grey), running (cobalt). The seal stands for durable approvals, the chamber for a run that survives restarts.
- The seal has a solid fill of its own (`#eef2fe` light, `#121418` dark), so the mark reads in every scheme and page combination (npm shows the dark scheme on a white page). A transparent seal disappears there.
- `logo-small.svg` is the mark for 32 px and below (the docs favicon `public/logo.svg`, the dashboard's `favicon.svg` and `BrandLogo.vue`): no dotted ring, fewer scallops, a bigger chamber and one lit step, since three steps blur at favicon size. `logo-test-kit.svg` puts a check mark in the chamber; `logo-organisation.svg` is the seal on a full-bleed square.
- The SVGs are generated from one geometry; edit them together, never one alone.
- `.github/assets/*.svg` are theme-aware through a `prefers-color-scheme` style block inside the SVG. The docs use fixed `logo-light.svg` / `logo-dark.svg` (and the lifecycle diagram variants) switched by the site's colour mode, because an SVG in an `<img>` follows the OS setting, not the site toggle.
- GitHub org avatar and repo social preview are PNG renders kept in `.github/assets/`: `avatar.png` (1000×1000, the dark seal on a solid graphite `#0c0d10` square), `avatar-light.png` (the light seal on white) and `social-preview.png` (1280×640, graphite card with the seal, name, pitch and `chamvi.dev`). GitHub has no API for either, so upload them in the web UI (org settings, profile picture; repo settings, social preview) and regenerate them when the logo changes.

## Landing page

Sections in order: hero (eyebrow "Self-hosted agents", headline "Agents that keep the keys.", README pitch, typechecked `defineModelAgent` sample) → feature row → how a run flows (lifecycle diagram) → packages (shipped vs planned) → closing call to action → site-wide dark footer. The nav is transparent over the hero at the top of the page.

## Parked palettes

Cobalt is the brand (chosen 2026-11-20 from rendered previews against Petrol, Folio, Berry, Moss and Cobalt/Berry font mixes). Two earlier palettes stay switchable; status colours stay as they are in both (amber waiting, green completed, red failed).

- **Glacier**: the first brand, a light sky on deep navy, set in Instrument Sans and JetBrains Mono.
- **Violet**: plum-tinted neutrals with a vivid violet accent (chosen 2026-10-21 against Slate, Terminal and Ochre in the dashboard mockups).

Each lives in `.github/assets/palettes/<name>/`: `tokens.css` (the docs site's `--ch-*` values and the full `@chamvi/ui` token set, light and dark) and a copy of every SVG that carries a brand colour (`.github/assets/*.svg`, the docs copies as `docs-*.svg`, the dashboard favicon as `ui-favicon.svg`). `../recolor.py <repo> <palette> <out-dir>` regenerates the copies from the current Cobalt SVGs with its mapping; it fails on any colour it has no mapping for, so a new asset colour cannot slip through. Add the colour to every mapping when an SVG gains one.

| Cobalt | Glacier | Violet | Role |
|---|---|---|---|
| `#2f55e4` | `#1479b0` | `#7c3aed` | Accent and primary button |
| `#7f9cff` | `#9ad8f5` | `#a78bfa` | Dark accent |
| `#4a6ff0` / `#eef2fe` | `#4db3e6` / `#e6f4fb` | `#8b5cf6` / `#f1eafd` | Logo / light seal fill |
| `#121419` / `#ececf0` | `#0b2233` / `#e2f0f8` | `#1a1523` / `#ece6f5` | Ink, light / dark |
| `#555b67` / `#9a9fab` | `#4a5e6d` / `#9db2c2` | `#5c546a` / `#a79db9` | Muted ink, light / dark |
| `#f4f5f8` / `#0c0d10` | `#eef5fa` / `#0a1620` | `#f2f0f6` / `#15111b` | Hero and fixed-dark surfaces |
| `#121418`, `#25282f` | `#0e1d28`, `#1e3242` | `#1c1724`, `#2e2639` | Dark page and dark seal fill, line |
| `#e2e4ea` | `#dce6ee` | `#e5e0ed` | Light line |
| `#a3a8b3` / `#6b717d` | `#9bb0bf` / `#5f7a8c` | `#9a93a8` / `#7a7189` | Pending step pill, light / dark |

Switching means: replace the token values (docs `style.css`, the UI token file, the vuecs primary scale there), swap the `@fontsource-variable` packages and font names when the palette has its own type, copy the SVGs over the Cobalt originals, re-render `avatar.png`, `avatar-light.png` and `social-preview.png` from the new logo (GitHub has no API, upload by hand), update the code-block colours in `packages/docs/src/.vitepress/shiki-theme.ts`, the dark page ground the UI e2e smoke spec asserts and this page's token table, and park Cobalt here.
