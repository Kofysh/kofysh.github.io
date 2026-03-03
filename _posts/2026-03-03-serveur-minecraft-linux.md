---
title: "Installer un serveur Minecraft sur Linux"
date: 2026-03-03 14:00:00 +0100
categories: [Tutoriels, Gaming]
tags: [minecraft, linux, serveur, java]
---

Dans ce tutoriel, on va installer un serveur Minecraft vanilla sur un serveur Linux (Debian/Ubuntu). Pas besoin d'être expert — chaque étape est expliquée.

## Prérequis

Avant de commencer, assure-toi d'avoir :

- Un serveur ou VPS sous **Debian 12** ou **Ubuntu 22.04+**
- Un accès **root** ou un utilisateur avec les droits `sudo`
- Au moins **2 Go de RAM** (4 Go recommandés pour une bonne expérience)
- Un accès SSH ou un terminal ouvert

## 1. Mettre à jour le système

Toujours commencer par mettre à jour les paquets pour éviter les conflits :

```bash
sudo apt update && sudo apt upgrade -y
```

## 2. Installer Java

Minecraft nécessite Java pour fonctionner. On installe la version **Java 21**, recommandée pour les versions récentes de Minecraft :

```bash
sudo apt install -y openjdk-21-jre-headless
```

Vérifie que Java est bien installé :

```bash
java -version
```

Tu devrais voir quelque chose comme `openjdk version "21.x.x"`.

## 3. Créer un utilisateur dédié

Par sécurité, on ne fait **jamais** tourner un serveur de jeu en root. On crée un utilisateur spécifique :

```bash
sudo useradd -m -s /bin/bash minecraft
sudo su - minecraft
```

À partir de maintenant, tu es connecté en tant qu'utilisateur `minecraft`.

## 4. Télécharger le serveur Minecraft

Crée un dossier dédié et télécharge le fichier serveur :

```bash
mkdir ~/server && cd ~/server
```

Rends-toi sur [minecraft.net/fr-fr/download/server](https://www.minecraft.net/fr-fr/download/server), copie le lien de téléchargement, puis :

```bash
wget -O server.jar https://LIEN_COPIE_ICI
```

> 💡 Remplace `https://LIEN_COPIE_ICI` par le lien récupéré sur le site officiel.

## 5. Premier lancement & accepter l'EULA

Lance le serveur une première fois pour générer les fichiers de configuration :

```bash
java -Xms1G -Xmx3G -jar server.jar nogui
```

Le serveur va s'arrêter automatiquement et créer un fichier `eula.txt`. Tu dois accepter les conditions d'utilisation :

```bash
sed -i 's/eula=false/eula=true/' eula.txt
```

Relance ensuite le serveur :

```bash
java -Xms1G -Xmx3G -jar server.jar nogui
```

> `-Xms1G` = RAM minimale allouée | `-Xmx3G` = RAM maximale allouée. Adapte selon ta machine.

## 6. Créer un service systemd

Pour que le serveur démarre automatiquement au reboot, on crée un service système. Quitte d'abord l'utilisateur minecraft :

```bash
exit
```

Crée le fichier de service :

```bash
sudo nano /etc/systemd/system/minecraft.service
```

Colle ce contenu :

```ini
[Unit]
Description=Serveur Minecraft
After=network.target

[Service]
User=minecraft
WorkingDirectory=/home/minecraft/server
ExecStart=/usr/bin/java -Xms1G -Xmx3G -jar server.jar nogui
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Active et démarre le service :

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now minecraft
```

Vérifie que tout fonctionne :

```bash
sudo systemctl status minecraft
```

## 7. Ouvrir le port dans le pare-feu

Par défaut, Minecraft utilise le port **25565**. Si tu as un pare-feu actif :

```bash
sudo ufw allow 25565/tcp
sudo ufw reload
```

## Connexion au serveur

Ton serveur est maintenant accessible ! Dans Minecraft, va dans **Multijoueur > Ajouter un serveur** et entre l'adresse IP de ton serveur suivi de `:25565`.

> Pour trouver l'IP de ton serveur : `curl ifconfig.me`
