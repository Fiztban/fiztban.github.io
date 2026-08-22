# Conditional consent form — prototype

A custom front-end for the Zanda custom form **"Intake - Combined Consent and
Information Forms"**, which Zanda renders as 17 flat sections in one scroll — 85 fields,
of which only 14 are inputs, wrapped in ~5,400 words of prose, with no conditional
logic. This page asks only what applies and writes the answers back into the shape
Zanda expects.

**Picking this up for the first time? Read [`HANDOVER.md`](HANDOVER.md)** — the full
spec, the Zanda API, the design decisions and what is still outstanding.

---

## Run it

```bash
# Serve it — the page fetches its snapshot, and file:// blocks that
python -m http.server 8765 --bind 127.0.0.1
#   → http://localhost:8765/forms/combined-consent.html?client=<hash>&form=<number>

# Standalone single file — double-click, no server, no network
python forms/build-single-file.py <clientHash> <formNumber>

# Tests
cd forms && npm install && npm test

# Drift check against the live form — before every intake batch, and after
# anyone edits the form in Zanda
node forms/capture-form.mjs --check <clientHash> <formNumber>
```

Use `localhost`, not a LAN IP: the skeleton-hash guard needs `crypto.subtle`, which
exists only in a secure context (https, or localhost).

---

## The two rules

**1. Zanda gives its fields no IDs.** Every `id` in the composition is `null`, so a
field's only identity is its position. Editing the form in Zanda — even fixing a typo
that splits a paragraph — shifts those indices and silently rebinds every answer after
the edit point to the wrong field. It fails quietly, into wrong consent data.

Two guards, and **neither should ever be softened into a warning**: `consent.js`
recomputes a hash of the form's shape at load and refuses to render on mismatch, and
`capture-form.mjs --check` reports exactly what moved.

**2. Legal wording is never retyped here.** Every clause, heading and option label is
rendered from the snapshot at load, so a change in Zanda carries through. Only
navigation and plain-language framing are ours, and every display-time adaptation lives
in one of three named tables in `consent.js` with its reasoning beside it. The payload
keeps Zanda's text to the character — six tests assert it.

---

## Status

Does **not** submit. Zanda's API sends no CORS headers and its session cookie is
`SameSite=Lax`, so no browser on our domain can post to it — a small server-side proxy
is required. See `HANDOVER.md` §9 for the shape of it and the one call still unverified.

---

## Files

| File | Role |
|---|---|
| `combined-consent.html` | The pathway. Structure only. |
| `consent.js` | Field map, conditional logic, derivation, validation, payload. |
| `consent.css` | Extends `../guide/guide.css`. |
| `zanda-combined-consent.json` | Composition snapshot — structure + prose, no client identifiers. |
| `capture-form.mjs` | Re-capture / drift check. Read-only, no dependencies. |
| `build-single-file.py` | Flattens everything into one double-clickable file. |
| `consent.test.js` | 163 assertions over every branch. Dev-only (`jsdom`). |

`combined-consent.local.html` is generated and gitignored — it hard-codes a client hash
and must never reach a public repo or web server.
