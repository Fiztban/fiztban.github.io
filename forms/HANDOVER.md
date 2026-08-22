# Handover — conditional consent form over Zanda

> Everything a new session needs to pick this up cold. Written 2026-08-22.
> Read this first; `README.md` is the short operational version.

---

## 1. What this is

A custom front-end for one Zanda custom form — **"Intake - Combined Consent and
Information Forms"**.

Zanda renders that form as **17 flat sections in one scroll: 85 fields, of which only
14 are inputs**, wrapped in ~5,400 words of prose, with no conditional logic. A parent
of an under-18 client and an adult consenting for themselves see exactly the same page,
including the sections that explicitly do not apply to them.

This page asks only what applies, then assembles the exact `composition` payload
Zanda's own client posts to `CustomForm/Save`.

| Path | Questions asked |
|---|---|
| Client consenting for themselves | 9 |
| Guardian, sole | 11 |
| Guardian, co-guardians | 13 |

**It does not submit.** That is the one substantial piece of work outstanding — see §9.

---

## 2. Run it

```bash
# Serve it (needed: the page fetches its snapshot, and file:// blocks that)
python -m http.server 8765 --bind 127.0.0.1
#   → http://localhost:8765/forms/combined-consent.html?client=<hash>&form=<number>

# Standalone single file — double-click, no server, no network
python forms/build-single-file.py <clientHash> <formNumber>
#   → forms/combined-consent.local.html   (gitignored: it hard-codes a client hash)

# Tests (163 assertions, every branch)
cd forms && npm install && npm test

# Drift check against the live form — run before every intake batch
node forms/capture-form.mjs --check <clientHash> <formNumber>
```

Use `localhost`, not a LAN IP: the skeleton-hash guard needs `crypto.subtle`, which
only exists in a secure context (https, or localhost).

The `client` and `form` values come from the personalised link. A Zanda form URL is
`clientportal.zandahealth.com/clientportal/kinderminds/customform/<clientHash>/<formNumber>`.

---

## 3. How it works

```
zanda-combined-consent.json     structure + prose, all values blanked
        │                       (no client identifiers — safe in a public repo)
        ▼
consent.js  ── verifies the skeleton hash, refuses to render on mismatch
            ── renders legal text VERBATIM from the snapshot
            ── shows/hides by data-when, derives answers, validates
            ── rebuilds the composition with answers written in
        ▼
review table (every field + value)  →  payload preview
```

`combined-consent.html` holds **structure only**. No legal wording is typed into it:
every clause, heading and option label is rendered from the snapshot at load. If the
wording changes in Zanda, this page changes with it.

**Steps 1–7 are the form's own sections 1–7.** The badge in the gutter states the
section number explicitly (not a CSS counter — that numbered by position and drifted).
Review is this pathway's own and carries no number.

---

## 4. The Zanda API — everything learned

Undocumented; all of this came from reading their minified client bundle
(`clientportal-assets.zandahealth.com/dist/clientPortal.js`) and probing the live API.

### Endpoints

| Endpoint | Notes |
|---|---|
| `GET /api/v1/{portal}/CustomForm/GetForm?publicId=&formDataNumber=&token=` | Full definition **and any saved values**. No auth beyond a session cookie. |
| `POST /api/v1/{portal}/CustomForm/Save` | Body `{id, composition, status}` |
| `GET /api/v1/{portal}/CustomForm/DownloadPdf?formDataNumber=` | Rendered PDF |
| `GET /api/v1/{portal}/CustomForm/FileUrl?fileName=&sgUniqueId=` | Drawing images |
| `POST /api/v1/{portal}/File/UploadClientFile?publicId=` | Attachments |
| `POST /api/v1/{portal}/CustomForm/EncryptToken` | For authenticated form links |

`{portal}` is `kinderminds`.

### The session handshake

An uncookied request gets a **302 back to the same URL** carrying
`Set-Cookie: .AspNetCore.Cookies=…`. Node's `fetch` keeps no cookie jar, so following
redirects automatically loops until it gives up (`redirect count exceeded`). Do one
manual hop, keep the cookie, retry — `capture-form.mjs` implements this and works.

### `Save` payload

```js
{
  id:          <customForm.id>,       // NOT the number in the URL — only GetForm returns it
  composition: { sections: [...] },   // the whole tree, values written in
  status:      2                      // 0 = Locked (submitted), 1 = Draft, 2 = AutoDraft
}
```

Zanda's own client autosaves every **5 s** while dirty at `status: 2`
(`useInterval(save, 5000)`). That is client-side React, not a server behaviour — our
page replaces their JS entirely, so it must re-implement it (about ten lines).

### Field types (their enum)

`0` Multiselect · `1` Select · `2` Text · `3` TextArea · `4` Checkbox · `5` Drawing ·
`6` Information · `7` Signature · `8` ProfileField · `9` FileUpload · `10` CustomProfileField

### Where a value lives

| Kind | Property |
|---|---|
| Text / TextArea | `field.text` |
| Select / Multiselect | `field.options[i].selected` |
| Checkbox | `field.checked` |
| Signature | `field.dataUrl` (base64 PNG) |
| Drawing | `field.selectedDrawing` names which image |

`field.currentValue` exists in the JSON but is **vestigial** — their client never reads it.

### Drawings — a trap

`customForm.drawings` is the clinic's **whole shared image library**, across every
custom form. A name appearing there says nothing about whether this form uses it. Only
the field's own `selectedDrawing` does. (Cost an hour: the page showed the wrong photo
of Neve because a filename in the library happened to match a file in `assets/`.)

---

## 5. The field map

`[section index, field index]` into `composition.sections[].fields[]`. This map is the
whole integration — anything that changes it is a break.

| Key | Address | Kind | Question |
|---|---|---|---|
| `clientName` | 2.0 | Text | 2.1 Full name of the Client |
| `completedBy` | 3.0 | Select | 2.2 Who is completing |
| `soleGuardian` | 5.1 | Select | 2.3.1 Sole guardian? |
| `guardian1` | 6.1 | TextArea | 2.3.2 Legal Guardian 1 |
| `guardian2` | 6.2 | TextArea | 2.3.2 Legal Guardian 2 |
| `guardian3` | 6.3 | TextArea | 2.3.2 Legal Guardian 3 |
| `contactOthers` | 7.1 | Select | 2.3.3 Contact other guardians |
| `scribeConsent` | 12.0 | Select | 5.5 Scribe (Heidi) consent |
| `dogRiskAck` | 14.0 | Select | 6.4 Risk understood |
| `dogChangeAck` | 14.1 | Select | 6.4 May change consent |
| `dogParticipate` | 15.0 | Select | 6.5 Therapy dog participation |
| `declaration` | 16.0 | Multiselect | 7 Declaration (all four) |
| `signerName` | 16.2 | Text | 7 Full name of person signing |
| `signature` | 16.3 | Signature | 7 Signature |

The Drawing at 13.1 is display-only. Guardian name/mobile/email are three inputs
composed into one Zanda textarea in its own `Full name: / Mobile number: /
Email address:` shape.

### Derived answers

| Field | When | Value |
|---|---|---|
| `soleGuardian`, `contactOthers` | Client consenting for themselves | "Not applicable – I am the Client" |
| `contactOthers` | Sole guardian | "Not applicable" — **Edo's decision, 2026-08-21.** No other guardians exist; Zanda's option names only the Client, so this is a deliberate reading |
| `dogRiskAck`, `dogChangeAck` | Always | Ticked. Zanda's own form says they apply "whether or not you choose to opt in", and the risk text is shown above the gate to every reader |
| `dogParticipate` | Gate + waiver both ticked | YES, else NO |

Every derived value is badged **"Set for you"** on the review with its reason.
Nothing is written that the signer cannot see.

---

## 6. The hazard, and the guards

**Zanda gives its fields no IDs.** Every `id` in the composition is `null`, sections and
fields alike. A field's only identity is its **position**. Editing the form in Zanda —
even fixing a typo that splits one paragraph into two — shifts those indices and
silently rebinds every answer after the edit point to the wrong field.

It fails quietly, and it fails into wrong clinical consent data.

Two guards. **Never soften either into a warning:**

1. `consent.js` **recomputes** a SHA-256 over the form's shape (every section label,
   field type, field label, option text) at load and refuses to render on mismatch.
   It never trusts the `skeletonHash` written in the JSON, so a hand-edit to the
   snapshot cannot slip past either.
2. `capture-form.mjs --check` compares the **live** form against the snapshot and
   prints exactly which fields moved.

Current hash: **`596209e279639295`** (captured 2026-08-21, matches live as of 2026-08-22).

After any deliberate change in Zanda: `capture-form.mjs --write`, paste the new hash
into `EXPECTED_SKELETON`, then **re-check every address in `FIELDS` by hand** before
trusting the page again.

---

## 7. Design decisions

**Verbatim legal text, re-composed wrapper.** Clause wording is never retyped into the
markup — only navigation and plain-language framing are ours.

**Group titles come from the form.** Invented headings ("Fees, payment, and what happens
if you cancel") were replaced with the document's own (`4.6 Terms of Trade`). Nothing on
the page renames a section of the document it renders.

**The gate pattern.** An optional section opens from one tick, and leaving it shut is a
*real answer*, not an unanswered question. Opting in to the therapy dog takes two
deliberate acts — open the waiver, then agree to it. Opening it alone is not consent.

**The scribe consent is deliberately NOT a gate.** It records an audio-recording
consent, and an untouched tick box cannot be told apart from a considered "no".

**A read-tick belongs where a step asks nothing else.** Steps 1, 3, 4 are pure reading
and carry one; 2, 5, 6, 7 end in a real answer. Read-ticks are local only — the record
of having read the form is the declaration in step 7.

**A step whose answer is valid without action must not look done unseen.** The therapy
dog step is answered on load (gate shut = NO), so it would sit green before the reader
opened it — and green invites skipping the one section *offering* something. It counts
as done once seen. Seeing is not counted as progress.

**Guardian validation.** A name plus at least one way to reach them — one guardian if
sole, two if not. A required guardian says so while still empty; an optional third stays
quiet until started. Contact checks are **deliberately loose**: catch a slip, do not
adjudicate validity. NZ mobiles are written `021 234 5678`, `+64 21 234 5678` and
`(09) 123 4567` alike.

---

## 8. Corrections made here, and errors to fix in Zanda

Three named tables in `consent.js` hold every display-time adaptation, with reasoning
beside each: `HEADING_FIXES`, `CITATION_FIXES`, `OMIT_SENTENCES`.

**All of it is presentation. The payload keeps Zanda's text to the character** — six
tests assert exactly that, field by field against the parsed composition. If anyone
ever wires a display fix into the record, those tests fail.

### Errors live in Zanda right now

The Terms of Service was numbered 5.x and renumbered to 4.x; the pass was never
finished. Clients reading the form today hit dead references.

| Where | Says | Should be |
|---|---|---|
| Heading, block 10.3 | `5.3. Appointment Booking and Communication` | `4.3` — leaves 4.3 missing and collides with the scribe's real 5.3 |
| 10.3, 10.5, 10.18, 10.22 | `Section 5.6.3` ×4 | `4.6.3` Cancellation Policy |
| 10.7 | `Section 5.7.3` | `4.7.3` Appointment Attendance |
| 10.9 | `Section 5.3` | `4.3` |
| 9.9, 9.12 | `Section 4` (means the scribe) | `Section 5` |
| 13.3 | `Section 6.4` (means where YES is selected) | `6.5` |

Also worth adding: a **fourth option on 2.3.3** worded *"Not applicable – I am the sole
legal guardian"*, which would make that record read exactly right instead of relying on
the reading in §5.

**Fixing any of these changes the skeleton hash** → re-capture, then delete the
corresponding entries from the three tables.

---

## 9. Not done — the submit path

The page ends at a reviewed, copyable payload. Closing the gap needs **a server-side
hop**, and there is no way around that:

- **Same-origin policy** — cannot script Zanda's page from ours (new tab or iframe).
- **CORS** — a POST preflight from our origin returns 405 with no CORS headers.
- **`SameSite=Lax; Partitioned`** on the session cookie — it would not travel on a
  cross-site request even if CORS vanished, and an iframe gets its own partitioned jar.

Also checked and absent: any prefill URL parameter (the app reads only `token`,
`returnUrl`, `id`, `tab`), and any `postMessage` API (**zero** window-level message
listeners; all six in the bundle are library internals).

Server-to-server works fine — `capture-form.mjs` reads the live form today.

### Shape when it is built

```
browser ──▶ forms.kinderminds.nz/consent?client=&form=
              │  the proxy serves the page too → same origin → no CORS anywhere
              ▼
            GET  /api/form   → GetForm → composition + customForm.id
                                 └─ fingerprint unknown? 302 to Zanda's own form
            POST /api/save   → Save, status 2 (autosave) then 0 (submit)
```

Four things to design in:

1. **Dispatch by fingerprint, not form number.** Hash whatever `GetForm` returns; if no
   field map matches, redirect to Zanda. Then all the guide's form links can point here
   and only the mapped ones get the new experience — incremental rollout, no branching.
2. **The snapshot stops being the data.** Render from the live composition; the JSON
   becomes purely the expected fingerprint, so drift fires at request time.
3. **Drop localStorage.** Autosave drafts into Zanda instead — one record, and the
   client can resume on another device or finish in Zanda's own UI.
4. **Write derived answers at submit, not on autosave.** Otherwise a client who
   abandons halfway and switches to Zanda finds consent boxes ticked they never saw.
5. **Fail open, always.** Any error → 302 to Zanda. The guide should also carry a
   visible direct-to-Zanda link on different infrastructure.

**The one unverified thing in this whole design: the `Save` POST.** Payload shape is
known exactly from their client code; `GetForm` is proven live; the POST has never been
executed. First task is one `AutoDraft` write against a test form, reading it back.

---

## 10. Decisions pending

| Question | Notes |
|---|---|
| **Where the proxy is hosted** | Cloudflare Workers needs the whole `kinderminds.nz` zone moved off SiteHost — which moves the GitHub Pages records **and the Microsoft 365 MX**. Netlify / Deno Deploy / Fly.io accept a plain CNAME instead: one record, email untouched. Recommended. |
| **Data residency** | Consent data would transit the proxy. Cloudflare/Netlify/Deno are global edge. Fly.io can pin Sydney. A Pi at home is NZ-only but Starlink is CGNAT — outbound tunnel only, and availability is domestic-grade. |
| **HIPC posture** | Today the path is browser→Zanda and Kinder Minds is not in it. With a proxy you are. Manageable (no storage, no logging, TLS throughout) but a deliberate change to record. |
| **Fix the ten numbering errors in Zanda?** | Deferred by Edo. Each fix changes the skeleton hash. |
| **Restore the signature-name carry?** | Built, then reverted at Edo's request — it filled step 7's name from 2.1 (self) or Guardian 1's name (guardian). The self-consent half was a true one-to-one; the guardian half assumed Guardian 1 is always the signer. |
| **Number section 1 internally?** | It has no sub-sections in the data, so its number lives in the badge alone. |

---

## 11. Tried and rejected

- **Re-skinning Zanda's own page** — cannot inject across origins, and their autosave
  reads state out of their mounted React components (`getEntryComposition()`), so it has
  no separable existence from their UI.
- **Loading their bundle into our page** — scripts are CORS-exempt so it would execute,
  but its relative `/api/v1/…` calls would resolve against our host. Would need a full
  API passthrough plus driving React inputs from outside React, breaking on every Zanda
  release. Rejected as a permanent maintenance liability.
- **Prefix-fallback for unresolvable citations** — linked `Section 5.6.3` to the scribe
  consent. Looked deliberate, was flatly wrong, hid a real fault. Reverted; unresolvable
  citations stay plain text.
- **`text/plain` POST to dodge preflight** — the request would be sent, but ASP.NET Core
  rejects `text/plain` with 415 and `SameSite=Lax` withholds the session cookie.

---

## 12. Files

| File | Role |
|---|---|
| `combined-consent.html` | The pathway. Structure only — no legal wording typed in. |
| `consent.js` | Field map, conditional logic, derivation, validation, signature pad, payload. |
| `consent.css` | Extends `guide/guide.css` — the page matches the assessment guides. |
| `zanda-combined-consent.json` | Composition snapshot: structure + prose, values blanked, no client identifiers. |
| `capture-form.mjs` | Re-capture / drift check. Read-only, zero dependencies. |
| `build-single-file.py` | Flattens everything into one double-clickable file. |
| `consent.test.js` | 163 assertions over every branch. Dev-only (`jsdom`). |
| `README.md` | Short operational version. |

**`forms/` is not self-contained.** It depends on:

- `../guide/guide.css` → `../intake/intake.css` → `../leaflets/leaflet.css` → `../reset.css`
- `../assets/Logos/km-logo-name-below.svg`, the three favicons
- `../assets/Used/20240904_084912_C.jpg` (Neve — referenced from `DRAWINGS` in `consent.js`)

`combined-consent.local.html` is generated and **gitignored** — it hard-codes a client
hash and must never reach a public repo or web server.

---

## 13. State at handover

- **163 tests passing**, live drift check clean, standalone build current.
- **Committed, not pushed.** Pushing publishes `forms/`, `guide/` and `staff/` to
  `kinderminds.nz` at once — unlisted (`noindex`, `no-referrer`) but publicly reachable.
- Feature commits: `f86b9f9` → `f3538c5` (8 commits).
- `.vscode/settings.json` is modified and deliberately uncommitted (Peacock colours).
