/* Masthead behaviour for index-v2.html.
 *
 * Two states, decided independently of each other:
 *
 *   .is-condensed    the page has scrolled, so the gradient band and the logo
 *                    both shrink. The links stay horizontal.
 *   .nav-collapsed   the links no longer fit beside the logo, so they give way
 *                    to the circular burger and open as a drawer instead.
 *
 * So a scrolled desktop is condensed but not collapsed; a phone is both.
 *
 * Everything here is enhancement. With JS off the stylesheet still collapses
 * the nav below 1080px, which is the width that actually matters - this only
 * has to catch the widths above that, where whether the links fit depends on
 * how long the link text is rather than on a number picked in advance.
 */

document.addEventListener('DOMContentLoaded', function () {
  var header = document.getElementById('site-header');
  if (!header) return;

  var list = header.querySelector('.nav-list > ul');
  var check = document.getElementById('check');

  /* ------------------------------------------------------------- condense */

  /* Past this many pixels the chrome shrinks. Set well clear of the
     rubber-band overscroll that would otherwise flap the state on touch. */
  var CONDENSE_AT = 40;

  var condensed = null;
  var scrollQueued = false;

  function readScroll() {
    scrollQueued = false;
    var want = window.scrollY > CONDENSE_AT;
    if (want === condensed) return;   /* nothing to do - avoids layout churn */
    condensed = want;
    header.classList.toggle('is-condensed', want);
  }

  function onScroll() {
    if (scrollQueued) return;
    scrollQueued = true;
    window.requestAnimationFrame(readScroll);
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  readScroll();   /* a reload partway down the page starts condensed */

  /* ------------------------------------------------------------- collapse */

  /* Measured rather than guessed at a breakpoint, so adding a nav item moves
     the threshold by itself.
     Summing the items instead of reading scrollWidth because the nav cannot be
     overflow:hidden - that would clip the dropdowns - and scrollWidth is not
     dependable on an overflow:visible box. */

  var BREATHING_ROOM = 8;   /* px, so it flips just before links meet the logo */

  function fit() {
    if (!list) return;

    var was = header.classList.contains('nav-collapsed');

    /* Measure in the uncollapsed layout, then put the class back. Both happen
       in one task, so the browser never paints the intermediate state. */
    header.classList.remove('nav-collapsed');

    var style = window.getComputedStyle(list);
    var available = list.clientWidth
      - (parseFloat(style.paddingLeft) || 0)
      - (parseFloat(style.paddingRight) || 0);

    var needed = 0;
    for (var i = 0; i < list.children.length; i++) {
      needed += list.children[i].offsetWidth;
    }

    var overflows = needed + BREATHING_ROOM > available;
    header.classList.toggle('nav-collapsed', overflows);

    /* Only when the layout actually flips - a drawer left open across that
       change would reappear detached from the burger that opened it. Doing it
       on every fit() would instead slam the drawer shut on the re-measure that
       follows the webfont landing, which happens well after a fast reader can
       have opened it. */
    if (overflows !== was && check) check.checked = false;
  }

  var fitQueued = false;

  function onResize() {
    if (fitQueued) return;
    fitQueued = true;
    window.requestAnimationFrame(function () {
      fitQueued = false;
      fit();
    });
  }

  fit();

  /* Text metrics change when the webfont lands, which moves the threshold. */
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(fit).catch(function () { /* nothing to recover */ });
  }

  /* Deliberately window resize rather than a ResizeObserver on the header:
     collapsing changes the header's own height, so observing it would feed
     straight back into itself. Viewport width is the real driver anyway. */
  window.addEventListener('resize', onResize);

  /* ------------------------------------------------- drawer dismissal ---- */
  /* script.js already closes the drawer when a link inside it is used. These
     cover the two ways out that do not involve picking anything. */

  document.addEventListener('click', function (event) {
    if (!check || !check.checked) return;
    if (!header.contains(event.target)) check.checked = false;
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && check && check.checked) check.checked = false;
  });
});
