/* ==========================================================================
   Kinder Minds — conditional consent form over Zanda, CARD VIEW

   A parallel presentation of consent.js. Same form, same 14 Zanda fields,
   same derivation, same payload — shown one card at a time instead of as an
   accordion, so the two flows can be walked side by side and compared.

   WHAT IS IDENTICAL, DELIBERATELY
     FIELDS, OPT, resolve(), the validation helpers, progressState(),
     buildComposition(), buildPayload(), renderReview() and the signature pad
     are carried across unchanged. The A/B is a test of FLOW; if the payloads
     could differ, it would be a test of two different forms.

     Both views also share one localStorage key, so answers entered in either
     appear in the other. That is what makes them a parallel view of the same
     information rather than two forms that happen to look alike.

   WHAT DIFFERS
     The accordion is replaced by a deck: a card list, a section rail, a
     sticky pager, and hash routing. markSteps() becomes markRail().

   THE HAZARD IS UNCHANGED
     Zanda gives its fields no IDs, so a field's only identity is its
     position. The skeleton hash is recomputed at load and the page refuses to
     render on mismatch. Never soften that check into a warning.

   URL PARAMETERS
     client   the client's Zanda profile hash   e.g. client=AbCdEfGhIjK
     form     the custom form number            e.g. form=1234
     name     optional, personalises the page

   Built to match consent.js: no dependencies, no build step, ES5 syntax.
   ========================================================================== */

(function () {
  'use strict';

  var PORTAL = 'https://clientportal.zandahealth.com/clientportal/kinderminds/customform/';
  var SNAPSHOT = 'zanda-combined-consent.json';

  /* Hash of the composition captured on 2026-08-21. Regenerate deliberately,
     never to silence a mismatch. Kept in step with consent.js by hand — if
     these two ever disagree, one of the views is rendering a form it was not
     built for. */
  var EXPECTED_SKELETON = '596209e279639295';

  /* ---------- Zanda field addresses -------------------------------------
     [section index, field index] into composition.sections[].fields[].
     These are the whole integration. Anything that changes them is a break.

     kind mirrors Zanda's own field-type enum:
       text  (2) / textarea (3)  -> field.text
       one   (1) Select          -> exactly one options[].selected
       many  (0) Multiselect     -> any number of options[].selected
       sign  (7) Signature       -> field.dataUrl                            */

  var FIELDS = {
    clientName:     { at: [2, 0],  kind: 'text',     required: true,  label: 'Full name of the Client' },
    completedBy:    { at: [3, 0],  kind: 'one',      required: true,  label: 'Who is completing this form' },
    soleGuardian:   { at: [5, 1],  kind: 'one',      required: true,  label: 'Sole guardian?' },
    guardian1:      { at: [6, 1],  kind: 'textarea', required: false, label: 'Legal Guardian 1 (completing this form)' },
    guardian2:      { at: [6, 2],  kind: 'textarea', required: false, label: 'Legal Guardian 2' },
    guardian3:      { at: [6, 3],  kind: 'textarea', required: false, label: 'Legal Guardian 3' },
    contactOthers:  { at: [7, 1],  kind: 'one',      required: true,  label: 'Consent to contact other guardians' },
    scribeConsent:  { at: [12, 0], kind: 'one',      required: true,  label: 'Automatic scribe (Heidi) consent' },
    dogRiskAck:     { at: [14, 0], kind: 'one',      required: true,  label: 'Therapy dog — risk understood' },
    dogChangeAck:   { at: [14, 1], kind: 'one',      required: true,  label: 'Therapy dog — may change consent' },
    dogParticipate: { at: [15, 0], kind: 'one',      required: true,  label: 'Therapy dog participation' },
    declaration:    { at: [16, 0], kind: 'many',     required: true,  label: 'Declaration' },
    signerName:     { at: [16, 2], kind: 'text',     required: true,  label: 'Full name of person signing' },
    signature:      { at: [16, 3], kind: 'sign',     required: true,  label: 'Signature' }
  };

  /* Option indices, named so the derivation table below reads as English. */
  var OPT = {
    completedBy:    { self: 0, guardian: 1 },
    soleGuardian:   { sole: 0, notSole: 1, notApplicable: 2 },
    contactOthers:  { yes: 0, no: 1, notApplicable: 2 },
    scribeConsent:  { consent: 0, decline: 1 },
    dogParticipate: { yes: 0, no: 1 }
  };

  var composition = null;     /* sections from the snapshot                */
  var answers = {};           /* what the reader actually chose            */
  var ui = {};                /* local-only state: read ticks, gates       */

  /* ====================================================================== */
  /* The deck                                                               */
  /* ====================================================================== */

  /* One entry per card, in order.

       id     the element id
       sec    which of the form's seven sections it belongs to (0 = review)
       when   the conditional that must hold for it to appear at all
       owns   progress keys this card is responsible for. Continue will not
              leave a card while any of them is outstanding — with one
              question per card, "what is missing" is never ambiguous, which
              is the whole reason the questions were isolated.               */

  var CARDS = [
    { id: 'card-intro',           sec: 1, when: null,             owns: ['read1'] },
    { id: 'card-client',          sec: 2, when: null,             owns: ['clientName'] },
    { id: 'card-who',             sec: 2, when: null,             owns: ['completedBy'] },
    { id: 'card-sole',            sec: 2, when: 'guardian',       owns: ['soleGuardian'] },
    { id: 'card-guardians',       sec: 2, when: 'guardian',       owns: ['guardian1', 'guardian2', 'guardian3'] },
    { id: 'card-contact',         sec: 2, when: 'guardian-multi', owns: ['contactOthers'] },
    { id: 'card-comms',           sec: 2, when: null,             owns: [] },
    { id: 'card-rights-services', sec: 3, when: null,             owns: [] },
    { id: 'card-rights-care',     sec: 3, when: null,             owns: [] },
    { id: 'card-rights-privacy',  sec: 3, when: null,             owns: ['read3'] },
    { id: 'card-terms-scope',     sec: 4, when: null,             owns: [] },
    { id: 'card-terms-trade',     sec: 4, when: null,             owns: [] },
    { id: 'card-terms-u18',       sec: 4, when: 'guardian',       owns: [] },
    { id: 'card-terms-close',     sec: 4, when: null,             owns: ['read4'] },
    { id: 'card-scribe-about',    sec: 5, when: null,             owns: [] },
    { id: 'card-scribe-choice',   sec: 5, when: null,             owns: ['scribeConsent'] },
    { id: 'card-dog-ask',         sec: 6, when: null,             owns: [] },
    { id: 'card-dog-waiver',      sec: 6, when: 'dog-in',         owns: [] },
    { id: 'card-sign',            sec: 7, when: null,             owns: ['declaration', 'signerName', 'signature'] },
    { id: 'card-review',          sec: 0, when: null,             owns: [] }
  ];

  /* The rail. Short labels, because the rail is a map rather than a table of
     contents — the card's own heading, taken from the form, says what the
     reader is actually looking at. */
  /* `label` is the short name on the rail — navigation, not a heading. `at` is
     where the form's OWN label for that section lives in the composition, and
     that is what the section header above the deck displays. The two are
     deliberately different things: the rail has to fit seven pills across a
     phone, the header must not rename a section of the document. */
  var SECTIONS = [
    { n: 1, label: 'Introduction', at: 0 },
    { n: 2, label: 'Who you are',  at: 1 },
    { n: 3, label: 'Your rights',  at: 9 },
    { n: 4, label: 'Terms',        at: 10 },
    { n: 5, label: 'Scribe',       at: 11 },
    { n: 6, label: 'Therapy dog',  at: 13 },
    { n: 7, label: 'Sign',         at: 16 }
  ];

  /* What each section needs before the rail shows it done. Mirrors the card
     ownership above, gathered by section. */
  var SECTION_OWNS = {
    1: ['read1'],
    2: ['clientName', 'completedBy', 'soleGuardian', 'guardian1', 'guardian2', 'guardian3', 'contactOthers'],
    3: ['read3'],
    4: ['read4'],
    5: ['scribeConsent'],
    6: [],
    7: ['declaration', 'signerName', 'signature']
  };

  /* The therapy dog section is answered the moment the page loads — leaving
     the gate shut IS the answer — so it would otherwise show done on the rail
     before the reader had ever reached it. A finished-looking section invites
     skipping, and this is the one section offering something a family might
     want. It counts as done once its card has been visited.

     Deliberately not part of the answered count: arriving somewhere is not an
     answer, and padding the denominator with it would misreport how much is
     actually left to do. */
  var NEEDS_SEEING = { 6: 'card-dog-ask' };

  /* Plain-language names for the pager's "still needed" line. The review
     table uses FIELDS[].label, which is written for an auditor reading the
     record; this is written for the person filling the form in. */
  var NEEDED_AS = {
    read1:        'tick to say you have read the introduction',
    read3:        'tick to say you have read this section',
    read4:        'tick to accept the terms of service',
    clientName:   'the Client’s full name',
    completedBy:  'who is completing this form',
    soleGuardian: 'whether you are the sole legal guardian',
    guardian1:    'your name and a way to contact you',
    guardian2:    'the second guardian’s name and a way to contact them',
    guardian3:    'the third guardian’s details, or clear the fields you have started',
    contactOthers: 'whether we may contact the other guardians',
    scribeConsent: 'your answer on the automatic scribe',
    declaration:  'all four confirmations',
    signerName:   'the full name of the person signing',
    signature:    'your signature'
  };

  var currentId = null;       /* the card on screen                        */
  var navigating = false;     /* re-entry guard for hashchange             */

  /* ====================================================================== */
  /* URL, storage                                                           */
  /* ====================================================================== */

  var params = new URLSearchParams(window.location.search);

  var clientHash = (params.get('client') || '').trim();
  if (!/^[A-Za-z0-9_-]{4,64}$/.test(clientHash)) { clientHash = null; }

  var formNumber = (params.get('form') || '').trim();
  if (!/^\d{1,10}$/.test(formNumber)) { formNumber = null; }

  var zandaUrl = (clientHash && formNumber) ? PORTAL + clientHash + '/' + formNumber : null;

  /* Identical to consent.js, and deliberately so: both views read and write
     the same saved answers, so a reader — or a reviewer comparing the two —
     can switch between them mid-form without losing anything. */
  function storageKey() {
    var seed = [clientHash, formNumber].join('|') || 'demo';
    var hash = 0;
    for (var i = 0; i < seed.length; i++) {
      hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
    }
    return 'km-consent-' + (hash >>> 0).toString(36);
  }

  var KEY = storageKey();

  function load() {
    try {
      var raw = JSON.parse(window.localStorage.getItem(KEY)) || {};
      answers = raw.answers || {};
      ui = raw.ui || {};
    } catch (e) { answers = {}; ui = {}; }
  }

  function save() {
    try {
      window.localStorage.setItem(KEY, JSON.stringify({ answers: answers, ui: ui }));
    } catch (e) { /* private browsing — the page still works, it just forgets */ }
  }

  /* ====================================================================== */
  /* Verbatim legal text                                                    */
  /* ====================================================================== */

  /* Zanda stores Information blocks as editor HTML. It is our own content, but
     it is still markup arriving from a data file, so anything executable is
     stripped before it reaches the page. */
  function sanitise(html) {
    var box = document.createElement('div');
    box.innerHTML = html || '';

    box.querySelectorAll('script, style, iframe, object, embed, form, input').forEach(function (el) {
      el.remove();
    });

    box.querySelectorAll('*').forEach(function (el) {
      Array.prototype.slice.call(el.attributes).forEach(function (attr) {
        var n = attr.name.toLowerCase();
        var v = (attr.value || '').trim().toLowerCase();
        if (n.indexOf('on') === 0) { el.removeAttribute(attr.name); }
        if ((n === 'href' || n === 'src') && v.indexOf('javascript:') === 0) { el.removeAttribute(attr.name); }
      });
      /* Links out of a consent form open away from it, never in place. */
      if (el.tagName === 'A' && el.getAttribute('href')) {
        el.setAttribute('target', '_blank');
        el.setAttribute('rel', 'noopener noreferrer');
      }
    });

    return box.innerHTML;
  }

  function fieldAt(si, fi) {
    var s = composition[si];
    return s && s.fields[fi];
  }

  /* data-legal="9.2"  |  "9.0,9.3"  |  "10.0-10.5"  — a single address, a
     list, or an inclusive range within one section. */
  function expandAddresses(spec) {
    var out = [];
    spec.split(',').forEach(function (part) {
      part = part.trim();
      var range = part.match(/^(\d+)\.(\d+)-(\d+)\.(\d+)$/);
      if (range) {
        var si = +range[1], from = +range[2], to = +range[4];
        for (var i = from; i <= to; i++) { out.push([si, i]); }
        return;
      }
      var one = part.match(/^(\d+)\.(\d+)$/);
      if (one) { out.push([+one[1], +one[2]]); }
    });
    return out;
  }

  var headingIds = {};        /* "4.6.3" -> element id, for rendered blocks only */

  /* ---------- known numbering faults in the source form ----------
     The Terms of Service was numbered 5.x and renumbered to 4.x, and the pass
     was left unfinished. Corrected here for DISPLAY only; the payload is
     untouched. Delete each entry once Zanda is corrected — the skeleton hash
     will change and force a re-capture anyway, which is the moment to check.

     Kept byte-identical to consent.js. If the two ever diverge, the same form
     reads differently depending on which view a client happened to open. */
  var HEADING_FIXES = {
    '10.3': '4.3'
  };

  /* ---------- citations corrected for display ---------- */
  var CITATION_FIXES = {
    '9.9':   { '4': '5' },
    '9.12':  { '4': '5' },
    '10.3':  { '5.6.3': '4.6.3' },
    '10.5':  { '5.6.3': '4.6.3' },
    '10.7':  { '5.7.3': '4.7.3' },
    '10.9':  { '5.3': '4.3' },
    '10.18': { '5.6.3': '4.6.3' },
    '10.22': { '5.6.3': '4.6.3' }
  };

  /* ---------- wording that does not survive the change of format ----------
     Sentences written for Zanda's single scroll that are wrong, not merely
     redundant, once the pathway replaces it. */
  var OMIT_SENTENCES = {
    /* Sits inside the waiver, which a reader only ever sees after opting IN.
       Telling them what happens if they select "No" describes a choice this
       format does not present — and in the card view the "No" path never
       reaches this card at all. */
    '15.1': ['By selecting "No" - no further action is required.']
  };

  var AMBIGUOUS_NUMBERS = {};

  function anchorFor(number) { return 's-' + number.replace(/\./g, '-'); }

  /* Splits "4.6.3.  Cancellation Policy" into its number and its title,
     applying any documented correction to the number as it goes. */
  function splitHeading(label, address) {
    var m = /^\s*(\d+(?:\.\d+)*)\.?\s+(.*)$/.exec(label || '');
    if (!m) { return null; }

    var number = m[1];
    var fixed = address && HEADING_FIXES[address];
    if (fixed) {
      AMBIGUOUS_NUMBERS[number] = true;
      number = fixed;
    }

    return { number: number, title: m[2].trim() };
  }

  /* Rewrites a mis-numbered citation in the text of one block, and drops any
     sentence that no longer applies. Operates on text nodes, so nothing inside
     an attribute or a URL is touched. */
  function adaptText(html, address) {
    var fixes = CITATION_FIXES[address];
    var omit = OMIT_SENTENCES[address];
    if (!fixes && !omit) { return html; }

    var box = document.createElement('div');
    box.innerHTML = html;

    var walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT, null);
    var nodes = [];
    while (walker.nextNode()) { nodes.push(walker.currentNode); }

    nodes.forEach(function (node) {
      var value = node.nodeValue;

      if (fixes) {
        value = value.replace(/Section\s+(\d+(?:\.\d+)*)/g, function (whole, number) {
          return fixes[number] ? whole.replace(number, fixes[number]) : whole;
        });
      }

      if (omit) {
        omit.forEach(function (sentence) { value = value.split(sentence).join(''); });
      }

      if (value !== node.nodeValue) { node.nodeValue = value; }
    });

    /* A sentence removed on its own line leaves an empty element behind. */
    if (omit) {
      box.querySelectorAll('p, div, li').forEach(function (node) {
        if (!node.textContent.trim() && !node.querySelector('img, br')) { node.remove(); }
      });
    }

    return box.innerHTML;
  }

  /* "Continue onto Section 5." is navigation for Zanda's single scroll, which
     this pathway has replaced with its own pager. */
  function stripNavigation(html) {
    var box = document.createElement('div');
    box.innerHTML = html;

    /* Each of these sits in its own element ("<div>Continue onto Section 3.</div>"),
       so matching on an element's entire text is exact — a parent holding real
       content alongside it can never match. */
    box.querySelectorAll('p, div, li').forEach(function (node) {
      if (/^\s*Continue\s+(?:onto|to)\s+Section\s+\d+(?:\.\d+)*\s*\.?\s*$/i.test(node.textContent)) {
        node.remove();
      }
    });

    /* Zanda's editor pads with <div><br></div>; once the line above it goes,
       the spacer is left dangling at the end. */
    while (box.lastElementChild && !box.lastElementChild.textContent.trim() &&
           box.lastElementChild.querySelector('br')) {
      box.lastElementChild.remove();
    }

    return box.innerHTML;
  }

  function fillLegal() {
    /* Section headings come from the form's own section labels, so the
       pathway never renames a section of the document it is rendering. */
    document.querySelectorAll('[data-section-heading]').forEach(function (host) {
      var section = composition[+host.getAttribute('data-section-heading')];
      var head = splitHeading(section && section.label);
      if (!head) { return; }

      var id = anchorFor(head.number);
      headingIds[head.number] = id;
      host.id = id;
      host.innerHTML = '<span class="clause-num">' + head.number + '</span> ' +
                       escapeText(head.title);
    });

    document.querySelectorAll('[data-section-title]').forEach(function (host) {
      var section = composition[+host.getAttribute('data-section-title')];
      var head = splitHeading(section && section.label);
      if (head) { host.textContent = head.title; }
    });

    document.querySelectorAll('[data-legal-title]').forEach(function (host) {
      var a = host.getAttribute('data-legal-title').split('.');
      var f = fieldAt(+a[0], +a[1]);
      var head = splitHeading(f && f.label, a[0] + '.' + a[1]);
      if (!head) { return; }

      var id = anchorFor(head.number);
      headingIds[head.number] = id;
      host.id = id;
      host.innerHTML = '<span class="clause-num">' + head.number + '</span> ' +
                       escapeText(head.title);
    });

    document.querySelectorAll('[data-legal]').forEach(function (host) {
      var skipFirst = host.hasAttribute('data-skip-first-heading');

      var html = expandAddresses(host.getAttribute('data-legal')).map(function (a, i) {
        var f = fieldAt(a[0], a[1]);
        if (!f || f.type !== 6) { return ''; }

        var address = a[0] + '.' + a[1];
        var body = adaptText(stripNavigation(sanitise(f.text)), address);
        var head = splitHeading(f.label, address);
        if (!head || (skipFirst && i === 0)) { return body; }

        var id = anchorFor(head.number);
        headingIds[head.number] = id;

        return '<h4 class="clause" id="' + id + '">' +
               '<span class="clause-num">' + head.number + '</span> ' +
               escapeText(head.title) + '</h4>' + body;
      }).join('');

      host.innerHTML = html;
      host.classList.add('legal');
    });

    linkCrossReferences();

    /* Option text is legal wording too — always taken from Zanda, never
       retyped into the markup. */
    document.querySelectorAll('[data-opt-text]').forEach(function (host) {
      var a = host.getAttribute('data-opt-text').split('.');
      var f = fieldAt(+a[0], +a[1]);
      var o = f && f.options[+a[2]];
      if (o) { host.textContent = stripRouting(o.value); }
    });
  }

  function escapeText(s) {
    var box = document.createElement('span');
    box.textContent = s || '';
    return box.innerHTML;
  }

  /* Turns "see Section 4.6.3" into a link to that clause, but only where the
     clause is actually on this page. An unresolvable citation is left as plain
     text — a link that goes nowhere is worse than none, and these are the
     symptom of a numbering fault in the source form that we must not paper
     over. Walks text nodes only, so nothing inside an attribute is touched. */
  function linkCrossReferences() {
    document.querySelectorAll('.legal').forEach(function (host) {
      var walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT, null);
      var nodes = [];
      while (walker.nextNode()) { nodes.push(walker.currentNode); }

      nodes.forEach(function (node) {
        if (node.parentNode.closest('a, h4')) { return; }
        if (!/Section\s+\d/.test(node.nodeValue)) { return; }

        var frag = document.createDocumentFragment();
        var re = /Section\s+(\d+(?:\.\d+)*)/g;
        var last = 0;
        var m;

        while ((m = re.exec(node.nodeValue)) !== null) {
          var id = resolveCitation(m[1]);
          if (!id) { continue; }

          frag.appendChild(document.createTextNode(node.nodeValue.slice(last, m.index)));
          var a = document.createElement('a');
          a.className = 'xref';
          a.href = '#' + id;
          a.textContent = m[0];
          frag.appendChild(a);
          last = m.index + m[0].length;
        }

        if (!last) { return; }
        frag.appendChild(document.createTextNode(node.nodeValue.slice(last)));
        node.parentNode.replaceChild(frag, node);
      });
    });
  }

  /* Resolve a cited number to something on this page. Exact clause first,
     then the card a whole section became, then upwards through the numbering
     — but only ever to a clause that genuinely exists.

     Returns null when nothing matches, and the citation then stays plain
     text. That is deliberate: 5.6.3 and 5.7.3 are cited five times between
     them and exist nowhere in the form, and a link that silently went to the
     nearest plausible clause would hide a real fault in the source. */
  function resolveCitation(number) {
    if (AMBIGUOUS_NUMBERS[number]) { return null; }
    if (headingIds[number]) { return headingIds[number]; }
    if (cardIds[number]) { return cardIds[number]; }
    if (number.indexOf('.') === -1) { return null; }

    var parts = number.split('.');
    while (parts.length > 1) {
      parts.pop();
      var parent = parts.join('.');
      if (headingIds[parent]) { return headingIds[parent]; }
    }

    return null;
  }

  /* Whole-section citations ("as outlined in Section 2") point at the card
     that section opens on, rather than at a clause. Section 2's sub-sections
     became the questions themselves, so each names its own card — a citation
     resolves to a named card or to nothing, never to a guess. */
  var cardIds = {
    '1': 'card-intro',
    '2': 'card-client',
    '3': 'card-rights-services',
    '4': 'card-terms-scope',
    '5': 'card-scribe-about',
    '6': 'card-dog-ask',
    '7': 'card-sign',

    '2.1':   'card-client',
    '2.2':   'card-who',
    '2.3':   'card-sole',
    '2.3.1': 'card-sole',
    '2.3.2': 'card-guardians',
    '2.3.3': 'card-contact',
    '2.4':   'card-comms',

    '5.5': 'card-scribe-choice',
    '6.4': 'card-dog-ask',
    '6.5': 'card-dog-ask'
  };

  /* ---------- drawings ----------
     Zanda's `drawings` array is the clinic's whole image library, shared
     across every custom form — so a name appearing in it says nothing about
     whether THIS form uses it. The field's own `selectedDrawing` is what the
     form displays, and that is what this reads. */
  var DRAWINGS = {
    '20240904_084912_C.jpg': '../assets/Used/20240904_084912_C.jpg'
  };

  function fillDrawings() {
    document.querySelectorAll('[data-drawing]').forEach(function (img) {
      var a = img.getAttribute('data-drawing').split('.');
      var f = fieldAt(+a[0], +a[1]);
      var name = f && f.selectedDrawing;
      var src = name && DRAWINGS[name];

      if (src) {
        img.src = src;
        img.hidden = false;
        return;
      }

      /* The form points at a drawing we hold no copy of. Showing nothing is
         the right answer — showing whatever else is to hand is how a
         therapy-dog waiver ends up illustrated with the wrong dog. */
      img.hidden = true;
      if (window.console) {
        window.console.warn('consent-cards.js: no local asset for drawing ' +
          JSON.stringify(name) + ' — add it to DRAWINGS.');
      }
    });
  }

  /* Several of Zanda's option labels end in a parenthetical telling the reader
     which section to jump to next. Those instructions describe the flat form's
     navigation, which this page has replaced. Only the DISPLAYED text is
     trimmed; the value written back to Zanda is always the untouched original. */
  function stripRouting(text) {
    return String(text || '')
      .replace(/\s*\((?:please|proceed)\b[^)]*\)?/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  /* ====================================================================== */
  /* Derivation — the heart of the conditional flow                         */
  /* ====================================================================== */

  /* Turns what the reader did into the complete set of Zanda answers,
     including every field the pathway answered on their behalf.

     Each entry is {value, derived, why}. `derived` drives the badge on the
     review table: a consent form must never write an answer its signer cannot
     see and cannot account for. */
  function resolve() {
    var r = {};

    function set(key, value, why) {
      r[key] = { value: value, derived: why != null, why: why || null };
    }

    /* --- Section 2: identity and authority --- */

    set('clientName', answers.clientName || '');
    set('completedBy', has(answers.completedBy) ? answers.completedBy : null);

    var isGuardian = answers.completedBy === OPT.completedBy.guardian;
    var isSelf     = answers.completedBy === OPT.completedBy.self;

    if (isSelf) {
      /* A client consenting for themselves has no guardian branch at all.
         Zanda still requires both questions, and both carry an explicit
         "Not applicable – I am the Client" option, so this is exactly what
         Zanda's own form instructs the reader to tick. */
      set('soleGuardian', OPT.soleGuardian.notApplicable, 'You are completing this form as the Client');
      set('contactOthers', OPT.contactOthers.notApplicable, 'You are completing this form as the Client');
      set('guardian1', '', 'Not collected — you are consenting for yourself');
      set('guardian2', '', 'Not collected — you are consenting for yourself');
      set('guardian3', '', 'Not collected — you are consenting for yourself');

    } else if (isGuardian) {
      set('soleGuardian', has(answers.soleGuardian) ? answers.soleGuardian : null);
      set('guardian1', person('g1'));

      var sole = answers.soleGuardian === OPT.soleGuardian.sole;

      if (sole) {
        set('guardian2', '', 'You are the sole legal guardian');
        set('guardian3', '', 'You are the sole legal guardian');
        /* 2.3.3 asks whether we may contact the OTHER guardians. For a sole
           guardian there are none, so the question is as moot as it is for a
           client consenting for themselves — the "Not applicable" option is
           read as covering both cases. Zanda's wording for it names only the
           client, which is why this is a deliberate decision rather than an
           obvious mapping; a fourth option worded for sole guardians would
           make the record read exactly right. */
        set('contactOthers', OPT.contactOthers.notApplicable,
            'There are no other guardians to contact');
      } else {
        set('guardian2', person('g2'));
        set('guardian3', person('g3'));
        set('contactOthers', has(answers.contactOthers) ? answers.contactOthers : null);
      }

    } else {
      set('soleGuardian', null);
      set('contactOthers', null);
      set('guardian1', '');
      set('guardian2', '');
      set('guardian3', '');
    }

    /* --- Section 5: automatic scribe --- */
    /* A real either/or consent, deliberately NOT a gate: an untouched tick box
       would be indistinguishable from a considered "no". */
    set('scribeConsent', has(answers.scribeConsent) ? answers.scribeConsent : null);

    /* --- Section 6: therapy dog --- */
    /* The two 6.4 acknowledgements are required of everyone — Zanda's own form
       says "This acknowledgement applies whether or not you choose to opt in".
       Both describe information this page shows to every reader, on the ask
       card and above the choice, so both are recorded either way. */
    set('dogRiskAck', 0, 'You were shown the therapy dog information and risks before choosing');
    set('dogChangeAck', 0, 'Applies to everyone: consent can be changed at any time');

    /* Opting in takes two deliberate acts — open the gate, then agree to the
       waiver on the card it opens. Opening it alone is not consent. */
    var dogYes = !!(ui.dogGate && ui.dogWaiver);
    set('dogParticipate',
        dogYes ? OPT.dogParticipate.yes : OPT.dogParticipate.no,
        dogYes ? 'You opted in and agreed to the Therapy Dog Interaction Waiver'
               : 'You did not opt in, so no therapy dog consent is recorded');

    /* --- Section 7: declaration --- */
    set('declaration', Array.isArray(answers.declaration) ? answers.declaration.slice() : []);

    set('signerName', answers.signerName || '');
    set('signature', answers.signature || '');

    return r;
  }

  function has(v) { return v !== null && v !== undefined && v !== ''; }

  /* Deliberately loose. The job is to catch a slip — a missing @, a phone
     number with letters in it — not to adjudicate what is a valid address or
     number. Anything stricter starts rejecting real people: NZ mobiles are
     written 021 234 5678, +64 21 234 5678 and (09) 123 4567 alike. */
  var EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  var PHONE_SHAPE = /^[+()\d\s-]+$/;

  function emailLooksRight(v) { return !v || EMAIL_SHAPE.test(v); }

  function phoneLooksRight(v) {
    if (!v) { return true; }
    return PHONE_SHAPE.test(v) && (v.match(/\d/g) || []).length >= 7;
  }

  /* Which guardians this pathway actually needs, given who is completing and
     whether they are sole. The third is never required — but must be usable if
     someone starts it. */
  function personRequired(prefix) {
    if (answers.completedBy !== OPT.completedBy.guardian) { return false; }
    if (prefix === 'g1') { return true; }
    if (prefix === 'g2') { return answers.soleGuardian === OPT.soleGuardian.notSole; }
    return false;
  }

  /* A guardian entry is only useful if we can reach them. Every legal guardian
     has to be sent their own copy of this form before appointments can be
     booked, so a name with no mobile and no email is a dead end that only
     surfaces days later when someone tries to send it. */
  function personComplete(prefix) {
    var f = personFields(prefix);
    if (!f.name) { return false; }
    if (!phoneLooksRight(f.mobile) || !emailLooksRight(f.email)) { return false; }
    return !!(f.mobile || f.email);
  }

  /* Half-filled entries are worse than empty ones — they look answered. */
  function personStarted(prefix) {
    var f = personFields(prefix);
    return !!(f.name || f.mobile || f.email);
  }

  function personFields(prefix) {
    return {
      name:   (answers[prefix + 'Name'] || '').trim(),
      mobile: (answers[prefix + 'Mobile'] || '').trim(),
      email:  (answers[prefix + 'Email'] || '').trim()
    };
  }

  /* Three inputs in, one Zanda textarea out — in the shape the field's own
     placeholder asks for, so a reader of the PDF sees what they expect. */
  function person(prefix) {
    var f = personFields(prefix);
    if (!f.name && !f.mobile && !f.email) { return ''; }
    return 'Full name: ' + f.name + '\nMobile number: ' + f.mobile + '\nEmail address: ' + f.email;
  }

  /* ====================================================================== */
  /* What is still outstanding                                              */
  /* ====================================================================== */

  /* What this pathway needs, given the answers so far — as one pass that
     yields both the outstanding items and the total. Identical to consent.js:
     the two views must never disagree about whether the form is finished. */
  function progressState() {
    var r = resolve();
    var missing = [];
    var total = 0;

    function need(key, ok) {
      total++;
      if (!ok) { missing.push(key); }
    }

    need('clientName', !!r.clientName.value.trim());
    need('completedBy', has(r.completedBy.value));

    if (answers.completedBy === OPT.completedBy.guardian) {
      need('soleGuardian', has(r.soleGuardian.value));

      /* A name and at least one way to reach them: one guardian if sole, two
         if not. Zanda marks these fields optional, but the whole guardian
         branch exists to collect them, so the page enforces it itself. */
      need('guardian1', personComplete('g1'));

      if (answers.soleGuardian === OPT.soleGuardian.notSole) {
        need('guardian2', personComplete('g2'));
        need('contactOthers', has(r.contactOthers.value));
      }

      /* A third guardian is optional. It only joins the count once someone
         starts filling it in — a half-filled entry must not pass as complete,
         but an untouched one should not be pending either. */
      if (personStarted('g3')) { need('guardian3', personComplete('g3')); }
    }

    need('scribeConsent', has(r.scribeConsent.value));

    /* A read-tick stands where a section asks nothing else. Sections 1, 3 and
       4 are pure reading; every other section ends in an answer that speaks
       for itself. These are local only — the record of having read the form is
       the declaration in section 7, which says so in as many words. */
    need('read1', !!ui.read1);
    need('read3', !!ui.read3);
    need('read4', !!ui.read4);
    need('declaration', r.declaration.value.length === 4);
    need('signerName', !!r.signerName.value.trim());
    need('signature', !!r.signature.value);

    return { missing: missing, total: total };
  }

  function outstanding() { return progressState().missing; }

  /* ====================================================================== */
  /* Payload                                                                */
  /* ====================================================================== */

  /* Rebuilds Zanda's composition with our answers written into it. Deep-copied
     every time so a preview can never mutate the snapshot. */
  function buildComposition() {
    var sections = JSON.parse(JSON.stringify(composition));
    var r = resolve();

    Object.keys(FIELDS).forEach(function (key) {
      var spec = FIELDS[key];
      var f = sections[spec.at[0]].fields[spec.at[1]];
      var v = r[key] ? r[key].value : null;

      if (spec.kind === 'text' || spec.kind === 'textarea') {
        f.text = v || null;

      } else if (spec.kind === 'one') {
        f.options.forEach(function (o, i) { o.selected = (i === v); });

      } else if (spec.kind === 'many') {
        f.options.forEach(function (o, i) { o.selected = v.indexOf(i) !== -1; });

      } else if (spec.kind === 'sign') {
        f.dataUrl = v || null;
      }
    });

    return { sections: sections };
  }

  function buildPayload() {
    return {
      /* Zanda's Save wants customForm.id — the form-DATA instance id, which is
         NOT the number in the URL. Only GetForm returns it, so in production
         the proxy reads it there and fills it in. */
      id: '<customForm.id, from GetForm>',
      composition: buildComposition(),
      status: 2                       /* 2 = AutoDraft. 0 = Locked/submitted. */
    };
  }

  /* ====================================================================== */
  /* Conditionals                                                           */
  /* ====================================================================== */

  function el(id) { return document.getElementById(id); }

  /* The closed vocabulary behind both data-when and a card's `when`.
     Deliberately not an eval'd expression. */
  function truthTable() {
    var isGuardian = answers.completedBy === OPT.completedBy.guardian;
    var isSelf     = answers.completedBy === OPT.completedBy.self;

    return {
      'guardian':       isGuardian,
      'self':           isSelf,
      'chosen':         isGuardian || isSelf,
      'unchosen':       !isGuardian && !isSelf,
      'guardian-sole':  isGuardian && answers.soleGuardian === OPT.soleGuardian.sole,
      'guardian-multi': isGuardian && answers.soleGuardian === OPT.soleGuardian.notSole,
      'dog-in':         !!ui.dogGate,
      'dog-out':        !ui.dogGate
    };
  }

  function applyConditionals() {
    var truth = truthTable();
    document.querySelectorAll('[data-when]').forEach(function (node) {
      /* A card's own visibility is the deck's business, not this function's —
         showing one here would put two cards on screen at once. */
      if (node.classList.contains('card')) { return; }
      node.hidden = !truth[node.getAttribute('data-when')];
    });
  }

  /* Says what is wrong on the card itself, rather than leaving it to the
     blocker at the end of the form. A REQUIRED guardian says so while still
     empty; an OPTIONAL one stays quiet until someone starts it. */
  function markPersonNotes() {
    document.querySelectorAll('[data-person-note]').forEach(function (note) {
      var prefix = note.getAttribute('data-person-note');
      var f = personFields(prefix);
      var required = personRequired(prefix);

      var message = personProblem(prefix, f, required);
      note.hidden = !message;
      if (message) { note.textContent = message; }

      /* Point at the offending field, not just the card. */
      mark(prefix + '-mobile', !phoneLooksRight(f.mobile));
      mark(prefix + '-email', !emailLooksRight(f.email));
    });
  }

  function mark(id, bad) {
    var input = el(id);
    if (input) { input.classList.toggle('invalid', !!bad); }
  }

  function personProblem(prefix, f, required) {
    var who = f.name || 'this guardian';

    if (!personStarted(prefix)) {
      return required
        ? 'Please give this guardian’s full name and at least one way to contact them.'
        : null;
    }

    if (!phoneLooksRight(f.mobile)) {
      return 'That mobile number does not look right. Digits, spaces, and + ( ) - are all fine.';
    }
    if (!emailLooksRight(f.email)) {
      return 'That email address does not look right — it should look like name@example.co.nz';
    }
    if (!f.name) {
      return 'Please give this guardian’s full name.';
    }
    if (!f.mobile && !f.email) {
      return 'Please give at least one way to contact ' + who +
             ' — a mobile number or an email address.';
    }
    return null;
  }

  function syncInputs() {
    /* Radios and checkboxes bound to a Zanda field. */
    document.querySelectorAll('[data-field]').forEach(function (input) {
      var key = input.getAttribute('data-field');
      var spec = FIELDS[key];
      if (!spec) { return; }

      if (input.type === 'radio') {
        input.checked = answers[key] === +input.value;
      } else if (input.type === 'checkbox') {
        var list = answers[key] || [];
        input.checked = list.indexOf(+input.value) !== -1;
      } else {
        input.value = answers[key] || '';
      }
    });

    /* Free-text that is composed into a Zanda field rather than being one. */
    document.querySelectorAll('[data-answer]').forEach(function (input) {
      input.value = answers[input.getAttribute('data-answer')] || '';
    });

    /* Local-only state: read acknowledgements and the therapy-dog gate. */
    document.querySelectorAll('[data-ui]').forEach(function (input) {
      input.checked = !!ui[input.getAttribute('data-ui')];
    });
  }

  /* ====================================================================== */
  /* The deck: which cards exist, and where we are in them                  */
  /* ====================================================================== */

  /* The cards this pathway actually contains, given the answers so far. The
     list shortens the moment someone says they are consenting for themselves,
     which is the whole point of asking that question early. */
  function visibleCards() {
    var truth = truthTable();
    return CARDS.filter(function (c) { return !c.when || truth[c.when]; });
  }

  function indexOfCard(id) {
    var list = visibleCards();
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) { return i; }
    }
    return -1;
  }

  function cardSpec(id) {
    for (var i = 0; i < CARDS.length; i++) {
      if (CARDS[i].id === id) { return CARDS[i]; }
    }
    return null;
  }

  /* Somewhere sensible to land when the requested card is not in the deck —
     because a saved position pointed at a guardian card and the reader has
     since said they are the client, or a hash was typed by hand. Falls back to
     the nearest earlier card that does exist, never past the reader's
     position. */
  function nearestVisible(id) {
    var list = visibleCards();
    if (!list.length) { return null; }

    var wanted = CARDS.findIndex(function (c) { return c.id === id; });
    if (wanted === -1) { return list[0].id; }

    for (var i = wanted; i >= 0; i--) {
      if (list.some(function (c) { return c.id === CARDS[i].id; })) { return CARDS[i].id; }
    }
    return list[0].id;
  }

  /* The start panel is the way in, not a card: it asks nothing, belongs to no
     section, and must not be counted. While it is up the deck's chrome — rail,
     counter, pager — is meaningless, so it goes too.

     A reader with saved progress never sees it. Landing someone who was half
     way through back on a welcome screen makes them find their place again,
     which is the specific cost this whole view exists to remove. */
  function showStart() {
    currentId = null;

    var panel = el('start-panel');
    if (panel) { panel.hidden = false; }

    document.querySelectorAll('.deck > .card').forEach(function (n) { n.hidden = true; });

    /* The bar stays: it is what divides the title block from the page, and the
       rail on it previews the seven sections before anyone commits. Only the
       pager goes — Back and Continue have nowhere to point yet. */
    var pager = el('pager');
    if (pager) { pager.hidden = true; }

    fillSectionHead();
    updateDeck();
  }

  /* The section the current card sits in, held above the deck. Unchanged while
     the reader moves between cards of one section — which is the whole point:
     the card animates in, this does not move, and that is what says "still
     section 2".

     Hidden on the start panel and on the review card, neither of which belongs
     to a numbered section of the form. */
  function fillSectionHead() {
    var head = el('section-head');
    if (!head) { return; }

    var spec = cardSpec(currentId);
    var sec = null;
    if (spec) {
      SECTIONS.forEach(function (s) { if (s.n === spec.sec) { sec = s; } });
    }

    if (!sec) { head.hidden = true; return; }
    head.hidden = false;

    var count = el('section-count');
    if (count) { count.textContent = 'Section ' + sec.n + ' of ' + SECTIONS.length; }

    var title = el('section-title');
    if (!title) { return; }

    var label = composition[sec.at] && composition[sec.at].label;
    var h = splitHeading(label);
    title.innerHTML = h
      ? '<span class="clause-num">' + h.number + '</span> ' + escapeText(h.title)
      : escapeText(label || '');
  }

  function showCard(id, opts) {
    var target = indexOfCard(id) === -1 ? nearestVisible(id) : id;
    if (!target) { return; }

    var panel = el('start-panel');
    if (panel) { panel.hidden = true; }
    var pager = el('pager');
    if (pager) { pager.hidden = false; }

    currentId = target;
    ui.cardAt = target;

    document.querySelectorAll('.deck > .card').forEach(function (node) {
      node.hidden = node.id !== target;
    });

    markSeen(target);
    save();
    fillSectionHead();
    updateDeck();

    if (!opts || !opts.keepHash) {
      navigating = true;
      window.location.hash = target;
      navigating = false;
    }

    if (!opts || !opts.noScroll) {
      /* The top of the card, not the top of the document: the rail stays put
         and the reader's eye lands on the heading. */
      var node = el(target);
      if (node) {
        var y = node.getBoundingClientRect().top + window.pageYOffset - 90;
        window.scrollTo({ top: Math.max(0, y), behavior: opts && opts.instant ? 'auto' : 'smooth' });
      }
    }

    setPagerMessage('');
  }

  /* Arriving at a card counts as having seen it. Only the therapy dog section
     cares — see NEEDS_SEEING. */
  function markSeen(id) {
    Object.keys(NEEDS_SEEING).forEach(function (sec) {
      if (NEEDS_SEEING[sec] === id) { ui['seen-' + id] = true; }
    });
  }

  function goBy(step) {
    var list = visibleCards();
    var i = indexOfCard(currentId);
    if (i === -1) { return; }

    var next = i + step;
    if (next < 0 || next >= list.length) { return; }
    showCard(list[next].id);
  }

  /* Continue will not leave a card while something it owns is outstanding.
     With one question per card the reason is never ambiguous, which is the
     point of isolating them — and the message goes beside the button that
     refused rather than at the end of the form. */
  function tryNext() {
    var spec = cardSpec(currentId);
    if (!spec) { return; }

    var missing = outstanding().filter(function (k) { return spec.owns.indexOf(k) !== -1; });

    if (missing.length) {
      setPagerMessage('Still needed on this card: ' + missing.map(nameFor).join(', ') + '.');

      /* Mark the offending question so the eye goes to it, not just to the
         message. Cleared on any change. */
      var card = el(currentId);
      if (card) {
        card.querySelectorAll('.q').forEach(function (q) { q.classList.add('missing'); });
        var first = card.querySelector('.q.missing');
        if (first) { first.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
      }
      return;
    }

    goBy(1);
  }

  function nameFor(key) { return NEEDED_AS[key] || (FIELDS[key] ? FIELDS[key].label : key); }

  function setPagerMessage(text) {
    var msg = el('pager-msg');
    if (msg) { msg.textContent = text || ''; }
    if (!text) {
      document.querySelectorAll('.q.missing').forEach(function (q) { q.classList.remove('missing'); });
    }
  }

  /* ====================================================================== */
  /* The rail and the counter                                               */
  /* ====================================================================== */

  function buildRail() {
    var rail = el('rail');
    if (!rail) { return; }

    rail.innerHTML = '';

    SECTIONS.forEach(function (s) {
      var li = document.createElement('li');
      li.setAttribute('data-sec', s.n);

      var b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = '<span class="n"><span>' + s.n + '</span></span>' +
                    '<span class="label">' + escapeText(s.label) + '</span>';

      /* The rail jumps to the first card of the section that is still in the
         pathway. Free movement in both directions is deliberate: a reader who
         wants to re-read the fees clause before signing should not have to
         page back through six cards to reach it. */
      b.addEventListener('click', function () {
        var list = visibleCards();
        for (var i = 0; i < list.length; i++) {
          if (list[i].sec === s.n) { showCard(list[i].id); return; }
        }
      });

      li.appendChild(b);
      rail.appendChild(li);
    });
  }

  function markRail(missing) {
    var here = cardSpec(currentId);
    var list = visibleCards();

    SECTIONS.forEach(function (s) {
      var li = document.querySelector('.rail li[data-sec="' + s.n + '"]');
      if (!li) { return; }

      var present = list.some(function (c) { return c.sec === s.n; });
      var owed = (SECTION_OWNS[s.n] || []).some(function (k) { return missing.indexOf(k) !== -1; });
      var unseen = NEEDS_SEEING[s.n] && !ui['seen-' + NEEDS_SEEING[s.n]];

      li.classList.toggle('na', !present);
      li.classList.toggle('done', present && !owed && !unseen);
      li.classList.toggle('current', !!here && here.sec === s.n);

      var b = li.querySelector('button');
      if (b) {
        b.setAttribute('aria-current', (here && here.sec === s.n) ? 'step' : 'false');
        b.disabled = !present;
      }
    });

    /* Keep the current pill in view on a phone, where the rail scrolls. */
    var cur = document.querySelector('.rail li.current');
    if (cur && cur.scrollIntoView) {
      cur.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }

  function updateDeck() {
    var state = progressState();
    var missing = state.missing;
    var total = state.total;
    var done = Math.max(0, total - missing.length);

    var list = visibleCards();
    var i = indexOfCard(currentId);

    var count = el('deck-count');
    if (count) {
      /* Before the reader starts there is no position to report, so the same
         space answers the question they actually have: how long is this. The
         honest number is the shortest one — the deck grows only if they turn
         out to be a guardian, and a form that runs longer than promised is
         worse than one that was never measured. */
      count.textContent = i === -1
        ? list.length + ' cards'
        : 'Card ' + (i + 1) + ' of ' + list.length;
    }

    var answered = el('deck-answered');
    if (answered) {
      answered.textContent = missing.length
        ? done + ' of ' + total + ' answered'
        : 'All answered';
    }

    var back = el('go-back');
    var next = el('go-next');
    if (back) { back.hidden = i <= 0; }
    if (next) {
      next.hidden = i === list.length - 1;
      /* The card before the review says where it goes. */
      next.textContent = (i === list.length - 2) ? 'Review my answers' : 'Continue';
    }

    markRail(missing);
    markPersonNotes();
  }

  function refresh() {
    applyConditionals();

    /* An answer can remove the card the reader is standing on — saying "I am
       the Client" while on a guardian card. Move them somewhere real before
       anything else reads currentId. */
    if (currentId && indexOfCard(currentId) === -1) {
      showCard(nearestVisible(currentId));
      return;
    }

    updateDeck();
    renderReview();
    save();
  }

  /* ====================================================================== */
  /* Review table                                                           */
  /* ====================================================================== */

  function describe(key, entry) {
    var spec = FIELDS[key];
    var f = fieldAt(spec.at[0], spec.at[1]);

    if (spec.kind === 'text' || spec.kind === 'textarea') {
      return entry.value ? entry.value : null;
    }
    if (spec.kind === 'one') {
      return has(entry.value) && f.options[entry.value] ? f.options[entry.value].value : null;
    }
    if (spec.kind === 'many') {
      if (!entry.value.length) { return null; }
      return entry.value.map(function (i) { return f.options[i].value; });
    }
    if (spec.kind === 'sign') {
      return entry.value ? 'SIGNATURE' : null;
    }
    return null;
  }

  function renderReview() {
    var body = el('review-body');
    if (!body) { return; }

    var r = resolve();
    body.innerHTML = '';

    Object.keys(FIELDS).forEach(function (key) {
      var spec = FIELDS[key];
      var entry = r[key];
      var value = describe(key, entry);

      var tr = document.createElement('tr');
      if (value === null) { tr.className = 'unanswered'; }

      var th = document.createElement('th');
      th.scope = 'row';
      th.textContent = spec.label;
      tr.appendChild(th);

      var addr = document.createElement('td');
      addr.className = 'addr';
      addr.textContent = 'sec ' + spec.at[0] + ' · fld ' + spec.at[1];
      tr.appendChild(addr);

      var td = document.createElement('td');

      if (value === null) {
        var none = document.createElement('em');
        none.textContent = 'Not yet answered';
        td.appendChild(none);
        td.appendChild(tagFor('empty'));

      } else if (value === 'SIGNATURE') {
        var img = document.createElement('img');
        img.className = 'sig-thumb';
        img.src = entry.value;
        img.alt = 'Your signature';
        td.appendChild(img);
        td.appendChild(tagFor('you'));

      } else if (Array.isArray(value)) {
        var ul = document.createElement('ul');
        value.forEach(function (v) {
          var li = document.createElement('li');
          li.textContent = v;
          ul.appendChild(li);
        });
        td.appendChild(ul);
        td.appendChild(tagFor('you'));

      } else {
        var p = document.createElement('span');
        p.textContent = value;
        p.style.whiteSpace = 'pre-line';
        td.appendChild(p);
        td.appendChild(tagFor(entry.derived ? 'derived' : 'you'));

        if (entry.derived && entry.why) {
          var why = document.createElement('p');
          why.className = 'q-help';
          why.style.margin = '0.3rem 0 0';
          why.textContent = entry.why;
          td.appendChild(why);
        }
      }

      tr.appendChild(td);
      body.appendChild(tr);
    });

    var payload = el('payload');
    if (payload) {
      payload.textContent = JSON.stringify(buildPayload(), null, 1);
    }

    var missing = outstanding();
    var blocker = el('review-blocker');
    if (blocker) {
      blocker.hidden = missing.length === 0;
      var list = el('review-missing');
      if (list && missing.length) {
        list.textContent = missing.map(function (k) {
          if (k === 'read3') { return 'Read section 3 (rights and information)'; }
          if (k === 'read4') { return 'Read section 4 (terms of service)'; }
          return FIELDS[k] ? FIELDS[k].label : k;
        }).join(' · ');
      }
    }
  }

  function tagFor(kind) {
    var span = document.createElement('span');
    span.className = 'tag tag-' + kind;
    span.textContent = kind === 'derived' ? 'Set for you'
                     : kind === 'empty'   ? 'Missing'
                     : 'Your answer';
    return span;
  }

  /* ====================================================================== */
  /* Signature pad                                                          */
  /* ====================================================================== */

  function initSignature() {
    var canvas = el('sig-pad');
    if (!canvas) { return; }

    var ctx = canvas.getContext('2d');
    var drawing = false;
    var dirty = false;

    /* Back the canvas at device resolution so a signature is not a soft blur
       on a phone, then scale the drawing context back to CSS pixels. */
    function size() {
      var ratio = window.devicePixelRatio || 1;
      var rect = canvas.getBoundingClientRect();
      if (!rect.width) { return; }

      var prior = dirty ? canvas.toDataURL('image/png') : null;

      canvas.width = Math.round(rect.width * ratio);
      canvas.height = Math.round(rect.height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#10233A';

      if (prior) {
        var img = new Image();
        img.onload = function () { ctx.drawImage(img, 0, 0, rect.width, rect.height); };
        img.src = prior;
      }
    }

    function pos(e) {
      var rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }

    canvas.addEventListener('pointerdown', function (e) {
      drawing = true;
      canvas.setPointerCapture(e.pointerId);
      var p = pos(e);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      e.preventDefault();
    });

    canvas.addEventListener('pointermove', function (e) {
      if (!drawing) { return; }
      var p = pos(e);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      dirty = true;
      e.preventDefault();
    });

    function stop() {
      if (!drawing) { return; }
      drawing = false;
      if (dirty) {
        answers.signature = canvas.toDataURL('image/png');
        setSigStatus(true);
        refresh();
      }
    }

    canvas.addEventListener('pointerup', stop);
    canvas.addEventListener('pointercancel', stop);
    canvas.addEventListener('pointerleave', stop);

    var clear = el('sig-clear');
    if (clear) {
      clear.addEventListener('click', function () {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        dirty = false;
        delete answers.signature;
        setSigStatus(false);
        refresh();
      });
    }

    function setSigStatus(signed) {
      var s = el('sig-status');
      if (s) {
        s.textContent = signed ? 'Signed' : 'Sign above using your mouse or finger';
        s.classList.toggle('ok', signed);
      }
    }

    /* The pad starts life on a hidden card, so at load its box is zero wide
       and there is nothing to scale to — sizing it then would produce a canvas
       that stays 300px wide and stretches once revealed. A ResizeObserver
       catches the moment the card is shown and gives it a real width, which is
       also when a saved signature can be painted back. */
    var restored = false;

    function ensureSized() {
      var rect = canvas.getBoundingClientRect();
      if (!rect.width) { return; }

      size();

      if (!restored && answers.signature) {
        restored = true;
        var img = new Image();
        img.onload = function () {
          ctx.drawImage(img, 0, 0, rect.width, rect.height);
          dirty = true;
        };
        img.src = answers.signature;
      }
    }

    if (window.ResizeObserver) {
      new window.ResizeObserver(ensureSized).observe(canvas);
    }
    window.addEventListener('resize', ensureSized);
    ensureSized();

    setSigStatus(!!answers.signature);
  }

  /* ====================================================================== */
  /* Cross-reference navigation                                             */
  /* ====================================================================== */

  /* A citation must land the reader on the clause, and in a deck the clause is
     usually on another card. Switch card first, then open any fold between the
     target and the page, then flash it. */
  function revealTarget(id) {
    var target = el(id);
    if (!target) { return false; }

    var card = target.closest('.card');
    if (card && card.id !== currentId) {
      showCard(card.id, { noScroll: true });
      target = el(id);
      if (!target) { return false; }
    }

    for (var node = target; node && node !== document.body; node = node.parentNode) {
      if (node.tagName === 'DETAILS') { node.open = true; }
    }

    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.classList.remove('just-linked');
    void target.offsetWidth;                     /* restart the flash */
    target.classList.add('just-linked');
    return true;
  }

  function initCrossRefLinks() {
    /* Delegated, because the links are created after the page is built. */
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a.xref');
      if (!a) { return; }
      if (revealTarget(a.getAttribute('href').slice(1))) { e.preventDefault(); }
    });
  }

  /* ====================================================================== */
  /* Wiring                                                                 */
  /* ====================================================================== */

  function initInputs() {
    /* Radios / checkboxes that map to a Zanda field. */
    document.querySelectorAll('[data-field]').forEach(function (input) {
      var key = input.getAttribute('data-field');

      input.addEventListener('change', function () {
        var spec = FIELDS[key];

        if (input.type === 'radio') {
          answers[key] = +input.value;

          /* Changing who is completing the form invalidates the guardian
             branch. Left in place, a stale "not sole guardian" answer would
             ride along under a self-consenting client. */
          if (key === 'completedBy') {
            delete answers.soleGuardian;
            delete answers.contactOthers;
          }
          if (key === 'soleGuardian' && +input.value === OPT.soleGuardian.sole) {
            delete answers.contactOthers;
            ['g2', 'g3'].forEach(function (p) {
              delete answers[p + 'Name']; delete answers[p + 'Mobile']; delete answers[p + 'Email'];
            });
          }

        } else if (input.type === 'checkbox' && spec.kind === 'many') {
          var list = answers[key] || [];
          var v = +input.value;
          var i = list.indexOf(v);
          if (input.checked && i === -1) { list.push(v); }
          if (!input.checked && i !== -1) { list.splice(i, 1); }
          list.sort(function (a, b) { return a - b; });
          answers[key] = list;
        }

        setPagerMessage('');
        syncInputs();
        refresh();
      });
    });

    /* Plain text inputs, including the ones composed into a guardian block. */
    document.querySelectorAll('[data-answer]').forEach(function (input) {
      input.addEventListener('input', function () {
        answers[input.getAttribute('data-answer')] = input.value;
        setPagerMessage('');
        refresh();
      });
    });

    /* Local-only ticks: the read acknowledgements and the therapy-dog gate. */
    document.querySelectorAll('[data-ui]').forEach(function (input) {
      input.addEventListener('change', function () {
        var key = input.getAttribute('data-ui');
        ui[key] = input.checked;

        /* Closing the gate withdraws the waiver with it — otherwise a reader
           who opts out still carries a ticked agreement underneath, and in
           this view the card holding it disappears while still ticked. */
        if (key === 'dogGate' && !input.checked) {
          ui.dogWaiver = false;
        }

        setPagerMessage('');
        syncInputs();
        refresh();
      });
    });

    var startBtn = el('go-start');
    if (startBtn) {
      startBtn.addEventListener('click', function () {
        var list = visibleCards();
        if (list.length) { showCard(list[0].id); }
      });
    }

    var back = el('go-back');
    if (back) { back.addEventListener('click', function () { goBy(-1); }); }

    var next = el('go-next');
    if (next) { next.addEventListener('click', tryNext); }

    var reset = el('reset-progress');
    if (reset) {
      reset.addEventListener('click', function () {
        if (!window.confirm('Clear every answer on this device and start again?')) { return; }
        answers = {}; ui = {};
        try { window.localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
        window.location.hash = '';
        window.location.reload();
      });
    }

    var copy = el('copy-payload');
    if (copy) {
      copy.addEventListener('click', function () {
        var text = JSON.stringify(buildPayload(), null, 1);
        navigator.clipboard.writeText(text).then(function () {
          copy.textContent = 'Copied';
          window.setTimeout(function () { copy.textContent = 'Copy payload'; }, 1600);
        }, function () {
          copy.textContent = 'Copy failed';
        });
      });
    }

    /* The browser's own Back button walks the deck, because each card is a
       hash. Guarded so our own hash writes do not re-enter. */
    window.addEventListener('hashchange', function () {
      if (navigating) { return; }
      var id = window.location.hash.slice(1);
      if (id && id !== currentId && indexOfCard(id) !== -1) {
        showCard(id, { keepHash: true });
      }
    });
  }

  function applyContext() {
    var name = (params.get('name') || '').trim().slice(0, 40);
    if (name) {
      var whom = el('for-whom');
      if (whom) { whom.textContent = 'Prepared for ' + name; whom.hidden = false; }
      document.title = name + ' — Consent form | Kinder Minds';
    }

    document.querySelectorAll('[data-zanda-link]').forEach(function (a) {
      if (zandaUrl) {
        a.href = zandaUrl;
      } else {
        a.removeAttribute('href');
        a.setAttribute('aria-disabled', 'true');
      }
    });

    var notice = el('no-link-notice');
    if (notice) { notice.hidden = !!zandaUrl; }

    var target = el('target-form');
    if (target) {
      target.textContent = zandaUrl
        ? 'client ' + clientHash + ' · form ' + formNumber
        : 'no client link supplied';
    }

    /* The A/B link carries the query string across, so switching views does
       not drop the client and form the page is bound to. */
    var swap = el('swap-view');
    if (swap && window.location.search) {
      swap.href = 'combined-consent.html' + window.location.search;
    }
  }

  /* ====================================================================== */
  /* Boot                                                                   */
  /* ====================================================================== */

  function fail(title, detail) {
    var box = el('boot-error');
    if (!box) { return; }
    box.hidden = false;
    box.querySelector('h3').textContent = title;
    box.querySelector('p').textContent = detail;
    var main = el('form-body');
    if (main) { main.hidden = true; }
    var bar = document.querySelector('.deck-bar');
    if (bar) { bar.hidden = true; }
  }

  /* The form's shape, in exactly the form capture-form.mjs hashes: every
     section label, field type, field label and option text. No field values —
     this identifies the form, never anything a client entered. */
  function skeletonOf(sections) {
    return JSON.stringify(sections.map(function (s) {
      return [s.label, s.fields.map(function (f) {
        return [f.type, f.label, f.options.map(function (o) { return o.value; })];
      })];
    }));
  }

  function skeletonHash(sections) {
    var bytes = new TextEncoder().encode(skeletonOf(sections));
    return window.crypto.subtle.digest('SHA-256', bytes).then(function (buf) {
      var hex = '';
      new Uint8Array(buf).forEach(function (b) {
        hex += (b < 16 ? '0' : '') + b.toString(16);
      });
      return hex.slice(0, 16);
    });
  }

  /* Where to open. A hash wins — it is how a shared or bookmarked link names a
     card. Otherwise resume where this reader left off. Returns null for a
     reader who has neither, who gets the start panel instead of being dropped
     straight into section 1. */
  function openingCard() {
    var hash = window.location.hash.slice(1);
    if (hash && indexOfCard(hash) !== -1) { return hash; }
    if (ui.cardAt && indexOfCard(ui.cardAt) !== -1) { return ui.cardAt; }
    return null;
  }

  function start(data) {
    /* Recomputed from the sections themselves — never read from the snapshot's
       own skeletonHash field. Trusting that string would mean a hand-edit to
       the JSON could shift every field position while still declaring itself
       unchanged. The stored field is informational only. */
    skeletonHash(data.sections).then(function (hash) {
      if (hash !== EXPECTED_SKELETON) {
        fail('This form no longer matches what the page was built for',
             'Expected ' + EXPECTED_SKELETON + ', computed ' + hash + '. Because Zanda ' +
             'gives its fields no IDs, answers are matched by position, so continuing could ' +
             'file them against the wrong fields. Run "node forms/capture-form.mjs --check ' +
             '<clientHash> <formNumber>" to see exactly what moved.');
        return;
      }

      composition = data.sections;

      load();
      fillLegal();
      fillDrawings();
      applyContext();
      buildRail();
      initCrossRefLinks();
      initInputs();
      initSignature();
      syncInputs();
      applyConditionals();

      var opening = openingCard();
      if (opening) { showCard(opening, { noScroll: true }); }
      else { showStart(); }

      refresh();

    }, function () {
      fail('Could not verify the form layout',
           'The browser would not compute a checksum. window.crypto.subtle exists only in a ' +
           'secure context — https, or localhost during development. Open this page over https.');
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    fetch(SNAPSHOT, { cache: 'no-cache' })
      .then(function (res) {
        if (!res.ok) { throw new Error('HTTP ' + res.status); }
        return res.json();
      })
      .then(start)
      .catch(function (err) {
        fail('Could not load the form definition',
             'Fetching ' + SNAPSHOT + ' failed (' + err.message + '). Opening this page ' +
             'straight from disk will do that — browsers block fetch on file:// URLs. ' +
             'Serve the folder over HTTP instead, e.g. "python -m http.server" from the ' +
             'site root, then open http://localhost:8000/forms/combined-consent-cards.html');
      });
  });
})();
