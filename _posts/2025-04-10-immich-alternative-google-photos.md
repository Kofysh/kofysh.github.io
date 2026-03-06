---
title: "Immich : L'Alternative Ultime à Google Photos"
date: 2025-04-10 10:00:00 +0100
categories: [Selfhost, Photos]
tags: [immich, photos, google-photos, selfhost, docker]
---

## Immich en quelques mots

Immich est une application de gestion de photos self-hosted avec :

- Upload automatique depuis mobile (iOS et Android)
- Reconnaissance faciale et de scènes par IA
- Timeline chronologique
- Albums partagés
- Recherche intelligente
- Compatible avec les métadonnées EXIF

## Prérequis

Immich est gourmand en ressources. Recommandé minimum :

- **4 Go de RAM** (8 Go idéalement)
- **4 cœurs CPU** pour le machine learning
- **Stockage rapide** pour les thumbnails

## Installation

```bash
mkdir -p ~/docker/immich && cd ~/docker/immich
```

```bash
# .env
DB_PASSWORD=MotDePassePostgres123!
DB_USERNAME=immich
DB_DATABASE_NAME=immich
UPLOAD_LOCATION=./library
IMMICH_VERSION=release
```

```yaml
# docker-compose.yml
services:
  immich-server:
    image: ghcr.io/immich-app/immich-server:${IMMICH_VERSION}
    container_name: immich_server
    environment:
      - DB_HOSTNAME=immich-postgres
      - DB_USERNAME=${DB_USERNAME}
      - DB_PASSWORD=${DB_PASSWORD}
      - DB_DATABASE_NAME=${DB_DATABASE_NAME}
      - REDIS_HOSTNAME=immich-redis
    volumes:
      - ${UPLOAD_LOCATION}:/usr/src/app/upload
      - /etc/localtime:/etc/localtime:ro
    depends_on:
      - immich-redis
      - immich-postgres
    networks:
      - proxy
      - immich-internal
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.immich.rule=Host(`photos.mondomaine.fr`)"
      - "traefik.http.services.immich.loadbalancer.server.port=2283"
    restart: unless-stopped

  immich-machine-learning:
    image: ghcr.io/immich-app/immich-machine-learning:${IMMICH_VERSION}
    container_name: immich_ml
    volumes:
      - immich-model-cache:/cache
    networks:
      - immich-internal
    restart: unless-stopped

  immich-redis:
    image: redis:7-alpine
    container_name: immich_redis
    networks:
      - immich-internal
    restart: unless-stopped

  immich-postgres:
    image: tensorchord/pgvecto-rs:pg14-v0.2.0
    container_name: immich_postgres
    environment:
      - POSTGRES_USER=${DB_USERNAME}
      - POSTGRES_PASSWORD=${DB_PASSWORD}
      - POSTGRES_DB=${DB_DATABASE_NAME}
    volumes:
      - immich-postgres:/var/lib/postgresql/data
    networks:
      - immich-internal
    restart: unless-stopped

volumes:
  immich-model-cache:
  immich-postgres:

networks:
  proxy:
    external: true
  immich-internal:
    driver: bridge
```

```bash
docker compose up -d
```

## Configuration initiale

1. Accédez à `https://photos.mondomaine.fr`
2. Créez votre compte administrateur
3. Configurez le **storage template** : `{{y}}/{{MM}}/{{dd}}/{{filename}}`

## Application mobile

Téléchargez **Immich** sur l'App Store ou le Play Store.

Configuration :
```
URL du serveur : https://photos.mondomaine.fr
```

Activez la **sauvegarde automatique** pour tous vos albums.

## Migration depuis Google Photos

```bash
# Téléchargez Google Takeout sur takeout.google.com
# Puis utilisez immich-go :

wget https://github.com/simulot/immich-go/releases/latest/download/immich-go_Linux_x86_64.tar.gz
tar -xzf immich-go_Linux_x86_64.tar.gz

./immich-go -server=https://photos.mondomaine.fr \
  -key=VOTRE_API_KEY \
  upload \
  --google-photos \
  /chemin/vers/takeout/
```

## Sauvegarde

```bash
#!/bin/bash
# backup-immich.sh

# Backup PostgreSQL
docker exec immich_postgres pg_dump -U immich immich | \
  gzip > /mnt/backup/immich/db-$(date +%Y%m%d).sql.gz

# Sync la bibliothèque vers le cloud
rclone sync ~/docker/immich/library remote:backup-immich/library \
  --transfers 4 \
  --progress

# 30 jours de rétention DB
find /mnt/backup/immich -name "db-*.sql.gz" -mtime +30 -delete
```

> Immich est en développement actif. Lisez **toujours** les release notes avant de mettre à jour, certaines migrations sont irréversibles.
{: .prompt-warning }
