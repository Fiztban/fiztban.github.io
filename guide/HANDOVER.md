# Client guides — handover

> Interactive service guides for Kinder Minds. Five pages, built from shared
> partials, driven by URL parameters.
>
> **Live on kinderminds.nz since 2026-08-25.** Unlisted: nothing on the marketing
> site links to them, and they are reached only through the personalised link a
> staff member builds.
>
> Last worked on: 2026-08-25

---

## What these are

One page per service. The same page serves two audiences depending on whether
the URL carries parameters:

- **No parameters** → a plain leaflet. General information, no checklist.
- **With parameters** → a personalised interactive guide: the family's name, their
  own Zanda form links, tickable steps that persist on their device.

Staff generate the link with `staff/link-builder.html`, paste it into the
Missive template, and the family gets one link that replaces the wall of text
in the current intake email.

---

## The five pages

| Page | Stages | Notes |
|---|---|---|
| `adhd-child-assessment.html` | 9 | `pathway=standard\|complex` — $1,500 NP-led or $1,800 Dr Castle |
| `asd-assessment.html` | 9 | $2,600. ADI-R and ADOS-2 |
| `adhd-asd-combined-assessment.html` | 11 | $3,000. All four components |
| `adhd-titration-clinic.html` | 7–9 | `dx=km\|ext` — $250 or $350, and whether reports are needed |
| `post-diagnostic-support.html` | 6 | `via=assessment\|referral` — whether the included hour applies. `ot=1` reveals the OT service |

---

## Build system

Pages are **generated**. Do not edit `guide/*.html` directly — the next build
overwrites them.

```
_build/
  build.js                       the assembler
  partials/
    registration-consent.html    the shared registration & consent stage
    page-foot.html               contact, signature, footer
  pages/
    *.html                       SOURCES — edit these
guide/
  *.html                         OUTPUT — generated, do not edit
```

```bash
node _build/build.js           # build all pages
node _build/build.js --check   # exit 1 if guide/ is out of date
```

Include syntax in a source page, on its own line:

```html
<!--@include registration-consent-->
```

The partial replaces that line verbatim — partials carry their own indentation,
so there is no re-indentation step. Line endings are preserved exactly (the repo
is CRLF; a build that rewrote endings would make every rebuild a whole-file diff).

**Why partials exist:** the registration & consent stage is ~9,800 characters and
byte-identical on all four pages. It carries the consent forms, the guardian
rule and the Care of Children Act wording — content where one page silently
drifting out of step is a real problem. Held in one file, it can only be wrong
once.

---

## URL parameters

| Parameter | Values | Effect |
|---|---|---|
| `name` | free text (40 max) | Personalises every mention. Also switches the page to guide mode. |
| `ref` | `child` `son` `daughter` `teen` | Fallback wording when no name is given. Whitelisted. |
| `client` | Zanda profile hash | Combined with the form numbers to build form links. |
| `reg` `c1` `c2` | form number, or full `https://` URL | Registration form, consent 1, consent 2. |
| `age` | `16plus` `under16` | Pre-answers the consent question. |
| `pathway` | `standard` `complex` | ADHD assessment only. Unset shows both prices. |
| `dx` | `km` `ext` | Titration only. Unset shows both fees. |
| `via` | `assessment` `referral` | Post-diagnostic only. Unset shows the included hour as general information. |
| `ot` | `1` | Post-diagnostic only. Reveals the occupational therapy service, hidden by default. |

### Example

```
guide/adhd-child-assessment.html?name=Éilis&client=0WtS5PDCOQI&reg=2831&c1=2832&c2=2833
```

Form links can be passed as **numbers** (short, resolved against `client`) or as
**complete https:// URLs** (the escape hatch for anything not on Zanda). No form
link is ever defaulted — a wrong default would file a family's forms against
another client's record.

---

## How the variants work

Every conditional follows the same pattern, used six times now:

1. A parameter is read into a class on `<html>` (`mode-guide`, `age-16plus`,
   `dx-km`, `pathway-complex`, `via-referral`, `reg-complete`).
2. Content declares which state it belongs to via a class.
3. CSS **hides** what does not apply.

```css
html:not(.pathway-standard) .pw-standard { display: none; }
```

**Always hide, never re-assert `display`.** An early version used
`display: revert` to show content, which overrode the `hidden` attribute
controlling the consent branches and rendered both simultaneously — asking for
two guardian consents *and* self-consent at once. Two-way hides avoid the whole
class of bug.

### Class vocabulary

| Class | Shows when |
|---|---|
| `leaflet-only` / `guide-only` | no parameters / personalised |
| `pw-standard` `pw-complex` `pw-neutral` | ADHD pathway |
| `dx-km-only` `dx-ext-only` `dx-unknown-only` | titration, exactly one state |
| `dx-not-km` | titration, **ext + unknown** (keeps the report stages on both) |
| `pd-included` `pd-standalone` | post-diagnostic, included hour or not |
| `via-assessment-only` `via-referral-only` `via-unknown-only` | post-diagnostic route |
| `svc-ot` | occupational therapy — hidden unless `?ot=1` |
| `reg-needed` / `reg-done` | registration outstanding or already complete |
| `unless-16plus` | drops when the consent answer proves the child is over 9 |

---

## Files under `guide/`

```
guide/
  HANDOVER.md                    this file
  guide.css                      self-contained, 1,434 lines
  guide-core.js                  names, form links, ticks, progress
  guide.js                       accordion, step links, tick sync
  *.html                         generated pages
```

`guide.css` was flattened out of `guide.css → intake.css → leaflet.css →
reset.css` so nothing outside `guide/` is needed. Section banners mark where
each came from; order matches the old cascade, so specificity is unchanged.
Verified pixel-identical on all four pages after flattening.

`guide-core.js` began as a copy of `intake/intake.js`, which no longer exists:
`intake/` and `leaflets/` were deleted on 2026-08-25, once this self-containment
made them unreferenced. Nothing under `guide/` now reaches outside itself.

Still outside `guide/`, deliberately:
- `staff/link-builder.html` — staff tool, not client-facing
- `_build/` — build tooling and sources

---

## What is live vs local

**Live on kinderminds.nz** since 2026-08-25:
- all five pages in `guide/`, plus `guide.css`, `guide.js`, `guide-core.js` and
  `masthead-v2.js`
- `staff/link-builder.html`

Unlisted rather than secret. Nothing links to them, so they are reached only
through the personalised link a staff member builds, but they are public URLs
and should be written as though a stranger might open one.

**In the repository but not served:** `_build/`, via `exclude:` in `_config.yml`
at the site root. Jekyll also skips anything starting with an underscore.

**Gone as of 2026-08-25:** `leaflets/` and `intake/`, the older superseded
split-page design. Deleted rather than left unlisted. They survive in git
history. Their removal was only possible once `guide.css` was flattened and
`guide-core.js` replaced the shared `intake.js`, because until then every guide
page loaded `../intake/intake.js` and the staff tool loaded
`../leaflets/leaflet.css`.

---

## Open questions

1. ~~**Post-diagnostic pricing conflict.**~~ **Resolved 2026-08-25.** The fee schedule
   (`Services and Fees (Professionals) v2`) settles it: the first hour is included with
   every assessment, further sessions are **$150/hour**, and $200/hour is the
   *occupational therapy* rate. The combined page had carried $200 for further
   sessions; corrected. $200/hour remains correct for a school visit.
2. **Consent wording needs Dr Castle's sign-off.** The Care of Children Act 2004
   framing (16+ consents for themselves; under-16 requires all legal guardians)
   is my reading, not legal advice. The under-16 all-guardians rule is stated as
   *clinic policy*, which is defensible; it was previously stated as law, which
   overstated it.
3. ~~**The live `leaflets/` page carries an incorrect claim.**~~ **Closed
   2026-08-25**, since that page is deleted. The claim was that all referrals are
   discussed at MDT during triage; triage is the directors, and MDT at triage is
   occasional. Correct in the guides. **Still wrong in the source PDF**, which is
   what families are sent today, so this is not fully resolved.
4. **Terminology split.** The parental interview is "ADHD Child Evaluation or
   Young DIVA" in the leaflets and "structured interview" in the Missive email.
   Pick one before families see both.
5. **Tuning into Kids start date.** One leaflet says "end of 2026", the other
   "January 2026" (already past). The page says "ask us about availability".
6. **Titration consent forms.** Currently the same registration and consent
   forms as an assessment. If starting a controlled medication needs its own
   consent, that would be a fourth form (`c3`), not a replacement — the page
   would need one more form card.
7. **Markdown/templating.** Only 34% of a page is prose; the rest is structure.
   Partials solved the duplication that mattered. Full markdown authoring was
   discussed and deferred — revisit if non-developers need to edit content.

---

## Gotchas worth knowing

- **Line endings are LF everywhere.** Fixed 2026-08-25; before that the tree was
  mixed and it caused real bugs. `core.autocrlf=true` was giving Windows a CRLF
  working tree while the repository stored LF, and the two halves of the build had
  drifted apart: `_build/partials/` was CRLF, `_build/pages/` mostly LF, and
  `build.js` concatenates verbatim — so every page in `guide/` carried both endings
  in one file. `.gitattributes` now pins `* text=auto eol=lf`, which overrides
  `core.autocrlf` for every clone, and all 37 offending files were converted.

  Converting was **not** free in git, contrary to what the `core.autocrlf` warnings
  suggest. The index turned out to be inconsistent too: most files were stored LF
  (those diff identically before and after), but 16 had been committed with literal
  CRLF bytes and now show a whole-file ending-only diff — `KM-index.html`,
  `README.md`, `Reference.url`, `reset.css`, `maintenanc.html`,
  `intake/intake.css`, `leaflets/leaflet.css`, both `_build/partials/`, four in
  `forms/`, and three in `Testing Archive/`. That is the one-time price of
  alignment. Commit them on their own — `git add --renormalize .` — so the ending
  churn never lands in the same commit as real content and hides it.

  To tell the two apart: `git diff --ignore-cr-at-eol --numstat -- <file>` prints
  nothing when the change is endings only.

  The reason it matters: a multi-line search string written with `\n` **finds
  nothing** in a CRLF file and reports zero matches rather than an error, so the
  edit silently does nothing. Single-line searches work either way, which is what
  makes it so easy to miss. It cost a run this session and left the link builder
  half-edited and broken once before that. **Assert every replacement** regardless —
  a match count of 1, checked, is the only thing that makes a silent no-op loud.
- **Shell heredocs eat backslashes.** `\\d` in a bash heredoc reaches Python as
  `\d`, and `\2713` became a literal `¹3` in the CSS. Write JS/CSS files with the
  editor, not through a heredoc, when escapes matter.
- **The local test server dies.** `python -m http.server 8731` from the site root.
  It died three times mid-session and Chrome silently returned its error page,
  which looks exactly like a real test failure. **Check the server before
  believing a bad result.**
- **Progress counting ignores accordion state.** A folded stage still owes its
  ticks to the denominator. `tickCounts()` in `guide-core.js` deliberately does
  not consult ancestor visibility — only the consent branch, the tick's own
  label, and whether registration is already complete.
- **Step numbers in prose are rewritten at runtime.** `renumberStepLinks()` reads
  each link's target position among *rendered* stages. Necessary because a
  hidden stage renumbers everything after it — with `dx=km` the titration page
  loses two stages, and every "step N" after them would otherwise be wrong.
- **Cross-page links declare their own parameters** via `data-service-params`.
  Assuming them centrally sent `dx=km` (titration-only) onto assessment links.

---

## Verifying a change

```bash
python -m http.server 8731          # from the site root
node _build/build.js                # rebuild after editing a source
node _build/build.js --check        # confirm guide/ matches sources
```

Then open each page in both modes:

```
guide/adhd-child-assessment.html                                   # leaflet
guide/adhd-child-assessment.html?name=Éilis&client=DEMO123456&reg=2831&c1=2832&c2=2833
```

Use `client=DEMO123456` for testing — **never** a real client hash in a shared
link, since those buttons open that family's actual consent forms.

---

## 2026-08-25 — Assessment pages standardised

The combined page was still on the pre-`intro-panel` design: loose `lede` paragraphs
above the panel, a `price-single` block, no component cards. Rebuilt onto the ADHD/ASD
panel flow, and the two older pages pulled level with it.

| | ADHD | ASD | Combined |
|---|---|---|---|
| `Who this assessment is for` | **added** | had | **added** |
| `Appointment options` | reworded | reworded | **added** |
| `price-panel` + include cards | had | had | **added** |
| Component cards with prices | 2 | 2 | **4** |
| Carry-over fee paragraph | **added** | **added** | **added** |
| `#support-after` | **added** | trimmed | **added** |
| `#school-visit` | had | **added** | **added** |

Decisions taken this session:

- **One nurse title.** `Nurse Specialist` everywhere. The fee schedule uses two
  ("Clinical Nurse Specialist in Neurodiversity" for Kezia, "Specialist Nurse" for
  Chris) and the combined page used both. Kezia and Chris divvy up the work, so two
  titles on a client-facing page only confuse.
- **Interviews are online only.** The ACE / Young DIVA / DIVA parental interview and the
  ADI-R are `Online only` on every page, until capacity allows offering in-person as
  well. The ADOS-2 stays in-person-only in Whangārei — `pill-must`, the one warm pill,
  is kept unique to that travel constraint.
- **ADI-R is 1 hour**, not the 1–1.5 the combined page had.
- **Carry-over fees.** If an assessment changes pathway, components already completed
  that also belong to the new pathway are covered by its price; only components outside
  it are charged. Same paragraph on all three pages.
- **No complex combined.** The `pathway=standard|complex` split stays ADHD-only.
- **Further-support callout pulled** from all three `#support-after` sections while
  Tuning into Kids and the OT sensory assessment are not running. An HTML comment in
  each source marks where to restore it. `post-diagnostic-support.html` still
  advertises both — deliberately untouched, but it is the same exposure.

- **Combined stage 8 renamed** to `Diagnosis appointment`, matching ADHD and ASD.
  It had been "Psychiatric assessment & feedback with Dr Castle" while its own panel
  said "Diagnosis appointment" and the medication section called it "the feedback
  appointment" — three names for one hour with Dr Castle. Nine references updated;
  the tick id stays `step-feedback`, which is what the ADHD page uses too.
- **Line endings unified to LF** — see the gotcha below.

Still open: whether ADHD has a lower age floor the way autism has 5; and whether the
adult ADHD pathway is genuinely identical (the page now says only "contact us", which
does not claim that it is). `post-diagnostic-support.html` is next.

---

## 2026-08-25 — Post-diagnostic support brought into line

Last of the five pages onto the shared `intro-panel` shape. Same moves as the
others: loose `lede` paragraphs folded into the panel, `task-note-boxed`,
`Who this is for` highlight, `Appointment options`, and `price-panel` with
include cards instead of a `price-single` plus a detached `price-grid`.

**The included hour now has three honest states**, all off `?via=`:

| `via=` | Headline | Says |
|---|---|---|
| `assessment` | **Included** | "already paid for — book it in the month after the diagnosis" |
| unset | **Included** | names all three assessments that include it |
| `referral` | **$150 per hour** | the hour is gone from the page entirely |

The unset copy had named only the ADHD and Combined assessments — `asd-assessment.html`
postdates this page, so the autism assessment was silently missing from the list of
what includes an hour. Fixed.

The panel's peek line also promised "what is included" to every reader including a
standalone referral, for whom nothing is. Split into `pd-included` / `pd-standalone`,
the same idiom the booking stage already used.

**Occupational therapy is written but partitioned.** The programme card under
`#programmes` shows at all times, and is first in that list. Every *other* trace — price panel,
clinician line, programme card, and one clause inside Appointment options — carries
`svc-ot`, and `html:not(.ot-on) .svc-ot { display: none; }` removes the lot.
`?ot=1` sets `.ot-on` to preview. Verified by deleting the four `svc-ot` subtrees
and grepping the remainder: no OT content survives with the flag off, and the page
still parses balanced. When OT goes live, delete one CSS rule.

**Programmes moved below the last step** into `<section class="after-stages"
id="programmes">`, matching where `#support-after` and `#school-visit` sit on the
assessment pages. ACT, Tuning into Kids and Sensory each carry a `pill-soon`
**Coming soon** pill. Step 6 (Further support) was repeating the same prices and
programme names one screen above; trimmed to the $150 line plus a pointer down.

Three CSS additions, each in its matching section of `guide.css`:

- `.pill-soon` — violet, the one hue the pill set had not used, so "not yet open"
  reads as a different kind of fact rather than another appointment detail. 8.3:1.
- `.callout-ok` — the affirming green callout, for "even without a diagnosis…".
  Reuses the greens already in `.pill-done`, so it is a new pairing, not a new
  colour. 7.4:1.
- `html:not(.ot-on) .svc-ot` — the OT partition.

Cross-page links carry `name` and `ref` plus whatever `data-service-params`
declares, so a family arriving from an assessment lands personalised and on
`via=assessment`; a family arriving from the leaflet lands on `via=assessment` in
leaflet mode. Both read correctly.

Still open on this page: **Tuning into Kids has no agreed start date.** The fee
schedule says "from end of 2026", one leaflet said "January 2026" (already past).
The card says "ask us about current availability" — deliberately, until it is
settled. ACT does carry "from September 2026", which is the fee schedule's date and
is next month.

### Later the same day — four refinements

- **Sensory first, and always visible.** The programme card under `#programmes`
  dropped its `svc-ot` and leads the list; only the price panel, the clinician
  line and the Appointment-options clause stay behind the flag. So the OT check
  now reports two deliberate "leaks" — that card. Anything else is a real one.
- **"1 hour included"**, not the looser "Included", as the price headline. The
  subtitle stopped repeating it and now just states the scope.
- **Bullets split onto two lines.** `<strong>lead</strong><span class="li-detail">`
  replaces `lead &mdash; detail`, with one CSS rule (`display: block`). Applied to
  both lists in the panel, since they are the same shape and leaving one dashed
  would read as an oversight. Detail lines were recapitalised and given full stops.
- **Edo prefers dashes minimised.** Not a one-off for these bullets. There are
  still ~86 `&mdash;` across the five pages; not touched, since a blanket sweep
  would rewrite a lot of prose that reads fine. Worth a pass if he asks.

---

## 2026-08-25 — Titration clinic onto the shared shape

Last page. Same panel flow as the other four, plus one new price rule.

**Prices are section content, not panel furniture.** First attempt made
"Medication Commencement or Review appointment" the title of a price panel and
put each fee in its own white card inside it. That read as a bubble within a
bubble. Corrected: the appointment is an `h3` in a `sub-block` like
"Appointment options", its explanatory paragraph sits under it, and the fees are
plain `price-panel-head` rows — the same figure-left, label-right layout as
every other price on the site.

**One new rule**, replacing the `.price-duo` grid that the first attempt added:

```css
.price-panel-head + .price-panel-head {
  border-top: 1px solid var(--line);
  padding-top: 1.15rem;
}
```

Stacked rather than side by side, because the head layout is horizontal already:
two in one row would give a 2.1rem figure and a paragraph half the width each.
Source order decides precedence, so $250 and the stimulant fee come first, and
when a `dx-` class hides one the other sits alone with no divider to draw.

Added `html.dx-ext .dx-not-ext { display: none; }`, the mirror of `dx-not-km`,
so a figure can show in km + unset.

| `dx=` | Commencement / review | Safety appointment | First-month figure |
|---|---|---|---|
| `km` | $250 only | 30 minutes | $250 |
| `ext` | $350 only | 1 hour | $350 |
| unset | both, stacked | "30 minutes or 1 hour" | "$250 or $350" |

Each price panel carries its own **what is included** card, so a figure and what
it buys are never a scroll apart. Commencement: safety appointment, medication
plan, Special Authority, GP letter, time for questions. Monthly: weekly follow-up
(`Online` + `Nurse Specialist` pills), observation review, dose advice, and the
prescriptions for the month. The "organised by the nurse" qualifier was dropped,
pending a decision on whether pills belong on that line.

The amber "Your first month" `.highlight` sits after the monthly panel rather
than inside it. Dose adjustments and Your prescriptions left as they were. Three
`Clinical Nurse Specialist` occurrences standardised to `Nurse Specialist`.

### Two bugs found while doing it

- **Two figures concatenated in the unset state.** The first-month note used
  `dx-not-ext` and `dx-not-km` for the $250/$350 figures, and *both* render when
  `dx` is unset, giving "($250$350)". Split into three mutually exclusive states.
  The general lesson: `dx-not-*` classes overlap in the unset state, so two of
  them can never be used as if they were alternatives.
- **Duplicate `id="step-observations"`**, on both the `<li>` and its checkbox.
  Pre-existing in the working tree, not from this session. Tick persistence
  survived it because `guide-core.js` iterates checkbox elements rather than
  calling `getElementById`, and the step link resolved to the `<li>` by document
  order, which happened to be the right target. Renamed the checkbox to
  `step-observations-sent`, matching `step-feedback-attended` and
  `step-pds-booked` elsewhere.

### And a correction to the `.li-detail` rule

`display: block` was not enough. Inside `.include-card-wide` the `li` becomes a
flex row above 800px, where a block child is still just another item on the same
line — which is why the first bullet stayed put. `flex: 0 0 100%` is what actually
breaks it, and `flex-wrap` was already on. Inert outside flex contexts.

---

## 2026-08-25 — Link builder onto guide.css

Ship prep, part one. `staff/link-builder.html` now loads `../guide/guide.css`
instead of `../leaflets/leaflet.css`.

The swap was clean because `guide.css` was flattened *out of* `leaflet.css`, so it
already carries `.leaflet-header`, `.leaflet-footer`, `.header-contact`, `.wrap`,
`.title-block`, `.eyebrow`, `.subtitle` and `.button`, and every custom property the
builder-specific `<style>` block references resolves. That block defines only form
furniture — `fieldset`, `.field`, `.radio-row`, `.diagnostics`, `.alert`,
`.actions` — none of which `guide.css` has any reason to carry. Zero collisions.

Two things had to move with it:

- **Fonts.** The builder was loading Source Serif 4. `guide.css` puts
  `Source Sans 3` on `p, li, label` (line 872), so every one of those would have
  dropped to a system fallback. It now loads the exact font URL the guides use.
- **Masthead.** Swapped from `.leaflet-header` to the guides' `.site-banner` /
  `.banner-logo`, so all six pages become one thing to change when the v2 masthead
  lands. The "not for clients" warning moved into the eyebrow, since the banner
  positions its logo absolutely and has nowhere to put a second element.

### Parameter coverage — verified complete

Every parameter the five pages read is offered by the builder, bar one:

| Read by a page | Offered |
|---|---|
| `name` `ref` `age` `client` `reg` `c1` `c2` | yes |
| `pathway` (ADHD), `dx` (titration), `via` (post-diagnostic) | yes, each gated to its own service |
| `ot` (post-diagnostic) | **no — deliberately** |

`reg`/`c1`/`c2` are emitted through a data-driven `row.key` loop rather than named
literals, which is worth knowing before concluding from a grep that they are absent.

**`ot=1` is documented in the builder but has no control.** It reveals the
occupational therapy service and its $800 fee on a page where OT is not yet running,
so a field for it sits one mis-click from putting an unavailable service and its
price in front of a family. The hint under the `via` field says the flag exists and
says to add it to the URL by hand. Give it a control when OT launches — at which
point the `svc-ot` partition comes out anyway and the flag stops mattering.

### Still to do — the v2 masthead

`index-v2.html` / `style-v2.css` / `header-v2.js` are the target. Doing one page
first as a test. Two decisions still open:

1. **Fixed or static?** v2 fixes the masthead to the viewport. The guides have
   `.progress-wrap { position: sticky; top: 0 }`, which would slide underneath it.
   Fixed means setting `top: var(--header-reserve)` on the progress bar and adding
   the condense JS to six pages; static means the gradient simply scrolls away and
   the progress bar behaves exactly as it does now.
2. **The empty nav strip.** v2 uses `--nav-height: max(44px, logo * 0.2053)`. That
   44px floor exists purely as a tap target for links there are none of here.

Worth knowing before starting: **only `km-logo-name-below-open-2.svg` carries the
`<g id="Threshold">` box** the v2 pin depends on. The other two logo files do not.
The constant checks out — `1116.567 * 0.870883 + 164.838 = 1137.24`, over a 1431
viewBox, is `0.79471`, matching `--logo-above-threshold: 0.7947`.
