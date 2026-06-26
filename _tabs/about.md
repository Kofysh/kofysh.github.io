---
icon: fas fa-info-circle
order: 4
---

<p class="about-lead">
  Administrateur systèmes passionné, je documente ici mon homelab et tout ce qui
  touche à l'<strong>auto-hébergement</strong> et à l'<strong>administration Linux</strong>.
</p>

## Qui suis-je ?

Je suis **Kofy**, administrateur systèmes passionné basé en Île-de-France. Sur ce blog, je documente mes expériences avec l'**auto-hébergement**, le **homelab** et l'**administration Linux** : tout ce que j'utilise au quotidien dans mon infra, mis en forme pour que ça te soit utile.

Sujets récurrents : Docker, Proxmox, Traefik, WireGuard, sécurité réseau, monitoring, game servers.

## Mon infrastructure

Tous mes services tournent sur trois serveurs physiques sous [Proxmox VE](https://www.proxmox.com/), hébergés en France sur une connexion **8 Gbit/s** via [Free](https://www.free.fr/).

<div class="spec-grid">
  <article class="spec-card">
    <div class="spec-card__head">
      <span class="spec-card__icon"><i class="fas fa-server" aria-hidden="true"></i></span>
      <div>
        <h3 class="spec-card__title">HPE ProLiant DL380 Gen10</h3>
        <p class="spec-card__role">Compute principal</p>
      </div>
    </div>
    <ul class="spec-list">
      <li><span>CPU</span><strong>2× Xeon Gold 6138 — 40C/80T</strong></li>
      <li><span>RAM</span><strong>384 Go DDR4 ECC</strong></li>
      <li><span>Stockage</span><strong>16× 2,4 To SAS 10K</strong></li>
      <li><span>GPU</span><strong>NVIDIA Tesla T4</strong></li>
    </ul>
  </article>

  <article class="spec-card">
    <div class="spec-card__head">
      <span class="spec-card__icon"><i class="fas fa-microchip" aria-hidden="true"></i></span>
      <div>
        <h3 class="spec-card__title">Dell PowerEdge R730</h3>
        <p class="spec-card__role">GPU / IA</p>
      </div>
    </div>
    <ul class="spec-list">
      <li><span>CPU</span><strong>2× Xeon E5-2699v4 — 44C/88T</strong></li>
      <li><span>RAM</span><strong>256 Go DDR4 ECC</strong></li>
      <li><span>Stockage</span><strong>8× 4 To SSD + 2× 2 To NVMe</strong></li>
      <li><span>GPU</span><strong>NVIDIA RTX 2080</strong></li>
    </ul>
  </article>

  <article class="spec-card">
    <div class="spec-card__head">
      <span class="spec-card__icon"><i class="fas fa-network-wired" aria-hidden="true"></i></span>
      <div>
        <h3 class="spec-card__title">HPE ProLiant DL360 Gen10</h3>
        <p class="spec-card__role">Services réseau</p>
      </div>
    </div>
    <ul class="spec-list">
      <li><span>CPU</span><strong>2× Xeon Silver 4214R — 24C/48T</strong></li>
      <li><span>RAM</span><strong>128 Go DDR4 ECC</strong></li>
      <li><span>Stockage</span><strong>8× 1,92 To SSD</strong></li>
      <li><span>Réseau</span><strong>10 GbE SFP+</strong></li>
    </ul>
  </article>
</div>

## Stack logicielle

<div class="stack-grid">
  <div class="stack-item"><i class="fas fa-layer-group" aria-hidden="true"></i><span><strong>Proxmox VE</strong><em>Hyperviseur</em></span></div>
  <div class="stack-item"><i class="fab fa-docker" aria-hidden="true"></i><span><strong>Docker + Compose</strong><em>Conteneurisation</em></span></div>
  <div class="stack-item"><i class="fas fa-shield-halved" aria-hidden="true"></i><span><strong>Traefik v3 + Let's Encrypt</strong><em>Reverse proxy</em></span></div>
  <div class="stack-item"><i class="fas fa-fire" aria-hidden="true"></i><span><strong>OPNsense</strong><em>Firewall</em></span></div>
  <div class="stack-item"><i class="fas fa-chart-line" aria-hidden="true"></i><span><strong>Grafana · Prometheus · Loki</strong><em>Monitoring</em></span></div>
  <div class="stack-item"><i class="fas fa-database" aria-hidden="true"></i><span><strong>Restic + rclone</strong><em>Sauvegardes</em></span></div>
  <div class="stack-item"><i class="fas fa-hard-drive" aria-hidden="true"></i><span><strong>Synology + PBS</strong><em>Stockage</em></span></div>
</div>

## Contact

N'hésite pas à me contacter pour toute question, suggestion ou collaboration via les liens dans la barre latérale, ou directement à **kofy@yipyip.fr**.
