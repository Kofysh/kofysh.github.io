---
icon: fas fa-info-circle
order: 99
---

<div class="about-intro" markdown="1">

<p class="about-intro__eyebrow">Kofy · Administrateur systèmes · Île-de-France</p>

## Un homelab, des expériences, de la documentation.

Je suis **Kofy**, administrateur systèmes passionné. Je documente ici mon infrastructure et mes expériences en **auto-hébergement**, **administration Linux** et **réseau** : des outils que j'utilise au quotidien, expliqués pour que tu puisses les comprendre et les reprendre dans ton propre lab.

**Mes sujets de prédilection** : Docker, Proxmox, Traefik, WireGuard, sécurité réseau, monitoring et serveurs de jeux.

</div>

## Mon infrastructure

Trois serveurs physiques sous [**Proxmox VE**](https://www.proxmox.com/), hébergés en **France**, sur une connexion **8 Gbit/s** via [Free](https://www.free.fr/).

<div class="about-servers" markdown="1">

<section class="about-server" markdown="1">

<p class="about-server__role">01 · Compute principal</p>

### HPE ProLiant DL380 Gen10

| Composant | Configuration |
| :--- | :--- |
| **Processeurs** | 2 × Intel Xeon Gold 6138 · 40C/80T |
| **Mémoire** | 384 Go DDR4 ECC |
| **Stockage** | 16 × 2,4 To SAS 10K |
| **GPU** | NVIDIA Tesla T4 |

</section>

<section class="about-server" markdown="1">

<p class="about-server__role">02 · GPU & intelligence artificielle</p>

### Dell PowerEdge R730

| Composant | Configuration |
| :--- | :--- |
| **Processeurs** | 2 × Intel Xeon E5-2699v4 · 44C/88T |
| **Mémoire** | 256 Go DDR4 ECC |
| **Stockage** | 8 × 4 To SSD + 2 × 2 To NVMe |
| **GPU** | NVIDIA RTX 2080 |

</section>

<section class="about-server" markdown="1">

<p class="about-server__role">03 · Services réseau</p>

### HPE ProLiant DL360 Gen10

| Composant | Configuration |
| :--- | :--- |
| **Processeurs** | 2 × Intel Xeon Silver 4214R · 24C/48T |
| **Mémoire** | 128 Go DDR4 ECC |
| **Stockage** | 8 × 1,92 To SSD |
| **Réseau** | 10 GbE SFP+ |

</section>

</div>

## Ma stack logicielle

| Usage | Outils |
| :--- | :--- |
| **Virtualisation** | Proxmox VE |
| **Conteneurs** | Docker · Docker Compose |
| **Reverse proxy & certificats** | Traefik v3 · Let's Encrypt |
| **Pare-feu** | OPNsense |
| **Observabilité** | Grafana · Prometheus · Loki |
| **Sauvegardes** | Restic · rclone |
| **Stockage** | NAS Synology · Proxmox Backup Server |

<div class="about-contact" markdown="1">

## On en parle ?

Une question technique, une suggestion ou une envie de collaborer ? Tu peux m'écrire à [**kofy@yipyip.fr**](mailto:kofy@yipyip.fr) ou me retrouver sur [GitHub](https://github.com/kofysh).

</div>
