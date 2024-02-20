document.addEventListener('DOMContentLoaded', function() {
  const navElements = document.querySelectorAll('[data-target]');
  const sections = document.querySelectorAll('main > section');
  const check = document.getElementById('check'); // Get the checkbox element

  function hideAllSectionsExcept(exceptId) {
      sections.forEach(section => {
          section.classList.add('hidden');
      });
      const targetSection = document.getElementById(exceptId);
      if (targetSection) {
          targetSection.classList.remove('hidden');
          // Scroll to the target section if it's not 'sec-home'
          if (exceptId !== 'sec-home') {
              targetSection.scrollIntoView({ behavior: 'smooth' });
          }
      }
  }

  // Initially hide all sections except 'sec-home'
  hideAllSectionsExcept('sec-home');

  navElements.forEach(element => {
      element.addEventListener('click', function(event) {
          const targetId = this.getAttribute('data-target');
          const hrefAttribute = this.getAttribute('href');
          const hashIndex = hrefAttribute.indexOf('#');
          const hasHash = hashIndex !== -1;

          hideAllSectionsExcept(targetId);

          if (hasHash) {
              event.preventDefault();
              const anchorId = hrefAttribute.substring(hashIndex);
              const anchorElement = document.querySelector(anchorId);
              if (anchorElement) {
                  setTimeout(() => {
                      anchorElement.scrollIntoView({ behavior: 'smooth' });
                  }, 300); // Adjust timing as needed
              }
          }

          // Uncheck the checkbox when a nav-link is clicked
          check.checked = false;
      });
  });

  // Add click listener for unchecking the checkbox when clicking outside the header
  document.addEventListener('click', function(e) {
      var header = document.querySelector('header');
      // If the click happened outside of the header
      if (!header.contains(e.target)) {
          check.checked = false;
      }
  });

  // Ensure that clicking on the label does not propagate and trigger the document click listener
  document.querySelector('.check-button').addEventListener('click', function(e) {
      e.stopPropagation();
  });
});
