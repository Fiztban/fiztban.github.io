/* ==========================================================================
   Kinder Minds — Interactive intake guide

   Three jobs:
     1. Read the client's form links out of the URL query string.
     2. Branch the registration step on the age-16 consent question.
     3. Remember ticked steps in localStorage so the family can come back.

   No dependencies, no build step, no data ever leaves the browser.

   URL PARAMETERS
     name    first name used to personalise the page
     client  the client's Zanda profile hash        e.g. client=0WtS5PDCOQI
     reg     registration form number, or full URL  e.g. reg=2831
     c1      consent form — guardian 1 / patient    e.g. c1=2832
     c2      consent form — guardian 2 (under 16)   e.g. c2=2833
     age     optional preset: "16plus" or "under16"

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

  /* ---------- personalisation ---------- */

  var rawName = (params.get('name') || '').trim().slice(0, 40);

  function applyName() {
    /* textContent everywhere — never innerHTML — so a name from the query
       string can never inject markup. */
    var display = rawName || 'your child';
    document.querySelectorAll('[data-name-slot]').forEach(function (el) {
      el.textContent = display;
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

    var notice = document.getElementById('default-links-notice');
    if (notice && anyLinkSupplied) { notice.hidden = true; }
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

    /* Ticks inside a hidden branch must not count toward progress. */
    updateProgress();
  }

  function initBranch() {
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

  /* ---------- tick boxes ---------- */

  function visibleTicks() {
    return Array.prototype.filter.call(
      document.querySelectorAll('.tick input[type="checkbox"]'),
      function (box) {
        /* offsetParent is null when the element or an ancestor is hidden */
        return box.offsetParent !== null;
      }
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
    });
  }

  /* ---------- go ---------- */

  document.addEventListener('DOMContentLoaded', function () {
    applyName();
    applyLinks();
    initBranch();
    initTicks();
    initReset();
  });
})();
