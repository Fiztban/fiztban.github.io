/* Masthead v2 — condense on scroll.
 *
 * The condense half of header-v2.js, without the nav. There is no collapse
 * logic here because there are no links to run out of room: the guides carry
 * a gradient band and a logo and nothing else.
 *
 * Everything is enhancement. With JS off the bar simply stays at its full
 * height, which is the correct-looking fallback rather than a broken one.
 */
(function () {
  'use strict';

  function init() {
    var header = document.getElementById('site-header');
    if (!header) { return; }

    /* Past this many pixels the chrome shrinks. Set well clear of the
       rubber-band overscroll that would otherwise flap the state on touch. */
    var CONDENSE_AT = 40;

    var condensed = null;      /* null so the first read always applies */
    var queued = false;

    function read() {
      queued = false;
      var want = window.scrollY > CONDENSE_AT;
      if (want === condensed) { return; }   /* avoids needless layout churn */
      condensed = want;
      header.classList.toggle('is-condensed', want);
    }

    function onScroll() {
      if (queued) { return; }
      queued = true;
      window.requestAnimationFrame(read);
    }

    window.addEventListener('scroll', onScroll, { passive: true });

    /* A reload partway down the page must start condensed, not animate into
       it — otherwise the bar drops to full height and snaps back on first
       touch of the wheel. */
    read();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
