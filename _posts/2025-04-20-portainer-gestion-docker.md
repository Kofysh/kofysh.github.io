---
title: "Portainer : Gérer Docker avec une Interface Web"
date: 2025-04-20 10:00:00 +0100
categories: [Selfhost, Docker]
tags: [portainer, docker, interface, administration, selfhost]
---

## Qu'est-ce que Portainer ?

Portainer est une interface web pour gérer vos conteneurs Docker. Idéal si vous débutez ou si vous préférez une interface graphique à la ligne de commande.

## Installation

```bash
mkdir -p ~/docker/portainer && cd ~/docker/portainer
```

```yaml
# docker-compose.yml
services:
  portainer:
    image: portainer/portainer-ce:latest
    container_name: portainer
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - ./data:/data
    networks:
      - proxy
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.portainer.rule=Host(`portainer.mondomaine.fr`)"
      - "traefik.http.services.portainer.loadbalancer.server.port=9000"
      - "traefik.http.routers.portainer.middlewares=default-chain@file"
    security_opt:
      - no-new-privileges:true
    restart: unless-stopped

networks:
  proxy:
    external: true
```

```bash
docker compose up -d
```

Créez votre compte admin sur `https://portainer.mondomaine.fr`.

## Fonctionnalités clés

### Stacks (docker-compose via l'interface)

Portainer permet de déployer des stacks Docker Compose directement depuis l'interface web :

1. **Stacks** → Add stack
2. Collez votre `docker-compose.yml`
3. Définissez les variables d'environnement
4. Deploy

### Gestion des conteneurs

- Démarrer / Arrêter / Redémarrer
- Voir les logs en temps réel
- Ouvrir un terminal dans le conteneur
- Statistiques CPU/RAM en temps réel

### Images

- Lister les images locales
- Puller de nouvelles images
- Supprimer les images inutilisées

### Volumes et Réseaux

- Créer et gérer des volumes
- Inspecter les réseaux Docker

## Portainer Agent (multi-serveurs)

Gérez plusieurs serveurs depuis une seule interface :

```yaml
# Sur le serveur distant
services:
  portainer-agent:
    image: portainer/agent:latest
    container_name: portainer-agent
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - /var/lib/docker/volumes:/var/lib/docker/volumes
    ports:
      - "9001:9001"
    restart: unless-stopped
```

Dans Portainer principal → Environments → Add → Agent → renseignez l'IP et le port 9001.

## Alternatives à Portainer

| Outil | Points forts | Points faibles |
|-------|-------------|----------------|
| **Portainer** | Complet, populaire | Lourd |
| **Dozzle** | Logs en temps réel | Logs uniquement |
| **Yacht** | Léger, simple | Moins de fonctions |
| **Lazydocker** | Terminal UI | Pas de web |

> Le socket Docker donne un **accès root** au serveur. Sécurisez bien l'accès à Portainer avec authentification forte.
{: .prompt-danger }
