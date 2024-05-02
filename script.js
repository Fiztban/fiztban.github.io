document.addEventListener('DOMContentLoaded', function() {
  const navElements = document.querySelectorAll('[data-target]');
  const sections = document.querySelectorAll('main > section');
  const check = document.getElementById('check'); // Get the checkbox element
  const lookup = {
    '#sec-service': 'sec-service',
    '#sec-team': 'sec-team',
    '#sec-about': 'sec-about',
    '#home': 'sec-home',
    '#contact': 'sec-home',
    '#expertise': 'sec-service',
    '#approach': 'sec-service',
    '#about': 'sec-about',
    '#who': 'sec-about',
    '#mission': 'sec-about',
    '#grow-km': 'sec-about',
    '#team': 'sec-team',
    '#sarah': 'sec-team',
    '#edoardo': 'sec-team'
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

  // New functionality for mobile navigation
  if (window.innerWidth <= 1080) {
      const hasSubmenu = document.querySelectorAll('.has-submenu');
      hasSubmenu.forEach(function(item) {
          item.addEventListener('click', function(e) {
              const submenu = this.querySelector('ul');
              if (submenu.style.display === 'block') {
                  submenu.style.display = 'none';
              } else {
                  e.preventDefault(); // Prevent navigation
                  submenu.style.display = 'block';
              }
          });
      });
  }
});
