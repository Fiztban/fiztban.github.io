/* ==========================================================================
   Kinder Minds — new patient intake card view, headless tests

   What matters here is the same thing that mattered on the consent form: the
   right VALUE lands in the right POSITION, because Zanda's fields have no IDs
   and position is the only binding there is. On top of that, this form's
   conditionals are load-bearing in a way the consent form's were not — a
   wrong age branch does not hide a paragraph, it fails to collect a guardian's
   phone number for a child.

       cd forms && npm install && node intake-cards.test.js

   jsdom is a dev-only dependency. The page itself has none.
   ========================================================================== */

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const FORMS = __dirname;
const HTML = fs.readFileSync(path.join(FORMS, 'intake-cards.html'), 'utf8');
const SNAP = fs.readFileSync(path.join(FORMS, 'zanda-patient-intake.json'), 'utf8');

let pass = 0, fail = 0;
function ok(cond, label, extra) {
  if (cond) { pass++; console.log('  ok   ' + label); }
  else { fail++; console.log('  FAIL ' + label + (extra ? '\n         ' + extra : '')); }
}

function storageKey(client, form) {
  const seed = [client, form].join('|') || 'demo';
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
  return 'km-intake-' + (h >>> 0).toString(36);
}

async function boot(opts = {}) {
  const query = '?client=AbCdEfGhIjK&form=1234';
  const dom = new JSDOM(HTML, {
    url: 'http://127.0.0.1:8765/forms/intake-cards.html' + query,
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const w = dom.window;

  w.HTMLCanvasElement.prototype.getContext = () => ({
    setTransform() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
    clearRect() {}, drawImage() {},
  });
  w.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,SIG';

  Object.defineProperty(w, 'crypto', { value: require('node:crypto').webcrypto, configurable: true });
  w.TextEncoder = TextEncoder;
  w.Element.prototype.scrollIntoView = function () {};
  w.scrollTo = function () {};

  if (opts.seed) {
    w.localStorage.setItem(storageKey('AbCdEfGhIjK', '1234'), JSON.stringify(opts.seed));
  }

  const body = opts.snapshot || SNAP;
  w.fetch = () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(JSON.parse(body)) });

  w.eval(fs.readFileSync(path.join(FORMS, 'intake-cards.js'), 'utf8'));
  await new Promise(r => setTimeout(r, 150));
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
const tick = (w, id, on = true) => {
  const el = w.document.getElementById(id);
  el.checked = on;
  el.dispatchEvent(new w.Event('change', { bubbles: true }));
};
const payload = w => JSON.parse(w.document.getElementById('payload').textContent);
const fieldOf = (p, si, fi) => p.composition.sections[si].fields[fi];
const chosen = f => f.options.map((o, i) => (o.selected ? i : -1)).filter(i => i !== -1);

const shownCard = w => {
  const c = [...w.document.querySelectorAll('.deck > .card')].find(n => !n.hidden);
  return c ? c.id : null;
};
const cardCount = w => w.document.getElementById('deck-count').textContent;
const click = (w, id) => w.document.getElementById(id).dispatchEvent(new w.Event('click', { bubbles: true }));
const enter = w => click(w, 'go-start');
const missingList = w => w.document.getElementById('review-missing').textContent;

/* Dates relative to today, so these tests do not rot. */
const yearsAgo = n => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - n);
  return d.toISOString().slice(0, 10);
};
const CHILD = yearsAgo(9);
const ADULT = yearsAgo(34);

const SIGNED = { answers: { signature: 'data:image/png;base64,SIG' }, ui: {} };

(async () => {
  // ======================================================================
  console.log('\n1. The field map — a guardian filling in for a child');
  {
    const w = await boot({ seed: SIGNED });
    enter(w);

    tick(w, 'read-1');
    pick(w, 'completedBy', 1);
    set(w, '#first-name', 'Tāne');
    set(w, '#middle-name', 'Rua');
    set(w, '#last-name', 'Example');
    set(w, '#preferred-name', 'T');
    set(w, '#dob', CHILD);
    set(w, '#nhi', 'ABC1234');
    set(w, '#sex', 'Male');
    set(w, '#pronouns', 'he/him');
    set(w, '#address', '12 Bank Street');
    set(w, '#city', 'Whangārei');
    set(w, '#postcode', '0110');
    set(w, '#region', 'Northland');

    pick(w, 'primaryWho', 1);
    set(w, '#primary-name', 'Aroha Example');
    set(w, '#primary-mobile', '021 000 111');
    set(w, '#primary-email', 'aroha@example.com');
    set(w, '#primary-rel', 'Mother');
    tick(w, 'sms-consent');

    set(w, '#add1-name', 'Sam Example');
    set(w, '#add1-phone', '021 222 333');
    set(w, '#add1-rel', 'Father');

    pick(w, 'custodial', 1);
    set(w, '#gp-name', 'Dr Who');
    set(w, '#school-name', 'Whangārei Primary');
    pick(w, 'services', 0);
    set(w, '#sign-name', 'Aroha Example');

    const p = payload(w);
    ok(fieldOf(p, 1, 0).text === 'Tāne', 'first name -> sec1/fld0');
    ok(fieldOf(p, 1, 1).text === 'Rua', 'middle name -> sec1/fld1');
    ok(fieldOf(p, 1, 2).text === 'Example', 'last name -> sec1/fld2');
    ok(fieldOf(p, 1, 5).text === 'ABC1234', 'NHI -> sec1/fld5');
    ok(fieldOf(p, 1, 12).text === 'Northland', 'region -> sec1/fld12');
    ok(chosen(fieldOf(p, 3, 0)).join() === '1', 'primary contact = parent/guardian');
    ok(fieldOf(p, 3, 1).text === 'Aroha Example', 'primary name -> sec3/fld1');
    ok(fieldOf(p, 3, 3).checked === true, 'SMS consent is a checkbox, not an option');
    ok(fieldOf(p, 3, 5).checked === false, 'email consent left untouched stays false');
    ok(fieldOf(p, 3, 6).text === 'Mother', 'relationship -> sec3/fld6');
    ok(fieldOf(p, 4, 2).text === 'Sam Example', 'additional contact 1 -> sec4/fld2');
    ok(chosen(fieldOf(p, 10, 1)).join() === '0', 'service request -> sec10/fld1');
    ok(fieldOf(p, 12, 1).text === 'Aroha Example', 'signer name -> sec12/fld1');
    ok(fieldOf(p, 12, 2).dataUrl === 'data:image/png;base64,SIG', 'signature -> sec12/fld2');
  }

  // ======================================================================
  console.log('\n2. Age decides the deck, and it is derived not asked');
  {
    const w = await boot({ seed: SIGNED });
    enter(w);
    pick(w, 'completedBy', 0);

    // No date of birth yet: unknown age takes the branch that ASKS more, so
    // an unfilled date cannot silently drop a child's guardian contacts.
    ok(/of 17$/.test(cardCount(w)),
       'with no date of birth, the guardian cards are still offered', cardCount(w));

    set(w, '#dob', ADULT);
    ok(/of 14$/.test(cardCount(w)), 'an adult drops both contact cards and custody', cardCount(w));

    set(w, '#dob', CHILD);
    ok(/of 17$/.test(cardCount(w)), 'a child gets them back', cardCount(w));

    const note = w.document.getElementById('age-note');
    ok(!note.hidden && /Aged 9/.test(note.textContent),
       'and the page says what it worked out', note.textContent);

    set(w, '#dob', ADULT);
    ok(/do not apply/.test(w.document.getElementById('age-note').textContent),
       'saying so in both directions', w.document.getElementById('age-note').textContent);
  }

  // ======================================================================
  console.log('\n3. An adult registering themselves is never asked about guardians');
  {
    const w = await boot({ seed: SIGNED });
    enter(w);
    pick(w, 'completedBy', 0);
    set(w, '#dob', ADULT);

    const ids = [...w.document.querySelectorAll('.deck > .card')].map(c => c.id);
    ok(ids.includes('card-add1'), 'the card exists in the markup');

    // ...but is not in the pathway, and its Zanda fields are recorded empty.
    const p = payload(w);
    ok(fieldOf(p, 4, 2).text === null, 'additional contact 1 written empty');
    ok(fieldOf(p, 5, 1).text === null, 'additional contact 2 written empty');
    ok(chosen(fieldOf(p, 6, 0)).join() === '2', 'custody recorded as "Not Applicable"');
    ok(missingList(w).indexOf('parent') === -1, 'and nothing about guardians is outstanding',
       missingList(w));
  }

  // ======================================================================
  console.log('\n4. Who is signing is filled in from who is filling it in');
  {
    const w = await boot({ seed: SIGNED });
    enter(w);

    pick(w, 'completedBy', 0);
    ok(chosen(fieldOf(payload(w), 12, 0)).join() === '0', 'Client -> "I am the Client"');

    pick(w, 'completedBy', 1);
    ok(chosen(fieldOf(payload(w), 12, 0)).join() === '1', 'guardian -> "I am a Parent / Legal Guardian"');

    const note = w.document.getElementById('signer-derived');
    ok(/Set for you/.test(note.textContent), 'and it says so on the signature card itself');
    ok(/told us/.test(note.textContent), 'with the reason', note.textContent);
  }

  // ======================================================================
  console.log('\n5. Custody is a gate');
  {
    const w = await boot({ seed: SIGNED });
    enter(w);
    pick(w, 'completedBy', 1);
    set(w, '#dob', CHILD);

    ok(w.document.querySelector('[data-when="custody-yes"]').hidden, 'follow-up hidden by default');

    pick(w, 'custodial', 0);
    ok(!w.document.querySelector('[data-when="custody-yes"]').hidden, 'opened by "Yes"');
    ok(w.document.querySelector('[data-when="custody-other"]').hidden, '"Other" box still shut');

    // The restriction options are built from the form, so find "Other" by wording.
    const opts = [...w.document.querySelectorAll('#custody-restrictions input')];
    ok(opts.length === 5, 'five restriction options, rendered from the form', String(opts.length));
    const other = opts.find(i => /^other/i.test(i.closest('label').textContent.trim()));
    other.checked = true;
    other.dispatchEvent(new w.Event('change', { bubbles: true }));
    ok(!w.document.querySelector('[data-when="custody-other"]').hidden, '"Other" opens its own box');

    set(w, '#custody-type', 'Shared care order');
    set(w, '#custody-other', 'No contact with paternal grandparents');
    let p = payload(w);
    ok(fieldOf(p, 6, 1).text === 'Shared care order', 'arrangement -> sec6/fld1');
    ok(chosen(fieldOf(p, 6, 2)).length === 1, 'restriction recorded');

    // Backing out must not leave the detail behind under a "No".
    pick(w, 'custodial', 1);
    p = payload(w);
    ok(fieldOf(p, 6, 1).text === null, 'switching to "No" clears the arrangement');
    ok(chosen(fieldOf(p, 6, 2)).length === 0, 'and the restrictions');
    ok(fieldOf(p, 6, 3).text === null, 'and the "Other" text');
  }

  // ======================================================================
  console.log('\n6. Insurance: no insurance ends the section, Southern Cross extends it');
  {
    const w = await boot({ seed: SIGNED });
    enter(w);
    pick(w, 'completedBy', 0);
    set(w, '#dob', ADULT);

    ok(w.document.querySelector('[data-when="insured"]').hidden, 'insurer hidden until asked');
    ok(/of 14$/.test(cardCount(w)), 'and no Southern Cross card', cardCount(w));

    pick(w, 'hasInsurance', 0);
    ok(w.document.querySelector('[data-when="insured"]').hidden, '"No" keeps it shut');
    ok(missingList(w).indexOf('insured with') === -1, 'and asks nothing further', missingList(w));

    pick(w, 'hasInsurance', 1);
    ok(!w.document.querySelector('[data-when="insured"]').hidden, '"Yes" opens the insurer question');

    set(w, '#insurer', 'nib');
    ok(/of 14$/.test(cardCount(w)), 'another insurer adds no card', cardCount(w));
    ok(/quote/.test(missingList(w)), 'but the pre-approval quote is still asked', missingList(w));

    set(w, '#insurer', 'Southern Cross');
    ok(/of 15$/.test(cardCount(w)), 'Southern Cross adds its own card', cardCount(w));

    set(w, '#sc-policy', 'POL-99');
    pick(w, 'scClaimConsent', 0);
    pick(w, 'quoteNeeded', 1);

    const p = payload(w);
    ok(fieldOf(p, 11, 3).text === 'POL-99', 'policy number -> sec11/fld3');
    ok(chosen(fieldOf(p, 11, 4)).join() === '0', 'claim consent -> sec11/fld4');
    ok(chosen(fieldOf(p, 11, 5)).join() === '1', 'quote question -> sec11/fld5');

    // Backing out of insurance entirely must not leave the details behind.
    pick(w, 'hasInsurance', 0);
    const q = payload(w);
    ok(fieldOf(q, 11, 0).text === null, 'saying "no insurance" clears the insurer');
    ok(fieldOf(q, 11, 3).text === null, 'and the policy number');
    ok(chosen(fieldOf(q, 11, 4)).length === 0, 'and the claim consent');
  }

  // ======================================================================
  console.log('\n7. Either Southern Cross number will do');
  {
    const w = await boot({ seed: SIGNED });
    enter(w);
    pick(w, 'completedBy', 0);
    set(w, '#dob', ADULT);
    pick(w, 'hasInsurance', 1);
    set(w, '#insurer', 'Southern Cross');

    ok(/membership number or your policy/.test(missingList(w)),
       'one of the two is outstanding at first', missingList(w));

    set(w, '#sc-membership', '6101234');
    ok(!/membership number or your policy/.test(missingList(w)),
       'the membership card alone satisfies it');

    set(w, '#sc-membership', '');
    set(w, '#sc-policy', 'POL-1');
    ok(!/membership number or your policy/.test(missingList(w)),
       'and so does the policy number alone');
  }

  // ======================================================================
  console.log('\n8. School is asked of everyone, and required only where it blocks a diagnosis');
  {
    const w = await boot({ seed: SIGNED });
    enter(w);
    pick(w, 'completedBy', 0);
    set(w, '#dob', ADULT);

    const ids = () => [...w.document.querySelectorAll('.deck > .card')].map(c => c.id);
    ok(ids().includes('card-school'), 'the school card is in the deck for an adult too');
    ok(!w.document.querySelector('[data-when="over18"]').hidden,
       'framed as optional, because a school recently left is still worth having');
    ok(!/school name/.test(missingList(w)), 'and not required', missingList(w));

    // Under-18 ADHD: the form's own prose says the diagnostic needs school input.
    set(w, '#dob', CHILD);
    pick(w, 'services', 1);
    ok(/school name/.test(missingList(w)),
       'an under-18 ADHD request makes it required', missingList(w));
    ok(!w.document.querySelector('[data-when="school-needed"]').hidden,
       'and the card says why');

    // The same service for an adult does not.
    set(w, '#dob', ADULT);
    ok(!/school name/.test(missingList(w)), 'the same request for an adult does not', missingList(w));
  }

  // ======================================================================
  console.log('\n9. Prescriptions are a gate, not an empty box');
  {
    const w = await boot({ seed: SIGNED });
    enter(w);

    ok(!w.document.querySelector('[data-when="scripts-out"]').hidden, 'shut by default');
    ok(!/pharmacy/.test(missingList(w)), 'and asks nothing', missingList(w));

    tick(w, 'scripts-gate');
    ok(!w.document.querySelector('[data-when="scripts-in"]').hidden, 'opens on the tick');
    ok(/pharmacy/.test(missingList(w)), 'and then wants a pharmacy', missingList(w));

    set(w, '#pharmacy', 'Kensington Pharmacy');
    ok(fieldOf(payload(w), 9, 1).text === 'Kensington Pharmacy', 'pharmacy -> sec9/fld1');

    tick(w, 'scripts-gate', false);
    ok(fieldOf(payload(w), 9, 1).text === null, 'closing the gate clears it again');
  }

  // ======================================================================
  console.log('\n10. Continue will not leave a card that is missing its own answer');
  {
    const w = await boot({ seed: SIGNED });
    enter(w);
    ok(shownCard(w) === 'card-intro', 'starts on the introduction');

    click(w, 'go-next');
    ok(shownCard(w) === 'card-intro', 'blocked with the read-tick empty');

    tick(w, 'read-1');
    click(w, 'go-next');
    ok(shownCard(w) === 'card-completer', 'through once ticked');

    click(w, 'go-next');
    ok(shownCard(w) === 'card-completer', 'blocked again without an answer');
    ok(/Client or a parent/.test(w.document.getElementById('pager-msg').textContent),
       'saying what is needed', w.document.getElementById('pager-msg').textContent);

    pick(w, 'completedBy', 0);
    click(w, 'go-next');
    ok(shownCard(w) === 'card-name', 'and on to the name card');

    click(w, 'go-next');
    ok(shownCard(w) === 'card-name', 'which wants a first and last name');
    set(w, '#first-name', 'Mia');
    set(w, '#last-name', 'Example');
    click(w, 'go-next');
    ok(shownCard(w) === 'card-about', 'then through');
  }

  // ======================================================================
  console.log('\n11. A reader is never stranded on a card that stops applying');
  {
    const w = await boot({ seed: SIGNED });
    enter(w);
    pick(w, 'completedBy', 1);
    set(w, '#dob', CHILD);

    w.location.hash = 'card-custody';
    await new Promise(r => setTimeout(r, 20));
    ok(shownCard(w) === 'card-custody', 'standing on the custody card');

    set(w, '#dob', ADULT);            // the client turns out to be an adult
    ok(shownCard(w) !== 'card-custody', 'moved off it when it stopped applying');
    ok(shownCard(w) !== null, 'and landed somewhere real', String(shownCard(w)));
  }

  // ======================================================================
  console.log('\n12. Text comes from the form, not from the markup');
  {
    const w = await boot({ seed: SIGNED });
    enter(w);
    const doc = w.document;

    ok(/Form Purpose/.test(doc.getElementById('card-intro').textContent),
       'the introduction is rendered from the snapshot');
    ok(/Southern Cross Registered Provider/.test(doc.getElementById('card-southern-cross').textContent),
       'and so is the Southern Cross explanation');

    // The four services and their prices are the form's, never retyped here.
    const services = [...doc.querySelectorAll('#service-options input')];
    ok(services.length === 4, 'four services, rendered from the form', String(services.length));
    ok(/Autism Assessment/.test(doc.getElementById('service-options').textContent),
       'with the form’s own wording');

    // Routing written for Zanda's single scroll is not shown.
    ok(!/continue onto Section/i.test(doc.getElementById('card-intro').textContent),
       'routing sentences are stripped from the display');

    // ...but the record keeps them to the character.
    const raw = JSON.parse(SNAP).sections[0].fields[1].text;
    ok(payload(w).composition.sections[0].fields[1].text === raw,
       'and the payload carries the block verbatim');
  }

  // ======================================================================
  console.log('\n13. The skeleton guard still stops the page dead');
  {
    const moved = JSON.parse(SNAP);
    moved.sections[1].fields.splice(2, 0, {
      id: null, type: 6, text: '<p>An inserted note.</p>', label: '', options: [],
    });

    const w = await boot({ snapshot: JSON.stringify(moved) });
    ok(!w.document.getElementById('boot-error').hidden, 'boot error shown on drift');
    ok(w.document.getElementById('form-body').hidden, 'the form itself is withheld');
  }

  // ======================================================================
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
