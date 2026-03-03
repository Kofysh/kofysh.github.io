---
title: "Proxmox : créer sa première VM"
date: 2026-03-03 17:00:00 +0100
categories: [Tutoriels, Homelab]
tags: [proxmox, virtualisation, vm, homelab]
---

Proxmox VE est une plateforme de virtualisation open-source qui permet de créer et gérer des machines virtuelles (VM) et des conteneurs (LXC) via une interface web. C'est l'outil parfait pour un homelab.

## Prérequis

- Proxmox VE installé sur un serveur physique ([proxmox.com/downloads](https://www.proxmox.com/en/downloads))
- Accès à l'interface web : `https://IP_DU_SERVEUR:8006`
- Une ISO téléchargée (ex : Debian 12)

## 1. Uploader une ISO

Avant de créer une VM, il faut disposer d'une image ISO sur Proxmox.

1. Dans l'interface web, clique sur ton nœud dans l'arbre à gauche
2. Va dans **local (stockage) > ISO Images**
3. Clique sur **Upload** ou **Download from URL**
4. Entre l'URL de l'ISO (ex : `https://cdimage.debian.org/debian-cd/current/amd64/iso-cd/debian-12.x.x-amd64-netinst.iso`)

## 2. Créer la VM

Clique sur le bouton bleu **Create VM** en haut à droite.

### Onglet General
- **VM ID** : laisse par défaut (ex: 100)
- **Name** : donne un nom parlant (ex: `debian-test`)

### Onglet OS
- Sélectionne ton ISO uploadée
- Type : **Linux**, Version : **6.x - 2.6 Kernel**

### Onglet System
- Machine : **q35**
- BIOS : **OVMF (UEFI)** recommandé pour les OS modernes
- Ajoute un **EFI Disk** (coché automatiquement)

### Onglet Disks
- **Bus** : VirtIO SCSI (plus performant)
- **Taille** : selon tes besoins (minimum 20 Go pour Debian)

### Onglet CPU
- **Cores** : 2 minimum (adapte selon ta machine physique)
- **Type** : `host` pour de meilleures performances

### Onglet Memory
- **RAM** : 2048 Mo minimum (2 Go)

### Onglet Network
- **Bridge** : `vmbr0` (le bridge réseau principal de Proxmox)
- **Model** : VirtIO (meilleure performance)

Clique **Finish**.

## 3. Démarrer et installer l'OS

1. Sélectionne ta VM dans l'arbre à gauche
2. Clique sur **Start**
3. Ouvre la **Console** (bouton en haut)
4. Suis l'installation de ton OS normalement

## 4. Installer les Guest Agents

Une fois l'OS installé, installe les outils QEMU pour une meilleure intégration avec Proxmox :

```bash
# Sur Debian/Ubuntu dans la VM
sudo apt install -y qemu-guest-agent
sudo systemctl enable --now qemu-guest-agent
```

Dans Proxmox, va dans **VM > Options > QEMU Guest Agent** et active-le.

## 5. Créer un snapshot

Un snapshot te permet de sauvegarder l'état de ta VM et d'y revenir en cas de problème :

1. Sélectionne ta VM
2. Onglet **Snapshots**
3. Clique **Take Snapshot**
4. Donne un nom (ex: `post-install-propre`)

> 💡 Prends toujours un snapshot avant de faire des modifications importantes sur une VM !
