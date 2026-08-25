# Kinder Minds Website — Project Context

> Static site for `kinderminds.nz`. Inherits from parent `CLAUDE.md` files (KM domain, global communication style), which aren't repeated here.
>
> Last substantially revised 2026-08-25, when the recoloured design replaced the original and the client guides went public.

---

## What this is

Static site on GitHub Pages, custom domain via `CNAME`. Hand-built by Edo while learning web fundamentals.

Three things live in one repository, and they are only loosely related:

1. **The marketing site** (`index.html`), one page with hash-routed sections.
2. **Client guides** (`guide/`), five per-service pages driven by URL parameters, sent to families individually. Not linked from the marketing site.
3. **Staff tooling** (`staff/link-builder.html`), which builds those guide links.

There is no build step for the marketing site. The guides *are* generated, from sources in `_build/`. See `guide/HANDOVER.md`.

---

## Publishing model

Three tiers, and the distinction matters. Getting it wrong either leaks something or breaks a live page.

| Tier | Mechanism | What's in it |
|---|---|---|
| **Published** | tracked, and not excluded | `index.html`, `style.css`, `script.js`, `header-v2.js`, `reset.css`, `maintenanc.html`, `guide/`, `staff/`, `assets/Used/`, `assets/Logos/`, `CNAME` |
| **In git, not served** | `_config.yml` `exclude:`, or a leading underscore | `forms/`, `_build/`, `CLAUDE.md`, `README.md`, `Reference.url` |
| **Local only** | `.gitignore` | `_archive/`, `_pending/`, `Testing Archive/`, `assets/Unused/`, `node_modules/`, `*.local.html` |

Jekyll runs on GitHub Pages whether or not `_config.yml` exists, passing the hand-written HTML through untouched, and skips anything starting with an underscore. `_config.yml` exists only to say what else shouldn't publish.

**Use the middle tier for working code.** `.gitignore` means "not version-controlled", which is wrong for source you're still writing. `forms/` is in the repository and off the web server.

**`assets/Used/` holds exactly what the site renders, and nothing else.** Everything else goes to `assets/Unused/`, which is not deployed. Before moving anything, check every HTML, CSS and JS file, not just `index.html`. A file quietly referenced by a guide page has been the cause of more than one near-miss.

---

## Architecture

- One page, sections `sec-home`, `sec-service`, `sec-about`, `sec-team`.
- `script.js` intercepts nav clicks, maps hash → section via a `lookup` table, and shows one section by toggling `.hidden` on the rest. Not an SPA, just hash-driven visibility.
- **Sync risk:** `lookup` must match the anchor IDs in `index.html`. A missing entry falls through to `sec-home` silently.
- `header-v2.js` runs the masthead independently: `.is-condensed` on scroll, `.nav-collapsed` when the links no longer fit. Enhancement only, the stylesheet still collapses below 1080px with JS off.
- `script.js` also drives **dated copy** (below).

### Dated copy

Content that retires itself on a date, so nobody has to remember.

```html
<span class="service-badge" data-show-until="2026-11-01">New service model</span>
<p data-show-until="2026-11-01">Our new model for …</p>
<p data-show-from="2026-11-01" hidden>Starting and adjusting …</p>
```

Currently used once, on the ADHD Titration Clinic card, switching **2026-11-01**. All three attributes must carry the same date or the card shows both paragraphs or neither.

It fails safe: the current copy is what's in the HTML, the future copy carries `hidden`, and JS only ever removes or adds `hidden`. With JS off you get today's page, correct now and never swapping. That is the right direction to fail in.

It depends on `[hidden] { display: none !important; }` in `style.css`. `[hidden]` is a user-agent rule, so any author rule that sets `display` beats it. Without the guard the inline-block badge stays on screen and the swap half-works, which is worse than not working.

---

## File layout

| Path | Role |
|---|---|
| `index.html` | The site. The recoloured design, formerly `index-v2.html`. |
| `style.css` | Its stylesheet, formerly `style-v2.css`. `@import 'reset.css'` at top. |
| `script.js` | Section routing, dated copy. |
| `header-v2.js` | Masthead condense and collapse. |
| `maintenanc.html` | Maintenance page (note the missing final `e`). Styled by `body.maintenance` rules in `style.css`. |
| `guide/` | Five client guides plus `guide.css`, `guide.js`, `guide-core.js`, `masthead-v2.js`. Self-contained. |
| `_build/` | Guide sources and assembler. Not published. |
| `staff/link-builder.html` | Builds personalised guide links. |
| `forms/` | Consent and intake prototypes. In git, not served. |
| `assets/Used`, `assets/Logos` | Deployed. `assets/Unused` is not. |
| `_archive/` | Retired designs, local only. |
| `_pending/` | Markup staged for a future release, local only. Currently Chris Jackson. |

---

## Styling conventions

The recolour kept the structural vocabulary and changed the palette, so the primitives below are unchanged from the original design.

- **Palette**: custom properties on `:root`. Read the comments in `style.css`, which record the contrast reasoning: `--brand-cyan` and `--brand-green` are decorative only, and `--subtitle` / `--accent` are the darkened versions that clear AA for text. `--mint` is a surface colour at 1.95:1 and must never be ink. Use the properties, not hex literals.
- **Fonts**: Source Serif 4 (body), Fira Sans (headings), Fira Sans Condensed (nav), Zen Maru Gothic (logo). One consolidated Google Fonts `<link>`.
- **Layout primitive**: `<article class="grid-row content-right">` (or `content-left`) wrapping a `.decoration` (image) and `.content` (text). `.more-text-space` widens the text column.
- **Backgrounds**: `.bg-light`, `.bg-mid`. **Padding**: `.no-pad-top`, `.no-pad-bot`, `.pad-top`, `.pad-bot`.
- **Images**: `.c20img`, `.c30img`, `.c45img`, `.c70img`, `.width-image` set `object-position` and width fill. `.framed-portrait` for team photos.
- **Breakpoints**: `1080px` (stacked and burger), `550px`, `450px`.
- **Inline icons**: `<symbol>` in a hidden `<svg>` at the top of `<body>`, used via `<use href="#id">`. Set `fill` on the consumer. Instagram and Facebook are inline this way, which is why no icon files are deployed.

Images are sized to cover their layout box at 2x, long edge capped at 1600px, JPEG quality 82. `index.html` pulls about 8 MB; it was 38 MB before. Don't add a camera original to `assets/Used`.

---

## Deploy

- Push to `main` = live, usually under a minute.
- **Never auto-commit or push. Ask each time.**
- Verify against the live URL afterwards, not the local copy. Both the deploy landing and the retired paths returning 404 are worth checking.

---

## External dependencies

- **Google Analytics 4**: `G-MH4X6DELRQ`, hardcoded in `index.html`.
- **Font Awesome kit**: `8d59357f15.js`, account-linked.
- **Google Fonts**: preconnected, then loaded.

---

## Known quirks worth surfacing before refactors

1. **`<button href="...">`** throughout. Buttons don't take `href`; it works only because `script.js` reads `href` off whatever was clicked. A semantic fix means `<a class="button">` or `data-href`.
2. **Prices are hardcoded in HTML.** Every pricing change is a code edit. The strongest argument for a CMS.
3. Some `-v2` names outlived the changeover: `header-v2.js`, `guide/masthead-v2.js`, `km-logo-name-below-open-2.svg`. Cosmetic, but they read oddly now that v2 simply is the site.

Surface these when relevant. Don't fix them during unrelated work.

---

## Gotchas that have cost real time

- **Measuring an element inside a collapsed section returns zero height.** Sections other than the current one carry `.hidden`. Remove it before measuring, or a working feature will look broken.
- **`git commit --only <paths>` re-reads the working tree.** It will re-stage files you have just untracked. To untrack something, stage the removal and commit without naming that path.
- **Heredocs eat backslashes.** `\\d` reaches Python as `\d`, and a `\` before a newline becomes a line continuation, so a multi-line search string silently stops matching. Write scripts with the editor when escapes matter.
- **OneDrive restores files mid-operation** and rewrites mtimes. If a file reappears after you move it, suspect sync before suspecting yourself. Office documents also hash differently after a copy, because SharePoint stamps a GUID into `docProps/custom.xml`.
- **Assert every replacement.** A silent no-op looks exactly like success.

---

## Working agreement

- Code style: `_assets/EG-Code-Guide.md` (referenced from global `CLAUDE.md`).
- Non-trivial visual or structural changes: propose a plan first.
- Content edits: just do them, show the diff.
- The section show/hide system is load-bearing. Confirm before refactoring it.
- Verify in a browser, not by reasoning about the CSS. Headless Chrome with a small probe script is quick and has caught several things reasoning alone missed.

---

## Open questions

- **Adult pathway.** Both the front page and the assessment cards say adult assessments are at Dr Castle's discretion. That is a placeholder for a decision Edo and Sarah have not made.
- **Therapeutic Interventions** (EMDR, MBT, CBT, DBT, FBT-AN) is archived to `Testing Archive/archived-service-cards.html`. Never confirmed whether it is genuinely retired.
- **Chris Jackson** is held back until his agreement is signed. Everything for him is in `_pending/`.
- **Kezia's consent review** needs `forms/` served, which means removing one line from `_config.yml`.

---

## Future direction (noted, not committed)

- The marketing page may eventually link to the guides directly. Today they are used separately.
- **Headless CMS**, if prices in HTML become painful. *Sanity*: rich editing, hosted dependency, build step. *Decap / Static CMS*: git-based, still needs templating. *Status quo plus discipline*: prices in a small JSON file the page reads at load. Lowest effort, and probably the right first move.
