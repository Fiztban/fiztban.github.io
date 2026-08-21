/* ==========================================================================
   Kinder Minds — conditional consent form (PROTOTYPE)

   A custom front-end for the Zanda custom form
   "Intake - Combined Consent and Information Forms".

   WHAT THIS DOES
     Renders our own guided, conditional pathway over Zanda's flat 17-section
     form, then assembles the exact `composition` payload Zanda's own client
     posts to /api/v1/{portal}/CustomForm/Save.

   WHAT THIS DOES NOT DO
     Submit. Zanda's API sends no Access-Control-Allow-Origin header (a POST
     preflight from this origin returns 405 with no CORS headers), so a browser
     on kinderminds.nz cannot call it. Production needs a small server-side
     proxy. Until that exists this page ends at a reviewed, copyable payload.

   ── THE ONE THING THAT WILL BREAK THIS ────────────────────────────────────
   Zanda gives its fields NO IDs. Every `id` in the composition is null, for
   sections and fields alike, so a field's only identity is its POSITION in the
   tree: section index, then field index. Editing the form in Zanda — even
   fixing a typo that splits or merges a prose block — shifts those indices and
   silently rebinds every answer after the edit point to the wrong field.

   It fails quietly, and it fails into wrong clinical consent data.

   So the composition snapshot carries a `skeletonHash` over every section
   label, field type, field label and option text. If the live form no longer
   matches, this page refuses to render rather than mis-file a consent. Never
   soften that check into a warning.
   ────────────────────────────────────────────────────────────────────────────

   URL PARAMETERS
     client   the client's Zanda profile hash   e.g. client=AbCdEfGhIjK
     form     the custom form number            e.g. form=1234
     name     optional, personalises the page

   Built to match intake.js: no dependencies, no build step, ES5 syntax.
   ========================================================================== */

(function () {
  'use strict';

  var PORTAL = 'https://clientportal.zandahealth.com/clientportal/kinderminds/customform/';
  var SNAPSHOT = 'zanda-combined-consent.json';

  /* Hash of the composition captured on 2026-08-21. Regenerate deliberately,
     never to silence a mismatch. */
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
  /* URL, storage                                                           */
  /* ====================================================================== */

  var params = new URLSearchParams(window.location.search);

  var clientHash = (params.get('client') || '').trim();
  if (!/^[A-Za-z0-9_-]{4,64}$/.test(clientHash)) { clientHash = null; }

  var formNumber = (params.get('form') || '').trim();
  if (!/^\d{1,10}$/.test(formNumber)) { formNumber = null; }

  var zandaUrl = (clientHash && formNumber) ? PORTAL + clientHash + '/' + formNumber : null;

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

  /* ---------- numbered headings ----------
     Every Information block carries its own numbered heading ("4.6.3.
     Cancellation Policy"), and the legal text cites those numbers — "see
     Section 4.6.3". Drop the numbering and sixteen cross-references in the
     text point at nothing the reader can find, so the headings are rendered
     verbatim and the citations are turned into links to them. */

  var headingIds = {};        /* "4.6.3" -> element id, for rendered blocks only */

  function anchorFor(number) { return 's-' + number.replace(/\./g, '-'); }

  /* Splits "4.6.3.  Cancellation Policy" into its number and its title. */
  function splitHeading(label) {
    var m = /^\s*(\d+(?:\.\d+)*)\.?\s+(.*)$/.exec(label || '');
    return m ? { number: m[1], title: m[2].trim() } : null;
  }

  /* "Continue onto Section 5." is navigation for Zanda's single scroll, which
     this pathway has replaced with its own Continue buttons. Same reasoning as
     stripRouting: only the displayed text changes, never the record. */
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
    document.querySelectorAll('[data-legal]').forEach(function (host) {
      var html = expandAddresses(host.getAttribute('data-legal')).map(function (a) {
        var f = fieldAt(a[0], a[1]);
        if (!f || f.type !== 6) { return ''; }

        var body = stripNavigation(sanitise(f.text));
        var head = splitHeading(f.label);
        if (!head) { return body; }

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
        var rest = node.nodeValue;
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
        rest = null;
      });
    });
  }

  /* Resolve a cited number to something on this page.

     Exact clause first. Failing that, walk up the numbering — "Section 2.3.2"
     has no clause of its own here because this pathway restructured all of
     section 2 into one step, so it resolves to that step. Landing a reader on
     the right step is useful; landing them nowhere is not.

     Returns null when nothing matches, and the citation then stays plain text.
     That is deliberate: 5.6.3 and 5.7.3 are cited five times between them and
     do not exist anywhere in the form, and a link that silently goes to the
     nearest plausible clause would hide a real fault in the source document. */
  function resolveCitation(number) {
    if (headingIds[number]) { return headingIds[number]; }

    /* A whole-section citation ("as outlined in Section 2") targets the step
       that section became. */
    if (number.indexOf('.') === -1) { return stepIds[number] || null; }

    /* A sub-number resolves upwards, but only ever to a clause that genuinely
       exists. It must NOT fall back to the containing step: "Section 5.6.3" is
       cited four times and exists nowhere, and sending the reader to section 5
       — the scribe consent — would look deliberate while being flatly wrong.
       Left as plain text it reads as the fault it is, which is the honest
       outcome and the one that gets it fixed at source. */
    var parts = number.split('.');
    while (parts.length > 1) {
      parts.pop();
      var parent = parts.join('.');
      if (headingIds[parent]) { return headingIds[parent]; }
    }

    return null;
  }

  /* Whole-section citations ("as outlined in Section 2") point at a step of
     this pathway rather than a clause. */
  var stepIds = {
    '1': 'about-form',
    '2': 'step-who',
    '3': 'step-info',
    '4': 'step-terms',
    '5': 'step-scribe',
    '6': 'step-dog',
    '7': 'step-sign'
  };

  /* ---------- drawings ----------
     Zanda's `drawings` array is the clinic's whole image library, shared across
     every custom form — so a name appearing in it says nothing about whether
     THIS form uses it. The field's own `selectedDrawing` is what the form
     displays, and that is what this reads.

     The images themselves sit behind Zanda's FileUrl endpoint, so the repo
     keeps local copies under the same filenames. Adding a drawing to a form in
     Zanda therefore means adding its file here too. */

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

      /* The form points at a drawing we hold no copy of. Showing nothing is the
         right answer — showing whatever else is to hand is how a therapy-dog
         waiver ends up illustrated with the wrong dog. */
      img.hidden = true;
      if (window.console) {
        window.console.warn('consent.js: no local asset for drawing ' +
          JSON.stringify(name) + ' — add it to DRAWINGS.');
      }
    });
  }

  /* Several of Zanda's option labels end in a parenthetical telling the reader
     which section to jump to next — "(Proceed to Section 2.3)", "(please tick
     Not applicable in Sections 2.3.1 & 2.3.3...)". Those instructions describe
     the flat form's navigation, which this page has replaced, so on screen they
     are not just noise but wrong.

     Only the DISPLAYED text is trimmed. The value written back to Zanda is
     always the untouched original, and the review table renders from the
     composition, so the record and the PDF keep Zanda's exact wording. */
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
       Both describe information this page shows to every reader, above the
       gate and before any choice, so both are recorded either way. */
    set('dogRiskAck', 0, 'You were shown the therapy dog information and risks before choosing');
    set('dogChangeAck', 0, 'Applies to everyone: consent can be changed at any time');

    /* Opting in takes two deliberate acts — open the waiver, then agree to it.
       Opening it alone is not consent. */
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

  /* Three inputs in, one Zanda textarea out — in the shape the field's own
     placeholder asks for, so a reader of the PDF sees what they expect. */
  function person(prefix) {
    var name = (answers[prefix + 'Name'] || '').trim();
    var mob  = (answers[prefix + 'Mobile'] || '').trim();
    var mail = (answers[prefix + 'Email'] || '').trim();
    if (!name && !mob && !mail) { return ''; }
    return 'Full name: ' + name + '\nMobile number: ' + mob + '\nEmail address: ' + mail;
  }

  /* ====================================================================== */
  /* What is still outstanding                                              */
  /* ====================================================================== */

  /* Which Zanda fields this pathway actually needs, given the answers so far.
     Guardian names are not `required` in Zanda but are the whole point of the
     guardian branch, so the page enforces them itself. */
  function outstanding() {
    var r = resolve();
    var missing = [];

    function need(key, ok) {
      if (!ok) { missing.push(key); }
    }

    need('clientName', !!r.clientName.value.trim());
    need('completedBy', has(r.completedBy.value));

    if (answers.completedBy === OPT.completedBy.guardian) {
      need('soleGuardian', has(r.soleGuardian.value));
      need('guardian1', !!r.guardian1.value);
      if (answers.soleGuardian === OPT.soleGuardian.notSole) {
        need('guardian2', !!r.guardian2.value);
        need('contactOthers', has(r.contactOthers.value));
      }
    }

    need('scribeConsent', has(r.scribeConsent.value));
    need('read3', !!ui.read3);
    need('read4', !!ui.read4);
    need('declaration', r.declaration.value.length === 4);
    need('signerName', !!r.signerName.value.trim());
    need('signature', !!r.signature.value);

    return missing;
  }

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
  /* Rendering                                                              */
  /* ====================================================================== */

  function el(id) { return document.getElementById(id); }

  /* Show or hide every conditional block. data-when="expr" where expr is one
     of a small closed vocabulary — deliberately not an eval'd expression. */
  function applyConditionals() {
    var isGuardian = answers.completedBy === OPT.completedBy.guardian;
    var isSelf     = answers.completedBy === OPT.completedBy.self;

    var truth = {
      'guardian':      isGuardian,
      'self':          isSelf,
      'chosen':        isGuardian || isSelf,
      'guardian-sole': isGuardian && answers.soleGuardian === OPT.soleGuardian.sole,
      'guardian-multi': isGuardian && answers.soleGuardian === OPT.soleGuardian.notSole,
      'dog-in':        !!ui.dogGate,
      'dog-out':       !ui.dogGate
    };

    document.querySelectorAll('[data-when]').forEach(function (node) {
      var want = truth[node.getAttribute('data-when')];
      node.hidden = !want;
    });
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

  function updateProgress() {
    var missing = outstanding();
    /* Denominator is everything this pathway asks of the reader, which moves
       as the pathway branches — so it is recomputed, never cached. */
    var total = requiredCount();
    var done = Math.max(0, total - missing.length);
    var pct = total ? Math.round((done / total) * 100) : 0;

    var fill = el('progress-fill');
    var label = el('progress-label');
    if (fill) { fill.style.width = pct + '%'; }
    if (label) {
      label.textContent = missing.length
        ? done + ' of ' + total + ' answered'
        : 'All answered — ready to review';
    }

    markSteps(missing);
  }

  /* Must stay in step with outstanding(): client name, who is completing,
     scribe consent, the two read ticks, declaration, signer name, signature. */
  function requiredCount() {
    var n = 8;
    if (answers.completedBy === OPT.completedBy.guardian) {
      n += 2;                                      /* sole? + guardian 1   */
      if (answers.soleGuardian === OPT.soleGuardian.notSole) {
        n += 2;                                    /* guardian 2 + contact */
      }
    }
    return n;
  }

  /* A step is done when nothing it owns is outstanding. */
  var STEP_OWNS = {
    'step-who':   ['clientName', 'completedBy', 'soleGuardian', 'guardian1', 'guardian2', 'contactOthers'],
    'step-info':  ['read3'],
    'step-terms': ['read4'],
    'step-dog':   [],
    'step-sign':  ['declaration', 'signerName', 'signature']
  };

  function markSteps(missing) {
    Object.keys(STEP_OWNS).forEach(function (id) {
      var li = el(id);
      if (!li) { return; }
      var owed = STEP_OWNS[id].some(function (k) { return missing.indexOf(k) !== -1; });
      li.classList.toggle('done', !owed);
    });

    var scribe = el('step-scribe');
    if (scribe) { scribe.classList.toggle('done', missing.indexOf('scribeConsent') === -1); }
  }

  function refresh() {
    applyConditionals();
    updateProgress();
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

    /* The pad starts life inside a collapsed step, so at load its box is zero
       wide and there is nothing to scale to — sizing it then would produce a
       canvas that stays 300px wide and stretches once revealed. A
       ResizeObserver catches the moment the step opens and gives it a real
       width, which is also when a saved signature can be painted back. */
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
  /* Accordion                                                              */
  /* ====================================================================== */

  function initAccordion() {
    var steps = Array.prototype.slice.call(document.querySelectorAll('.task-steps > li, .intro-panel'));

    steps.forEach(function (li) {
      var head = li.querySelector('.stage-head');
      var body = li.querySelector('.stage-body');
      if (!head || !body) { return; }

      head.addEventListener('click', function () {
        var open = head.getAttribute('aria-expanded') !== 'true';
        head.setAttribute('aria-expanded', open ? 'true' : 'false');
        body.hidden = !open;
        syncExpandAll();
      });
    });

    function setAll(open) {
      steps.forEach(function (li) {
        var head = li.querySelector('.stage-head');
        var body = li.querySelector('.stage-body');
        if (!head || !body) { return; }
        head.setAttribute('aria-expanded', open ? 'true' : 'false');
        body.hidden = !open;
      });
      syncExpandAll();
    }

    function allOpen() {
      return steps.every(function (li) {
        var head = li.querySelector('.stage-head');
        return !head || head.getAttribute('aria-expanded') === 'true';
      });
    }

    function syncExpandAll() {
      var btn = el('expand-all');
      if (btn) { btn.textContent = allOpen() ? 'Collapse all' : 'Expand all'; }
    }

    var btn = el('expand-all');
    if (btn) { btn.addEventListener('click', function () { setAll(!allOpen()); }); }

    /* "Continue" moves to the next step and opens it — the pathway gesture the
       flat Zanda form has no way to express. */
    document.querySelectorAll('[data-next]').forEach(function (b) {
      b.addEventListener('click', function () {
        var target = el(this.getAttribute('data-next'));
        if (!target) { return; }

        var current = this.closest('.task-steps > li, .intro-panel');
        if (current) {
          var ch = current.querySelector('.stage-head');
          var cb = current.querySelector('.stage-body');
          if (ch && cb) { ch.setAttribute('aria-expanded', 'false'); cb.hidden = true; }
        }

        var th = target.querySelector('.stage-head');
        var tb = target.querySelector('.stage-body');
        if (th && tb) { th.setAttribute('aria-expanded', 'true'); tb.hidden = false; }

        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        syncExpandAll();
      });
    });

    syncExpandAll();
  }

  /* ====================================================================== */
  /* Cross-reference navigation                                             */
  /* ====================================================================== */

  /* A citation must land the reader on the clause, not on a collapsed header
     they then have to hunt through. Opens every fold between the target and
     the page — the accordion stage, and any nested reader. */
  function revealTarget(id) {
    var target = el(id);
    if (!target) { return false; }

    function openStage(body) {
      if (!body) { return; }
      body.hidden = false;
      var head = body.parentNode && body.parentNode.querySelector('.stage-head');
      if (head) { head.setAttribute('aria-expanded', 'true'); }
    }

    /* A whole-section citation targets the step itself. */
    openStage(target.querySelector && target.querySelector('.stage-body'));

    for (var node = target; node && node !== document.body; node = node.parentNode) {
      if (node.tagName === 'DETAILS') { node.open = true; }
      if (node.classList && node.classList.contains('stage-body')) { openStage(node); }
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

        syncInputs();
        refresh();
      });
    });

    /* Plain text inputs, including the ones composed into a guardian block. */
    document.querySelectorAll('[data-answer]').forEach(function (input) {
      input.addEventListener('input', function () {
        answers[input.getAttribute('data-answer')] = input.value;
        refresh();
      });
    });

    /* Local-only ticks: the two "I have read this" boxes and the dog gate. */
    document.querySelectorAll('[data-ui]').forEach(function (input) {
      input.addEventListener('change', function () {
        var key = input.getAttribute('data-ui');
        ui[key] = input.checked;

        /* Closing the gate withdraws the waiver with it — otherwise a reader
           who opts out still carries a ticked agreement underneath. */
        if (key === 'dogGate' && !input.checked) {
          ui.dogWaiver = false;
        }

        syncInputs();
        refresh();
      });
    });

    var reset = el('reset-progress');
    if (reset) {
      reset.addEventListener('click', function () {
        if (!window.confirm('Clear every answer on this device and start again?')) { return; }
        answers = {}; ui = {};
        try { window.localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
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

  function start(data) {
    /* Recomputed from the sections themselves — never read from the snapshot's
       own skeletonHash field. Trusting that string would mean a hand-edit to
       the JSON (inserting a paragraph, fixing an option's wording) could shift
       every field position while still declaring itself unchanged. The stored
       field is informational only. */
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
      initAccordion();
      initCrossRefLinks();
      initInputs();
      initSignature();
      syncInputs();
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
             'site root, then open http://localhost:8000/forms/combined-consent.html');
      });
  });
})();
