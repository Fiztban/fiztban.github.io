document.addEventListener('DOMContentLoaded', function() {
    const checkButton = document.getElementById('check');
    const navList = document.querySelector('.nav-list');

    checkButton.addEventListener('change', function() {
        if (this.checked) {
            navList.classList.add('nav-list-visible');
        } else {
            navList.classList.remove('nav-list-visible');
        }
    });

    // ... rest of your code ...
});
