/* ==========================================================================
   Kinder Minds — conditional consent form, headless tests

   Drives every branch of combined-consent.html through jsdom and asserts the
   composition payload that would reach Zanda. The point is not the UI: it is
   that the right VALUE lands in the right POSITION, because Zanda's fields
   have no IDs and position is the only binding there is.

       cd forms && npm install && npm test

   jsdom is a dev-only dependency. The page itself has none.
   ========================================================================== */

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const FORMS = __dirname;

const HTML = fs.readFileSync(path.join(FORMS, 'combined-consent.html'), 'utf8');
const SNAP = fs.readFileSync(path.join(FORMS, 'zanda-combined-consent.json'), 'utf8');

let pass = 0, fail = 0;
function ok(cond, label, extra) {
  if (cond) { pass++; console.log('  ok   ' + label); }
  else { fail++; console.log('  FAIL ' + label + (extra ? '\n         ' + extra : '')); }
}

function storageKey(client, form) {
  const seed = [client, form].join('|') || 'demo';
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
  return 'km-consent-' + (h >>> 0).toString(36);
}

async function boot(opts = {}) {
  const query = '?client=AbCdEfGhIjK&form=1234';
  const dom = new JSDOM(HTML, {
    url: 'http://127.0.0.1:8765/forms/combined-consent.html' + query,
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const w = dom.window;

  // jsdom ships no canvas backend; the pad only needs the calls to succeed.
  w.HTMLCanvasElement.prototype.getContext = () => ({
    setTransform() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
    clearRect() {}, drawImage() {},
  });
  w.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,SIG';

  // jsdom ships neither WebCrypto on window nor TextEncoder; the page uses both
  // to recompute the skeleton hash. Node has real implementations of each.
  Object.defineProperty(w, 'crypto', { value: require('node:crypto').webcrypto, configurable: true });
  w.TextEncoder = TextEncoder;

  // jsdom implements no layout, so it has no scrollIntoView. Browsers all do.
  w.Element.prototype.scrollIntoView = function () {};

  // Seed a prior visit so the signature (which needs real drawing) is present.
  if (opts.seed) {
    w.localStorage.setItem(storageKey('AbCdEfGhIjK', '1234'), JSON.stringify(opts.seed));
  }

  const body = opts.snapshot || SNAP;
  w.fetch = () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(JSON.parse(body)) });

  // jsdom fires its own DOMContentLoaded once parsing finishes. Dispatching a
  // second one by hand runs the page's init twice, which double-binds every
  // listener and makes the accordion toggle twice per click.
  w.eval(fs.readFileSync(path.join(FORMS, 'consent.js'), 'utf8'));
  await new Promise(r => setTimeout(r, 120));  // DOMContentLoaded + fetch settle
  return w;
}

// ---- driving helpers -----------------------------------------------------
const set = (w, sel, v) => {
  const el = w.document.querySelector(sel);
  el.value = v;
  el.dispatchEvent(new w.Event('input', { bubbles: true }));
};
const pick = (w, name, value) => {
  const el = w.document.querySelector(`input[name="${name}"][value="${value}"]`);
  el.checked = true;
  el.dispatchEvent(new w.Event('change', { bubbles: true }));
};
const tickAll = (w, name) => w.document.querySelectorAll(`input[name="${name}"]`).forEach(b => {
  b.checked = true;
  b.dispatchEvent(new w.Event('change', { bubbles: true }));
});
const tick = (w, id, on = true) => {
  const el = w.document.getElementById(id);
  el.checked = on;
  el.dispatchEvent(new w.Event('change', { bubbles: true }));
};
const payload = w => JSON.parse(w.document.getElementById('payload').textContent);
const fieldOf = (p, si, fi) => p.composition.sections[si].fields[fi];
const chosen = f => f.options.map((o, i) => (o.selected ? i : -1)).filter(i => i !== -1);
const visible = (w, sel) => !w.document.querySelector(sel).hidden;

const SIGNED = { answers: { signature: 'data:image/png;base64,SIG' }, ui: {} };

(async () => {
  // ======================================================================
  console.log('\n1. Guardian, more than one guardian');
  {
    const w = await boot({ seed: SIGNED });
    ok(!w.document.getElementById('boot-error').hidden === false, 'page booted without error');

    set(w, '#client-name', 'Tāne Example');
    pick(w, 'completedBy', 1);
    ok(visible(w, '[data-when="guardian"]'), 'guardian branch revealed');
    ok(!visible(w, '.when[data-when="self"]'), 'self branch stays hidden');

    pick(w, 'soleGuardian', 1);
    ok(visible(w, '[data-when="guardian-multi"]'), 'second/third guardian revealed');

    set(w, '#g1-name', 'Aroha Example');
    set(w, '#g1-mobile', '021 000 111');
    set(w, '#g1-email', 'aroha@example.com');
    set(w, '#g2-name', 'Sam Example');
    set(w, '#g2-mobile', '021 222 333');
    set(w, '#g2-email', 'sam@example.com');
    pick(w, 'contactOthers', 0);
    pick(w, 'scribeConsent', 0);
    tick(w, 'read-3'); tick(w, 'read-4');
    tickAll(w, 'declaration');
    set(w, '#signer-name', 'Aroha Example');

    const p = payload(w);
    ok(fieldOf(p, 2, 0).text === 'Tāne Example', 'client name -> sec2/fld0');
    ok(chosen(fieldOf(p, 3, 0)).join() === '1', 'completedBy = guardian');
    ok(chosen(fieldOf(p, 5, 1)).join() === '1', 'soleGuardian = not sole');
    ok(fieldOf(p, 6, 1).text === 'Full name: Aroha Example\nMobile number: 021 000 111\nEmail address: aroha@example.com',
       'guardian 1 composed into Zanda textarea shape', JSON.stringify(fieldOf(p, 6, 1).text));
    ok(fieldOf(p, 6, 2).text.includes('Sam Example'), 'guardian 2 written');
    ok(fieldOf(p, 6, 3).text === null, 'guardian 3 left null when unused');
    ok(chosen(fieldOf(p, 7, 1)).join() === '0', 'contactOthers = yes');
    ok(chosen(fieldOf(p, 12, 0)).join() === '0', 'scribe consent = yes');
    ok(chosen(fieldOf(p, 14, 0)).join() === '0', 'dog risk ack recorded');
    ok(chosen(fieldOf(p, 14, 1)).join() === '0', 'dog change ack recorded');
    ok(chosen(fieldOf(p, 15, 0)).join() === '1', 'dog participation = NO (gate untouched)');
    ok(chosen(fieldOf(p, 16, 0)).join() === '0,1,2,3', 'all four declarations ticked');
    ok(fieldOf(p, 16, 2).text === 'Aroha Example', 'signer name');
    ok(fieldOf(p, 16, 3).dataUrl === 'data:image/png;base64,SIG', 'signature dataUrl carried');
    ok(p.status === 2, 'status = 2 (AutoDraft), never 0');
    ok(w.document.getElementById('review-blocker').hidden, 'nothing outstanding');
    ok(/All answered/.test(w.document.getElementById('progress-label').textContent),
       'progress reports complete', w.document.getElementById('progress-label').textContent);
  }

  // ======================================================================
  console.log('\n2. Client consenting for themselves');
  {
    const w = await boot({ seed: SIGNED });
    set(w, '#client-name', 'Self Example');
    pick(w, 'completedBy', 0);

    ok(!visible(w, '[data-when="guardian"]'), 'guardian branch hidden');
    ok(visible(w, '.when[data-when="self"]'), 'self branch revealed');

    pick(w, 'scribeConsent', 1);
    tick(w, 'read-3'); tick(w, 'read-4');
    tickAll(w, 'declaration');
    set(w, '#signer-name', 'Self Example');

    const p = payload(w);
    ok(chosen(fieldOf(p, 5, 1)).join() === '2', 'soleGuardian auto-set to "Not applicable – I am the Client"');
    ok(chosen(fieldOf(p, 7, 1)).join() === '2', 'contactOthers auto-set to "Not applicable – I am the Client"');
    ok(fieldOf(p, 6, 1).text === null && fieldOf(p, 6, 2).text === null && fieldOf(p, 6, 3).text === null,
       'no guardian details collected');
    ok(chosen(fieldOf(p, 12, 0)).join() === '1', 'scribe consent = no');
    ok(w.document.getElementById('review-blocker').hidden, 'complete with 8 answers');

    const label = w.document.getElementById('progress-label').textContent;
    ok(/All answered/.test(label), 'progress complete for self branch', label);
  }

  // ======================================================================
  console.log('\n3. Sole guardian');
  {
    const w = await boot({ seed: SIGNED });
    set(w, '#client-name', 'Only Child');
    pick(w, 'completedBy', 1);
    pick(w, 'soleGuardian', 0);

    ok(visible(w, '[data-when="guardian-sole"]'), 'sole-guardian note shown');
    ok(!visible(w, '[data-when="guardian-multi"]'), 'other-guardian block hidden');

    set(w, '#g1-name', 'Solo Parent');
    set(w, '#g1-mobile', '021 999');
    set(w, '#g1-email', 'solo@example.com');
    pick(w, 'scribeConsent', 0);
    tick(w, 'read-3'); tick(w, 'read-4');
    tickAll(w, 'declaration');
    set(w, '#signer-name', 'Solo Parent');

    const p = payload(w);
    ok(chosen(fieldOf(p, 5, 1)).join() === '0', 'soleGuardian = sole');
    ok(fieldOf(p, 6, 2).text === null && fieldOf(p, 6, 3).text === null, 'guardians 2 and 3 blank');
    ok(chosen(fieldOf(p, 7, 1)).join() === '2', 'contactOthers derived to "Not applicable"');
    ok(w.document.getElementById('review-blocker').hidden, 'complete');

    const row = [...w.document.querySelectorAll('#review-body tr')]
      .find(tr => tr.querySelector('th').textContent.includes('contact other guardians'));
    ok(/Set for you/.test(row.textContent), 'derived answer is badged in the review');
    ok(/no other guardians to contact/i.test(row.textContent), 'and explains itself to the signer');
  }

  // ======================================================================
  console.log('\n4. Therapy dog gate');
  {
    const w = await boot({ seed: SIGNED });
    pick(w, 'completedBy', 0);

    ok(visible(w, '.gate-closed[data-when="dog-out"]'), 'closed-gate message shown by default');
    ok(!visible(w, '.gated[data-when="dog-in"]'), 'waiver hidden by default');
    ok(chosen(fieldOf(payload(w), 15, 0)).join() === '1', 'default answer is NO');

    tick(w, 'dog-gate');
    ok(visible(w, '.gated[data-when="dog-in"]'), 'waiver revealed by the gate');
    ok(!visible(w, '.gate-closed[data-when="dog-out"]'), 'closed message withdrawn');
    ok(chosen(fieldOf(payload(w), 15, 0)).join() === '1',
       'opening the gate alone is NOT consent');

    tick(w, 'dog-waiver');
    ok(chosen(fieldOf(payload(w), 15, 0)).join() === '0', 'agreeing to the waiver gives YES');

    tick(w, 'dog-gate', false);
    ok(chosen(fieldOf(payload(w), 15, 0)).join() === '1', 'closing the gate reverts to NO');
    ok(w.document.getElementById('dog-waiver').checked === false,
       'and withdraws the waiver tick with it');

    const p = payload(w);
    ok(chosen(fieldOf(p, 14, 0)).join() === '0' && chosen(fieldOf(p, 14, 1)).join() === '0',
       'both 6.4 acknowledgements recorded either way');
  }

  // ======================================================================
  console.log('\n5. Stale answers are cleared when the branch changes');
  {
    const w = await boot({ seed: SIGNED });
    pick(w, 'completedBy', 1);
    pick(w, 'soleGuardian', 1);
    set(w, '#g2-name', 'Should Vanish');
    pick(w, 'contactOthers', 1);

    pick(w, 'soleGuardian', 0);           // switch to sole
    let p = payload(w);
    ok(fieldOf(p, 6, 2).text === null, 'guardian 2 cleared on switching to sole');
    ok(chosen(fieldOf(p, 7, 1)).join() === '2', 'stale "No" replaced by the derived answer');

    pick(w, 'completedBy', 0);            // switch to self
    p = payload(w);
    ok(chosen(fieldOf(p, 5, 1)).join() === '2', 'soleGuardian reset for a self-consenting client');
    ok(w.document.querySelector('input[name="soleGuardian"]:checked') === null,
       'and the radio is visually cleared too');
  }

  // ======================================================================
  console.log('\n6. Displayed option text drops obsolete routing');
  {
    const w = await boot();
    const t = w.document.querySelector('[data-opt-text="3.0.0"]').textContent;
    ok(!/proceed to section/i.test(t), 'no "proceed to Section" instruction on screen', t);
    ok(!/please tick/i.test(t), 'no "please tick Not applicable" instruction', t);
    ok(/I am the Client named in Section 2.1/.test(t), 'substantive wording kept');

    // The record itself must stay byte-exact.
    const p = payload(w);
    ok(/proceed to Section 3\.1/i.test(fieldOf(p, 3, 0).options[0].value),
       'payload keeps Zanda\u2019s original option text untouched');
  }

  // ======================================================================
  console.log('\n7. Skeleton drift refuses to render');
  {
    // The realistic failure: someone splits a prose block in Zanda, which
    // inserts a field and shifts every position after it. The snapshot's own
    // skeletonHash is left untouched, so this also proves the page does not
    // trust that field.
    const bad = JSON.parse(SNAP);
    bad.sections[9].fields.splice(1, 0, JSON.parse(JSON.stringify(bad.sections[9].fields[0])));
    const w = await boot({ snapshot: JSON.stringify(bad) });
    ok(!w.document.getElementById('boot-error').hidden, 'boot error shown');
    ok(w.document.getElementById('form-body').hidden, 'form hidden entirely');
    ok(/no longer matches/i.test(w.document.getElementById('boot-error').textContent),
       'and says why');
    ok(/capture-form/.test(w.document.getElementById('boot-error').textContent),
       'and says how to diagnose it');

    // A snapshot whose declared hash still reads "correct" must not rescue it.
    ok(bad.skeletonHash === JSON.parse(SNAP).skeletonHash,
       'the corrupt snapshot still declared the original hash');
  }

  // ======================================================================
  console.log('\n8. Accordion');
  {
    const w = await boot();
    const head = w.document.querySelector('#step-dog .stage-head');
    const body = w.document.getElementById('body-dog');
    ok(head.getAttribute('aria-expanded') === 'false' && body.hidden, 'starts collapsed');
    head.click();
    ok(head.getAttribute('aria-expanded') === 'true' && !body.hidden, 'opens on click');
    head.click();
    ok(head.getAttribute('aria-expanded') === 'false' && body.hidden, 'closes again');

    const btn = w.document.getElementById('expand-all');
    btn.click();
    const all = [...w.document.querySelectorAll('.task-steps > li .stage-head, .intro-panel .stage-head')];
    ok(all.every(h => h.getAttribute('aria-expanded') === 'true'), 'expand-all opens every step');
    ok(btn.textContent === 'Collapse all', 'button relabels itself');

    const w2 = await boot();
    w2.document.querySelector('#body-who [data-next="step-info"]').click();
    ok(w2.document.querySelector('#step-who .stage-head').getAttribute('aria-expanded') === 'false',
       'Continue closes the current step');
    ok(w2.document.querySelector('#step-info .stage-head').getAttribute('aria-expanded') === 'true',
       'Continue opens the next step');
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
