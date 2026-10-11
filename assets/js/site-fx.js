/* Progressive entrance effects. No pointer tracking or hidden content. */
(function () {
  'use strict';
  var motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var list = document.getElementById('post-list');
  if (!list || document.querySelector('.kofy-hero')) return;

  var hero = document.createElement('section');
  hero.className = 'kofy-hero';
  hero.setAttribute('aria-label', 'Introduction');
  hero.innerHTML =
    '<div class="kofy-hero__scene">' +
      '<div class="kofy-hero__copy">' +
        '<p class="kofy-hero__kicker">Homelab · Linux · auto-hébergement</p>' +
        '<h1>Le rack, documenté.</h1>' +
        '<p>Retours d’expérience et guides pratiques sur les systèmes, les réseaux et la cybersécurité.</p>' +
      '</div>' +
      '<div class="kofy-hero__term" aria-label="Environnement technique">' +
        '<div><span class="term__prompt">kofy@homelab</span><span class="term__sep">:</span><span class="term__path">~</span><span class="term__sep">$</span> <span class="term__cmd">cat stack.txt</span></div>' +
        '<div class="term__out">Proxmox · Docker · Linux<br>WireGuard · OPNsense · réseau</div>' +
        '<div><span class="term__prompt">→</span> <span class="term__cmd">Tester. Comprendre. Documenter.</span></div>' +
      '</div>' +
    '</div>';
  list.parentNode.insertBefore(hero, list);

  if (motion.matches || !('IntersectionObserver' in window)) return;
  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('kofy-enter');
      entry.target.addEventListener('animationend', function () {
        entry.target.classList.remove('kofy-enter');
      }, { once: true });
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.08 });
  observer.observe(hero);
  list.querySelectorAll('.card-wrapper').forEach(function (card) { observer.observe(card); });
  motion.addEventListener('change', function (event) {
    if (event.matches) {
      observer.disconnect();
      document.querySelectorAll('.kofy-enter').forEach(function (el) { el.classList.remove('kofy-enter'); });
    }
  });
})();
