---
title: "Vaultwarden : Votre Gestionnaire de Mots de Passe Self-Hosted"
date: 2025-04-01 10:00:00 +0100
categories: [Selfhost, Sécurité]
tags: [vaultwarden, bitwarden, mots-de-passe, sécurité, selfhost]
---

## Pourquoi un gestionnaire de mots de passe ?

Utiliser le même mot de passe partout est dangereux. Un gestionnaire vous permet d'avoir un **mot de passe unique et complexe** pour chaque service.

Vaultwarden est une implémentation légère et compatible Bitwarden, que vous pouvez héberger vous-même.

## Prérequis

Un nom de domaine avec HTTPS est **obligatoire** pour Vaultwarden (requis par les navigateurs pour l'API Web Crypto).

## Installation

```bash
mkdir -p ~/docker/vaultwarden && cd ~/docker/vaultwarden
```

```bash
# .env
DOMAIN=https://vault.mondomaine.fr
ADMIN_TOKEN=un-token-tres-secret-genere-avec-openssl
# Générer : openssl rand -base64 48
```

```yaml
# docker-compose.yml
services:
  vaultwarden:
    image: vaultwarden/server:latest
    container_name: vaultwarden
    environment:
      - DOMAIN=${DOMAIN}
      - ADMIN_TOKEN=${ADMIN_TOKEN}
      - SIGNUPS_ALLOWED=false
      - INVITATIONS_ALLOWED=true
      - SHOW_PASSWORD_HINT=false
      - LOG_LEVEL=warn
      - EXTENDED_LOGGING=false
      - SMTP_HOST=smtp.mondomaine.fr
      - SMTP_FROM=vault@mondomaine.fr
      - SMTP_PORT=587
      - SMTP_SECURITY=starttls
      - SMTP_USERNAME=user@mondomaine.fr
      - SMTP_PASSWORD=smtp-password
    volumes:
      - ./data:/data
    networks:
      - proxy
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.vaultwarden.rule=Host(`vault.mondomaine.fr`)"
      - "traefik.http.services.vaultwarden.loadbalancer.server.port=80"
      - "traefik.http.routers.vaultwarden.middlewares=default-chain@file"
    restart: unless-stopped

networks:
  proxy:
    external: true
```

```bash
docker compose up -d
```

## Premier compte

1. Accédez à `https://vault.mondomaine.fr`
2. Créez votre compte
3. Désactivez ensuite les inscriptions dans `.env` : `SIGNUPS_ALLOWED=false`
4. `docker compose up -d` pour appliquer

## Panneau d'administration

Accédez à `https://vault.mondomaine.fr/admin` avec votre `ADMIN_TOKEN`.

Depuis là, vous pouvez :
- Inviter des utilisateurs
- Voir les statistiques
- Configurer les organisations

## Clients

Vaultwarden est **100% compatible** avec tous les clients Bitwarden officiels :

- **Extension navigateur** : Chrome, Firefox, Safari
- **Mobile** : iOS et Android
- **Desktop** : Windows, macOS, Linux
- **CLI** : `bw` pour les scripts

### Configuration du client

Dans les paramètres du client Bitwarden, changez l'URL du serveur :

```
https://vault.mondomaine.fr
```

## Sauvegarde

```bash
#!/bin/bash
# backup-vaultwarden.sh
BACKUP_DIR="/mnt/backup/vaultwarden"
DATE=$(date +%Y%m%d-%H%M%S)

mkdir -p "$BACKUP_DIR"

# Arrêt propre pour backup SQLite cohérent
docker compose stop vaultwarden

# Copie des données
tar -czf "$BACKUP_DIR/vaultwarden-$DATE.tar.gz" ~/docker/vaultwarden/data/

# Redémarrage
docker compose start vaultwarden

# Garder 30 jours
find "$BACKUP_DIR" -name "*.tar.gz" -mtime +30 -delete

echo "Backup Vaultwarden terminé : $DATE"
```

> Sauvegardez Vaultwarden **tous les jours**. Une perte de données signifie perdre tous vos mots de passe.
{: .prompt-danger }
