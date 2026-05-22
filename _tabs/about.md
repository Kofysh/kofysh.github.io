---
icon: fas fa-info-circle
order: 4
---

## Qui suis-je ?

Je suis **Kofy**, administrateur systèmes passionné basé en Île-de-France. Sur ce blog, je documente mes expériences avec l'**auto-hébergement**, le **homelab** et l'**administration Linux** : tout ce que j'utilise au quotidien dans mon infra, mis en forme pour que ça te soit utile.

Sujets récurrents : Docker, Proxmox, Traefik, WireGuard, sécurité réseau, monitoring, game servers.

## Mon infrastructure

Tous mes services tournent sur trois serveurs physiques sous [Proxmox VE](https://www.proxmox.com/), hébergés en France sur une connexion **8 Gbit/s** via [Free](https://www.free.fr/).

### HPE ProLiant DL380 Gen10 — Compute principal

| Composant | Spécification |
|-----------|---------------|
| **CPU** | 2× Intel Xeon Gold 6138 (40C/80T) |
| **RAM** | 384 Go DDR4 ECC |
| **Stockage** | 16× 2,4 To SAS 10K |
| **GPU** | NVIDIA Tesla T4 |

### Dell PowerEdge R730 — GPU / IA

| Composant | Spécification |
|-----------|---------------|
| **CPU** | 2× Intel Xeon E5-2699v4 (44C/88T) |
| **RAM** | 256 Go DDR4 ECC |
| **Stockage** | 8× 4 To SSD + 2× 2 To NVMe |
| **GPU** | NVIDIA RTX 2080 |

### HPE ProLiant DL360 Gen10 — Services réseau

| Composant | Spécification |
|-----------|---------------|
| **CPU** | 2× Intel Xeon Silver 4214R (24C/48T) |
| **RAM** | 128 Go DDR4 ECC |
| **Stockage** | 8× 1,92 To SSD |
| **Réseau** | 10 GbE SFP+ |

## Stack logicielle

- **Hyperviseur** : Proxmox VE
- **Conteneurisation** : Docker + Docker Compose
- **Reverse proxy** : Traefik v3 + Let's Encrypt
- **Firewall** : OPNsense
- **Monitoring** : Grafana + Prometheus + Loki
- **Sauvegardes** : Restic + rclone
- **Stockage** : NAS Synology + Proxmox Backup Server

## Contact

N'hésite pas à me contacter pour toute question, suggestion ou collaboration via les liens dans la barre latérale, ou directement à **kofy@yipyip.fr**.
