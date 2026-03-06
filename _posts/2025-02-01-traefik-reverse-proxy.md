---
title: "Traefik : Le Reverse Proxy Ultime pour votre Homelab"
date: 2025-02-01 10:00:00 +0100
categories: [Selfhost, Réseau]
tags: [traefik, reverse-proxy, ssl, letsencrypt, docker]
---

## Qu'est-ce qu'un reverse proxy ?

Un reverse proxy redirige le trafic entrant vers vos différents services. Au lieu d'accéder à `http://IP:3001`, vous utilisez `https://status.mondomaine.fr`.

## Prérequis

1. Un nom de domaine (OVH, Namecheap, Cloudflare...)
2. DNS configuré :

```
A    mondomaine.fr       → VOTRE_IP_PUBLIQUE
A    *.mondomaine.fr     → VOTRE_IP_PUBLIQUE
```

3. Ports 80 et 443 redirigés sur votre box

## Installation

```bash
mkdir -p ~/docker/traefik/config/dynamic
touch ~/docker/traefik/acme.json
chmod 600 ~/docker/traefik/acme.json
docker network create proxy
cd ~/docker/traefik
```

### Configuration statique

```yaml
# config/traefik.yml
api:
  dashboard: true

entryPoints:
  web:
    address: ":80"
    http:
      redirections:
        entryPoint:
          to: websecure
          scheme: https
  websecure:
    address: ":443"
    http:
      tls:
        certResolver: letsencrypt

certificatesResolvers:
  letsencrypt:
    acme:
      email: votre@email.com
      storage: /acme.json
      httpChallenge:
        entryPoint: web

providers:
  docker:
    endpoint: "unix:///var/run/docker.sock"
    exposedByDefault: false
    network: proxy
  file:
    directory: /config/dynamic
    watch: true

log:
  level: INFO
```

### Middlewares de sécurité

```yaml
# config/dynamic/middlewares.yml
http:
  middlewares:
    secure-headers:
      headers:
        stsSeconds: 31536000
        stsIncludeSubdomains: true
        stsPreload: true
        forceSTSHeader: true
        contentTypeNosniff: true
        browserXssFilter: true
        frameDeny: true

    rate-limit:
      rateLimit:
        average: 100
        burst: 50

    default-chain:
      chain:
        middlewares:
          - secure-headers
          - rate-limit
```

### Docker Compose de Traefik

```yaml
services:
  traefik:
    image: traefik:v3
    container_name: traefik
    security_opt:
      - no-new-privileges:true
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - ./config/traefik.yml:/traefik.yml:ro
      - ./config/dynamic:/config/dynamic:ro
      - ./acme.json:/acme.json
    networks:
      - proxy
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.dashboard.rule=Host(`traefik.mondomaine.fr`)"
      - "traefik.http.routers.dashboard.service=api@internal"
      - "traefik.http.routers.dashboard.middlewares=default-chain@file"
    restart: unless-stopped

networks:
  proxy:
    external: true
```

## Ajouter un service derrière Traefik

```yaml
services:
  uptime-kuma:
    image: louislam/uptime-kuma:1
    container_name: uptime-kuma
    volumes:
      - ./data:/app/data
    networks:
      - proxy
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.uptime.rule=Host(`status.mondomaine.fr`)"
      - "traefik.http.services.uptime.loadbalancer.server.port=3001"
      - "traefik.http.routers.uptime.middlewares=default-chain@file"
    restart: unless-stopped

networks:
  proxy:
    external: true
```

Plus besoin de `ports:` ! Traefik route le trafic via le réseau Docker interne.

> Ne montez jamais le socket Docker sans `:ro` (read-only). C'est un vecteur d'attaque critique.
{: .prompt-danger }
