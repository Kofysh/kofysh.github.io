/* Accueil animé : décoratif, bref et sans bloquer le chargement du blog. */
(function () {
  'use strict';
  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (reducedMotion.matches || document.getElementById('kofy-splash')) return;
  try {
    if (sessionStorage.getItem('kofy-intro-seen') === '1') return;
    sessionStorage.setItem('kofy-intro-seen', '1');
  } catch (_) {
    // Le site reste utilisable lorsque le stockage du navigateur est désactivé.
  }

  var script = document.currentScript;
  var logoUrl = script && script.getAttribute('data-logo');
  if (!logoUrl) return;
  var splash = document.createElement('div');
  splash.id = 'kofy-splash';
  splash.setAttribute('aria-hidden', 'true');
  var mark = document.createElement('div');
  mark.className = 'kofy-splash__mark';
  var logo = document.createElement('img');
  logo.src = logoUrl;
  logo.alt = '';
  logo.width = 88;
  logo.height = 88;
  logo.decoding = 'async';
  var caption = document.createElement('div');
  caption.className = 'kofy-splash__caption';
  caption.textContent = 'Blog de Kofy';
  mark.appendChild(logo);
  splash.appendChild(mark);
  splash.appendChild(caption);

  var timer;
  function finish() {
    clearTimeout(timer);
    splash.remove();
    document.removeEventListener('keydown', skip);
    reducedMotion.removeEventListener('change', onMotionChange);
  }
  function skip(event) {
    if (event.key === 'Escape' || event.key === 'Tab') finish();
  }
  function onMotionChange(event) {
    if (event.matches) finish();
  }
  splash.addEventListener('animationend', function (event) {
    if (event.target === splash) finish();
  });
  logo.addEventListener('error', finish, { once: true });
  document.addEventListener('keydown', skip);
  reducedMotion.addEventListener('change', onMotionChange);
  document.body.appendChild(splash);
  // Secours si une extension empêche l’événement de fin d’animation.
  timer = setTimeout(finish, 1800);
})();
