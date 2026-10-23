/* ==========================================================================
   Kinder Minds — guide core

   Names, form links, tick state and progress. Pairs with guide.js, which adds
   the accordion on top. Originally copied out of intake/intake.js, which was
   the actionable half of an older split-page design. That folder was retired
   on 2026-08-25 once the guides absorbed both halves, so this file is now the
   only copy — the two had already diverged before it went.

   Four jobs:
     1. Read the client's form links out of the URL query string.
     2. Branch the page on the questions it asks: the age-16 consent question,
        the titration fork, and the adult requirements check.
     3. Remember ticked steps in localStorage so the family can come back.
     4. Turn an all-ages page into its adult version when the link asks.

   No dependencies, no build step, no data ever leaves the browser.

   URL PARAMETERS
     name    first name used to personalise the page
     client  the client's Zanda profile hash        e.g. client=DEMO123456
     reg     registration form number, or full URL  e.g. reg=2831
     c1      consent form — guardian 1 / patient    e.g. c1=2832
     c2      consent form — guardian 2 (under 16)   e.g. c2=2833
     age     optional preset: "16plus" or "under16"
     reconsent  "1" — returning family, consent forms only. The branch then
                follows the number of consent links supplied, and the family is
                not asked.
     for     "adult" — the adult version of a page that serves all ages (the
             Titration Clinic and Post-Diagnostic Support). Only a page whose
             own <head> script opts in acts on it; every guide passes it on
             through its service links.

   Build these links with staff/link-builder.html rather than by hand.
   ========================================================================== */

(function () {
  'use strict';

  /* Zanda custom-form URLs are shaped:
       <PORTAL><client hash>/<form number>
     The portal path is clinic-level and fixed; the client hash identifies the
     individual client's record and MUST come from the link, never a default —
     a wrong hash would file a family's forms against another client.

     Two ways to supply the forms:
       compact  client=<hash> plus reg/c1/c2 as bare form numbers
       explicit reg/c1/c2 as complete https:// URLs (overrides the compact form)
     The explicit form is the escape hatch for anything not on Zanda. */

  var PORTAL = 'https://clientportal.zandahealth.com/clientportal/kinderminds/customform/';

  var params = new URLSearchParams(window.location.search);

  /* ---------- form links ---------- */

  var clientHash = (params.get('client') || '').trim();
  /* Restrict to the character set Zanda actually uses, so nothing from the
     query string can escape the path segment it belongs in. */
  if (!/^[A-Za-z0-9_-]{4,64}$/.test(clientHash)) { clientHash = null; }

  function formUrl(value) {
    if (!value) { return null; }
    var v = String(value).trim();

    /* A complete URL is taken as-is — https only, which also blocks
       javascript: and data: URLs arriving via the query string. */
    if (/^https:\/\//i.test(v)) { return v; }

    /* Otherwise a bare form number, resolved against this client's hash. */
    if (/^\d{1,10}$/.test(v) && clientHash) { return PORTAL + clientHash + '/' + v; }

    return null;
  }

  var links = {
    reg: formUrl(params.get('reg')),
    c1: formUrl(params.get('c1')),
    c2: formUrl(params.get('c2'))
  };

  var anyLinkSupplied = !!(links.reg || links.c1 || links.c2);

  /* A link carrying a client's name is personalised whether or not it also
     carries forms — an existing patient starting titration has nothing new to
     sign, but should still get the interactive guide. */
  var personalised = anyLinkSupplied || !!(params.get('name') || '').trim();

  /* Two modes. Without a personalised link there is no workflow to complete,
     so the page presents as a plain leaflet; with one it becomes the saveable
     guide. Published as a class on <html> — pages that define no rules for it
     (the standalone intake page) are unaffected. A matching inline script in
     the guide's <head> sets this before first paint to avoid a flash; this
     line is the authoritative correction once the links are validated. */
  document.documentElement.classList.remove('mode-leaflet', 'mode-guide');
  document.documentElement.classList.add(personalised ? 'mode-guide' : 'mode-leaflet');

  /* Where the ADHD was diagnosed. When we diagnosed it ourselves — which is
     the case whenever this page is linked from one of our own assessments —
     the fees and caveats that only apply to an outside diagnosis are noise,
     and quoting a price the family will never pay invites confusion. */
  var dx = (params.get('dx') || '').trim().toLowerCase();
  if (dx === 'km' || dx === 'ext') {
    document.documentElement.classList.add('dx-' + dx);
  }

  /* Returning family whose consent has been superseded since they signed.
     Registration stands; only the consent forms are reissued.

     Set in the page's pre-paint script as well as here — that one stops the
     new-client wording flashing up before this file loads, this one is the
     authoritative correction once the links have been parsed. */
  var reconsent = (params.get('reconsent') || '').trim() === '1';
  if (reconsent) {
    document.documentElement.classList.add('reg-reconsent');
    /* The two states are mutually exclusive: reg-complete means there is
       nothing to do, and here there is. A page that inferred reg-complete from
       something coarser — the titration page does, from dx=km — must not
       override a link that explicitly asks for a consent refresh. */
    document.documentElement.classList.remove('reg-complete');
  }

  /* ---------- the adult version ----------

     Titration and Post-Diagnostic Support are the same process at any age, so
     each is one page with an adult version rather than two pages. for=adult
     selects it, but this file does not read the parameter: the page's own
     <head> script turns it into the for-adult class, before first paint. That
     is the opt-in. A page that never sets the class, such as an assessment
     carrying for=adult on to its service links, is left as it is. */
  var adult = document.documentElement.classList.contains('for-adult');

  /* An adult consents for themselves, so the adult version needs the adult
     registration step. The page carries it in a <template>, which is inert:
     not shown, not counted, and its ids do not clash with the step it
     replaces. Swapped in before anything else reads the stages. */
  function applyAudience() {
    if (!adult) { return; }
    var tpl = document.getElementById('registration-adult');
    var step = document.getElementById('step-registration');
    if (tpl && step) { step.parentNode.replaceChild(tpl.content.cloneNode(true), step); }
  }

  /* ---------- personalisation ---------- */

  var rawName = (params.get('name') || '').trim().slice(0, 40);

  /* With no name the page still has to read naturally, so every mention falls
     back to a generic referent. `ref` chooses which one; a whitelist keeps the
     page's grammar predictable and stops arbitrary text being injected into
     dozens of sentences. */
  var REFERENTS = {
    child: 'your child',
    son: 'your son',
    daughter: 'your daughter',
    teen: 'your young person',
    'young person': 'your young person'
  };

  var fallbackName = REFERENTS[(params.get('ref') || '').trim().toLowerCase()] || REFERENTS.child;

  /* English possessive: a name already ending in s takes a bare apostrophe
     (Iris' report), anything else takes apostrophe-s (Tāne's report). The
     generic fallbacks — "your child", "your son" — never end in s, so they
     always take the full form. */
  function possessive(name) {
    return /s$/i.test(name) ? name + '’' : name + '’s';
  }

  function capitalise(text) {
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  function applyName() {
    /* textContent everywhere — never innerHTML — so a name from the query
       string can never inject markup. */
    var display = rawName || fallbackName;

    document.querySelectorAll('[data-name-slot]').forEach(function (el) {
      /* Slot kinds:
           (empty)         Iris            plain mention
           cap             Iris            sentence-initial (matters only for
                                            the lower-case generic fallbacks)
           possessive      Iris’ / Tāne’s  possessive, apostrophe chosen by name
           cap-possessive  as above, sentence-initial */
      var kind = el.getAttribute('data-name-slot') || '';
      var out;

      /* The adult version speaks to the client directly, so every mention is
         "you", whether or not the link carries a name. The name still heads
         the page and the tab title, below. Sentences are written so the slot
         is never the subject: "since we last saw you", not "since you was". */
      if (adult) {
        out = /possessive/.test(kind) ? 'your' : 'you';
        el.textContent = /^cap/.test(kind) ? capitalise(out) : out;
        return;
      }

      if (kind === 'possessive')          { out = possessive(display); }
      else if (kind === 'cap-possessive') { out = capitalise(possessive(display)); }
      else if (kind === 'cap')            { out = capitalise(display); }
      else                                { out = display; }

      el.textContent = out;
    });

    if (rawName) {
      var whom = document.getElementById('for-whom');
      if (whom) {
        whom.textContent = 'Prepared for ' + rawName;
        whom.hidden = false;
      }
      document.title = rawName + ' — Getting started | Kinder Minds';
    }
  }

  /* ---------- wire up the form links ---------- */

  function applyLinks() {
    document.querySelectorAll('[data-form]').forEach(function (anchor) {
      var url = links[anchor.getAttribute('data-form')];
      if (url) {
        anchor.href = url;
        anchor.removeAttribute('aria-disabled');
      } else {
        /* No link supplied: leave the card visible but make the absence
           obvious rather than shipping a dead button. */
        anchor.removeAttribute('href');
        anchor.setAttribute('aria-disabled', 'true');
        anchor.textContent = 'Link not yet provided';
      }
    });

    /* The "forms not loaded" notice is only meaningful when forms were
       expected. If registration is already complete, none were. */
    var notice = document.getElementById('default-links-notice');
    var expectsForms = !document.documentElement.classList.contains('reg-complete');
    if (notice && (anyLinkSupplied || !expectsForms)) { notice.hidden = true; }
  }

  /* ---------- saved state ---------- */

  /* Key the stored state to the specific form set, so two different
     children guided on the same device do not share a checklist. */
  function storageKey() {
    var seed = [links.reg, links.c1, links.c2, rawName].join('|');
    var hash = 0;
    for (var i = 0; i < seed.length; i++) {
      hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
    }
    return 'km-intake-' + (hash >>> 0).toString(36);
  }

  var KEY = storageKey();

  function readState() {
    try {
      return JSON.parse(window.localStorage.getItem(KEY)) || {};
    } catch (e) {
      return {};                        /* private mode, or corrupt value */
    }
  }

  function writeState(state) {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      /* Storage unavailable (private browsing). The page still works —
         it simply will not remember ticks between visits. */
    }
  }

  var state = readState();

  /* ---------- the age-16 branch ---------- */

  function applyBranch(choice) {
    var over = document.getElementById('branch-16plus');
    var under = document.getElementById('branch-under16');
    if (!over || !under) { return; }

    over.hidden = (choice !== '16plus');
    under.hidden = (choice !== 'under16');

    /* A 16-or-older answer tells us more than which forms are needed — it also
       settles other age-dependent wording on the page (a 16-year-old is
       necessarily over 9, so that qualifier can drop away). */
    var root = document.documentElement;
    root.classList.toggle('age-16plus', choice === '16plus');
    root.classList.toggle('age-under16', choice === 'under16');

    /* Ticks inside a hidden branch must not count toward progress. */
    updateProgress();
  }

  function initBranch() {
    /* A consent refresh is not a question. Staff have the age from the record
       before the link is built and express it in the link itself: one consent
       form means the young person consents for themselves, two means both
       legal guardians. The radios are hidden by CSS in this mode, so nothing
       here reads or writes them — and a stale saved answer from an earlier
       visit must not reach applyBranch either. */
    if (reconsent) {
      applyBranch(links.c2 ? 'under16' : '16plus');
      return;
    }

    var preset = params.get('age');
    var saved = state.age;
    var choice = (preset === '16plus' || preset === 'under16') ? preset : saved;

    document.querySelectorAll('input[name="age-consent"]').forEach(function (radio) {
      radio.checked = (radio.value === choice);
      radio.addEventListener('change', function () {
        state.age = this.value;
        writeState(state);
        applyBranch(this.value);
      });
    });

    applyBranch(choice);
  }

  /* ---------- the titration fork (titration guide only) ----------

     Titration can be run by us or handed to the GP, and the answer decides
     whether the four Kinder Minds steps apply at all:

       unanswered  dimmed but readable — the reader is choosing between two
                   pathways, so both have to be legible before choosing
       yes         the four steps are live
       no          they are replaced by a single Hand Over step

     Unanswered is a real third state, not a default to "yes": presenting the
     Kinder Minds pathway as chosen would be the wrong way to fail. */

  function applyTitration(choice) {
    if (!document.getElementById('step-handover')) { return; }   /* not this guide */

    var root = document.documentElement;
    root.classList.toggle('titr-unset', choice !== 'yes' && choice !== 'no');
    root.classList.toggle('titr-yes', choice === 'yes');
    root.classList.toggle('titr-no', choice === 'no');

    /* Every step on the handover route, not just the handover itself —
       confirming the GP will take it on is part of that route too. */
    document.querySelectorAll('.titr-handover').forEach(function (li) {
      li.hidden = (choice !== 'no');
    });

    /* A dimmed step must not be tickable, or progress could be advanced
       against a pathway that has not been chosen. Disabled rather than
       pointer-events, so it is out of the keyboard order too. */
    document.querySelectorAll('.titr-with-us .tick input[type="checkbox"]')
      .forEach(function (box) { box.disabled = (choice !== 'yes'); });

    updateProgress();
  }

  function initTitration() {
    if (!document.getElementById('step-handover')) { return; }

    var saved = state.titration;
    var choice = (saved === 'yes' || saved === 'no') ? saved : null;

    document.querySelectorAll('input[name="titration-choice"]').forEach(function (radio) {
      radio.checked = (radio.value === choice);
      radio.addEventListener('change', function () {
        state.titration = this.value;
        writeState(state);
        applyTitration(this.value);
      });
    });

    applyTitration(choice);
  }

  /* ---------- the requirements check (adult guides only) ----------

     Two questions decide whether the client can supply the evidence an adult
     assessment needs: school reports, and an observer for the interviews. The
     second depends on the first, because without school reports the observer
     has to be family who has known the client from childhood to today.

       first answer     req-reports-yes / req-reports-no on <html>
       both answered    req-met (observer yes) or req-contact (observer no)

     The answers stay on this device and never reach the clinic, which is why
     the contact outcome tells the client to get in touch.

     The step's own tick follows the answers, not the reader: ticked when the
     requirements are met, unticked while unanswered, and in the contact
     outcome it is the reader's "I have spoken to Kinder Minds" tick. CSS hides
     it outside that outcome. Hidden rather than disabled, because guide.js
     passes over a disabled tick when choosing the stage to open, and an
     unanswered check is exactly the stage to open.

     No school reports also skips the School reports step: CSS greys it, its
     tick is disabled here, and tickCounts leaves it out of the total. */

  function applyRequirements() {
    var step = document.getElementById('step-requirements');
    if (!step) { return; }                                  /* not this guide */

    var reports = state.reqReports;
    var observer = state.reqObserver;
    var answered = (reports === 'yes' || reports === 'no')
      && (observer === 'yes' || observer === 'no');

    var root = document.documentElement;
    root.classList.toggle('req-reports-yes', reports === 'yes');
    root.classList.toggle('req-reports-no', reports === 'no');
    root.classList.toggle('req-met', answered && observer === 'yes');
    root.classList.toggle('req-contact', answered && observer === 'no');

    var box = step.querySelector('[data-step-tick]');
    if (box) {
      box.checked = answered && (observer === 'yes' || !!state.reqSpoken);
      if (state[box.id] !== box.checked) {
        state[box.id] = box.checked;
        writeState(state);
      }
      markCard(box);
    }

    document.querySelectorAll('.req-reports-step .tick input[type="checkbox"]')
      .forEach(function (b) { b.disabled = (reports === 'no'); });

    updateProgress();
  }

  function initRequirements() {
    var step = document.getElementById('step-requirements');
    if (!step) { return; }

    function bind(name, key, onChange) {
      document.querySelectorAll('input[name="' + name + '"]').forEach(function (radio) {
        radio.checked = (radio.value === state[key]);
        radio.addEventListener('change', function () {
          state[key] = this.value;
          onChange();
          writeState(state);
          applyRequirements();
        });
      });
    }

    /* The second question asks something different depending on the first,
       so changing the first clears it, and the contact tick with it. */
    bind('req-reports', 'reqReports', function () {
      delete state.reqObserver;
      delete state.reqSpoken;
      document.querySelectorAll('input[name="req-observer"]')
        .forEach(function (r) { r.checked = false; });
    });
    bind('req-observer', 'reqObserver', function () { delete state.reqSpoken; });

    /* Only reachable in the contact outcome, where the tick is the reader's. */
    var box = step.querySelector('[data-step-tick]');
    if (box) {
      box.addEventListener('change', function () {
        state.reqSpoken = this.checked;
        writeState(state);
      });
    }

    applyRequirements();
  }

  /* ---------- tick boxes ---------- */

  /* Which ticks count toward progress.

     Deliberately does NOT consult ancestor visibility: on the combined guide a
     stage folded shut by the accordion still owes its ticks to the denominator,
     so collapsing a stage must not make the total jump around. Only two things
     genuinely remove a tick from the count. */
  function tickCounts(box) {
    /* Nothing in the registration stage counts once registration is already
       complete. Needed as its own rule: a preset consent branch un-hides
       itself inside the hidden wrapper, so neither the branch check nor the
       label check below would catch it, and the family would be told to
       complete steps they cannot see. */
    if (document.documentElement.classList.contains('reg-complete')
        && box.closest('#step-registration')) { return false; }

    /* On a consent refresh the registration card is hidden by CSS. Needed as
       its own rule because the label check further down cannot see it: the
       computed display of an element inside a display:none ancestor is still
       its own value, not none, so the tick would otherwise be counted and the
       family told to submit a form they cannot see. */
    if (reconsent && box.closest('.card-reg')) { return false; }

    /* A tick inside a consent branch counts only when that branch is chosen. */
    var branch = box.closest('.branch');
    if (branch && branch.hidden) { return false; }

    /* A tick in a Kinder Minds titration step counts only once the family has
       said we are doing the titration. Checked by class rather than by
       visibility, because these steps stay on screen while dimmed — the point
       is that they are readable but not yet in play. */
    if (box.closest('.titr-with-us')
        && !document.documentElement.classList.contains('titr-yes')) { return false; }

    /* On the adult guides the School reports step is skipped when the client
       has none. Checked by class for the same reason as the titration steps:
       the step stays on screen, greyed, so it can still be read. */
    if (box.closest('.req-reports-step')
        && document.documentElement.classList.contains('req-reports-no')) { return false; }

    /* A step removed from this reader's route owes nothing to the total. The
       [hidden] attribute on the <li> is the test, not computed display: a step
       folded shut by the accordion hides its body, never itself, so folding
       still must not move the denominator. */
    var step = box.closest('.task-steps > li');
    if (step && step.hidden) { return false; }

    /* Leaflet mode hides the tick's own label via stylesheet. */
    var label = box.closest('.tick');
    if (label && window.getComputedStyle(label).display === 'none') { return false; }

    return true;
  }

  function visibleTicks() {
    return Array.prototype.filter.call(
      document.querySelectorAll('.tick input[type="checkbox"]'), tickCounts
    );
  }

  function markCard(box) {
    var card = box.closest('.form-card');
    if (card) { card.classList.toggle('done', box.checked); }

    var step = box.closest('.task-steps > li');
    /* Only the step's own summary tick colours the whole step. */
    if (step && box.hasAttribute('data-step-tick')) {
      step.classList.toggle('done', box.checked);
    }
  }

  function updateProgress() {
    var boxes = visibleTicks();
    var done = boxes.filter(function (b) { return b.checked; }).length;
    var total = boxes.length;
    var pct = total ? Math.round((done / total) * 100) : 0;

    var fill = document.getElementById('progress-fill');
    var label = document.getElementById('progress-label');
    if (fill) { fill.style.width = pct + '%'; }
    if (label) {
      label.textContent = done + ' of ' + total + ' steps complete';
    }
  }

  function initTicks() {
    document.querySelectorAll('.tick input[type="checkbox"]').forEach(function (box) {
      if (!box.id) { return; }
      box.checked = !!state[box.id];
      markCard(box);

      box.addEventListener('change', function () {
        state[this.id] = this.checked;
        writeState(state);
        markCard(this);
        updateProgress();
      });
    });

    updateProgress();
  }

  /* ---------- reset ---------- */

  function initReset() {
    var btn = document.getElementById('reset-progress');
    if (!btn) { return; }

    btn.addEventListener('click', function () {
      if (!window.confirm('Clear your ticked steps on this device? The forms you have already submitted are not affected.')) {
        return;
      }
      try { window.localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
      state = {};

      document.querySelectorAll('.tick input[type="checkbox"]').forEach(function (box) {
        box.checked = false;
        markCard(box);
      });
      document.querySelectorAll('input[name="age-consent"]').forEach(function (r) {
        r.checked = false;
      });
      applyBranch(null);
      document.querySelectorAll('input[name="titration-choice"]').forEach(function (r) {
        r.checked = false;
      });
      applyTitration(null);
      document.querySelectorAll('input[name="req-reports"], input[name="req-observer"]')
        .forEach(function (r) { r.checked = false; });
      applyRequirements();

      /* Each apply above refreshes the count only on a page that has its
         question. The adult Post-Diagnostic Support page has none of them,
         so without this its label kept the old total after a reset. */
      updateProgress();
    });
  }

  /* ---------- go ---------- */

  document.addEventListener('DOMContentLoaded', function () {
    applyAudience();        /* first: it decides which registration step exists */
    applyName();
    applyLinks();
    initBranch();
    initTitration();
    initTicks();
    initRequirements();     /* after initTicks: the answers decide its tick */
    initReset();
  });
})();
