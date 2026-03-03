---
title: "Serveur Minecraft avec Docker en 5 minutes"
date: 2026-03-03 15:00:00 +0100
categories: [Tutoriels, Docker]
tags: [minecraft, docker, conteneur, compose]
---

Docker permet de faire tourner un serveur Minecraft dans un conteneur isolé, sans polluer ton système. C'est propre, facile à mettre à jour, et tu peux faire tourner plusieurs serveurs en parallèle.

## Prérequis

- Docker et Docker Compose installés ([guide officiel](https://docs.docker.com/engine/install/))
- Un serveur ou VPS sous Linux
- Port **25565** ouvert dans ton pare-feu

## 1. Installer Docker (si pas encore fait)

```bash
curl -fsSL https://get.docker.com | bash
sudo usermod -aG docker $USER
newgrp docker
```

## 2. Créer le fichier docker-compose

Crée un dossier de travail :

```bash
mkdir ~/minecraft && cd ~/minecraft
```

Crée le fichier `docker-compose.yml` :

```bash
nano docker-compose.yml
```

Colle ce contenu :

```yaml
services:
  minecraft:
    image: itzg/minecraft-server
    container_name: minecraft
    ports:
      - "25565:25565"
    environment:
      EULA: "TRUE"
      VERSION: "LATEST"
      MEMORY: "3G"
      TYPE: "PAPER"
      ONLINE_MODE: "TRUE"
    volumes:
      - ./data:/data
    restart: unless-stopped
```

## 3. Démarrer le serveur

```bash
docker compose up -d
```

Suis les logs en temps réel pour voir quand le serveur est prêt :

```bash
docker logs -f minecraft
```

Quand tu vois `Done! For help, type "help"`, le serveur est en ligne. ✅

## 4. Personnaliser le serveur

Tu peux modifier les variables d'environnement selon tes besoins :

| Variable | Description | Exemple |
|----------|-------------|----------|
| `VERSION` | Version de Minecraft | `1.21.4` |
| `TYPE` | Type de serveur | `PAPER`, `VANILLA`, `FORGE`, `FABRIC` |
| `MEMORY` | RAM allouée | `4G` |
| `DIFFICULTY` | Difficulté | `normal`, `hard` |
| `MAX_PLAYERS` | Joueurs max | `20` |
| `MOTD` | Message d'accueil | `Mon Super Serveur` |

Après modification, recrée le conteneur :

```bash
docker compose up -d --force-recreate
```

## 5. Commandes utiles

```bash
# Arrêter le serveur
docker compose stop

# Redémarrer
docker compose restart

# Accéder à la console Minecraft
docker attach minecraft
# (Ctrl+P puis Ctrl+Q pour quitter sans arrêter)

# Mettre à jour l'image
docker compose pull && docker compose up -d
```

> Les données du serveur (monde, configs, plugins) sont sauvegardées dans le dossier `./data` sur ton hôte.
