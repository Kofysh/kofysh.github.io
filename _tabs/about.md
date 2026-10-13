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

<p class="about-server__role">01 · Calcul intensif & intelligence artificielle</p>

### AMD Threadripper PRO · Quad RTX A6000

| Composant | Configuration |
| :--- | :--- |
| **Processeur** | AMD Ryzen Threadripper PRO 7995WX · 96 cœurs / 192 threads |
| **Mémoire** | 1 To DDR5 ECC RDIMM |
| **Stockage système** | 2 × 1,92 To NVMe |
| **Stockage des données** | 8 × 7,68 To NVMe |
| **GPU** | 4 × NVIDIA RTX A6000 · 48 Go GDDR6 ECC par carte |
| **Réseau interne** | 100 GbE |

</section>

<section class="about-server" markdown="1">

<p class="about-server__role">02 · Virtualisation & services applicatifs</p>

### AMD Threadripper PRO · Compute

| Composant | Configuration |
| :--- | :--- |
| **Processeur** | AMD Ryzen Threadripper PRO 7985WX · 64 cœurs / 128 threads |
| **Mémoire** | 512 Go DDR5 ECC RDIMM |
| **Stockage système** | 2 × 1,92 To NVMe |
| **Stockage des données** | 8 × 7,68 To NVMe |
| **Réseau interne** | 100 GbE |

</section>

<section class="about-server" markdown="1">

<p class="about-server__role">03 · Services réseau & infrastructure</p>

### AMD Threadripper PRO · Infrastructure

| Composant | Configuration |
| :--- | :--- |
| **Processeur** | AMD Ryzen Threadripper PRO 7975WX · 32 cœurs / 64 threads |
| **Mémoire** | 256 Go DDR5 ECC RDIMM |
| **Stockage système** | 2 × 1,92 To NVMe |
| **Stockage des données** | 4 × 3,84 To NVMe |
| **Réseau interne** | 25 GbE SFP28 |

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
