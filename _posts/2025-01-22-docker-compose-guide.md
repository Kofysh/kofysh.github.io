---
title: "Docker Compose : Maîtriser l'Outil Essentiel du Self-Hoster"
date: 2025-01-22 10:00:00 +0100
categories: [Selfhost, Docker]
tags: [docker, docker-compose, conteneurs, selfhost]
---

## Pourquoi Docker Compose ?

Docker Compose permet de définir et gérer des applications multi-conteneurs avec un simple fichier YAML. Fini les longues commandes `docker run` impossibles à reproduire.

## Structure d'un docker-compose.yml

```yaml
services:
  nom-du-service:
    image: image:tag
    container_name: nom-unique
    environment:
      - VARIABLE=valeur
    volumes:
      - ./donnees-locales:/donnees-conteneur
    ports:
      - "port-hote:port-conteneur"
    networks:
      - mon-reseau
    depends_on:
      - autre-service
    restart: unless-stopped

networks:
  mon-reseau:
    driver: bridge
```

## Les commandes essentielles

```bash
# Démarrer en arrière-plan
docker compose up -d

# Arrêter
docker compose down

# Logs en temps réel
docker compose logs -f

# Logs d'un service spécifique
docker compose logs -f --tail 100 nom-du-service

# État des services
docker compose ps

# Mise à jour
docker compose pull && docker compose up -d

# Shell dans un conteneur
docker compose exec nom-du-service bash
```

## Bonne pratique : fichiers .env

Ne mettez jamais de mots de passe en clair dans le `docker-compose.yml` :

```bash
# .env
PUID=1000
PGID=1000
TZ=Europe/Paris
DB_USER=myapp
DB_PASS=MotDePasseSuperSecure123!
```

```yaml
services:
  db:
    image: mariadb:11
    environment:
      - MYSQL_USER=${DB_USER}
      - MYSQL_PASSWORD=${DB_PASS}
```

> Ajoutez `.env` à votre `.gitignore` si vous versionnez vos configs !
{: .prompt-warning }

## Réseaux Docker

Pour que des services de stacks différentes communiquent :

```bash
docker network create proxy
```

```yaml
# Stack A (Traefik)
networks:
  proxy:
    external: true

# Stack B (App)
networks:
  proxy:
    external: true
  interne:
    driver: bridge
```

## Healthchecks

```yaml
services:
  db:
    image: postgres:16
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 30s
      timeout: 10s
      retries: 3

  app:
    depends_on:
      db:
        condition: service_healthy
```

## Limiter les ressources

```yaml
services:
  app:
    deploy:
      resources:
        limits:
          memory: 512M
          cpus: '0.5'
```

## Sécurité des conteneurs

```yaml
services:
  app:
    security_opt:
      - no-new-privileges:true
    read_only: true
    tmpfs:
      - /tmp
    user: "1000:1000"
```

## Script de mise à jour automatique

```bash
#!/bin/bash
DOCKER_DIR="$HOME/docker"

for dir in "$DOCKER_DIR"/*/; do
    if [ -f "$dir/docker-compose.yml" ]; then
        echo "→ Mise à jour de $(basename "$dir")"
        cd "$dir"
        docker compose pull
        docker compose up -d
    fi
done

docker image prune -f
echo "✓ Terminé"
```

## Commandes utiles

```bash
# Espace disque Docker
docker system df

# Nettoyage complet
docker system prune -a --volumes

# Stats en temps réel
docker stats

# Inspecter un conteneur
docker inspect nom-conteneur
```
