/* ==================================================================
   Terminal animé du hero — Blog de Kofy
   Effet machine à écrire qui enchaîne quelques commandes shell.
   Respecte prefers-reduced-motion (affichage statique immédiat).
   ================================================================== */
(function () {
  'use strict';

  var el = document.getElementById('hero-term');
  if (!el) return;

  // Séquence de commandes : { cmd, out } affichées tour à tour.
  var SEQUENCE = [
    { cmd: 'whoami', out: 'kofy — administrateur systèmes & homelabber' },
    { cmd: 'cat ~/stack.txt', out: 'proxmox · docker · traefik · wireguard · opnsense' },
    { cmd: 'ls ~/posts', out: 'reseau-vlan-unifi  wireguard-failover  wireguard-vyos' },
    { cmd: 'uptime', out: 'up 365 days — self-hosted with ❤' }
  ];

  var PROMPT = '<span class="term__prompt">kofy@homelab</span>' +
               '<span class="term__sep">:</span>' +
               '<span class="term__path">~</span>' +
               '<span class="term__sep">$</span> ';

  var reduce = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- Mode statique (accessibilité / pas d'animation) ----
  if (reduce) {
    var html = '';
    SEQUENCE.forEach(function (l) {
      html += '<div class="term__line">' + PROMPT +
        '<span class="term__cmd">' + l.cmd + '</span></div>' +
        '<div class="term__out">' + l.out + '</div>';
    });
    el.innerHTML = html;
    return;
  }

  // ---- Mode animé ----
  var TYPE = 55;      // ms par caractère tapé
  var AFTER_CMD = 480; // pause après la commande
  var AFTER_OUT = 1500; // pause après la sortie
  var idx = 0;

  function esc(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function newLine() {
    var line = document.createElement('div');
    line.className = 'term__line';
    line.innerHTML = PROMPT + '<span class="term__cmd"></span><span class="term__cursor">▋</span>';
    el.appendChild(line);
    return line;
  }

  function scrollDown() { el.scrollTop = el.scrollHeight; }

  function typeCmd(line, text, done) {
    var cmdEl = line.querySelector('.term__cmd');
    var i = 0;
    (function tick() {
      if (i <= text.length) {
        cmdEl.textContent = text.slice(0, i);
        i++;
        scrollDown();
        setTimeout(tick, TYPE + Math.random() * 40);
      } else {
        var cur = line.querySelector('.term__cursor');
        if (cur) cur.remove();
        setTimeout(done, AFTER_CMD);
      }
    })();
  }

  function showOut(text, done) {
    var out = document.createElement('div');
    out.className = 'term__out';
    out.innerHTML = esc(text);
    el.appendChild(out);
    scrollDown();
    setTimeout(done, AFTER_OUT);
  }

  function step() {
    var item = SEQUENCE[idx % SEQUENCE.length];
    var line = newLine();
    typeCmd(line, item.cmd, function () {
      showOut(item.out, function () {
        idx++;
        // On repart à zéro après un cycle complet pour garder le terminal lisible.
        if (idx % SEQUENCE.length === 0) {
          setTimeout(function () { el.innerHTML = ''; step(); }, 700);
        } else {
          step();
        }
      });
    });
  }

  // Petit délai initial pour laisser le hero apparaître.
  setTimeout(step, 500);
})();
