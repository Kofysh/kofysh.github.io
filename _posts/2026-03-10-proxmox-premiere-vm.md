---
title: "Proxmox : créer ta première VM en 10 minutes"
date: 2026-03-10 10:00:00 +0100
categories: [Tutoriels, Virtualisation]
tags: [proxmox, vm, virtualisation, homelab]
---

Proxmox VE est une plateforme de virtualisation open-source basée sur KVM et LXC. Voici comment créer ta première machine virtuelle depuis l'interface web.

## Prérequis

- Proxmox VE installé et accessible sur `https://IP:8006`
- Une ISO téléchargée (Debian, Ubuntu, etc.) dans le stockage local

## 1. Télécharger une ISO

Dans l'interface Proxmox : **Datacenter → ton nœud → local → ISO Images → Download from URL**

```
https://cdimage.debian.org/debian-cd/current/amd64/iso-cd/debian-12.x.x-amd64-netinst.iso
```

## 2. Créer la VM

Clique sur **Create VM** en haut à droite et suis l'assistant :

| Étape | Paramètre recommandé |
|-------|---------------------|
| **General** | Nom descriptif, VM ID auto |
| **OS** | Sélectionne ton ISO, type Linux |
| **System** | Machine `q35`, BIOS `OVMF (UEFI)` |
| **Disks** | VirtIO SCSI, taille selon besoin, SSD activé |
| **CPU** | Type `host` pour meilleures perf, 2+ cœurs |
| **Memory** | 2048 Mo minimum, activez Ballooning |
| **Network** | Bridge `vmbr0`, modèle VirtIO |

> Utilise toujours le type CPU `host` pour les VMs Linux — ça permet au système d'utiliser toutes les extensions du processeur physique.
{: .prompt-tip }

## 3. Installer le système

Démarre la VM et ouvre la console (**Console → noVNC**). L'installation est identique à un serveur physique.

## 4. Installer les QEMU Guest Agents

Une fois le système installé :

```bash
sudo apt install qemu-guest-agent
sudo systemctl enable --now qemu-guest-agent
```

Dans Proxmox, active l'option **QEMU Guest Agent** dans les options de la VM, puis redémarre. Tu auras l'IP affichée directement dans l'interface.

## 5. Créer un snapshot

Avant toute opération risquée, crée un snapshot : **VM → Snapshots → Take Snapshot**.

Restaurer un snapshot prend moins de 10 secondes. C'est la fonctionnalité la plus utile de Proxmox.

```bash
# Depuis l'API CLI Proxmox
qm snapshot 100 snap-avant-maj --description "Avant mise à jour kernel"
qm rollback 100 snap-avant-maj
```
