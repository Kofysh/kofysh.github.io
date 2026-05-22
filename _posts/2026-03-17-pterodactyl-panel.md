---
title: "Pterodactyl : panel de gestion de serveurs de jeux"
date: 2026-03-17 10:00:00 +0100
categories: [Tutoriels, Game Servers]
tags: [pterodactyl, game-server, docker, panel]
---

Pterodactyl est un panel open-source pour gérer tes serveurs de jeux via une interface web moderne. Il supporte Minecraft, Rust, CS2, Valheim et des dizaines d'autres jeux.

## Architecture

Pterodactyl se compose de deux parties :
- **Panel** : l'interface web (Laravel/PHP)
- **Wings** : le daemon qui tourne sur chaque nœud de jeu (Go)

## Prérequis

- Un serveur dédié ou VPS avec Docker installé
- Un nom de domaine (ex: `panel.mondomaine.fr` et `node1.mondomaine.fr`)
- Traefik ou Nginx en reverse proxy

## 1. Déployer le panel

```bash
mkdir -p ~/docker/pterodactyl && cd ~/docker/pterodactyl
```

```yaml
# docker-compose.yml
services:
  panel:
    image: ghcr.io/pterodactyl/panel:latest
    restart: unless-stopped
    networks:
      - traefik-network
      - pterodactyl
    environment:
      APP_URL: "https://panel.mondomaine.fr"
      APP_TIMEZONE: "Europe/Paris"
      APP_SERVICE_AUTHOR: "admin@mondomaine.fr"
      DB_HOST: "mariadb"
      DB_PORT: "3306"
      DB_DATABASE: "pterodactyl"
      DB_USERNAME: "pterodactyl"
      DB_PASSWORD: "MOT_DE_PASSE_FORT"
      REDIS_HOST: "redis"
    volumes:
      - panel_data:/app/var
      - panel_logs:/app/storage/logs
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.pterodactyl.rule=Host(`panel.mondomaine.fr`)"
      - "traefik.http.routers.pterodactyl.tls.certresolver=letsencrypt"
      - "traefik.http.routers.pterodactyl.entrypoints=websecure"
      - "traefik.http.services.pterodactyl.loadbalancer.server.port=80"

  mariadb:
    image: mariadb:10.11
    restart: unless-stopped
    networks:
      - pterodactyl
    environment:
      MYSQL_ROOT_PASSWORD: "ROOT_PASS"
      MYSQL_DATABASE: "pterodactyl"
      MYSQL_USER: "pterodactyl"
      MYSQL_PASSWORD: "MOT_DE_PASSE_FORT"
    volumes:
      - db_data:/var/lib/mysql

  redis:
    image: redis:alpine
    restart: unless-stopped
    networks:
      - pterodactyl

volumes:
  panel_data:
  panel_logs:
  db_data:

networks:
  traefik-network:
    external: true
  pterodactyl:
```

## 2. Initialiser le panel

```bash
docker compose up -d
# Attendre ~30 secondes puis
docker compose exec panel php artisan p:user:make
```

Suis les instructions pour créer ton compte admin.

## 2. Installer Wings sur le nœud

```bash
curl -L https://github.com/pterodactyl/wings/releases/latest/download/wings_linux_amd64 -o /usr/local/bin/wings
chmod +x /usr/local/bin/wings
```

Dans le panel : **Admin → Nodes → Create Node** → configure et télécharge le fichier `config.yml` → place-le dans `/etc/pterodactyl/config.yml`.

```bash
wings --debug  # Test
# Si OK, créer le service systemd
curl -o /etc/systemd/system/wings.service https://raw.githubusercontent.com/pterodactyl/wings/develop/wings.service
systemctl enable --now wings
```

> Pterodactyl nécessite Docker sur le nœud Wings — chaque serveur de jeu tourne dans son propre conteneur isolé.
{: .prompt-info }
