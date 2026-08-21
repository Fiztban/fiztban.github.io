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
    tick(w, 'read-1'); tick(w, 'read-3'); tick(w, 'read-4');
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
    tick(w, 'read-1'); tick(w, 'read-3'); tick(w, 'read-4');
    tickAll(w, 'declaration');
    set(w, '#signer-name', 'Self Example');

    const p = payload(w);
    ok(chosen(fieldOf(p, 5, 1)).join() === '2', 'soleGuardian auto-set to "Not applicable – I am the Client"');
    ok(chosen(fieldOf(p, 7, 1)).join() === '2', 'contactOthers auto-set to "Not applicable – I am the Client"');
    ok(fieldOf(p, 6, 1).text === null && fieldOf(p, 6, 2).text === null && fieldOf(p, 6, 3).text === null,
       'no guardian details collected');
    ok(chosen(fieldOf(p, 12, 0)).join() === '1', 'scribe consent = no');
    ok(w.document.getElementById('review-blocker').hidden, 'complete with 9 answers');

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
    tick(w, 'read-1'); tick(w, 'read-3'); tick(w, 'read-4');
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

  // ======================================================================
  // Zanda's `drawings` array is the clinic's whole shared image library, so a
  // name appearing in it says nothing about whether THIS form uses it. The
  // page must follow the field's own selectedDrawing.
  console.log('\n9. The therapy dog image follows the form');
  {
    const w = await boot();
    const img = w.document.querySelector('[data-drawing="13.1"]');
    const src = String(img.getAttribute('src'));

    ok(!img.hidden, 'image resolved and shown');
    ok(/20240904_084912_C\.jpg$/.test(src), 'uses the drawing the field selects', src);
    ok(!/Neve_cropped/.test(src), 'not the other image in the shared library');

    // An unknown drawing must show nothing rather than the wrong picture.
    const snap = JSON.parse(SNAP);
    snap.sections[13].fields[1].selectedDrawing = 'something-we-do-not-have.jpg';
    const w2 = await boot({ snapshot: JSON.stringify(snap) });
    const img2 = w2.document.querySelector('[data-drawing="13.1"]');
    ok(img2.hidden, 'unknown drawing hides the image');
    ok(!img2.getAttribute('src'), 'and sets no src at all');
  }

  // ======================================================================
  // The legal text cites its own clause numbers ("see Section 4.6.3"), so the
  // numbering is load-bearing, not decoration.
  console.log('\n10. Clause numbering and cross-references');
  {
    const w = await boot();
    const d = w.document;

    // A numbered heading renders either as a clause heading or, where it is the
    // title of a reader group, as that group's summary. Both count.
    const heads = [...d.querySelectorAll('h4.clause, [data-legal-title]')];
    ok(heads.length > 50, `numbered headings rendered (${heads.length})`);
    ok(heads.some(h => /^4\.6\.3\b/.test(h.textContent.trim())),
       'ToS clause 4.6.3 present with its number');
    ok(!!d.getElementById('s-4-6-3'), 'and carries an anchor');

    const links = [...d.querySelectorAll('a.xref')];
    ok(links.length > 0, `citations linked (${links.length})`);
    ok(links.every(a => !!d.getElementById(a.getAttribute('href').slice(1))),
       'every link points at something that exists on the page');

    // The load-bearing one: citations that resolve nowhere must stay plain.
    // 5.6.3 and 5.7.3 are cited five times between them and exist nowhere in
    // the form. Linking them to the nearest plausible clause would look
    // deliberate while being wrong, and would hide a fault in the source.
    const linked = new Set(links.map(a => /Section\s+([\d.]+)/.exec(a.textContent)[1]));
    ok(!linked.has('5.6.3'), 'Section 5.6.3 is not linked (it does not exist)');
    ok(!linked.has('5.7.3'), 'Section 5.7.3 is not linked (it does not exist)');

    // Zanda's own "Continue onto Section N" is navigation for its single
    // scroll; this pathway has Continue buttons. Stripped on screen only.
    const prose = [...d.querySelectorAll('.legal')].map(n => n.textContent).join(' ');
    ok(!/Continue\s+(?:onto|to)\s+Section/i.test(prose),
       'navigation instructions removed from the displayed text');
    ok(/Continue onto Section/.test(d.getElementById('payload').textContent),
       'but preserved byte-exact in the payload');
  }

  // ======================================================================
  // Group titles must come from the form, never be invented here.
  console.log('\n11. Reader groups follow the document');
  {
    const w = await boot();
    const d = w.document;

    const titled = [...d.querySelectorAll('summary[data-legal-title]')];
    ok(titled.length >= 15, `reader groups titled from the form (${titled.length})`);
    ok(titled.every(x => x.textContent.trim()), 'none left empty');

    const tos = [...d.querySelectorAll('#body-terms > details.reader > summary')]
      .map(x => x.textContent.trim());
    ok(tos[0].startsWith('4.2 Scope of Services'), 'ToS opens at 4.2', tos[0]);
    ok(tos.some(t => t.startsWith('4.6 Terms of Trade')), 'includes 4.6 Terms of Trade');
    ok(tos[tos.length - 1].startsWith('4.9 Governing Law'), 'ends at 4.9', tos[tos.length - 1]);

    // Zanda labels block 10.3 "5.3", which collides with the scribe consent's
    // real 5.3. Corrected for display so one number means one clause.
    ok(tos.some(t => t.startsWith('4.3 Appointment Booking')),
       'the mislabelled 5.3 renders as 4.3');
    ok(!tos.some(t => t.startsWith('5.')), 'no 5.x heading remains inside the ToS');

    const fives = [...d.querySelectorAll('h4.clause, summary[data-legal-title]')]
      .map(x => x.textContent.trim()).filter(t => /^5\.3\b/.test(t));
    ok(fives.length === 1, 'exactly one clause numbered 5.3 on the page', fives.join(' | '));
    ok(/Privacy and Security/.test(fives[0] || ''), 'and it is the scribe consent one');

    // A citation to a re-pointed number must not be linked anywhere.
    const linked = new Set([...d.querySelectorAll('a.xref')]
      .map(a => /Section\s+([\d.]+)/.exec(a.textContent)[1]));
    ok(!linked.has('5.3'), 'the "Section 5.3" citation is left plain, not mis-linked');

    // 4.7 is guardian-only; a self-consenting client never sees it.
    const g = d.querySelector('#body-terms [data-when="guardian"]');
    ok(!!g && /^4\.7 /.test(g.querySelector('summary').textContent.trim()),
       '4.7 is the guardian-only group');
  }

  // ======================================================================
  // The gutter badge must agree with the clause numbering inside the step,
  // or a reader is holding two numbering systems at once.
  console.log('\n12. Step numbers match the form section numbers');
  {
    const w = await boot();
    const d = w.document;

    const steps = [...d.querySelectorAll('.task-steps > li')];
    const numbered = steps.filter(li => li.querySelector('.stage-num[data-num]'));
    ok(numbered.length === 7, `seven numbered steps (${numbered.length})`);

    const seq = numbered.map(li => li.querySelector('.stage-num').getAttribute('data-num'));
    ok(seq.join(',') === '1,2,3,4,5,6,7', 'badges run 1-7', seq.join(','));

    // Each step's first clause must start with that step's own number.
    numbered.forEach(li => {
      const n = li.querySelector('.stage-num').getAttribute('data-num');
      const first = li.querySelector('h4.clause, summary[data-legal-title]');
      if (!first) { return; }                       // steps 1 and 7 hold no clauses
      ok(first.textContent.trim().startsWith(n + '.'),
         `step ${n} opens at clause ${n}.x`, first.textContent.trim().slice(0, 40));
    });

    ok(!!d.querySelector('#step-review.unnumbered'),
       'review carries no section number (it is not part of the form)');

    const titles = [...d.querySelectorAll('.stage-title')].map(x => x.textContent.trim());
    ok(titles.every(Boolean), 'every step title resolved');
    ok(titles.includes('Kinder Minds Terms of Service'),
       'step titles come from the form, not from this page');
  }

  // ======================================================================
  console.log('\n13. Corrected citations, and the payload left alone');
  {
    const w = await boot();
    const d = w.document;

    const links = [...d.querySelectorAll('a.xref')];
    ok(links.every(a => !!d.getElementById(a.getAttribute('href').slice(1))),
       'every citation link resolves');

    // Nothing should be left dangling now that the mis-numbering is corrected.
    const plain = [];
    d.querySelectorAll('.legal').forEach(host => {
      const wk = d.createTreeWalker(host, w.NodeFilter.SHOW_TEXT, null);
      while (wk.nextNode()) {
        if (wk.currentNode.parentNode.closest('a')) { continue; }
        for (const m of wk.currentNode.nodeValue.matchAll(/Section\s+(\d+(?:\.\d+)*)/g)) {
          plain.push(m[1]);
        }
      }
    });
    ok(plain.length === 0, 'no citation left unlinked', plain.join(', '));

    const shown = [...d.querySelectorAll('.legal')].map(n => n.textContent).join(' ');
    ok(/Section 4\.6\.3/.test(shown), 'the cancellation citation reads 4.6.3');
    ok(!/Section 5\.6\.3/.test(shown), 'and no longer reads 5.6.3');
    ok(!/By selecting "No" - no further action/.test(shown),
       'the "if you select No" line is gone from inside the waiver');

    // THE LOAD-BEARING ASSERTION. Every correction above is presentation. What
    // reaches Zanda must still be Zanda's own text, to the character.
    // Asserted against the parsed composition, field by field, rather than the
    // rendered JSON string — that is what would actually reach Zanda.
    const sent = JSON.parse(d.getElementById('payload').textContent).composition.sections;
    const at = (s, f) => sent[s].fields[f];

    ok(at(10, 3).label.includes('5.3.'),
       'payload keeps the original "5.3." heading label', at(10, 3).label);
    ok(at(10, 9).text.includes('Section 5.3'),
       'payload keeps the original "Section 5.3" citation');
    ok(at(10, 5).text.includes('Section 5.6.3'),
       'payload keeps the original "Section 5.6.3" citation');
    ok(at(9, 12).text.includes('Section 4'),
       'payload keeps the original "Section 4" citation');
    ok(at(15, 1).text.includes('By selecting "No" - no further action is required.'),
       'payload keeps the sentence omitted from the display');
    ok(at(10, 27).text.includes('Continue onto Section 5.'),
       'payload keeps the navigation lines');
  }

  // ======================================================================
  console.log('\n14. Read-ticks and step completion');
  {
    const w = await boot();
    const d = w.document;

    // A read-tick belongs where a step asks nothing else.
    ['read-1', 'read-3', 'read-4'].forEach(id =>
      ok(!!d.getElementById(id), `${id} present`));
    ok(!d.querySelector('#body-scribe .tick') && !d.querySelector('#body-sign .tick'),
       'steps that end in a real answer carry no read-tick');

    ok(/0 of 9 answered/.test(d.getElementById('progress-label').textContent),
       'the introduction tick is counted in progress',
       d.getElementById('progress-label').textContent);

    const step1 = d.getElementById('about-form');
    ok(!step1.classList.contains('done'), 'the introduction starts incomplete');
    const t = d.getElementById('read-1');
    t.checked = true; t.dispatchEvent(new w.Event('change', { bubbles: true }));
    ok(step1.classList.contains('done'), 'and completes on the tick');

    // The therapy dog answers itself, so it must not look finished unseen.
    const dog = d.getElementById('step-dog');
    ok(!dog.classList.contains('done'), 'the therapy dog step is not done before it is opened');
    d.querySelector('#step-dog .stage-head').click();
    ok(dog.classList.contains('done'), 'opening it is enough — the answer was always valid');

    // Opening a section is not an answer, so it must not pad the denominator.
    ok(/of 9 answered/.test(d.getElementById('progress-label').textContent),
       'seeing a step does not change the total',
       d.getElementById('progress-label').textContent);
  }

  // ======================================================================
  // A guardian we cannot reach is a dead end: every legal guardian has to be
  // sent their own copy before appointments can be booked.
  console.log('\n15. Guardian contact details');
  {
    const note = (w, p) => w.document.querySelector(`[data-person-note="${p}"]`);
    const left = w => w.document.getElementById('progress-label').textContent;

    const w = await boot({ seed: SIGNED });
    set(w, '#client-name', 'Tama Example');
    pick(w, 'completedBy', 1);
    pick(w, 'soleGuardian', 0);                      // sole: one guardian needed
    tick(w, 'read-1'); tick(w, 'read-3'); tick(w, 'read-4');
    pick(w, 'scribeConsent', 0);
    tickAll(w, 'declaration');

    ok(note(w, 'g1').hidden, 'no nagging before an entry is started');
    ok(!w.document.getElementById('review-blocker').hidden, 'incomplete while g1 is empty');

    set(w, '#g1-name', 'Aroha Example');
    ok(!note(w, 'g1').hidden, 'a name with no contact is flagged');
    ok(/mobile number or an email/.test(note(w, 'g1').textContent), 'and says what is needed');
    ok(!w.document.getElementById('review-blocker').hidden, 'still incomplete');

    set(w, '#g1-mobile', '021 000 111');
    ok(note(w, 'g1').hidden, 'a mobile is enough');
    ok(w.document.getElementById('review-blocker').hidden, 'sole guardian needs only the one');

    // Email alone is equally acceptable.
    const w2 = await boot({ seed: SIGNED });
    set(w2, '#client-name', 'Tama Example');
    pick(w2, 'completedBy', 1); pick(w2, 'soleGuardian', 0);
    set(w2, '#g1-name', 'Aroha'); set(w2, '#g1-email', 'a@example.com');
    ok(note(w2, 'g1').hidden, 'an email is enough');

    // Not sole: two complete guardians.
    const w3 = await boot({ seed: SIGNED });
    set(w3, '#client-name', 'Tama Example');
    pick(w3, 'completedBy', 1); pick(w3, 'soleGuardian', 1);
    tick(w3, 'read-1'); tick(w3, 'read-3'); tick(w3, 'read-4');
    pick(w3, 'scribeConsent', 0); pick(w3, 'contactOthers', 0);
    tickAll(w3, 'declaration');
    set(w3, '#g1-name', 'Aroha'); set(w3, '#g1-mobile', '021 1');
    ok(!w3.document.getElementById('review-blocker').hidden, 'a second guardian is required');
    set(w3, '#g2-name', 'Sam');
    ok(!note(w3, 'g2').hidden, 'and must also be contactable');
    set(w3, '#g2-email', 's@example.com');
    ok(w3.document.getElementById('review-blocker').hidden, 'complete with two');

    // A third is optional — but half of one is not "optional", it is wrong.
    const before = left(w3);
    set(w3, '#g3-name', 'Half Entered');
    ok(!note(w3, 'g3').hidden, 'a half-filled third guardian is flagged');
    ok(!w3.document.getElementById('review-blocker').hidden, 'and blocks completion');
    ok(left(w3) !== before, 'and joins the count only once started', before + ' -> ' + left(w3));
    set(w3, '#g3-mobile', '021 3');
    ok(w3.document.getElementById('review-blocker').hidden, 'complete once contactable');
  }

  // ======================================================================
  console.log('\n16. The signature name carries across');
  {
    const signer = w => w.document.getElementById('signer-name').value;

    const w = await boot();
    set(w, '#client-name', 'Tama Example');
    pick(w, 'completedBy', 1);
    set(w, '#g1-name', 'Aroha Example');
    ok(signer(w) === 'Aroha Example', 'guardian 1 fills the signature name', signer(w));

    set(w, '#g1-name', 'Aroha Renamed');
    ok(signer(w) === 'Aroha Renamed', 'and follows a correction');

    // The payload has to agree with what the reader can see in the field.
    ok(fieldOf(payload(w), 16, 2).text === 'Aroha Renamed',
       'the payload matches the visible field');

    set(w, '#signer-name', 'I Sign Differently');
    set(w, '#g1-name', 'Changed Again');
    ok(signer(w) === 'I Sign Differently', 'editing it by hand stops the carry for good');

    const w2 = await boot();
    set(w2, '#client-name', 'Self Example');
    pick(w2, 'completedBy', 0);
    ok(signer(w2) === 'Self Example', 'a self-consenting client carries their own name');

    // Carried, not invented — the review says where it came from.
    const row = [...w2.document.querySelectorAll('#review-body tr')]
      .find(tr => tr.querySelector('th').textContent.includes('person signing'));
    ok(/Set for you/.test(row.textContent), 'shown as carried on the review');
    ok(/section 2\.1/.test(row.textContent), 'and says where from', row.textContent.slice(0, 120));
  }

  // ======================================================================
  console.log('\n17. Section 2 carries numbered headings too');
  {
    const w = await boot();
    const d = w.document;

    const nums = [...d.querySelectorAll('#body-who h4.clause')]
      .map(h => h.querySelector('.clause-num').textContent);
    ['2.1', '2.2', '2.3', '2.3.1', '2.3.2', '2.3.3', '2.4'].forEach(n =>
      ok(nums.includes(n), `${n} present`));

    ok(!!d.getElementById('s-2-3-2'), '2.3.2 is anchored');
    // Which also gives the "see Section 2.3.2" citation somewhere exact.
    const link = [...d.querySelectorAll('a.xref')].find(a => /2\.3\.2/.test(a.textContent));
    ok(!!link && link.getAttribute('href') === '#s-2-3-2',
       'the 2.3.2 citation now points at the clause, not the step',
       link ? link.getAttribute('href') : 'no link');

    ok(d.getElementById('client-name').getAttribute('aria-labelledby') === 's-2-1',
       'the client name input is labelled by its heading');
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
