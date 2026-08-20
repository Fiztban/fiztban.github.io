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

  /* The about-the-assessment panel behaves like a stage — collapsible, with its
     own tick — but sits outside the numbered sequence, so it is handled
     separately everywhere stages() is used. */
  function panel() { return document.getElementById('about-assessment'); }

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

  /* A stage is outstanding when it has a summary tick that is not yet ticked
     and is actually in play (its consent branch chosen, if it has one). */
  function outstanding(li) {
    var ticks = li.querySelectorAll('[data-step-tick]');
    for (var i = 0; i < ticks.length; i++) {
      var t = ticks[i];
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

    setOpen(panel(), showPanel);

    var target = showPanel ? null : firstOutstanding();
    all.forEach(function (li) { setOpen(li, li === target); });
  }

  function allOpen() {
    return stages().every(isOpen) && isOpen(panel());
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
      li.scrollIntoView({ behavior: 'smooth', block: 'center' });
      li.classList.remove('just-linked');
      void li.offsetWidth;                 /* restart the flash */
      li.classList.add('just-linked');
      return true;
    }

    document.querySelectorAll('a[href^="#step-"]').forEach(function (a) {
      a.addEventListener('click', function (e) {
        var id = this.getAttribute('href').slice(1);
        if (reveal(id)) { e.preventDefault(); }
      });
    });

    /* Someone may arrive on a link that already carries a step fragment. */
    if (/^#step-[\w-]+$/.test(window.location.hash)) {
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
      out.set('dx', 'km');

      var qs = out.toString();
      a.href = a.getAttribute('data-service-link') + (qs ? '?' + qs : '');
    });
  }

  function init() {
    var all = stages();
    if (!all.length) { return; }

    all.concat([panel()]).forEach(function (li) {
      if (!li) { return; }
      var h = head(li);
      if (!h) { return; }

      h.addEventListener('click', function () {
        var nowOpen = !isOpen(li);
        setOpen(li, nowOpen);
        if (li === panel()) { writePanelPref(nowOpen); }
        syncExpandAll();
      });
    });

    /* Ticking "I have read the assessment process" folds the panel and moves on. */
    var read = document.getElementById('step-read');
    if (read) {
      read.addEventListener('change', function () {
        var p = panel();
        if (p) { p.classList.toggle('done', this.checked); }
        if (!this.checked) { return; }
        /* Fold it and move on, and remember that it is shut — but only because
           the reader ticked it, never as a side effect of anything else. */
        window.setTimeout(function () {
          setOpen(p, false);
          writePanelPref(false);
          var next = firstOutstanding();
          if (next) {
            setOpen(next, true);
            next.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
          syncExpandAll();
        }, 220);
      });
      var p0 = panel();
      if (p0) { p0.classList.toggle('done', read.checked); }
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
        stages().concat([panel()]).forEach(function (li) {
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
