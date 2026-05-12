# Kinder Minds Website — Project Context

> Static marketing site for `kinderminds.nz`. Inherits from parent `CLAUDE.md` files (KM domain, global communication style) — those aren't repeated here.

---

## What this is

Single-page static site. Hosted on GitHub Pages, custom domain via `CNAME`. No build step — files are deployed as-is. Hand-built by Edo while learning web fundamentals; Wix template in `Reference.url` was the visual reference.

---

## Architecture

- One HTML page with multiple `<section id="sec-...">` blocks: `sec-home`, `sec-service`, `sec-about`, `sec-team`.
- `script.js` intercepts nav-link clicks, maps hash fragments → section IDs via a `lookup` table, and hides all sections except the target by adding/removing `.hidden` (which sets `display: none`).
- Deliberate choice: load everything once, swap visibility via CSS for fluidity. Not a true SPA — no client-side routing library, just hash-driven section toggling.
- **Sync risk**: the `lookup` table in `script.js` must match anchor IDs across `index.html`. Adding a new anchor without updating `lookup` will fall through to `sec-home`.

---

## File layout

| Path | Role |
|---|---|
| `index.html` | Production site. |
| `KM-index.html` | **Sandbox.** Isolated from `index.html`. Neither file syncs to the other unless explicitly requested. |
| `maintenanc.html` | Maintenance/downtime page. Note the typo (missing final `e`). Either rename and update links, or formally adopt as canonical — decide before next deploy that needs it. |
| `style.css` | Main stylesheet. `@import 'reset.css'` at top. |
| `reset.css` | Modern minimal reset (box-sizing, margins, image defaults, etc.). |
| `script.js` | Section show/hide + hash routing. |
| `assets/Used/` | Assets in production use. |
| `assets/Unused/` | Kept but not currently displayed. |
| `assets/Logos/` | Brand marks and favicons. |
| `Testing Archive/` | Older experiments (`text-nav.html`, `style-test.css`, `simple.js`). Inert; safe to ignore or eventually delete. |
| `Reference.url` | Link to the Wix design reference (preview page that shows multiple aspect ratios). |
| `CNAME` | GitHub Pages custom domain (`kinderminds.nz`). |
| `README.md` | One-line project description. |

---

## Styling conventions

- **Palette**: CSS custom properties on `:root` (`--km-blue`, `--text-colour`, `--mid-background`, `--light-background`, etc.). Use these, not hex literals.
- **Fonts**: Source Serif 4 (body), Fira Sans (headings), Fira Sans Condensed (nav), Zen Maru Gothic (logo). Loaded via Google Fonts in a single consolidated `<link>`.
- **Layout primitive**: `<article class="grid-row content-right">` (or `content-left`) wrapping a `.decoration` (image) and `.content` (text). Swap the order by changing the class. Modifiers: `.more-text-space` widens the text column.
- **Background variants**: `.bg-light`, `.bg-mid`.
- **Padding helpers**: `.no-pad-top`, `.no-pad-bot`, `.pad-top`, `.pad-bot`.
- **Image positioning helpers**: `.c20img`, `.c30img`, `.c45img`, `.c70img`, `.width-image` — manual `object-position` percentages and width-fill control.
- **Breakpoints**: `1080px` (two-column → stacked + burger menu), `550px` (service-table padding), `450px` (button row → stacked).
- **Maintenance page styling**: gated by `body.maintenance` selectors in `style.css`.
- **Reusable inline icons**: defined once as `<symbol>` inside a hidden `<svg>` at the top of `<body>`, referenced via `<use href="#icon-id">`. Set `fill` and `fill-rule` on the consumer `<svg>` or `<use>` element — they cascade into the symbol's path. Currently used for the Instagram icon.

---

## Deploy

- Push to `main` = live, after GitHub Pages CDN refresh (typically a minute or two).
- I can help draft commits but **never auto-commit or push**. Ask each time.
- No build step, no preview branch. Edit, commit, push.

---

## External dependencies

- **Google Analytics 4**: tracking ID `G-MH4X6DELRQ` hardcoded in `index.html` `<head>`.
- **Font Awesome kit**: `8d59357f15.js` — kit ID is account-linked.
- **Google Fonts**: preconnected, then loaded.

---

## Known quirks worth surfacing before refactors

1. **`<button href="...">`** pattern used throughout. Buttons don't accept `href`; works only because `script.js` reads `href` from any clicked nav element. A semantic refactor should make these `<a class="button">` or move targets to `data-href`.
2. **Service prices are hardcoded in HTML** — any pricing change is a code edit. This is the strongest argument for a CMS.

Surface these when relevant; don't auto-fix during unrelated work.

---

## Working agreement

- Code style: follow `_assets/EG-Code-Guide.md` (referenced from global `CLAUDE.md`).
- Non-trivial visual/structural changes: propose in plan form before editing.
- Content edits: just do them, show the diff.
- JS is the most likely candidate for cleanup (per Edo) but is load-bearing — confirm before refactoring the section show/hide system.
- Keep `index.html` and `KM-index.html` independent.

---

## Future direction (noted, not committed)

- **Headless CMS exploration**: Edo is considering a tool like **Sanity** to make content edits easier without touching HTML. When this comes up, raise the trade-offs:
  - *Sanity*: rich editing UI, structured content, but adds a hosted dependency and a build step.
  - *Decap CMS* (formerly Netlify CMS) / *Static CMS*: git-based, content stays in-repo, no third-party host, still needs templating to avoid hand-editing HTML.
  - *Status quo + better discipline*: extract prices/copy into a small JSON file the page reads at load, no CMS. Lowest-effort middle ground.
