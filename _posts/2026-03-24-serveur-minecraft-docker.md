---
title: "Serveur Minecraft sous Docker : déploiement rapide"
date: 2026-03-24 10:00:00 +0100
categories: [Tutoriels, Game Servers]
tags: [minecraft, docker, game-server, java]
---

Déployer un serveur Minecraft avec Docker prend moins de 5 minutes grâce à l'image `itzg/minecraft-server`, la plus complète du marché.

## Déploiement de base

```bash
mkdir -p ~/docker/minecraft && cd ~/docker/minecraft
```

```yaml
services:
  minecraft:
    image: itzg/minecraft-server:latest
    container_name: minecraft
    restart: unless-stopped
    ports:
      - "25565:25565"
    environment:
      EULA: "TRUE"
      TYPE: "PAPER"          # Vanilla, Forge, Fabric, Paper, Purpur...
      VERSION: "LATEST"      # ou une version spécifique : "1.21.1"
      MEMORY: "4G"
      DIFFICULTY: "normal"
      MAX_PLAYERS: "20"
      MOTD: "Mon serveur Minecraft"
      ENABLE_AUTOPAUSE: "TRUE"  # Met en pause si personne connecté
    volumes:
      - ./data:/data
```

```bash
docker compose up -d
docker logs -f minecraft
```

## Types de serveur

| Type | Usage | Plugins/Mods |
|------|-------|---------------|
| `VANILLA` | Officiel, pur | Non |
| `PAPER` | Vanilla optimisé | Plugins Bukkit/Spigot |
| `PURPUR` | Paper amélioré | Plugins + options avancées |
| `FABRIC` | Mods légèrs | Mods Fabric |
| `FORGE` | Modpacks lourds | Mods Forge |

## Gestion via RCON

RCON permet d'envoyer des commandes au serveur depuis le terminal :

```yaml
environment:
  RCON_PASSWORD: "MOT_DE_PASSE_RCON"
  ENABLE_RCON: "true"
```

```bash
docker exec -i minecraft rcon-cli
# Puis tape tes commandes directement
```

## Sauvegardes automatiques

```bash
# Script simple de backup
cat > backup-minecraft.sh << 'EOF'
#!/bin/bash
DATE=$(date +%Y%m%d-%H%M)
docker exec minecraft rcon-cli save-off
docker exec minecraft rcon-cli save-all
tar -czf ~/backups/minecraft-$DATE.tar.gz ~/docker/minecraft/data
docker exec minecraft rcon-cli save-on
echo "Backup $DATE terminé"
EOF
chmod +x backup-minecraft.sh

# Ajouter au cron (tous les jours à 4h)
crontab -e
# 0 4 * * * /home/user/backup-minecraft.sh
```

> Utilise `save-off` avant le backup pour éviter la corruption des fichiers de monde.
{: .prompt-warning }
