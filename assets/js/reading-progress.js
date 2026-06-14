/* ==================================================
   Barre de progression de lecture — Blog de Kofy
   Affiche une fine barre en haut indiquant la position
   de défilement. Naturellement invisible (largeur 0)
   sur les pages trop courtes pour défiler.
   ================================================== */
(function () {
  'use strict';

  function init() {
    var bar = document.createElement('div');
    bar.id = 'reading-progress';
    bar.setAttribute('aria-hidden', 'true');
    document.body.appendChild(bar);

    var ticking = false;

    function update() {
      var doc = document.documentElement;
      var scrollable = doc.scrollHeight - doc.clientHeight;
      var pct = scrollable > 0 ? (doc.scrollTop / scrollable) * 100 : 0;
      bar.style.width = pct + '%';
      ticking = false;
    }

    function onScroll() {
      if (!ticking) {
        window.requestAnimationFrame(update);
        ticking = true;
      }
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    update();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
