---
title: "Serveur Minecraft sur Linux bare-metal : le guide complet"
date: 2026-03-31 10:00:00 +0100
categories: [Tutoriels, Game Servers]
tags: [minecraft, linux, java, systemd, game-server]
---

Installer Minecraft directement sur un serveur Linux (sans Docker) donne plus de contrôle sur les performances et la configuration JVM. Voici la méthode propre avec systemd.

## Prérequis

```bash
# Installer Java 21 (requis pour Minecraft 1.21+)
sudo apt install -y default-jdk-headless
java -version

# Créer un utilisateur dédié
sudo useradd -r -m -U -d /opt/minecraft -s /bin/false minecraft
```

## Télécharger Paper

```bash
sudo su -s /bin/bash minecraft
mkdir -p /opt/minecraft/server && cd /opt/minecraft/server

# Récupère la dernière version de Paper
curl -o paper.jar https://api.papermc.io/v2/projects/paper/versions/$(curl -s https://api.papermc.io/v2/projects/paper | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['versions'][-1])")/builds/$(curl -s https://api.papermc.io/v2/projects/paper/versions/1.21.4/builds | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['builds'][-1]['build'])")/downloads/paper-1.21.4-*.jar
```

## Configurer le serveur

```bash
# Accepter l'EULA
echo 'eula=true' > eula.txt

# Créer le fichier server.properties
cat > server.properties << EOF
server-port=25565
max-players=20
difficulty=normal
motd=Mon serveur Kofy
view-distance=10
simulation-distance=8
EOF
```

## Flags JVM optimisés (Aikar's flags)

```bash
java -Xms4G -Xmx4G \
  -XX:+UseG1GC \
  -XX:+ParallelRefProcEnabled \
  -XX:MaxGCPauseMillis=200 \
  -XX:+UnlockExperimentalVMOptions \
  -XX:+DisableExplicitGC \
  -XX:+AlwaysPreTouch \
  -XX:G1NewSizePercent=30 \
  -XX:G1MaxNewSizePercent=40 \
  -XX:G1HeapRegionSize=8M \
  -XX:G1ReservePercent=20 \
  -XX:G1HeapWastePercent=5 \
  -XX:G1MixedGCCountTarget=4 \
  -XX:InitiatingHeapOccupancyPercent=15 \
  -XX:G1MixedGCLiveThresholdPercent=90 \
  -XX:G1RSetUpdatingPauseTimePercent=5 \
  -XX:SurvivorRatio=32 \
  -XX:+PerfDisableSharedMem \
  -XX:MaxTenuringThreshold=1 \
  -jar paper.jar --nogui
```

## Service systemd

```bash
sudo nano /etc/systemd/system/minecraft.service
```

```ini
[Unit]
Description=Serveur Minecraft Paper
After=network.target

[Service]
User=minecraft
WorkingDirectory=/opt/minecraft/server
ExecStart=/usr/bin/java -Xms4G -Xmx4G -XX:+UseG1GC -jar paper.jar --nogui
ExecStop=/bin/kill -s INT $MAINPID
SuccessExitStatus=0 1
Restart=on-failure
RestartSec=30

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now minecraft
sudo journalctl -u minecraft -f
```

> Les flags JVM d'Aikar réduisent significativement les pics de lag causés par le Garbage Collector. Recommandés pour tout serveur avec plus de 10 joueurs.
{: .prompt-tip }
