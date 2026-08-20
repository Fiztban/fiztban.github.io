# Conditional consent form — prototype

A custom front-end for the Zanda custom form **"Intake - Combined Consent and Information Forms"**.

Zanda renders that form as 17 flat sections in one scroll: **85 fields, of which only 14 are
inputs**, wrapped in ~5,400 words of prose, with no conditional logic. A parent of an under-18
client and an adult consenting for themselves see exactly the same page, including the sections
that explicitly do not apply to them.

This page asks only what applies, in an order that makes sense, and writes the answers back into
the shape Zanda expects.

---

## Status: does not submit

Zanda's API sends no `Access-Control-Allow-Origin` header — a POST preflight from `kinderminds.nz`
returns `405` with no CORS headers at all. A browser on our domain therefore cannot post to it.

The page goes as far as a reviewed, copyable payload. Going further needs a small server-side
proxy (Cloudflare Worker or similar), which would:

1. call `GetForm` to fetch the live composition **and its `customForm.id`** — the id is not the
   number in the URL and only `GetForm` returns it;
2. hand the composition to this page;
3. post the completed composition back to `Save`.

---

## The hazard, stated plainly

**Zanda gives its fields no IDs.** Every `id` in the composition is `null`, sections and fields
alike. A field's only identity is its position: section index, then field index.

Editing the form in Zanda — even fixing a typo that splits one paragraph into two — shifts those
indices and silently rebinds every answer after the edit point to the wrong field. It fails
quietly, and it fails into wrong clinical consent data.

Two things guard against it:

- `consent.js` **recomputes** a hash over the form's shape (every section label, field type, field
  label and option text) at load and refuses to render if it does not match `EXPECTED_SKELETON`.
  It never trusts the `skeletonHash` written in the JSON, so a hand-edit to the snapshot cannot
  slip past.
- `capture-form.mjs --check` compares the **live** form against the snapshot and prints exactly
  what moved.

Never soften either check into a warning.

---

## Files

| File | Role |
|---|---|
| `combined-consent.html` | The pathway. Structure only — no legal wording is typed here. |
| `consent.js` | Field map, conditional logic, derivation, signature pad, payload assembly. |
| `consent.css` | Extends `guide/guide.css`, so the page matches the assessment guides. |
| `zanda-combined-consent.json` | Composition snapshot: structure + prose, all values blanked, **no client identifiers**. |
| `capture-form.mjs` | Re-capture / drift check against the live form. Read-only, zero dependencies. |
| `consent.test.js` | Headless tests over every branch. Dev-only (`jsdom`). |

Legal wording is **always** rendered from the snapshot, never retyped into the HTML — so if the
wording changes in Zanda, this page changes with it. Only navigation and plain-language framing
are ours. Zanda's own option labels carry obsolete routing instructions ("Proceed to Section
2.3"); those are stripped **for display only**, and the value written back stays byte-exact.

---

## Usage

```bash
# Drift check before an intake batch, and after anyone edits the form in Zanda
node forms/capture-form.mjs --check <clientHash> <formNumber>

# Re-capture after a deliberate change, then paste the printed hash into
# EXPECTED_SKELETON in consent.js and re-check every address in FIELDS
node forms/capture-form.mjs --write <clientHash> <formNumber>

# Tests
cd forms && npm install && npm test
```

The page needs `client` and `form` query parameters, the same shape `staff/link-builder.html`
already produces for the intake guide:

```
forms/combined-consent.html?client=0Vhl5VibLxq&form=2920&name=Tāne
```

Serve over HTTP — `fetch` will not load the snapshot from a `file://` URL, and
`crypto.subtle` needs a secure context (https, or localhost).

---

## Two decisions worth knowing about

**The gate pattern.** Optional sections open from a single tick, and leaving it shut is a real
answer, not an unanswered question. The therapy dog section works this way: no tick means
`participation = NO`, and opting in takes two deliberate acts — open the waiver, then agree to it.
Opening it alone is not consent.

The scribe consent deliberately does **not** use a gate. It records an audio-recording consent, and
an untouched tick box cannot be told apart from a considered "no".

**Derived answers are always shown.** Where the pathway answers a Zanda field on the reader's
behalf, the review table marks it *Set for you* and says why. Nothing is written that the signer
has not seen.

---

## A note on section 2.3.3

2.3.3 asks whether Kinder Minds may contact the *other* legal guardians. It is required, and its
options are Yes / No / *"Not applicable – I am the Client"*.

Two cases make the question moot: a client consenting for themselves, and a **sole guardian** (there
are no others to contact). Both are recorded as **Not applicable**. Zanda's wording for that option
names only the client, so this is a deliberate reading rather than an obvious mapping — adding a
fourth option worded for sole guardians would make the record read exactly right, at the cost of a
re-capture.
