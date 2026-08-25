document.addEventListener('DOMContentLoaded', function() {
  const navElements = document.querySelectorAll('[data-target], .nav-list > ul > li > a');
  const sections = document.querySelectorAll('main > section');
  const check = document.getElementById('check');
  const lookup = {
    '#sec-service': 'sec-service',
    '#sec-team': 'sec-team',
    '#sec-about': 'sec-about',
    '#home': 'sec-home',
    '#contact': 'sec-home',
    '#service-overview' : 'sec-home',
    '#services': 'sec-service',
    '#approach': 'sec-service',
    '#about': 'sec-about',
    '#who': 'sec-about',
    '#mission': 'sec-about',
    '#grow-km': 'sec-about',
    '#team': 'sec-team',
    '#sarah': 'sec-team',
    '#edoardo': 'sec-team',
    '#neve': 'sec-team',
    '#kezia': 'sec-team',
    '#chris': 'sec-team'
  };

  function hideAllSectionsExcept(exceptId) {
    sections.forEach(section => {
      section.classList.add('hidden');
    });
    const targetSection = document.getElementById(exceptId);
    if (targetSection) {
      targetSection.classList.remove('hidden');
    }
  }

  function handleHashChange() {
    const currentHash = window.location.hash;
    const targetSectionId = lookup[currentHash];
    if (targetSectionId) {
      hideAllSectionsExcept(targetSectionId);
      setTimeout(() => {
        const element = document.querySelector(currentHash);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth' });
        }
      }, 100);
    } else {
      hideAllSectionsExcept('sec-home');
    }
  }

  window.addEventListener('hashchange', handleHashChange);

  if (window.location.hash) {
    handleHashChange();
  } else {
    hideAllSectionsExcept('sec-home');
  }

  navElements.forEach(element => {
    element.addEventListener('click', function(event) {
      const hrefAttribute = this.getAttribute('href');
      if (hrefAttribute === "") {
        event.preventDefault(); // Stop the function if href is empty
        return false; // Ensures that no further actions take place
      }

      const hashIndex = hrefAttribute.indexOf('#');
      const hasHash = hashIndex !== -1;

      if (hasHash) {
        event.preventDefault();
        const anchorId = hrefAttribute.substring(hashIndex);
        window.location.hash = anchorId;
      }

      check.checked = false;
    });
  });

  // Carousel arrows. The strip already scrolls and snaps by itself, so this is
  // enhancement only - without it you can still swipe or drag through the photos.
  document.querySelectorAll('.carousel').forEach(carousel => {
    const track = carousel.querySelector('.carousel__track');
    const prev = carousel.querySelector('.carousel__arrow--prev');
    const next = carousel.querySelector('.carousel__arrow--next');
    if (!track || !prev || !next) return;

    // Wraps at both ends: forward from the last photo returns to the first,
    // back from the first jumps to the last.
    const step = direction => () => {
      const page = track.clientWidth;
      const end = track.scrollWidth - page;
      const at = track.scrollLeft;
      let target;

      if (direction > 0) {
        target = at >= end - 1 ? 0 : at + page;
      } else {
        target = at <= 1 ? end : at - page;
      }

      track.scrollTo({ left: target, behavior: 'smooth' });
    };

    prev.addEventListener('click', step(-1));
    next.addEventListener('click', step(1));
  });
});


/* Dated copy.

   An element carrying data-show-until="YYYY-MM-DD" is removed from the page
   once that date arrives; one carrying data-show-from="YYYY-MM-DD" appears on
   it. Used for the ADHD Titration Clinic, so the "new service model"
   announcement retires itself and the plain description takes over without
   anyone having to remember.

   The page ships in its CURRENT state: the show-until copy is visible in the
   HTML and the show-from copy carries the `hidden` attribute. So if this never
   runs - no JS, a script error above it - the page is still correct today, and
   only the future swap is lost. That is the safe direction to fail in.

   Dates are read as local midnight rather than UTC, so the swap happens at the
   start of that day in the reader's own timezone, not at 1pm the day before in
   New Zealand. The clock is the reader's, which is fine for marketing copy and
   would not be for anything that mattered. */
(function () {
  const midnight = value => {
    const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
    if (!parts) return null;
    return new Date(+parts[1], +parts[2] - 1, +parts[3]);
  };

  const now = new Date();

  document.querySelectorAll('[data-show-until]').forEach(el => {
    const date = midnight(el.dataset.showUntil);
    if (date && now >= date) el.hidden = true;
  });

  document.querySelectorAll('[data-show-from]').forEach(el => {
    const date = midnight(el.dataset.showFrom);
    if (date && now >= date) el.hidden = false;
  });
})();
