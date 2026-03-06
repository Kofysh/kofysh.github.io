---
title: "Héberger son Propre Cloud avec Nextcloud"
date: 2025-02-10 10:00:00 +0100
categories: [Selfhost, Cloud]
tags: [nextcloud, cloud, stockage, selfhost, docker]
---

## Pourquoi Nextcloud ?

Nextcloud est l'alternative open-source à Google Drive / Dropbox / OneDrive. Fichiers, calendrier, contacts, notes, visioconférence... tout en un, chez vous.

## Installation

```bash
mkdir -p ~/docker/nextcloud && cd ~/docker/nextcloud
```

```bash
# .env
MYSQL_ROOT_PASSWORD=SuperRootPass789!
MYSQL_PASSWORD=NextcloudDBPass456!
MYSQL_DATABASE=nextcloud
MYSQL_USER=nextcloud
NEXTCLOUD_ADMIN=admin
NEXTCLOUD_PASS=AdminPassword123!
DOMAIN=cloud.mondomaine.fr
```

```yaml
# docker-compose.yml
services:
  nextcloud:
    image: nextcloud:29-apache
    container_name: nextcloud
    depends_on:
      db:
        condition: service_healthy
    environment:
      - MYSQL_HOST=db
      - MYSQL_DATABASE=${MYSQL_DATABASE}
      - MYSQL_USER=${MYSQL_USER}
      - MYSQL_PASSWORD=${MYSQL_PASSWORD}
      - NEXTCLOUD_ADMIN_USER=${NEXTCLOUD_ADMIN}
      - NEXTCLOUD_ADMIN_PASSWORD=${NEXTCLOUD_PASS}
      - NEXTCLOUD_TRUSTED_DOMAINS=${DOMAIN}
      - REDIS_HOST=redis
      - OVERWRITEPROTOCOL=https
      - OVERWRITEHOST=${DOMAIN}
      - PHP_MEMORY_LIMIT=1G
      - PHP_UPLOAD_LIMIT=16G
    volumes:
      - ./data:/var/www/html
    networks:
      - proxy
      - interne
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.nextcloud.rule=Host(`${DOMAIN}`)"
      - "traefik.http.services.nextcloud.loadbalancer.server.port=80"
    restart: unless-stopped

  db:
    image: mariadb:11
    container_name: nextcloud-db
    environment:
      - MYSQL_ROOT_PASSWORD=${MYSQL_ROOT_PASSWORD}
      - MYSQL_DATABASE=${MYSQL_DATABASE}
      - MYSQL_USER=${MYSQL_USER}
      - MYSQL_PASSWORD=${MYSQL_PASSWORD}
    volumes:
      - ./db:/var/lib/mysql
    networks:
      - interne
    healthcheck:
      test: ["CMD", "healthcheck.sh", "--connect", "--innodb_initialized"]
      interval: 30s
      timeout: 10s
      retries: 5
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    container_name: nextcloud-redis
    volumes:
      - ./redis:/data
    networks:
      - interne
    restart: unless-stopped

networks:
  proxy:
    external: true
  interne:
    driver: bridge
```

## Optimisations post-installation

```bash
docker compose exec nextcloud bash

php occ db:add-missing-indices
php occ background:cron
php occ config:system:set memcache.local --value="\OC\Memcache\APCu"
php occ config:system:set memcache.locking --value="\OC\Memcache\Redis"
php occ config:system:set redis host --value="redis"
php occ config:system:set redis port --value=6379 --type=integer
```

Cron sur l'hôte :

```bash
crontab -e
# */5 * * * * docker exec -u www-data nextcloud php cron.php
```

## Applications recommandées

- **Calendar** : synchronisation CalDAV
- **Contacts** : synchronisation CardDAV
- **Notes** : prise de notes Markdown
- **Deck** : gestion Kanban
- **Talk** : visioconférence intégrée
- **Memories** : galerie photo moderne

## Clients

- PC : [Nextcloud Desktop](https://nextcloud.com/install/#install-clients)
- Mobile : Nextcloud sur Play Store / App Store
- CalDAV/CardDAV : `https://cloud.mondomaine.fr/remote.php/dav/`
