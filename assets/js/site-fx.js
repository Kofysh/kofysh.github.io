/* ==================================================================
   Effets 3D du blog — hero accueil, tilt des cartes, halo curseur.
   ================================================================== */
(function () {
  'use strict';

  var reduce = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fine = window.matchMedia &&
    window.matchMedia('(pointer: fine)').matches;

  function isHome() {
    var path = (window.location.pathname || '/').replace(/\/+$/, '') || '/';
    return path === '' || path === '/' || /\/index\.html$/i.test(path);
  }

  function injectHero() {
    if (!isHome()) return;
    var list = document.getElementById('post-list');
    if (!list || document.querySelector('.kofy-hero')) return;

    var hero = document.createElement('section');
    hero.className = 'kofy-hero';
    hero.setAttribute('aria-label', 'Introduction');
    hero.innerHTML =
      '<div class="kofy-hero__scene" id="kofy-hero-scene">' +
        '<div class="kofy-hero__orb" aria-hidden="true"></div>' +
        '<div class="kofy-hero__copy">' +
          '<p class="kofy-hero__kicker">Homelab · Linux · auto-hébergement</p>' +
          '<h1>Le rack, documenté.</h1>' +
          '<p>Tutoriels Proxmox, réseau et cybersécurité — du lab jusqu’à la prod, sans folklore.</p>' +
        '</div>' +
        '<div class="kofy-hero__term" id="hero-term" aria-live="polite"></div>' +
      '</div>';
    list.parentNode.insertBefore(hero, list);
  }

  function spotlight() {
    if (reduce || !fine) return;
    var ticking = false;
    window.addEventListener('pointermove', function (e) {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(function () {
        var x = (e.clientX / window.innerWidth) * 100;
        var y = (e.clientY / window.innerHeight) * 100;
        document.documentElement.style.setProperty('--k-mx', x + '%');
        document.documentElement.style.setProperty('--k-my', y + '%');
        ticking = false;
      });
    }, { passive: true });
  }

  function tiltCards() {
    if (reduce || !fine) return;
    var cards = document.querySelectorAll('#post-list .card, #post-list article.card-wrapper');
    var max = 7;

    cards.forEach(function (card) {
      card.addEventListener('pointermove', function (e) {
        var r = card.getBoundingClientRect();
        var px = (e.clientX - r.left) / r.width;
        var py = (e.clientY - r.top) / r.height;
        var rx = ((0.5 - py) * max).toFixed(2);
        var ry = ((px - 0.5) * max).toFixed(2);
        card.style.transform =
          'rotateX(' + rx + 'deg) rotateY(' + ry + 'deg) translateZ(12px)';
        card.style.setProperty('--k-cx', (px * 100) + '%');
        card.style.setProperty('--k-cy', (py * 100) + '%');
      });
      card.addEventListener('pointerleave', function () {
        card.style.transform = '';
      });
    });
  }

  function tiltHero() {
    if (reduce || !fine) return;
    var scene = document.getElementById('kofy-hero-scene');
    if (!scene) return;
    scene.addEventListener('pointermove', function (e) {
      var r = scene.getBoundingClientRect();
      var px = (e.clientX - r.left) / r.width;
      var py = (e.clientY - r.top) / r.height;
      var rx = ((0.5 - py) * 8).toFixed(2);
      var ry = ((px - 0.5) * 10).toFixed(2);
      scene.style.transform = 'rotateX(' + rx + 'deg) rotateY(' + ry + 'deg)';
    });
    scene.addEventListener('pointerleave', function () {
      scene.style.transform = '';
    });
  }

  injectHero();
  spotlight();
  tiltCards();
  tiltHero();
})();
