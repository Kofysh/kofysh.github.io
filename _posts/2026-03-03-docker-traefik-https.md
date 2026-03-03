---
title: "Docker + Traefik : HTTPS automatique pour tes services"
date: 2026-03-03 19:00:00 +0100
categories: [Tutoriels, Infrastructure]
tags: [docker, traefik, https, reverse-proxy, letsencrypt]
---

Traefik est un reverse proxy moderne conçu pour Docker. Il détecte automatiquement tes conteneurs et leur génère un certificat HTTPS via Let's Encrypt — sans rien configurer manuellement.

## Prérequis

- Un serveur avec Docker et Docker Compose installés
- Un nom de domaine qui pointe vers ton serveur (ex: `mondomaine.fr`)
- Les ports **80** et **443** ouverts dans ton pare-feu

## 1. Créer le réseau Docker

Tous les services exposés par Traefik doivent être sur le même réseau Docker :

```bash
docker network create traefik-network
```

## 2. Déployer Traefik

Crée un dossier de travail :

```bash
mkdir ~/traefik && cd ~/traefik
touch acme.json && chmod 600 acme.json
```

Crée le fichier `docker-compose.yml` :

```yaml
services:
  traefik:
    image: traefik:v3.0
    container_name: traefik
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    command:
      - "--api.dashboard=true"
      - "--providers.docker=true"
      - "--providers.docker.exposedbydefault=false"
      - "--entrypoints.web.address=:80"
      - "--entrypoints.websecure.address=:443"
      - "--certificatesresolvers.letsencrypt.acme.tlschallenge=true"
      - "--certificatesresolvers.letsencrypt.acme.email=ton@email.fr"
      - "--certificatesresolvers.letsencrypt.acme.storage=/acme.json"
      # Redirection HTTP -> HTTPS automatique
      - "--entrypoints.web.http.redirections.entrypoint.to=websecure"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - ./acme.json:/acme.json
    networks:
      - traefik-network
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.dashboard.rule=Host(`traefik.mondomaine.fr`)"
      - "traefik.http.routers.dashboard.tls.certresolver=letsencrypt"
      - "traefik.http.routers.dashboard.service=api@internal"

networks:
  traefik-network:
    external: true
```

> 💡 Remplace `ton@email.fr` et `traefik.mondomaine.fr` par tes vraies valeurs.

```bash
docker compose up -d
```

## 3. Exposer un service avec Traefik

Voici un exemple avec **Nginx** exposé en HTTPS automatiquement :

```yaml
services:
  monsite:
    image: nginx
    container_name: monsite
    restart: unless-stopped
    networks:
      - traefik-network
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.monsite.rule=Host(`monsite.mondomaine.fr`)"
      - "traefik.http.routers.monsite.tls.certresolver=letsencrypt"
      - "traefik.http.routers.monsite.entrypoints=websecure"

networks:
  traefik-network:
    external: true
```

Démarre le service et Traefik s'occupe du reste :

```bash
docker compose up -d
```

Ton site est maintenant accessible en HTTPS sur `https://monsite.mondomaine.fr` avec un certificat valide généré automatiquement. ✅

## 4. Visualiser le dashboard

Traefik propose un dashboard pour voir tous tes services et leurs statuts. Accède-y sur `https://traefik.mondomaine.fr`.

## Commandes utiles

```bash
# Voir les logs de Traefik
docker logs -f traefik

# Vérifier les certificats générés
cat ~/traefik/acme.json | python3 -m json.tool
```
