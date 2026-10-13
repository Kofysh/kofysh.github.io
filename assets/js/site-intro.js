/* Introduction progressive : le contenu reste accessible sans JavaScript. */
(function () {
  'use strict';
  var script = document.currentScript;
  var logoUrl = script && script.getAttribute('data-logo');
  var motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var storageKey = 'kofy-intro-v3';
  var active = null;
  var pending = false;
  if (!logoUrl) return;

  function element(tag, className, text) {
    var node = document.createElement(tag);
    node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function play() {
    if (motion.matches || active || pending || document.hidden) return;
    pending = true;
    var logo = new Image(96, 96);
    logo.alt = '';
    var imageTimer = setTimeout(cancel, 1200);
    function cancel() {
      clearTimeout(imageTimer);
      logo.onload = logo.onerror = null;
      pending = false;
    }
    logo.onerror = cancel;
    logo.onload = function () {
      cancel();
      if (motion.matches || document.hidden) return;
      show(logo);
    };
    logo.src = logoUrl;
  }

  function show(logo) {
    var splash = element('section', '');
    splash.id = 'kofy-splash';
    splash.setAttribute('aria-label', 'Bienvenue sur le Blog de Kofy');
    var art = element('div', 'kofy-intro__art');
    art.setAttribute('aria-hidden', 'true');
    ['blue', 'mint', 'violet', 'gold'].forEach(function (color) {
      art.appendChild(element('span', 'kofy-intro__fluid kofy-intro__fluid--' + color));
    });
    var stage = element('div', 'kofy-intro__stage');
    stage.setAttribute('aria-hidden', 'true');
    var orbit = element('div', 'kofy-intro__orbit');
    for (var i = 0; i < 4; i++) orbit.appendChild(element('span', 'kofy-intro__bubble'));
    var mark = element('div', 'kofy-intro__logo');
    mark.appendChild(logo);
    stage.appendChild(orbit);
    stage.appendChild(mark);
    stage.appendChild(element('div', 'kofy-intro__title', 'Blog de Kofy'));
    stage.appendChild(element('p', 'kofy-intro__subtitle', 'Systèmes · Réseaux · Homelab'));
    var dots = element('div', 'kofy-intro__dots');
    for (var j = 0; j < 4; j++) dots.appendChild(document.createElement('span'));
    stage.appendChild(dots);
    var skip = element('button', 'kofy-intro__skip', 'Passer l’introduction');
    skip.type = 'button';
    splash.appendChild(art);
    splash.appendChild(stage);
    splash.appendChild(skip);
    var timer;
    function finish() {
      clearTimeout(timer);
      var restoreFocus = document.activeElement === skip;
      splash.remove();
      active = null;
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('visibilitychange', onVisibility);
      motion.removeEventListener('change', onMotion);
      if (restoreFocus && replay) replay.focus({ preventScroll: true });
    }
    function onKey(event) {
      if (event.key === 'Escape' || event.key === 'Tab') finish();
    }
    function onMotion(event) { if (event.matches) finish(); }
    function onVisibility() { if (document.hidden) finish(); }
    splash.addEventListener('animationend', function (event) {
      if (event.target === splash) finish();
    });
    skip.addEventListener('click', finish);
    document.addEventListener('keydown', onKey);
    document.addEventListener('visibilitychange', onVisibility);
    motion.addEventListener('change', onMotion);
    active = splash;
    document.body.appendChild(splash);
    timer = setTimeout(finish, 3200);
    try { sessionStorage.setItem(storageKey, '1'); } catch (_) {}
  }

  var replay = null;
  var footer = document.querySelector('footer');
  if (footer) {
    replay = element('button', 'kofy-intro__replay', 'Revoir l’intro');
    replay.type = 'button';
    replay.disabled = motion.matches;
    replay.addEventListener('click', play);
    footer.appendChild(replay);
    motion.addEventListener('change', function (event) { replay.disabled = event.matches; });
  }
  try { if (sessionStorage.getItem(storageKey) === '1') return; } catch (_) {}
  play();
})();
