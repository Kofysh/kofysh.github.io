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

> Vérifie que rien d'autre n'écoute sur le port 80/443 avant de démarrer Traefik.
{: .prompt-warning }

## 1. Créer le réseau Docker

Tous les services exposés par Traefik doivent être sur le même réseau Docker :

```bash
docker network create traefik-network
```

## 2. Déployer Traefik

Crée un dossier de travail :

```bash
mkdir -p ~/docker/traefik && cd ~/docker/traefik
touch acme.json && chmod 600 acme.json
```

> Le `chmod 600` sur `acme.json` est **obligatoire** — Traefik refuse de démarrer si les permissions sont trop ouvertes.
{: .prompt-danger }

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
      # Redirection HTTP → HTTPS automatique
      - "--entrypoints.web.http.redirections.entrypoint.to=websecure"
      - "--entrypoints.web.http.redirections.entrypoint.scheme=https"
      # Logs
      - "--log.level=INFO"
      - "--accesslog=true"
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
      - "traefik.http.routers.dashboard.middlewares=dashboard-auth"
      - "traefik.http.middlewares.dashboard-auth.basicauth.users=admin:HASH_A_GENERER"

networks:
  traefik-network:
    external: true
```

> Remplace `ton@email.fr`, `traefik.mondomaine.fr` et `HASH_A_GENERER` par tes vraies valeurs (voir section sécurisation).
{: .prompt-tip }

```bash
docker compose up -d
docker logs -f traefik
```

## 3. Exposer un service avec Traefik

Voici un exemple complet avec **Nginx** exposé en HTTPS :

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
      - "traefik.http.routers.monsite.entrypoints=websecure"
      - "traefik.http.routers.monsite.tls.certresolver=letsencrypt"
      # Optionnel : rediriger explicitement depuis HTTP
      - "traefik.http.routers.monsite-http.rule=Host(`monsite.mondomaine.fr`)"
      - "traefik.http.routers.monsite-http.entrypoints=web"
      - "traefik.http.routers.monsite-http.middlewares=redirect-https"
      - "traefik.http.middlewares.redirect-https.redirectscheme.scheme=https"

networks:
  traefik-network:
    external: true
```

```bash
docker compose up -d
```

Ton service est accessible en HTTPS sur `https://monsite.mondomaine.fr` avec un certificat valide ✅

## 4. Sécuriser le dashboard

Le dashboard Traefik est accessible sans auth par défaut. Génère un hash bcrypt :

```bash
sudo apt install -y apache2-utils
# Génère le hash pour l'utilisateur "admin"
echo $(htpasswd -nb admin MON_MOT_DE_PASSE) | sed -e s/\\$/\\$\\$/g
```

Copie le résultat et remplace `HASH_A_GENERER` dans les labels du `docker-compose.yml` de Traefik.

> Ne laisse **jamais** le dashboard exposé sans authentification en production.
{: .prompt-danger }

## 5. Ajouter des middlewares utiles

Traefik supporte des middlewares réutilisables. Voici les plus courants à définir directement en labels :

### Rate limiting

```yaml
labels:
  - "traefik.http.middlewares.ratelimit.ratelimit.average=100"
  - "traefik.http.middlewares.ratelimit.ratelimit.burst=50"
```

### Headers de sécurité

```yaml
labels:
  - "traefik.http.middlewares.secheaders.headers.stsSeconds=31536000"
  - "traefik.http.middlewares.secheaders.headers.stsIncludeSubdomains=true"
  - "traefik.http.middlewares.secheaders.headers.contentTypeNosniff=true"
  - "traefik.http.middlewares.secheaders.headers.browserXssFilter=true"
  - "traefik.http.middlewares.secheaders.headers.referrerPolicy=strict-origin-when-cross-origin"
```

## 6. Commandes de diagnostic

```bash
# Voir les logs en temps réel
docker logs -f traefik

# Lister les routes actives
docker exec traefik traefik version

# Inspecter les certificats générés
cat ~/docker/traefik/acme.json | python3 -m json.tool | grep -A3 'domain'

# Vérifier l'état des conteneurs
docker compose ps
```

## Résumé de l'architecture

```
Internet
   │
   ▼
Traefik (80/443)
   │
   ├── traefik.mondomaine.fr  →  Dashboard (basicAuth)
   ├── monsite.mondomaine.fr  →  Nginx
   ├── nextcloud.mondomaine.fr → Nextcloud
   └── ...                    →  Autres services
```

Avec cette configuration, chaque nouveau service que tu ajoutes à `traefik-network` avec les bons labels est automatiquement disponible en HTTPS. Plus besoin de gérer Certbot ou nginx manuellement.
