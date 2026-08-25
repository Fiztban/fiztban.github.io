/* ==========================================================================
   Kinder Minds — new patient intake form over Zanda, CARD VIEW

   A conditional pathway over the Zanda custom form "Intake - New Patient
   Form", which Zanda renders as 13 flat sections in one scroll: 67 fields, 52
   of them inputs, with no conditional logic. An adult registering themselves
   is shown the same guardian, custody and school sections as the parent of a
   nine-year-old.

   This is the mirror image of the consent form. There the load was 5,421
   words of reading around 14 questions; here it is 52 questions around 878
   words. So the work conditional flow does is different: not hiding text, but
   not asking.

   THE HAZARD IS THE SAME
     Zanda gives its fields no IDs. A field's only identity is its position in
     the composition, so any edit to the form in Zanda silently rebinds every
     answer after the edit point. The skeleton hash is recomputed at load and
     the page refuses to render on mismatch. Never soften that into a warning.

   NOT YET MAPPED — see §"profile fields" below and the notice on the review
   card. Fourteen inputs are ProfileField (type 8), a type the consent form did
   not use. This page writes them as text against their positions, which is a
   placeholder, not a mapping.

   URL PARAMETERS
     client   the client's Zanda profile hash   e.g. client=AbCdEfGhIjK
     form     the custom form number            e.g. form=1234
     name     optional, personalises the page

   No dependencies, no build step, ES5 syntax.
   ========================================================================== */

(function () {
  'use strict';

  var PORTAL = 'https://clientportal.zandahealth.com/clientportal/kinderminds/customform/';
  var SNAPSHOT = 'zanda-patient-intake.json';

  /* Captured 2026-08-22 from form 2930. Regenerate deliberately, never to
     silence a mismatch. */
  var EXPECTED_SKELETON = '7de6bdc88953551b';

  /* ---------- Zanda field addresses -------------------------------------
     [section index, field index] into composition.sections[].fields[].

     kind mirrors Zanda's own field-type enum:
       text    (2) / textarea (3)  -> field.text
       one     (1) Select          -> exactly one options[].selected
       many    (0) Multiselect     -> any number of options[].selected
       check   (4) Checkbox        -> field.checked
       sign    (7) Signature       -> field.dataUrl
       profile (8) ProfileField    -> UNKNOWN. Written to field.text for now.

     `profile` is the open question on this form. Zanda writes these through to
     the client's profile record rather than keeping them only on the form, and
     we have not yet observed which property carries the value on the way
     there. Every one of them is marked so the review can say so out loud. */

  var FIELDS = {
    firstName:      { at: [1, 0],  kind: 'profile', label: 'First name' },
    middleName:     { at: [1, 1],  kind: 'text',    label: 'Middle name(s)' },
    lastName:       { at: [1, 2],  kind: 'profile', label: 'Last name' },
    preferredName:  { at: [1, 3],  kind: 'profile', label: 'Preferred name' },
    dob:            { at: [1, 4],  kind: 'profile', label: 'Date of birth' },
    nhi:            { at: [1, 5],  kind: 'text',    label: 'NHI number' },
    sex:            { at: [1, 6],  kind: 'profile', label: 'Sex' },
    gender:         { at: [1, 7],  kind: 'profile', label: 'Gender identity' },
    pronouns:       { at: [1, 8],  kind: 'profile', label: 'Pronouns' },
    address:        { at: [1, 9],  kind: 'profile', label: 'Address' },
    postcode:       { at: [1, 10], kind: 'profile', label: 'Postcode' },
    city:           { at: [1, 11], kind: 'profile', label: 'City' },
    region:         { at: [1, 12], kind: 'profile', label: 'Region' },

    primaryWho:     { at: [3, 0],  kind: 'one',     label: 'Who is the primary contact' },
    primaryName:    { at: [3, 1],  kind: 'text',    label: 'Primary contact name' },
    primaryMobile:  { at: [3, 2],  kind: 'profile', label: 'Primary contact mobile' },
    smsConsent:     { at: [3, 3],  kind: 'check',   label: 'Consent to SMS contact' },
    primaryEmail:   { at: [3, 4],  kind: 'profile', label: 'Primary contact email' },
    emailConsent:   { at: [3, 5],  kind: 'check',   label: 'Consent to email contact' },
    primaryRel:     { at: [3, 6],  kind: 'text',    label: 'Primary contact relationship' },

    add1Who:        { at: [4, 1],  kind: 'one',     label: 'Additional contact 1 — who they are' },
    add1Name:       { at: [4, 2],  kind: 'text',    label: 'Additional contact 1 — name' },
    add1Phone:      { at: [4, 3],  kind: 'text',    label: 'Additional contact 1 — telephone' },
    add1Email:      { at: [4, 4],  kind: 'text',    label: 'Additional contact 1 — email' },
    add1Rel:        { at: [4, 5],  kind: 'text',    label: 'Additional contact 1 — relationship' },

    add2Name:       { at: [5, 1],  kind: 'text',    label: 'Additional contact 2 — name' },
    add2Mobile:     { at: [5, 2],  kind: 'text',    label: 'Additional contact 2 — mobile' },
    add2Email:      { at: [5, 3],  kind: 'text',    label: 'Additional contact 2 — email' },
    add2Rel:        { at: [5, 4],  kind: 'text',    label: 'Additional contact 2 — relationship' },

    custodial:      { at: [6, 0],  kind: 'one',     label: 'Custodial arrangements in place' },
    custodialType:  { at: [6, 1],  kind: 'textarea', label: 'Type of custodial arrangement' },
    custodialRestr: { at: [6, 2],  kind: 'many',    label: 'Disclosure restrictions' },
    custodialOther: { at: [6, 3],  kind: 'textarea', label: 'Disclosure restrictions — other' },

    gpName:         { at: [7, 1],  kind: 'text',    label: 'GP name' },
    gpAddress:      { at: [7, 2],  kind: 'textarea', label: 'GP address' },
    gpConsent:      { at: [7, 3],  kind: 'check',   label: 'Consent to share with GP' },

    schoolName:     { at: [8, 1],  kind: 'text',    label: 'School name' },
    teacherName:    { at: [8, 2],  kind: 'textarea', label: 'Teacher name' },
    teacherContact: { at: [8, 3],  kind: 'text',    label: 'Teacher contact' },
    schoolConsent:  { at: [8, 4],  kind: 'check',   label: 'Consent to share with school' },

    pharmacy:       { at: [9, 1],  kind: 'textarea', label: 'Pharmacy for e-prescriptions' },

    services:       { at: [10, 1], kind: 'many',    label: 'Services requested' },
    serviceDetail:  { at: [10, 2], kind: 'textarea', label: 'What you are seeking help with' },
    howHeard:       { at: [10, 3], kind: 'profile', label: 'How did you hear about us' },

    insurer:        { at: [11, 0], kind: 'profile', label: 'Insurer' },
    scMembership:   { at: [11, 2], kind: 'text',    label: 'Southern Cross membership number' },
    scPolicy:       { at: [11, 3], kind: 'text',    label: 'Southern Cross policy number' },
    scClaimConsent: { at: [11, 4], kind: 'one',     label: 'Consent to submit Southern Cross claims' },
    quoteNeeded:    { at: [11, 5], kind: 'one',     label: 'Quote needed for pre-approval' },

    signWho:        { at: [12, 0], kind: 'one',     label: 'Who is signing' },
    signName:       { at: [12, 1], kind: 'text',    label: 'Name of person signing' },
    signature:      { at: [12, 2], kind: 'sign',    label: 'Signature' }
  };

  /* Option indices, named so the derivation table reads as English. */
  var OPT = {
    primaryWho:     { client: 0, guardian: 1 },
    add1Who:        { client: 0, guardian: 1 },
    custodial:      { yes: 0, no: 1, notApplicable: 2 },
    scClaimConsent: { yes: 0, no: 1 },
    quoteNeeded:    { yes: 0, no: 1 },
    signWho:        { client: 0, guardian: 1 },

    /* 10.1, in the order the form lists them. Referenced by the school rule:
       an under-18 ADHD assessment cannot be completed without school input. */
    services:       { autism: 0, adhd: 1, neuroPsych: 2, postDiagnostic: 3 }
  };

  var composition = null;
  var answers = {};           /* what the reader typed or chose             */
  var ui = {};                /* local-only: read ticks, gates, our own Qs  */

  /* ====================================================================== */
  /* The deck                                                               */
  /* ====================================================================== */

  var CARDS = [
    { id: 'card-intro',           sec: 1,  when: null,             owns: ['read1'] },
    { id: 'card-completer',       sec: 1,  when: null,             owns: ['completedBy'] },
    { id: 'card-name',            sec: 2,  when: null,             owns: ['firstName', 'lastName'] },
    { id: 'card-about',           sec: 2,  when: null,             owns: ['dob'] },
    { id: 'card-address',         sec: 2,  when: null,             owns: [] },
    { id: 'card-primary',         sec: 3,  when: null,             owns: ['primaryWho', 'primaryName', 'primaryReach', 'primaryRel'] },
    { id: 'card-add1',            sec: 3,  when: 'under18',        owns: ['add1'] },
    { id: 'card-add2',            sec: 3,  when: 'under18',        owns: [] },
    { id: 'card-custody',         sec: 4,  when: 'under18',        owns: ['custodial', 'custodialType'] },
    { id: 'card-gp',              sec: 5,  when: null,             owns: [] },
    { id: 'card-school',          sec: 6,  when: null,             owns: ['schoolName'] },
    { id: 'card-scripts',         sec: 7,  when: null,             owns: ['pharmacy'] },
    { id: 'card-services',        sec: 8,  when: null,             owns: ['services'] },
    { id: 'card-service-detail',  sec: 8,  when: null,             owns: [] },
    { id: 'card-insurance',       sec: 9,  when: null,             owns: ['hasInsurance', 'insurer', 'quoteNeeded'] },
    { id: 'card-southern-cross',  sec: 9,  when: 'southern-cross', owns: ['scNumber', 'scClaimConsent'] },
    { id: 'card-sign',            sec: 10, when: null,             owns: ['signName', 'signature'] },
    { id: 'card-review',          sec: 0,  when: null,             owns: [] }
  ];

  /* `label` is the short name on the rail — navigation, not a heading. `at` is
     where the form's own label for that section lives in the composition, and
     that is what the section header above the deck shows. */
  var SECTIONS = [
    { n: 1,  label: 'Intro',      at: 0 },
    { n: 2,  label: 'The client', at: 1 },
    { n: 3,  label: 'Contacts',   at: 2 },
    { n: 4,  label: 'Custody',    at: 6 },
    { n: 5,  label: 'GP',         at: 7 },
    { n: 6,  label: 'School',     at: 8 },
    { n: 7,  label: 'Scripts',    at: 9 },
    { n: 8,  label: 'Services',   at: 10 },
    { n: 9,  label: 'Insurance',  at: 11 },
    { n: 10, label: 'Sign',       at: 12 }
  ];

  var SECTION_OWNS = {
    1:  ['read1', 'completedBy'],
    2:  ['firstName', 'lastName', 'dob'],
    3:  ['primaryWho', 'primaryName', 'primaryReach', 'primaryRel', 'add1'],
    4:  ['custodial', 'custodialType'],
    5:  [],
    6:  ['schoolName'],
    7:  ['pharmacy'],
    8:  ['services'],
    9:  ['hasInsurance', 'insurer', 'quoteNeeded', 'scNumber', 'scClaimConsent'],
    10: ['signName', 'signature']
  };

  /* Sections answered the moment the page loads — the GP card asks nothing
     required, and the scripts gate is a valid answer while shut — so they
     would read done on the rail before the reader arrived. They count as done
     once visited. Arriving is not an answer, so this is deliberately not part
     of the answered count. */
  var NEEDS_SEEING = { 5: 'card-gp', 7: 'card-scripts' };

  var NEEDED_AS = {
    read1:          'tick to say you have read the introduction',
    completedBy:    'whether you are the Client or a parent/guardian',
    firstName:      'the Client’s first name',
    lastName:       'the Client’s last name',
    dob:            'the Client’s date of birth',
    primaryWho:     'who the primary contact is',
    primaryName:    'the primary contact’s name',
    primaryReach:   'a mobile number or an email address for the primary contact',
    primaryRel:     'their relationship to the Client',
    add1:           'a name and one way to contact them',
    custodial:      'whether any custodial arrangement is in place',
    custodialType:  'what kind of arrangement it is',
    schoolName:     'the school name',
    pharmacy:       'which pharmacy to send scripts to',
    services:       'at least one service you are interested in',
    hasInsurance:   'whether you have health insurance',
    insurer:        'who you are insured with',
    quoteNeeded:    'whether you would like a quote for pre-approval',
    scNumber:       'either your Southern Cross membership number or your policy number',
    scClaimConsent: 'whether we may submit claims on your behalf',
    signName:       'the name of the person signing',
    signature:      'a signature'
  };

  var currentId = null;
  var navigating = false;

  /* ====================================================================== */
  /* URL, storage                                                           */
  /* ====================================================================== */

  var params = new URLSearchParams(window.location.search);

  var clientHash = (params.get('client') || '').trim();
  if (!/^[A-Za-z0-9_-]{4,64}$/.test(clientHash)) { clientHash = null; }

  var formNumber = (params.get('form') || '').trim();
  if (!/^\d{1,10}$/.test(formNumber)) { formNumber = null; }

  var zandaUrl = (clientHash && formNumber) ? PORTAL + clientHash + '/' + formNumber : null;

  /* Its own key. This is a different form from the consent one and shares
     nothing with it — a name typed here is not a name typed there. */
  function storageKey() {
    var seed = [clientHash, formNumber].join('|') || 'demo';
    var hash = 0;
    for (var i = 0; i < seed.length; i++) {
      hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
    }
    return 'km-intake-' + (hash >>> 0).toString(36);
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
    } catch (e) { /* private browsing — the page works, it just forgets */ }
  }

  /* ====================================================================== */
  /* Text from the form                                                     */
  /* ====================================================================== */

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

  /* Routing written for Zanda's single scroll — "Please continue onto Section
     2", "Please proceed to Section 6" — which this pathway has replaced with
     its own pager. The form uses four different verbs for it, so the pattern
     is looser than the consent page's. Display only: the record keeps Zanda's
     text to the character. */
  function stripNavigation(html) {
    var box = document.createElement('div');
    box.innerHTML = html;

    var ROUTING = /^\s*(?:please\s+)?(?:continue|proceed|move)\s+(?:onto|on\s+to|to)\s+section\s+\d+(?:\.\d+)*\s*\.?\s*$/i;

    box.querySelectorAll('p, div, li').forEach(function (node) {
      if (ROUTING.test(node.textContent)) { node.remove(); }
    });

    /* A routing sentence tacked onto the end of a real paragraph, rather than
       standing alone in its own element. */
    var walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT, null);
    var nodes = [];
    while (walker.nextNode()) { nodes.push(walker.currentNode); }
    nodes.forEach(function (node) {
      var trimmed = node.nodeValue.replace(
        /\s*(?:Please\s+)?(?:continue|proceed|move)\s+(?:onto|on to|to)\s+Section\s+\d+(?:\.\d+)*\s*\.?\s*$/i, '');
      if (trimmed !== node.nodeValue) { node.nodeValue = trimmed; }
    });

    while (box.lastElementChild && !box.lastElementChild.textContent.trim() &&
           box.lastElementChild.querySelector('br')) {
      box.lastElementChild.remove();
    }

    return box.innerHTML;
  }

  function escapeText(s) {
    var box = document.createElement('span');
    box.textContent = s || '';
    return box.innerHTML;
  }

  function fillFromForm() {
    /* Prose blocks. This form has little of it — 878 words against the consent
       form's 5,421 — and none of it is numbered clauses, so there is no
       clause-heading or cross-reference machinery here. */
    document.querySelectorAll('[data-legal]').forEach(function (host) {
      var html = expandAddresses(host.getAttribute('data-legal')).map(function (a) {
        var f = fieldAt(a[0], a[1]);
        if (!f || f.type !== 6) { return ''; }
        var body = stripNavigation(sanitise(f.text));
        var label = (f.label || '').trim();
        return label ? '<h4 class="clause">' + escapeText(label) + '</h4>' + body : body;
      }).join('');

      host.innerHTML = html;
      host.classList.add('legal');
    });

    /* A field's own label, taken from the form rather than retyped here. */
    document.querySelectorAll('[data-field-label]').forEach(function (host) {
      var a = host.getAttribute('data-field-label').split('.');
      var f = fieldAt(+a[0], +a[1]);
      if (f) { host.textContent = (f.label || '').trim(); }
    });

    /* Option text is the form's wording too. */
    document.querySelectorAll('[data-opt-text]').forEach(function (host) {
      var a = host.getAttribute('data-opt-text').split('.');
      var f = fieldAt(+a[0], +a[1]);
      var o = f && f.options[+a[2]];
      if (o) { host.textContent = stripRouting(o.value); }
    });

    buildOptionList('service-options', [10, 1], 'services', 'checkbox');
    buildOptionList('custody-restrictions', [6, 2], 'custodialRestr', 'checkbox');
  }

  /* Options rendered straight from the form, so a service added in Zanda
     appears here without an edit. (It would change the skeleton hash and stop
     the page until someone re-checks the map — which is the point.) */
  function buildOptionList(hostId, at, key, type) {
    var host = document.getElementById(hostId);
    var f = fieldAt(at[0], at[1]);
    if (!host || !f) { return; }

    host.innerHTML = '';
    f.options.forEach(function (o, i) {
      var li = document.createElement('li');
      var label = document.createElement('label');
      label.className = 'opt';

      var input = document.createElement('input');
      input.type = type;
      input.name = key;
      input.value = i;
      input.setAttribute('data-field', key);

      var span = document.createElement('span');
      span.className = 'opt-text';
      span.textContent = stripRouting(o.value);

      label.appendChild(input);
      label.appendChild(span);
      li.appendChild(label);
      host.appendChild(li);
    });
  }

  /* Zanda's option labels sometimes end in a parenthetical telling the reader
     where to go next, which describes the flat form's navigation. Display
     only — the value written back is always the untouched original. */
  function stripRouting(text) {
    return String(text || '')
      .replace(/\s*\((?:please|proceed)\b[^)]*\)?/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  /* ====================================================================== */
  /* Age — the one derivation this form makes from data rather than a choice */
  /* ====================================================================== */

  /* Under 18 decides whether the guardian-contact and custody sections are
     asked at all. The Zanda form never asks it; it states the rule in prose
     over three sections and leaves the reader to apply it. Date of birth is
     already collected, so asking again would only create something that can
     disagree with itself.

     School is deliberately NOT gated on this. A school recently left can still
     be contacted for background, so that card is shown to everyone and only
     its framing changes. */
  function ageYears() {
    var raw = (answers.dob || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) { return null; }

    var parts = raw.split('-');
    var born = new Date(+parts[0], +parts[1] - 1, +parts[2]);
    if (isNaN(born.getTime())) { return null; }

    var now = new Date();
    if (born > now) { return null; }

    var years = now.getFullYear() - born.getFullYear();
    var m = now.getMonth() - born.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < born.getDate())) { years--; }
    return years;
  }

  /* Unknown age is treated as under 18 — the branch that ASKS more. Guessing
     the shorter path would silently drop the guardian contacts for a child
     whose date of birth had not been filled in yet. */
  function isUnder18() {
    var age = ageYears();
    return age === null ? true : age < 18;
  }

  function southernCross() {
    return hasInsurance() && /southern\s*cross/i.test(answers.insurer || '');
  }

  function hasInsurance() { return ui.hasInsurance === 1; }

  /* ====================================================================== */
  /* Derivation                                                             */
  /* ====================================================================== */

  /* Turns what the reader did into the complete set of Zanda answers,
     including the fields this pathway answered for them. Each entry is
     {value, derived, why}; `derived` drives the badge on the review, because a
     form must never write an answer its signer cannot see and account for. */
  function resolve() {
    var r = {};

    function set(key, value, why) {
      r[key] = { value: value, derived: why != null, why: why || null };
    }

    function plain(key) { set(key, answers[key] || ''); }

    /* --- section 2: the client --- */
    ['firstName', 'middleName', 'lastName', 'preferredName', 'dob', 'nhi',
     'sex', 'gender', 'pronouns', 'address', 'postcode', 'city', 'region'].forEach(plain);

    /* --- section 3: contacts --- */
    set('primaryWho', has(answers.primaryWho) ? answers.primaryWho : null);
    plain('primaryName');
    plain('primaryMobile');
    plain('primaryEmail');
    set('smsConsent', !!ui.smsConsent);
    set('emailConsent', !!ui.emailConsent);

    /* Only asked where the primary contact is not the Client themselves. */
    if (answers.primaryWho === OPT.primaryWho.client) {
      set('primaryRel', '', 'The primary contact is the Client');
    } else {
      plain('primaryRel');
    }

    var under18 = isUnder18();

    if (under18) {
      /* 4.1 asks whether this additional contact is the Client or a
         parent/guardian. On both branches of "who is filling this in" the
         answer is the same — a Client under 18 lists their guardian, and a
         guardian lists the OTHER guardian — so it is never worth asking. */
      set('add1Who', OPT.add1Who.guardian,
          'This contact is a parent or legal guardian either way');
      ['add1Name', 'add1Phone', 'add1Email', 'add1Rel',
       'add2Name', 'add2Mobile', 'add2Email', 'add2Rel'].forEach(plain);

      set('custodial', has(answers.custodial) ? answers.custodial : null);

      if (answers.custodial === OPT.custodial.yes) {
        plain('custodialType');
        set('custodialRestr', Array.isArray(answers.custodialRestr) ? answers.custodialRestr.slice() : []);
        set('custodialOther', custodyOtherPicked() ? (answers.custodialOther || '') : '');
      } else {
        set('custodialType', '', 'No custodial arrangement to record');
        set('custodialRestr', [], 'No custodial arrangement to record');
        set('custodialOther', '', 'No custodial arrangement to record');
      }

    } else {
      var why18 = 'Not collected — the Client is 18 or over';
      set('add1Who', null, why18);
      ['add1Name', 'add1Phone', 'add1Email', 'add1Rel',
       'add2Name', 'add2Mobile', 'add2Email', 'add2Rel'].forEach(function (k) { set(k, '', why18); });
      set('custodial', OPT.custodial.notApplicable, why18);
      set('custodialType', '', why18);
      set('custodialRestr', [], why18);
      set('custodialOther', '', why18);
    }

    /* --- sections 5 and 6: GP and school --- */
    ['gpName', 'gpAddress', 'schoolName', 'teacherName', 'teacherContact'].forEach(plain);
    set('gpConsent', !!ui.gpConsent);
    set('schoolConsent', !!ui.schoolConsent);

    /* --- section 7: electronic prescriptions --- */
    if (ui.scriptsGate) {
      plain('pharmacy');
    } else {
      set('pharmacy', '', 'You did not ask for electronic prescriptions');
    }

    /* --- section 8: request for service --- */
    set('services', Array.isArray(answers.services) ? answers.services.slice() : []);
    plain('serviceDetail');
    plain('howHeard');

    /* --- section 9: insurance --- */
    if (!hasInsurance()) {
      var whyNone = 'You told us you have no health insurance';
      set('insurer', '', whyNone);
      set('scMembership', '', whyNone);
      set('scPolicy', '', whyNone);
      set('scClaimConsent', null, whyNone);
      set('quoteNeeded', null, whyNone);

    } else {
      plain('insurer');
      set('quoteNeeded', has(answers.quoteNeeded) ? answers.quoteNeeded : null);

      if (southernCross()) {
        plain('scMembership');
        plain('scPolicy');
        set('scClaimConsent', has(answers.scClaimConsent) ? answers.scClaimConsent : null);
      } else {
        var whyNotSC = 'These apply to Southern Cross policies only';
        set('scMembership', '', whyNotSC);
        set('scPolicy', '', whyNotSC);
        set('scClaimConsent', null, whyNotSC);
      }
    }

    /* --- section 10: signature --- */
    /* Asked once, on the second card. The form asks it again here and never
       uses either answer; this pathway fills it from the first. */
    if (ui.completedBy === 0) {
      set('signWho', OPT.signWho.client, 'You told us you are the Client');
    } else if (ui.completedBy === 1) {
      set('signWho', OPT.signWho.guardian, 'You told us you are a parent or legal guardian');
    } else {
      set('signWho', null);
    }

    plain('signName');
    set('signature', answers.signature || '');

    return r;
  }

  function has(v) { return v !== null && v !== undefined && v !== ''; }

  function custodyOtherPicked() {
    var list = answers.custodialRestr || [];
    var f = fieldAt(6, 2);
    if (!f) { return false; }
    /* Matched on the option's own wording rather than on a hard-coded index,
       because "Other" is the one option whose position a future edit is most
       likely to move. */
    var other = -1;
    f.options.forEach(function (o, i) { if (/^other\b/i.test(o.value)) { other = i; } });
    return other !== -1 && list.indexOf(other) !== -1;
  }

  /* Deliberately loose — the job is to catch a slip, not to adjudicate what a
     valid address or number is. NZ mobiles are written 021 234 5678,
     +64 21 234 5678 and (09) 123 4567 alike. */
  var EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  var PHONE_SHAPE = /^[+()\d\s-]+$/;

  function emailLooksRight(v) { return !v || EMAIL_SHAPE.test(v); }

  function phoneLooksRight(v) {
    if (!v) { return true; }
    return PHONE_SHAPE.test(v) && (v.match(/\d/g) || []).length >= 7;
  }

  /* An under-18 ADHD assessment cannot be completed without school input —
     the form says so in section 6's own prose. So the school name stops being
     optional exactly when that service is requested for a child. */
  function schoolRequired() {
    var list = answers.services || [];
    return isUnder18() && list.indexOf(OPT.services.adhd) !== -1;
  }

  /* ====================================================================== */
  /* What is still outstanding                                              */
  /* ====================================================================== */

  function progressState() {
    var r = resolve();
    var missing = [];
    var total = 0;

    function need(key, ok) {
      total++;
      if (!ok) { missing.push(key); }
    }

    need('read1', !!ui.read1);
    need('completedBy', ui.completedBy === 0 || ui.completedBy === 1);

    need('firstName', !!r.firstName.value.trim());
    need('lastName', !!r.lastName.value.trim());
    need('dob', ageYears() !== null);

    need('primaryWho', has(r.primaryWho.value));
    need('primaryName', !!r.primaryName.value.trim());

    /* A contact we cannot reach is a contact we do not have. Either channel
       will do; both is better but we do not insist. */
    need('primaryReach', !!((r.primaryMobile.value || r.primaryEmail.value) &&
                            phoneLooksRight(r.primaryMobile.value) &&
                            emailLooksRight(r.primaryEmail.value)));

    if (answers.primaryWho === OPT.primaryWho.guardian) {
      need('primaryRel', !!r.primaryRel.value.trim());
    }

    if (isUnder18()) {
      need('add1', !!(r.add1Name.value.trim() &&
                      (r.add1Phone.value.trim() || r.add1Email.value.trim()) &&
                      phoneLooksRight(r.add1Phone.value) &&
                      emailLooksRight(r.add1Email.value)));

      need('custodial', has(r.custodial.value));
      if (answers.custodial === OPT.custodial.yes) {
        need('custodialType', !!r.custodialType.value.trim());
      }
    }

    if (schoolRequired()) {
      need('schoolName', !!r.schoolName.value.trim());
    }

    if (ui.scriptsGate) {
      need('pharmacy', !!r.pharmacy.value.trim());
    }

    need('services', r.services.value.length > 0);

    need('hasInsurance', ui.hasInsurance === 0 || ui.hasInsurance === 1);
    if (hasInsurance()) {
      need('insurer', !!r.insurer.value.trim());
      need('quoteNeeded', has(r.quoteNeeded.value));

      if (southernCross()) {
        /* Either number is enough — the form's own prose says so. */
        need('scNumber', !!(r.scMembership.value.trim() || r.scPolicy.value.trim()));
        need('scClaimConsent', has(r.scClaimConsent.value));
      }
    }

    need('signName', !!r.signName.value.trim());
    need('signature', !!r.signature.value);

    return { missing: missing, total: total };
  }

  function outstanding() { return progressState().missing; }

  /* ====================================================================== */
  /* Payload                                                                */
  /* ====================================================================== */

  function buildComposition() {
    var sections = JSON.parse(JSON.stringify(composition));
    var r = resolve();

    Object.keys(FIELDS).forEach(function (key) {
      var spec = FIELDS[key];
      var f = sections[spec.at[0]].fields[spec.at[1]];
      var v = r[key] ? r[key].value : null;

      if (spec.kind === 'text' || spec.kind === 'textarea' || spec.kind === 'profile') {
        /* `profile` lands here as a placeholder. Zanda writes ProfileField
           values through to the client's profile record, and which property
           carries them on the way has not been observed — so this is a guess
           marked as one, not a mapping. See the notice on the review card. */
        f.text = v || null;

      } else if (spec.kind === 'one') {
        f.options.forEach(function (o, i) { o.selected = (i === v); });

      } else if (spec.kind === 'many') {
        f.options.forEach(function (o, i) { o.selected = v.indexOf(i) !== -1; });

      } else if (spec.kind === 'check') {
        f.checked = !!v;

      } else if (spec.kind === 'sign') {
        f.dataUrl = v || null;
      }
    });

    return { sections: sections };
  }

  function buildPayload() {
    return {
      id: '<customForm.id, from GetForm>',
      composition: buildComposition(),
      status: 2                       /* 2 = AutoDraft. 0 = Locked/submitted. */
    };
  }

  /* ====================================================================== */
  /* Conditionals                                                           */
  /* ====================================================================== */

  function el(id) { return document.getElementById(id); }

  function truthTable() {
    var self     = ui.completedBy === 0;
    var guardian = ui.completedBy === 1;

    return {
      'self':             self,
      'guardian':         guardian,
      'unchosen':         !self && !guardian,
      'under18':          isUnder18(),
      'over18':           !isUnder18(),
      'primary-guardian': answers.primaryWho === OPT.primaryWho.guardian,
      'custody-yes':      answers.custodial === OPT.custodial.yes,
      'custody-other':    custodyOtherPicked(),
      'scripts-in':       !!ui.scriptsGate,
      'scripts-out':      !ui.scriptsGate,
      'insured':          hasInsurance(),
      'southern-cross':   southernCross(),
      'school-needed':    schoolRequired()
    };
  }

  function applyConditionals() {
    var truth = truthTable();
    document.querySelectorAll('[data-when]').forEach(function (node) {
      if (node.classList.contains('card')) { return; }
      node.hidden = !truth[node.getAttribute('data-when')];
    });
  }

  /* ====================================================================== */
  /* Notes shown beside the field they are about                            */
  /* ====================================================================== */

  function markNotes() {
    /* What the date of birth resolved to, said at the moment it is entered
       rather than leaving three sections to appear and vanish unexplained. */
    var ageNote = el('age-note');
    if (ageNote) {
      var age = ageYears();
      if (age === null) {
        ageNote.hidden = true;
      } else {
        ageNote.hidden = false;
        ageNote.textContent = age < 18
          ? 'Aged ' + age + '. We will ask for a parent or guardian we can reach, and about any custody arrangements.'
          : 'Aged ' + age + '. The guardian and custody questions do not apply, so we will skip them.';
      }
    }

    var primary = el('primary-note');
    if (primary) {
      var msg = null;
      if (!phoneLooksRight(answers.primaryMobile)) {
        msg = 'That mobile number does not look right. Digits, spaces, and + ( ) - are all fine.';
      } else if (!emailLooksRight(answers.primaryEmail)) {
        msg = 'That email address does not look right — it should look like name@example.co.nz';
      } else if (!(answers.primaryMobile || '').trim() && !(answers.primaryEmail || '').trim()) {
        msg = 'Please give at least one way to reach them — a mobile number or an email address.';
      }
      primary.hidden = !msg;
      if (msg) { primary.textContent = msg; }
      mark('primary-mobile', !phoneLooksRight(answers.primaryMobile));
      mark('primary-email', !emailLooksRight(answers.primaryEmail));
    }

    document.querySelectorAll('[data-person-note]').forEach(function (note) {
      var p = note.getAttribute('data-person-note');
      var name = (answers[p + 'Name'] || '').trim();
      var phone = (answers[p + 'Phone'] || answers[p + 'Mobile'] || '').trim();
      var email = (answers[p + 'Email'] || '').trim();
      var required = p === 'add1' && isUnder18();

      var msg = null;
      if (!phoneLooksRight(phone)) {
        msg = 'That number does not look right. Digits, spaces, and + ( ) - are all fine.';
      } else if (!emailLooksRight(email)) {
        msg = 'That email address does not look right — it should look like name@example.co.nz';
      } else if (name && !phone && !email) {
        msg = 'Please give at least one way to reach them.';
      } else if (required && !name) {
        msg = 'Please give a name and at least one way to contact them.';
      }

      note.hidden = !msg;
      if (msg) { note.textContent = msg; }
      mark(p + '-phone', !phoneLooksRight(answers[p + 'Phone']));
      mark(p + '-mobile', !phoneLooksRight(answers[p + 'Mobile']));
      mark(p + '-email', !emailLooksRight(email));
    });

    var sc = el('sc-note');
    if (sc) {
      var need = southernCross() &&
                 !(answers.scMembership || '').trim() &&
                 !(answers.scPolicy || '').trim();
      sc.hidden = !need;
      if (need) { sc.textContent = 'One of these is needed so we can process a claim — whichever you have to hand.'; }
    }

    /* The one answer this page fills in on the signature card, stated where it
       is used rather than only on the review. */
    var derived = el('signer-derived');
    if (derived) {
      var r = resolve();
      var f = fieldAt(12, 0);
      var chosen = has(r.signWho.value) && f && f.options[r.signWho.value];
      derived.innerHTML = chosen
        ? '<strong>Set for you:</strong> ' + escapeText(stripRouting(chosen.value)) +
          ' — ' + escapeText(r.signWho.why || '')
        : '';
    }
  }

  function mark(id, bad) {
    var input = el(id);
    if (input) { input.classList.toggle('invalid', !!bad); }
  }

  function syncInputs() {
    document.querySelectorAll('[data-field]').forEach(function (input) {
      var key = input.getAttribute('data-field');
      var spec = FIELDS[key];
      if (!spec) { return; }

      if (input.type === 'radio') {
        input.checked = answers[key] === +input.value;
      } else if (input.type === 'checkbox' && spec.kind === 'many') {
        var list = answers[key] || [];
        input.checked = list.indexOf(+input.value) !== -1;
      } else if (input.type === 'checkbox') {
        input.checked = !!ui[key];
      } else {
        input.value = answers[key] || '';
      }
    });

    document.querySelectorAll('[data-answer]').forEach(function (input) {
      input.value = answers[input.getAttribute('data-answer')] || '';
    });

    document.querySelectorAll('[data-ui]').forEach(function (input) {
      input.checked = !!ui[input.getAttribute('data-ui')];
    });

    /* Our own questions — the ones that drive the pathway without being Zanda
       fields in their own right. */
    document.querySelectorAll('[data-ui-radio]').forEach(function (input) {
      input.checked = ui[input.getAttribute('data-ui-radio')] === +input.value;
    });
  }

  /* ====================================================================== */
  /* The deck                                                               */
  /* ====================================================================== */

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

  function nearestVisible(id) {
    var list = visibleCards();
    if (!list.length) { return null; }

    var wanted = -1;
    CARDS.forEach(function (c, i) { if (c.id === id) { wanted = i; } });
    if (wanted === -1) { return list[0].id; }

    for (var i = wanted; i >= 0; i--) {
      var here = CARDS[i].id;
      if (list.some(function (c) { return c.id === here; })) { return here; }
    }
    return list[0].id;
  }

  function fillSectionHead() {
    var head = el('section-head');
    if (!head) { return; }

    var spec = cardSpec(currentId);
    var sec = null;
    if (spec) { SECTIONS.forEach(function (s) { if (s.n === spec.sec) { sec = s; } }); }

    if (!sec) { head.hidden = true; return; }
    head.hidden = false;

    var count = el('section-count');
    if (count) { count.textContent = 'Section ' + sec.n + ' of ' + SECTIONS.length; }

    var title = el('section-title');
    if (!title) { return; }

    var label = (composition[sec.at] && composition[sec.at].label) || '';
    var m = /^\s*(\d+(?:\.\d+)*)\.?\s+(.*)$/.exec(label);
    title.innerHTML = m
      ? '<span class="clause-num">' + m[1] + '</span> ' + escapeText(m[2].trim())
      : escapeText(label);
  }

  function showStart() {
    currentId = null;

    var panel = el('start-panel');
    if (panel) { panel.hidden = false; }

    document.querySelectorAll('.deck > .card').forEach(function (n) { n.hidden = true; });

    var pager = el('pager');
    if (pager) { pager.hidden = true; }

    fillSectionHead();
    updateDeck();
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
      var node = el(target);
      if (node) {
        var y = node.getBoundingClientRect().top + window.pageYOffset - 90;
        window.scrollTo({ top: Math.max(0, y), behavior: opts && opts.instant ? 'auto' : 'smooth' });
      }
    }

    setPagerMessage('');
  }

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

  function tryNext() {
    var spec = cardSpec(currentId);
    if (!spec) { return; }

    var missing = outstanding().filter(function (k) { return spec.owns.indexOf(k) !== -1; });

    if (missing.length) {
      setPagerMessage('Still needed on this card: ' + missing.map(nameFor).join(', ') + '.');

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
  /* Rail and counter                                                       */
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
      next.textContent = (i === list.length - 2) ? 'Check my answers' : 'Continue';
    }

    markRail(missing);
    markNotes();
  }

  function refresh() {
    applyConditionals();

    /* An answer can remove the card the reader is standing on — a date of
       birth that turns out to be an adult's, while they are on the guardian
       card. Move them somewhere real before anything else reads currentId. */
    if (currentId && indexOfCard(currentId) === -1) {
      showCard(nearestVisible(currentId));
      return;
    }

    updateDeck();
    renderReview();
    save();
  }

  /* ====================================================================== */
  /* Review                                                                 */
  /* ====================================================================== */

  function describe(key, entry) {
    var spec = FIELDS[key];
    var f = fieldAt(spec.at[0], spec.at[1]);

    if (spec.kind === 'text' || spec.kind === 'textarea' || spec.kind === 'profile') {
      return entry.value ? entry.value : null;
    }
    if (spec.kind === 'one') {
      return has(entry.value) && f.options[entry.value] ? f.options[entry.value].value : null;
    }
    if (spec.kind === 'many') {
      if (!entry.value.length) { return null; }
      return entry.value.map(function (i) { return f.options[i].value; });
    }
    if (spec.kind === 'check') {
      return entry.value ? 'Ticked' : null;
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
      addr.textContent = 'sec ' + spec.at[0] + ' · fld ' + spec.at[1] +
                         (spec.kind === 'profile' ? ' · profile' : '');
      tr.appendChild(addr);

      var td = document.createElement('td');

      if (value === null) {
        var none = document.createElement('em');
        none.textContent = 'Not answered';
        td.appendChild(none);
        td.appendChild(tagFor(entry.derived ? 'derived' : 'empty'));
        if (entry.derived && entry.why) { td.appendChild(why(entry.why)); }

      } else if (value === 'SIGNATURE') {
        var img = document.createElement('img');
        img.className = 'sig-thumb';
        img.src = entry.value;
        img.alt = 'Signature';
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
        if (entry.derived && entry.why) { td.appendChild(why(entry.why)); }
      }

      tr.appendChild(td);
      body.appendChild(tr);
    });

    var payload = el('payload');
    if (payload) { payload.textContent = JSON.stringify(buildPayload(), null, 1); }

    var missing = outstanding();
    var blocker = el('review-blocker');
    if (blocker) {
      blocker.hidden = missing.length === 0;
      var list = el('review-missing');
      if (list && missing.length) {
        list.textContent = missing.map(nameFor).join(' · ');
      }
    }
  }

  function why(text) {
    var p = document.createElement('p');
    p.className = 'q-help';
    p.style.margin = '0.3rem 0 0';
    p.textContent = text;
    return p;
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

    /* The pad starts on a hidden card, so at load its box is zero wide and
       there is nothing to scale to. A ResizeObserver catches the moment the
       card is shown, which is also when a saved signature can be painted back. */
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

    if (window.ResizeObserver) { new window.ResizeObserver(ensureSized).observe(canvas); }
    window.addEventListener('resize', ensureSized);
    ensureSized();

    setSigStatus(!!answers.signature);
  }

  /* ====================================================================== */
  /* Wiring                                                                 */
  /* ====================================================================== */

  function initInputs() {
    /* Delegated, because the service and custody option lists are built from
       the form after load. */
    document.addEventListener('change', function (e) {
      var input = e.target;
      if (!input || !input.getAttribute) { return; }

      var key = input.getAttribute('data-field');
      if (key && FIELDS[key]) {
        var spec = FIELDS[key];

        if (input.type === 'radio') {
          answers[key] = +input.value;

          /* Naming a Client as their own primary contact leaves no
             relationship to state. */
          if (key === 'primaryWho' && +input.value === OPT.primaryWho.client) {
            delete answers.primaryRel;
          }
          /* Dropping out of "yes" abandons the follow-up rather than carrying
             a stale custody description under a "No". */
          if (key === 'custodial' && +input.value !== OPT.custodial.yes) {
            delete answers.custodialType;
            delete answers.custodialRestr;
            delete answers.custodialOther;
          }

        } else if (input.type === 'checkbox' && spec.kind === 'many') {
          var list = answers[key] || [];
          var v = +input.value;
          var at = list.indexOf(v);
          if (input.checked && at === -1) { list.push(v); }
          if (!input.checked && at !== -1) { list.splice(at, 1); }
          list.sort(function (a, b) { return a - b; });
          answers[key] = list;

        } else if (input.type === 'checkbox') {
          ui[key] = input.checked;
        }

        setPagerMessage('');
        syncInputs();
        refresh();
        return;
      }

      var uiKey = input.getAttribute('data-ui');
      if (uiKey) {
        ui[uiKey] = input.checked;
        /* Closing the prescriptions gate drops the pharmacy with it. */
        if (uiKey === 'scriptsGate' && !input.checked) { delete answers.pharmacy; }
        setPagerMessage('');
        syncInputs();
        refresh();
        return;
      }

      var uiRadio = input.getAttribute('data-ui-radio');
      if (uiRadio) {
        ui[uiRadio] = +input.value;
        /* Saying there is no insurance abandons the insurer details rather
           than keeping them under a "No". */
        if (uiRadio === 'hasInsurance' && +input.value === 0) {
          ['insurer', 'scMembership', 'scPolicy', 'scClaimConsent', 'quoteNeeded']
            .forEach(function (k) { delete answers[k]; });
        }
        setPagerMessage('');
        syncInputs();
        refresh();
      }
    });

    document.addEventListener('input', function (e) {
      var input = e.target;
      if (!input || !input.getAttribute) { return; }
      var key = input.getAttribute('data-answer');
      if (!key) { return; }

      answers[key] = input.value;

      /* Typing a different insurer can close the Southern Cross card. */
      setPagerMessage('');
      refresh();
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
      document.title = name + ' — New patient form | Kinder Minds';
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

  function openingCard() {
    var hash = window.location.hash.slice(1);
    if (hash && indexOfCard(hash) !== -1) { return hash; }
    if (ui.cardAt && indexOfCard(ui.cardAt) !== -1) { return ui.cardAt; }
    return null;
  }

  function start(data) {
    skeletonHash(data.sections).then(function (hash) {
      if (hash !== EXPECTED_SKELETON) {
        fail('This form no longer matches what the page was built for',
             'Expected ' + EXPECTED_SKELETON + ', computed ' + hash + '. Because Zanda ' +
             'gives its fields no IDs, answers are matched by position, so continuing could ' +
             'file them against the wrong fields. Run "node forms/capture-form.mjs --check ' +
             '<clientHash> <formNumber> zanda-patient-intake.json" to see exactly what moved.');
        return;
      }

      composition = data.sections;

      load();
      fillFromForm();
      applyContext();
      buildRail();
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
             'site root, then open http://localhost:8000/forms/intake-cards.html');
      });
  });
})();
