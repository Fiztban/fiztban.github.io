#!/usr/bin/env node
/* ==========================================================================
   Kinder Minds — Zanda form capture / drift check

   Zanda gives its custom-form fields NO IDs. A field's only identity is its
   position in the composition tree, so any edit to the form in Zanda — even a
   typo fix that splits a paragraph — silently rebinds every answer after it.

   This script is the safety net. It fetches the live form and compares its
   shape against the committed snapshot.

       node forms/capture-form.mjs --check <clientHash> <formNumber> [snapshot]
       node forms/capture-form.mjs --write <clientHash> <formNumber> [snapshot]

   snapshot defaults to zanda-combined-consent.json. Pass a filename to work
   against another form — each custom form has its own snapshot, its own field
   map and its own EXPECTED_SKELETON.

   --check  compare only; exit 1 on drift. Run this before every intake batch,
            and after anyone edits the form in Zanda.
   --write  re-capture the snapshot and print the new hash. You must then paste
            that hash into EXPECTED_SKELETON in consent.js — deliberately a
            manual step, because a re-capture means the field map in consent.js
            needs re-checking by a human before it is trusted again.

   Reads only. It never posts, so it cannot alter a client's form.
   Zero dependencies — Node 18+ for global fetch.
   ========================================================================== */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_SNAPSHOT = 'zanda-combined-consent.json';
const API = 'https://clientportal.zandahealth.com/api/v1/kinderminds/CustomForm/GetForm';

const TYPE = {
  0: 'Multiselect', 1: 'Select', 2: 'Text', 3: 'TextArea', 4: 'Checkbox',
  5: 'Drawing', 6: 'Information', 7: 'Signature', 8: 'ProfileField',
  9: 'FileUpload', 10: 'CustomProfileField',
};

/* Identity of every field, ignoring anything a client could have entered.
   Must stay byte-identical to the generator that produced the snapshot. */
function skeletonHash(sections) {
  const skeleton = sections.map(s => [
    s.label,
    s.fields.map(f => [f.type, f.label, f.options.map(o => o.value)]),
  ]);
  return createHash('sha256')
    .update(JSON.stringify(skeleton, canonical))
    .digest('hex')
    .slice(0, 16);
}

/* json.dumps(..., sort_keys=True) equivalent, so the Python generator and this
   script agree on key order. Arrays here hold no objects, but keep it honest. */
function canonical(_key, value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return Object.keys(value).sort().reduce((o, k) => { o[k] = value[k]; return o; }, {});
  }
  return value;
}

function blank(f) {
  return {
    ...f,
    text: f.type === 6 ? f.text : null,   // Information blocks ARE their text
    currentValue: null,
    checked: false,
    dataUrl: null,
    files: [],
    annotations: [],
    options: f.options.map(o => ({ ...o, selected: false })),
  };
}

/* Zanda's portal answers an uncookied request with a 302 back to the same URL,
   carrying a Set-Cookie for an anonymous ASP.NET session. Node's fetch keeps no
   cookie jar, so following redirects automatically just loops until it gives up
   ("redirect count exceeded"). Do one manual hop, keep the cookie, retry. */
async function fetchLive(client, form) {
  const url = `${API}?publicId=${encodeURIComponent(client)}&formDataNumber=${encodeURIComponent(form)}`;
  const headers = { Accept: 'application/json' };

  let res = await fetch(url, { headers, redirect: 'manual' });

  if (res.status >= 300 && res.status < 400) {
    const jar = (typeof res.headers.getSetCookie === 'function'
      ? res.headers.getSetCookie()
      : [res.headers.get('set-cookie')].filter(Boolean))
      .map(c => c.split(';')[0])
      .join('; ');

    if (!jar) { throw new Error('portal redirected without setting a session cookie'); }
    res = await fetch(url, { headers: { ...headers, Cookie: jar } });
  }

  if (!res.ok) { throw new Error(`GetForm returned HTTP ${res.status}`); }

  const data = await res.json();
  if (!data?.customForm?.composition?.sections) { throw new Error('no composition in response'); }
  return data.customForm;
}

/* Report the first structural difference in terms a human can act on. */
function diff(oldSecs, newSecs) {
  const out = [];
  const n = Math.max(oldSecs.length, newSecs.length);
  for (let i = 0; i < n; i++) {
    const a = oldSecs[i], b = newSecs[i];
    if (!a) { out.push(`section ${i} ADDED: "${b.label}"`); continue; }
    if (!b) { out.push(`section ${i} REMOVED: "${a.label}"`); continue; }
    if (a.label !== b.label) { out.push(`section ${i} label: "${a.label}" -> "${b.label}"`); }

    const m = Math.max(a.fields.length, b.fields.length);
    for (let j = 0; j < m; j++) {
      const x = a.fields[j], y = b.fields[j];
      const at = `  ${i}.${j}`;
      if (!x) { out.push(`${at} ADDED (${TYPE[y.type]}) — SHIFTS EVERY FIELD AFTER IT`); continue; }
      if (!y) { out.push(`${at} REMOVED (${TYPE[x.type]}) — SHIFTS EVERY FIELD AFTER IT`); continue; }
      if (x.type !== y.type) { out.push(`${at} type ${TYPE[x.type]} -> ${TYPE[y.type]}`); }
      if (x.label !== y.label) { out.push(`${at} label "${x.label}" -> "${y.label}"`); }
      if (x.options.length !== y.options.length) {
        out.push(`${at} options ${x.options.length} -> ${y.options.length} — CHECK THE OPTION INDICES IN consent.js`);
      } else {
        x.options.forEach((o, k) => {
          if (o.value !== y.options[k].value) { out.push(`${at} option[${k}] text changed`); }
        });
      }
      /* Information blocks are rendered verbatim, so wording changes matter
         even though they do not move anything. */
      if (x.type === 6 && y.type === 6 && x.text !== y.text) {
        out.push(`${at} Information text edited (wording only, positions unchanged)`);
      }
    }
  }
  return out;
}

const [mode, client, form, snapshotArg] = process.argv.slice(2);

if (!['--check', '--write'].includes(mode) || !client || !form) {
  console.error('usage: node forms/capture-form.mjs --check|--write <clientHash> <formNumber> [snapshot]');
  process.exit(2);
}

const SNAPSHOT = join(HERE, snapshotArg || DEFAULT_SNAPSHOT);

try {
  const live = await fetchLive(client, form);
  const sections = live.composition.sections.map(s => ({
    id: s.id, label: s.label, fields: s.fields.map(blank),
  }));
  const hash = skeletonHash(sections);

  /* A first capture of a form we hold no snapshot for. Only --write can do
     anything useful here; --check has nothing to compare against and says so
     rather than inventing a baseline from the very thing it exists to police. */
  const fresh = !existsSync(SNAPSHOT);

  if (fresh && mode === '--check') {
    console.error(`no snapshot at ${SNAPSHOT} — capture one first with --write.`);
    process.exit(2);
  }

  const saved = fresh ? null : JSON.parse(readFileSync(SNAPSHOT, 'utf8'));

  /* Recomputed from the stored sections, not read from the file's own
     skeletonHash field — otherwise a hand-edit to the snapshot that left the
     hash untouched would sail through this check and through the page. */
  const savedHash = saved ? skeletonHash(saved.sections) : null;

  console.log(`form    : ${live.name}`);
  console.log(`live    : ${hash}`);
  console.log(saved
    ? `snapshot: ${savedHash} (captured ${saved.capturedOn})`
    : 'snapshot: none yet — first capture');

  if (saved && savedHash !== saved.skeletonHash) {
    console.error(`\nSNAPSHOT CORRUPT — ${SNAPSHOT} declares ${saved.skeletonHash} but its`);
    console.error('sections hash to ' + savedHash + '. The file has been edited by hand.');
    console.error('Re-capture it with --write rather than patching the hash.');
    process.exit(1);
  }

  if (mode === '--check') {
    if (hash === savedHash) {
      console.log('\nOK — the live form matches the snapshot.');
      process.exit(0);
    }
    console.error('\nDRIFT — the live form no longer matches the snapshot.');
    const changes = diff(saved.sections, sections);
    changes.forEach(c => console.error('  ' + c));
    console.error('\nThe consent page will refuse to render until this is resolved.');
    console.error('Re-check the field map in consent.js, then re-capture with --write.');
    process.exit(1);
  }

  writeFileSync(SNAPSHOT, JSON.stringify({
    formName: live.name,
    skeletonHash: hash,
    capturedOn: new Date().toISOString().slice(0, 10),
    sections,
  }, null, 1), 'utf8');

  console.log(`\nSnapshot ${fresh ? 'created' : 'rewritten'} at ${SNAPSHOT}.`);
  console.log(`Now set in the page that renders it:\n\n  var EXPECTED_SKELETON = '${hash}';\n`);
  console.log('Re-check every address in its FIELDS map before trusting the page again.');

} catch (err) {
  console.error('failed:', err.message);
  process.exit(2);
}
