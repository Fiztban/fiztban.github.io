/* ==========================================================================
   Kinder Minds — consent form CARD VIEW, headless tests

   The card view is an A/B against combined-consent.html, so the thing worth
   testing is not that it works but that it is the SAME FORM. Every path is
   driven through both views with identical input and the two payloads are
   compared field by field. If they can differ, the A/B is measuring two
   different forms and any result from it is worthless.

   On top of that: the deck's own behaviour — which cards exist on each
   pathway, that Continue refuses to leave an unanswered card, that the gate
   adds and removes the waiver card, and that the skeleton guard still stops
   the page dead.

       cd forms && npm install && node consent-cards.test.js

   jsdom is a dev-only dependency. The pages themselves have none.
   ========================================================================== */

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const FORMS = __dirname;

const CARDS_HTML = fs.readFileSync(path.join(FORMS, 'combined-consent-cards.html'), 'utf8');
const PAGE_HTML  = fs.readFileSync(path.join(FORMS, 'combined-consent.html'), 'utf8');
const SNAP       = fs.readFileSync(path.join(FORMS, 'zanda-combined-consent.json'), 'utf8');

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

/* view: 'cards' | 'page' — the same boot for both, so a difference in the
   result can only come from the page under test. */
async function boot(view, opts = {}) {
  const cards = view === 'cards';
  const file = cards ? 'combined-consent-cards.html' : 'combined-consent.html';
  const js   = cards ? 'consent-cards.js' : 'consent.js';
  const query = '?client=AbCdEfGhIjK&form=1234';

  const dom = new JSDOM(cards ? CARDS_HTML : PAGE_HTML, {
    url: 'http://127.0.0.1:8765/forms/' + file + query,
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

  // jsdom ships neither WebCrypto on window nor TextEncoder; both pages use
  // them to recompute the skeleton hash. Node has real implementations.
  Object.defineProperty(w, 'crypto', { value: require('node:crypto').webcrypto, configurable: true });
  w.TextEncoder = TextEncoder;

  // jsdom implements no layout, so it has neither of these. Browsers do.
  w.Element.prototype.scrollIntoView = function () {};
  w.scrollTo = function () {};

  if (opts.seed) {
    w.localStorage.setItem(storageKey('AbCdEfGhIjK', '1234'), JSON.stringify(opts.seed));
  }

  const body = opts.snapshot || SNAP;
  w.fetch = () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(JSON.parse(body)) });

  w.eval(fs.readFileSync(path.join(FORMS, js), 'utf8'));
  await new Promise(r => setTimeout(r, 150));
  return w;
}

// ---- driving helpers -----------------------------------------------------
// Identical to consent.test.js. Both views bind the same data attributes, so
// the same gestures drive either one — which is itself part of the claim.

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

// ---- deck helpers --------------------------------------------------------
const shownCard = w => {
  const c = [...w.document.querySelectorAll('.deck > .card')].find(n => !n.hidden);
  return c ? c.id : null;
};
const cardCount = w => w.document.getElementById('deck-count').textContent;
const click = (w, id) => w.document.getElementById(id).dispatchEvent(new w.Event('click', { bubbles: true }));
const railState = w => [...w.document.querySelectorAll('.rail li')]
  .map(li => li.getAttribute('data-sec') + ':' + (li.className || '-'));

/* A fresh reader lands on the start panel, not on a card. Most of what
   follows is about the deck, so it steps through the door first. */
const onStart = w => !w.document.getElementById('start-panel').hidden;
const enter = w => click(w, 'go-start');

const SIGNED = { answers: { signature: 'data:image/png;base64,SIG' }, ui: {} };

/* The same sequence of gestures, applied to whichever view is passed in. The
   card view hides all but one card, but jsdom does not enforce visibility on
   dispatched events — which is what lets one script drive both. */
function driveGuardianMulti(w) {
  set(w, '#client-name', 'Tāne Example');
  pick(w, 'completedBy', 1);
  pick(w, 'soleGuardian', 1);
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
}

function driveSelf(w) {
  set(w, '#client-name', 'Mia Example');
  pick(w, 'completedBy', 0);
  pick(w, 'scribeConsent', 1);
  tick(w, 'read-1'); tick(w, 'read-3'); tick(w, 'read-4');
  tickAll(w, 'declaration');
  set(w, '#signer-name', 'Mia Example');
}

function driveDogIn(w) {
  driveSelf(w);
  tick(w, 'dog-gate');
  tick(w, 'dog-waiver');
}

(async () => {
  // ======================================================================
  console.log('\n1. The two views produce the same payload — guardian, co-guardians');
  {
    const a = await boot('cards', { seed: SIGNED });
    const b = await boot('page',  { seed: SIGNED });
    driveGuardianMulti(a);
    driveGuardianMulti(b);

    const pa = payload(a), pb = payload(b);
    ok(JSON.stringify(pa) === JSON.stringify(pb), 'payloads are byte-identical');
    ok(fieldOf(pa, 2, 0).text === 'Tāne Example', 'client name -> sec2/fld0');
    ok(chosen(fieldOf(pa, 5, 1)).join() === '1', 'soleGuardian = not sole');
    ok(fieldOf(pa, 6, 2).text.includes('Sam Example'), 'guardian 2 written');
    ok(chosen(fieldOf(pa, 15, 0)).join() === '1', 'therapy dog = NO by default');
  }

  // ======================================================================
  console.log('\n2. The two views produce the same payload — client consenting for themselves');
  {
    const a = await boot('cards', { seed: SIGNED });
    const b = await boot('page',  { seed: SIGNED });
    driveSelf(a);
    driveSelf(b);
    ok(JSON.stringify(payload(a)) === JSON.stringify(payload(b)), 'payloads are byte-identical');
    ok(chosen(fieldOf(payload(a), 5, 1)).join() === '2', 'soleGuardian derived to "not applicable"');
    ok(chosen(fieldOf(payload(a), 7, 1)).join() === '2', 'contactOthers derived to "not applicable"');
  }

  // ======================================================================
  console.log('\n3. The two views produce the same payload — therapy dog opted in');
  {
    const a = await boot('cards', { seed: SIGNED });
    const b = await boot('page',  { seed: SIGNED });
    driveDogIn(a);
    driveDogIn(b);
    ok(JSON.stringify(payload(a)) === JSON.stringify(payload(b)), 'payloads are byte-identical');
    ok(chosen(fieldOf(payload(a), 15, 0)).join() === '0', 'therapy dog = YES');
    ok(chosen(fieldOf(payload(a), 14, 0)).join() === '0', 'risk ack recorded');
  }

  // ======================================================================
  console.log('\n3b. The way in is a panel, not a card');
  {
    const w = await boot('cards', { seed: SIGNED });
    const doc = w.document;

    ok(onStart(w), 'a fresh reader lands on the start panel');
    ok(shownCard(w) === null, 'and on no card at all');

    /* The banner logo straddles the banner's lower edge and .title-block's top
       padding is what clears the half hanging below it. Removing the title
       block once cut the logo through the middle, so both views must carry it
       and it must never be hidden. */
    const title = doc.querySelector('.title-block');
    ok(title && !title.hidden, 'the title block is present on the start panel');
    ok(/Before we can see you/.test(title.textContent), 'and carries the page heading');
    /* The bar is what divides the title block from the page, so it is up from
       the first paint. Only the pager waits — Back and Continue have nowhere
       to point yet. */
    ok(!doc.querySelector('.deck-bar').hidden, 'the bar is up before the reader starts');
    ok(doc.getElementById('pager').hidden, 'but the pager is not');
    ok(doc.getElementById('deck-count').textContent === '15 cards',
       'and the counter says how long the form is', doc.getElementById('deck-count').textContent);
    ok(doc.querySelectorAll('.rail li').length === 7, 'the rail previews all seven sections');

    // The framing copy belongs to the panel; card 1 is section 1 and nothing else.
    ok(/This form covers everything/.test(doc.getElementById('start-panel').textContent),
       'the lede sits on the panel');
    ok(!/This form covers everything/.test(doc.getElementById('card-intro').textContent),
       'and not on the introduction card');
    ok(!/Prototype/.test(doc.getElementById('card-intro').textContent),
       'nor does the prototype notice');

    enter(w);
    ok(!onStart(w), 'Start puts the panel away');
    ok(shownCard(w) === 'card-intro', 'and opens the introduction');
    ok(/^Card 1 of /.test(doc.getElementById('deck-count').textContent),
       'the counter turns into a position', doc.getElementById('deck-count').textContent);
    ok(!doc.getElementById('pager').hidden, 'and the pager arrives');
    ok(!doc.querySelector('.title-block').hidden, 'and the title block stays put');

    // The section header carries the form's own label for section 1.
    ok(!doc.getElementById('section-head').hidden, 'the section header is up');
    ok(doc.getElementById('section-count').textContent === 'Section 1 of 7',
       'and counts the section', doc.getElementById('section-count').textContent);
    ok(/Introduction/.test(doc.getElementById('section-title').textContent),
       'titled from the form’s own section label',
       doc.getElementById('section-title').textContent);
  }

  // ======================================================================
  console.log('\n3d. The section header holds while its cards change');
  {
    const w = await boot('cards', { seed: SIGNED });
    enter(w);
    const doc = w.document;
    const head  = () => doc.getElementById('section-title').textContent;
    const count = () => doc.getElementById('section-count').textContent;

    const go = async id => { w.location.hash = id; await new Promise(r => setTimeout(r, 20)); };

    await go('card-client');
    ok(count() === 'Section 2 of 7', 'section 2 on the first of its cards', count());
    ok(/Identification and Authority/.test(head()), 'showing the form’s own label', head());
    ok(/Who is the Client/.test(doc.querySelector('#card-client .card-title').textContent),
       'and the card underneath is 2.1');

    const wasHead = head(), wasCount = count();

    await go('card-who');
    ok(head() === wasHead && count() === wasCount,
       'moving to the next card does not disturb the header');
    ok(/Who is Completing/.test(doc.querySelector('#card-who .card-title').textContent),
       'though the card underneath is now 2.2');

    await go('card-comms');
    ok(head() === wasHead, 'still section 2 five cards later', head());

    // ...and it does change when the section does.
    await go('card-terms-trade');
    ok(count() === 'Section 4 of 7', 'section 4 once the reader crosses into it', count());
    ok(/Terms of Service/.test(head()), 'with section 4’s own label', head());

    // The review belongs to no numbered section of the form.
    await go('card-review');
    ok(doc.getElementById('section-head').hidden, 'and is withheld on the review card');
  }

  // ======================================================================
  console.log('\n3c. A reader with saved progress is not sent back to the door');
  {
    const w = await boot('cards', {
      seed: { answers: { clientName: 'Tāne Example' }, ui: { read1: true, cardAt: 'card-who' } },
    });
    ok(!onStart(w), 'the start panel is skipped');
    ok(shownCard(w) === 'card-who', 'and they resume where they left off');
  }

  // ======================================================================
  console.log('\n4. The deck shortens to the pathway');
  {
    const w = await boot('cards', { seed: SIGNED });
    enter(w);
    ok(shownCard(w) === 'card-intro', 'the deck opens on the introduction');
    // Before the branch is answered the guardian cards are not counted, so
    // the deck starts at its shortest and grows if the reader turns out to be
    // a guardian. Counting cards that may never appear would be the other way
    // of being wrong, and the worse one: a total that only ever shrinks reads
    // as progress the reader did not make.
    ok(/of 15$/.test(cardCount(w)), 'before the branch, only the unconditional cards count', cardCount(w));

    pick(w, 'completedBy', 0);                    // consenting for themselves
    ok(/of 15$/.test(cardCount(w)), 'self: no guardian cards, no under-18 terms', cardCount(w));

    pick(w, 'completedBy', 1);                    // guardian
    pick(w, 'soleGuardian', 0);                   // sole
    ok(/of 18$/.test(cardCount(w)), 'sole guardian: +sole, +details, +under-18 terms', cardCount(w));

    pick(w, 'soleGuardian', 1);                   // co-guardians
    ok(/of 19$/.test(cardCount(w)), 'co-guardians: the contact card joins too', cardCount(w));
  }

  // ======================================================================
  console.log('\n5. The gate adds and removes the waiver card');
  {
    const w = await boot('cards', { seed: SIGNED });
    enter(w);
    pick(w, 'completedBy', 0);
    ok(/of 15$/.test(cardCount(w)), 'waiver card absent while the gate is shut', cardCount(w));

    tick(w, 'dog-gate');
    ok(/of 16$/.test(cardCount(w)), 'ticking the gate adds the waiver card', cardCount(w));

    tick(w, 'dog-waiver');
    ok(chosen(fieldOf(payload(w), 15, 0)).join() === '0', 'gate + waiver = YES');

    tick(w, 'dog-gate', false);
    ok(/of 15$/.test(cardCount(w)), 'closing the gate removes the card again', cardCount(w));
    ok(chosen(fieldOf(payload(w), 15, 0)).join() === '1',
       'closing the gate withdraws the waiver with it');
  }

  // ======================================================================
  console.log('\n6. Continue will not leave an unanswered card');
  {
    const w = await boot('cards', { seed: SIGNED });
    enter(w);
    ok(shownCard(w) === 'card-intro', 'starts on the introduction');

    click(w, 'go-next');
    ok(shownCard(w) === 'card-intro', 'blocked while the read-tick is empty');
    ok(/Still needed/.test(w.document.getElementById('pager-msg').textContent),
       'and says what is missing', w.document.getElementById('pager-msg').textContent);

    tick(w, 'read-1');
    click(w, 'go-next');
    ok(shownCard(w) === 'card-client', 'ticking it lets Continue through');

    click(w, 'go-next');
    ok(shownCard(w) === 'card-client', 'blocked again with no client name');

    set(w, '#client-name', 'Tāne Example');
    click(w, 'go-next');
    ok(shownCard(w) === 'card-who', 'and through once the name is there');

    click(w, 'go-back');
    ok(shownCard(w) === 'card-client', 'Back always moves, answered or not');
  }

  // ======================================================================
  console.log('\n7. The reader is never stranded on a card that stops applying');
  {
    const w = await boot('cards', { seed: SIGNED });
    enter(w);
    tick(w, 'read-1');
    set(w, '#client-name', 'Tāne Example');
    pick(w, 'completedBy', 1);
    pick(w, 'soleGuardian', 1);

    // Walk to the co-guardian-only contact card, then remove it underneath.
    w.location.hash = 'card-contact';
    await new Promise(r => setTimeout(r, 20));
    ok(shownCard(w) === 'card-contact', 'standing on the contact card');

    pick(w, 'soleGuardian', 0);                   // now sole: that card is gone
    ok(shownCard(w) !== 'card-contact', 'moved off it when it stopped applying');
    ok(shownCard(w) !== null, 'and landed somewhere real', String(shownCard(w)));
  }

  // ======================================================================
  console.log('\n8. The rail reports the sections, not just the cards');
  {
    const w = await boot('cards', { seed: SIGNED });
    enter(w);
    ok(w.document.querySelectorAll('.rail li').length === 7, 'seven sections on the rail');
    ok(railState(w)[0].includes('current'), 'section 1 is current at the start');

    pick(w, 'completedBy', 0);
    ok(!railState(w).some(s => s.includes('na')),
       'no section drops out entirely for a self-consenting client');

    tick(w, 'read-1');
    ok(railState(w)[0].includes('done'), 'section 1 goes done once its tick is set');

    // Section 6 is answered on load (gate shut = NO) but must not read done
    // until the reader has actually been there.
    ok(!railState(w)[5].includes('done'), 'therapy dog is not done before it is seen');
    w.location.hash = 'card-dog-ask';
    await new Promise(r => setTimeout(r, 20));
    ok(railState(w)[5].includes('done'), 'and is done once the card has been visited');
  }

  // ======================================================================
  console.log('\n9. The skeleton guard still stops the page dead');
  {
    const moved = JSON.parse(SNAP);
    moved.sections[10].fields.splice(3, 0, {
      id: null, type: 6, text: '<p>An inserted paragraph.</p>', label: '', options: [],
    });

    const w = await boot('cards', { snapshot: JSON.stringify(moved) });
    ok(!w.document.getElementById('boot-error').hidden, 'boot error shown on skeleton drift');
    ok(w.document.getElementById('form-body').hidden, 'the form itself is withheld');
    ok(/no longer matches/.test(w.document.querySelector('#boot-error h3').textContent),
       'and says why');
  }

  // ======================================================================
  console.log('\n10. Legal text is rendered from the snapshot, not typed into the page');
  {
    const w = await boot('cards', { seed: SIGNED });
    enter(w);
    const doc = w.document;

    ok(/Terms of Trade/.test(doc.getElementById('card-terms-trade').textContent),
       '4.6 heading rendered onto its card');
    ok(/Cancellation Policy/.test(doc.getElementById('card-terms-trade').textContent),
       '4.6.3 rendered inside it');
    ok(/Governing Law/.test(doc.getElementById('card-terms-close').textContent),
       '4.9 rendered on the closing card');
    ok(doc.querySelectorAll('#card-rights-privacy .clause').length >= 7,
       'section 3.3 keeps all seven of its sub-clauses');

    // The waiver's "By selecting No" sentence describes a branch this view
    // never presents — the card only exists once the gate is open.
    ok(!/By selecting "No" - no further action/.test(doc.getElementById('card-dog-waiver').textContent),
       'the omitted sentence is not displayed');

    // ...but the record keeps Zanda's text to the character.
    const raw = JSON.parse(SNAP).sections[15].fields[1].text;
    ok(payload(w).composition.sections[15].fields[1].text === raw,
       'and the payload still carries it verbatim');
  }

  // ======================================================================
  console.log('\n11. Both views agree on what is still outstanding');
  {
    const a = await boot('cards', { seed: SIGNED });
    const b = await boot('page',  { seed: SIGNED });
    set(a, '#client-name', 'Tāne Example');
    set(b, '#client-name', 'Tāne Example');
    pick(a, 'completedBy', 1);
    pick(b, 'completedBy', 1);

    const missA = a.document.getElementById('review-missing').textContent;
    const missB = b.document.getElementById('review-missing').textContent;
    ok(missA === missB, 'the same outstanding list on both', missA + '  vs  ' + missB);
    ok(!a.document.getElementById('review-blocker').hidden, 'and both still blocked');
  }

  // ======================================================================
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
