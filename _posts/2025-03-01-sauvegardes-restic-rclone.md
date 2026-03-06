---
title: "Sauvegardes Automatiques avec Restic et Rclone"
date: 2025-03-01 10:00:00 +0100
categories: [Selfhost, Sauvegardes]
tags: [restic, rclone, backup, sauvegarde, automatisation]
---

## La règle du 3-2-1

> **3** copies, sur **2** supports différents, dont **1** hors site.
{: .prompt-info }

En pratique :
- Données en production (le serveur)
- Backup local (disque externe ou NAS)
- Backup cloud (Backblaze B2, Scaleway, Cloudflare R2...)

## Restic : le meilleur outil de backup

Restic chiffre, déduplique et compresse vos sauvegardes.

### Installation

```bash
sudo apt install restic -y
# Ou la dernière version :
restic self-update
```

### Initialiser un dépôt

```bash
# Local
restic init --repo /mnt/backup/homelab

# Ou sur Backblaze B2
export B2_ACCOUNT_ID="your-account-id"
export B2_ACCOUNT_KEY="your-account-key"
restic init --repo b2:mon-bucket-backup:homelab
```

### Première sauvegarde

```bash
restic -r /mnt/backup/homelab backup ~/docker   --exclude="*/logs/*"   --exclude="*/.git/*"   --tag docker
```

### Vérifier les snapshots

```bash
restic -r /mnt/backup/homelab snapshots
restic -r /mnt/backup/homelab check
```

### Restaurer

```bash
# Lister les fichiers d'un snapshot
restic -r /mnt/backup/homelab ls latest

# Restaurer un fichier spécifique
restic -r /mnt/backup/homelab restore latest   --target /tmp/restore   --include "/home/user/docker/nextcloud"
```

## Script de sauvegarde complet

```bash
#!/bin/bash
# ~/scripts/backup.sh

set -euo pipefail

REPO="/mnt/backup/homelab"
BACKUP_DIRS="$HOME/docker /etc"
LOG_FILE="/var/log/backup.log"
RETENTION_DAILY=7
RETENTION_WEEKLY=4
RETENTION_MONTHLY=6

export RESTIC_PASSWORD="VotreMotDePasseRestic"
export RESTIC_REPOSITORY="$REPO"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"; }

log "=== Début de la sauvegarde ==="

# Sauvegarde
restic backup $BACKUP_DIRS   --exclude="*/logs/*"   --exclude="*/__pycache__/*"   --tag auto   --verbose

# Pruning
restic forget   --keep-daily $RETENTION_DAILY   --keep-weekly $RETENTION_WEEKLY   --keep-monthly $RETENTION_MONTHLY   --prune

# Vérification
restic check --read-data-subset=5%

log "=== Sauvegarde terminée avec succès ==="
```

```bash
chmod +x ~/scripts/backup.sh
crontab -e
# 0 3 * * * /home/user/scripts/backup.sh >> /var/log/backup.log 2>&1
```

## Rclone : synchroniser vers le cloud

```bash
# Installation
curl https://rclone.org/install.sh | sudo bash

# Configuration (interface interactive)
rclone config
```

Choisissez votre provider (Backblaze B2, S3, Google Drive, etc.) et suivez les instructions.

```bash
# Synchroniser vers le cloud
rclone sync /mnt/backup/homelab remote:mon-bucket/homelab   --progress   --transfers 4

# Vérifier
rclone ls remote:mon-bucket/homelab | head -20
```

## Automatiser avec Restic + Rclone

```bash
#!/bin/bash
# backup-and-sync.sh

# 1. Sauvegarde locale
restic backup ~/docker --tag auto

# 2. Sync vers le cloud
rclone sync /mnt/backup/homelab remote:backup-homelab   --transfers 4   --checkers 8   --log-file /var/log/rclone.log

echo "Backup + sync terminé : $(date)"
```

> Testez **régulièrement** vos restaurations. Un backup non testé n'est pas un backup.
{: .prompt-danger }
