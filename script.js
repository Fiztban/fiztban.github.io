document.addEventListener('DOMContentLoaded', function() {
    const navElements = document.querySelectorAll('[data-target]');
    const sections = document.querySelectorAll('main > section');
    const check = document.getElementById('check'); // Get the checkbox element
    const lookup = {
      '#home': 'sec-home',
      '#contact': 'sec-home',
      '#sec-service': 'sec-service',
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
        // Ensure the browser has time to render the section before scrolling
        setTimeout(() => {
          const element = document.querySelector(currentHash);
          if (element) {
            element.scrollIntoView({ behavior: 'smooth' });
          }
        }, 100); // A slight delay to ensure the section is visible
      } else {
        hideAllSectionsExcept('sec-home');
      }
    }
  
    // Listen to hash change events
    window.addEventListener('hashchange', handleHashChange);
  
    // Initial check for hash in URL on load
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
          window.location.hash = anchorId; // Update the URL hash
        }
  
        // Uncheck the checkbox when a nav-link is clicked
        check.checked = false;
      });
    });
  });
  