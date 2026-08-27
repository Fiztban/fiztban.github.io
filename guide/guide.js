/* ==========================================================================
   Kinder Minds — guide accordion

   Runs after intake.js (which owns names, form links, ticks and progress) and
   adds one thing: every stage folds open and shut from its numbered header.

   Why: the guide runs to ~6,400px fully expanded. Families using it have
   attention and executive-function difficulties by definition, so the default
   view opens exactly one stage — the next thing they have to do — and leaves
   everything else shut but one click away.

   Progress counting deliberately ignores fold state (see tickCounts in
   intake.js), so the denominator never moves when a stage is folded.
   ========================================================================== */

(function () {
  'use strict';

  function stages() {
    return Array.prototype.slice.call(document.querySelectorAll('.task-steps > li'));
  }

  /* The about-the-assessment panels behave like stages — collapsible, sharing
     one tick — but sit outside the numbered sequence, so they are handled
     separately everywhere stages() is used.
     Selected by class, not id: most guides carry a single panel, but the
     titration guide splits its introduction into three (the clinic, the
     consultation, titration and monitoring). One panel is simply an array of
     one, so nothing changes for the other guides. */
  function panels() {
    return Array.prototype.slice.call(document.querySelectorAll('.intro-panel'));
  }

  function panelRead() {
    var t = document.getElementById('step-read');
    return !!t && t.checked;
  }

  /* The panel opens the first time a link is used, and after that remembers
     whatever the reader last chose. Stored separately from tick state: this is
     a view preference, not progress, so Reset deliberately leaves it alone. */
  function panelKey() {
    var seed = window.location.search || 'plain';
    var hash = 0;
    for (var i = 0; i < seed.length; i++) {
      hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
    }
    return 'km-guide-panel-' + (hash >>> 0).toString(36);
  }

  function readPanelPref() {
    try {
      var v = window.localStorage.getItem(panelKey());
      return v === null ? null : v === '1';       /* null = never opened before */
    } catch (e) {
      return null;
    }
  }

  function writePanelPref(open) {
    try { window.localStorage.setItem(panelKey(), open ? '1' : '0'); } catch (e) { /* ignore */ }
  }

  function head(li) { return li.querySelector('.stage-head'); }
  function body(li) { return li.querySelector('.stage-body'); }

  function setOpen(li, open) {
    var h = head(li), b = body(li);
    if (!h || !b) { return; }
    h.setAttribute('aria-expanded', open ? 'true' : 'false');
    b.hidden = !open;
  }

  function isOpen(li) {
    var h = head(li);
    return !!h && h.getAttribute('aria-expanded') === 'true';
  }

  /* Whether a stage is on the page at all for this reader.

     Steps come and go: dx hides the outside-diagnosis steps, and the titration
     fork replaces four steps with one. Opening a step nobody can see reads as
     nothing having happened, which is worse than opening the wrong one — so
     these are excluded before anything is chosen as "next".

     Folding does not interfere: a folded stage hides its .stage-body, never
     the <li>, so a stage the reader collapsed still counts as in play. */
  function inPlay(li) {
    if (li.hidden) { return false; }
    if (window.getComputedStyle(li).display === 'none') { return false; }

    /* Registration is already held when we made the diagnosis ourselves. */
    if (li.id === 'step-registration'
        && document.documentElement.classList.contains('reg-complete')) { return false; }

    return true;
  }

  /* A stage is outstanding when it has a summary tick that is not yet ticked
     and is actually in play (its consent branch chosen, if it has one; its
     tick enabled, which the titration steps are not until the fork is
     answered). */
  function outstanding(li) {
    if (!inPlay(li)) { return false; }

    var ticks = li.querySelectorAll('[data-step-tick]');
    for (var i = 0; i < ticks.length; i++) {
      var t = ticks[i];
      if (t.disabled) { continue; }
      var branch = t.closest('.branch');
      if (branch && branch.hidden) { continue; }
      if (!t.checked) { return true; }
    }
    return false;
  }

  function firstOutstanding() {
    var all = stages();
    for (var i = 0; i < all.length; i++) {
      if (outstanding(all[i])) { return all[i]; }
    }
    return null;
  }

  /* Open the next thing to do; fold everything else. In leaflet mode nothing is
     outstanding, so open the service information — the substance of the page —
     rather than the referral stage that happens to be first. */
  /* The panel is open on a link's first use and remembered thereafter. When it
     is shut, attention goes to the next outstanding stage instead. */
  function openDefault() {
    var all = stages();
    var pref = readPanelPref();
    var showPanel = (pref === null) ? true : pref;

    panels().forEach(function (p) { setOpen(p, showPanel); });

    var target = showPanel ? null : firstOutstanding();
    all.forEach(function (li) { setOpen(li, li === target); });
  }

  function allOpen() {
    return stages().every(isOpen) && panels().every(isOpen);
  }

  function syncExpandAll() {
    var btn = document.getElementById('expand-all');
    if (btn) { btn.textContent = allOpen() ? 'Collapse all' : 'Expand all'; }
  }


  /* ---------- form ticks and their summary tick stay in step ----------

     Inside a consent branch the individual "Submitted" ticks and the
     "All my registration forms are submitted" tick describe the same fact, so
     they are kept consistent in both directions:

       every form ticked        -> the summary ticks itself
       any form unticked        -> the summary unticks itself
       summary ticked/unticked  -> every form in that branch follows

     Only the chosen branch is touched, so the under-16 and 16-plus sets never
     interfere with each other. Changes are applied by dispatching a real change
     event so intake.js still persists them and recounts progress; a guard stops
     the two directions from re-triggering each other. */

  var syncing = false;

  function groupFor(box) {
    var branch = box.closest('.branch');
    if (!branch) { return null; }

    var summary = branch.querySelector('[data-step-tick]');
    var forms = Array.prototype.slice.call(
      branch.querySelectorAll('.form-card .tick input[type="checkbox"]'));

    return (summary && forms.length) ? { summary: summary, forms: forms } : null;
  }

  function setChecked(box, value) {
    if (box.checked === value) { return; }
    box.checked = value;
    box.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function initTickSync() {
    document.querySelectorAll('.branch').forEach(function (branch) {
      var g = groupFor(branch.querySelector('input[type="checkbox"]') || branch);
      if (!g) { return; }

      g.forms.forEach(function (form) {
        form.addEventListener('change', function () {
          if (syncing) { return; }
          syncing = true;
          setChecked(g.summary, g.forms.every(function (f) { return f.checked; }));
          syncing = false;
        });
      });

      g.summary.addEventListener('change', function () {
        if (syncing) { return; }
        syncing = true;
        var want = g.summary.checked;
        g.forms.forEach(function (f) { setChecked(f, want); });
        syncing = false;
      });

      /* Restored state could already disagree — reconcile once, quietly. */
      syncing = true;
      setChecked(g.summary, g.forms.every(function (f) { return f.checked; }));
      syncing = false;
    });
  }

  /* A cross-reference to another stage should open it, not just scroll to a
     collapsed header the reader then has to click. */
  function initStepLinks() {
    function reveal(id) {
      var li = document.getElementById(id);
      if (!li) { return false; }
      setOpen(li, true);
      syncExpandAll();

      /* Centring only works for something that fits on screen. An introduction
         panel is taller than the viewport the moment it opens, so centring it
         puts its heading off the top — which reads as overshooting the link.
         Anchor tall targets to their top instead; the [id] scroll-margin-top
         already clears the fixed masthead and the sticky progress bar.
         Measured after setOpen, because a shut element has no height. */
      var tall = li.getBoundingClientRect().height > window.innerHeight * 0.8;
      li.scrollIntoView({ behavior: 'smooth', block: tall ? 'start' : 'center' });
      li.classList.remove('just-linked');
      void li.offsetWidth;                 /* restart the flash */
      li.classList.add('just-linked');
      return true;
    }

    /* #about- covers the introduction panels, which fold exactly like stages.
       Without this a link to a shut panel scrolls to a closed header and looks
       broken. */
    document.querySelectorAll('a[href^="#step-"], a[href^="#about-"]').forEach(function (a) {
      a.addEventListener('click', function (e) {
        var id = this.getAttribute('href').slice(1);
        if (reveal(id)) { e.preventDefault(); }
      });
    });

    renumberStepLinks();

    /* Someone may arrive on a link that already carries a step fragment. */
    if (/^#(step|about)-[\w-]+$/.test(window.location.hash)) {
      window.setTimeout(function () { reveal(window.location.hash.slice(1)); }, 60);
    }
  }

  /* Cross-links to another service's guide carry the client's details, so a
     family moving from an assessment to the Titration Clinic does not land on
     an impersonal page. dx=km is added because reaching this link means we made
     the diagnosis — which is also what tells the titration page that
     registration is already complete. Form links are deliberately NOT carried:
     they belong to the assessment, not to titration. */
  function initServiceLinks() {
    var here = new URLSearchParams(window.location.search);

    document.querySelectorAll('a[data-service-link]').forEach(function (a) {
      var out = new URLSearchParams();
      ['name', 'ref'].forEach(function (k) {
        var v = (here.get(k) || '').trim();
        if (v) { out.set(k, v); }
      });
      /* Any extra parameters are declared on the link itself. Assuming them
         here sent dx=km — a titration-only value — onto assessment links. */
      var extra = a.getAttribute('data-service-params') || '';
      extra.split('&').forEach(function (pair) {
        var bits = pair.split('=');
        if (bits[0] && bits[1]) { out.set(bits[0].trim(), bits[1].trim()); }
      });

      var qs = out.toString();
      a.href = a.getAttribute('data-service-link') + (qs ? '?' + qs : '');
    });
  }

  /* "step 4" in prose has to mean whatever that stage is actually numbered,
     and stages can disappear — the previous-diagnosis stage is removed when we
     made the diagnosis ourselves, renumbering everything after it. Rather than
     maintain the numbers by hand across four pages, each link is rewritten from
     its target's real position among the stages that rendered. */
  function renumberStepLinks() {
    var visible = stages().filter(function (li) {
      return window.getComputedStyle(li).display !== 'none';
    });

    document.querySelectorAll('a[href^="#step-"]').forEach(function (a) {
      var target = document.getElementById(a.getAttribute('href').slice(1));
      var index = visible.indexOf(target);
      if (index === -1) { return; }

      var n = index + 1;
      var text = a.textContent.trim();

      if (/^\d+$/.test(text)) {
        a.textContent = String(n);
      } else if (/^step\s+\d+$/i.test(text)) {
        a.textContent = text.replace(/\d+/, String(n));
      }
    });
  }

  function init() {
    var all = stages();
    if (!all.length) { return; }

    all.concat(panels()).forEach(function (li) {
      if (!li) { return; }
      var h = head(li);
      if (!h) { return; }

      h.addEventListener('click', function () {
        var nowOpen = !isOpen(li);
        setOpen(li, nowOpen);
        if (panels().indexOf(li) !== -1) { writePanelPref(nowOpen); }
        syncExpandAll();
      });
    });

    /* Ticking "I have read the assessment process" folds the panel and moves on. */
    var read = document.getElementById('step-read');
    if (read) {
      read.addEventListener('change', function () {
        var checked = this.checked;
        panels().forEach(function (p) { p.classList.toggle('done', checked); });
        if (!checked) { return; }
        /* Fold them and move on, and remember they are shut — but only because
           the reader ticked it, never as a side effect of anything else. */
        window.setTimeout(function () {
          panels().forEach(function (p) { setOpen(p, false); });
          writePanelPref(false);
          var next = firstOutstanding();
          if (next) {
            setOpen(next, true);
            next.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
          syncExpandAll();
        }, 220);
      });
      panels().forEach(function (p) { p.classList.toggle('done', read.checked); });
    }

    /* When a stage's summary tick completes it, fold it and open whatever is
       next — the "done, what now" gesture, without a scroll hunt. */
    document.querySelectorAll('[data-step-tick]').forEach(function (t) {
      t.addEventListener('change', function () {
        if (!this.checked) { return; }
        var li = this.closest('.task-steps > li');

        window.setTimeout(function () {
          if (li && !outstanding(li)) { setOpen(li, false); }
          var next = firstOutstanding();
          if (next) {
            setOpen(next, true);
            next.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
          syncExpandAll();
        }, 220);
      });
    });

    /* Choosing a consent branch changes which stages are outstanding. */
    document.querySelectorAll('input[name="age-consent"]').forEach(function (r) {
      r.addEventListener('change', syncExpandAll);
    });

    var btn = document.getElementById('expand-all');
    if (btn) {
      btn.addEventListener('click', function () {
        var open = !allOpen();
        stages().concat(panels()).forEach(function (li) {
          if (li) { setOpen(li, open); }
        });
        writePanelPref(open);
        syncExpandAll();
      });
    }

    initStepLinks();
    initServiceLinks();
    initTickSync();

    openDefault();
    syncExpandAll();
  }

  /* intake.js also listens for DOMContentLoaded and is loaded first, so its
     saved ticks are already restored by the time this runs. */
  document.addEventListener('DOMContentLoaded', init);
})();
