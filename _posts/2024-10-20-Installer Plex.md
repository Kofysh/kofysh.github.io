---
layout: post  
title: "Installer Plex sur un VPS (Debian/Ubuntu)"  
description: "Guide pour installer Plex Media Server sur un VPS Debian ou Ubuntu"  
date: 2024-10-20 15:30:00 +0100  
category: vps  
---

## Qu'est-ce que Plex ?

Plex est une solution centralisée qui vous permet d'accéder à tous vos médias préférés en un seul endroit. Vous pouvez l'utiliser pour streamer des médias personnels stockés sur votre propre serveur, ainsi que pour accéder à des films, des émissions, des podcasts, de la télévision en direct et bien plus encore. Plex est compatible avec une grande variété d'appareils, ce qui en fait un excellent choix pour gérer et profiter de vos contenus multimédias.

## Étapes pour installer Plex Media Server

### 1. Installation des dépendances

Avant de commencer l'installation de Plex, vous devez installer `curl` pour télécharger les fichiers nécessaires :

```bash
sudo apt-get install curl
```

### 2. Ajouter le dépôt Plex

Ajoutez le dépôt officiel de Plex pour Debian/Ubuntu et la clé de signature afin de permettre l'installation sécurisée des paquets :

```bash
sudo echo deb https://downloads.plex.tv/repo/deb ./public main | sudo tee /etc/apt/sources.list.d/plexmediaserver.list
sudo curl https://downloads.plex.tv/plex-keys/PlexSign.key | sudo apt-key add -
```

### 3. Mise à jour des paquets et installation de Plex

Après avoir ajouté le dépôt, mettez à jour vos paquets et installez Plex Media Server :

```bash
sudo apt-get update
sudo apt-get install plexmediaserver
```

### 4. Accéder à l'interface Plex

Une fois l'installation terminée, accédez à Plex via votre navigateur à l'URL suivante : 

```
http://votre_ip:32400/web
```

Cela vous permettra d'ouvrir l'interface web Plex et de commencer la configuration initiale.

![Accéder à Plex]({{ site.baseurl }}/images/plexsettings.webp)

## Lier votre serveur à Plex.tv

Si vous souhaitez lier votre serveur localement à Plex.tv, vous pouvez utiliser un tunnel SSH pour rediriger le port 32400 :

```bash
ssh -L 32400:127.0.0.1:32400 root@votre_ip_serveur
```

Accédez à l'URL suivante dans votre navigateur pour terminer la liaison :

```
https://localhost:32400/web
```

Connectez-vous à votre compte Plex et associez votre serveur via l'interface dans la section des réglages.

![Lier à Plex]({{ site.baseurl }}/images/plexbibli.webp)

## Ajouter des bibliothèques de médias

Pour ajouter des médias à votre Plex, cliquez sur l'icône "+" à gauche de l'interface web. Vous pourrez alors :

1. Spécifier le type de contenu (Films, Séries, Musique, etc.)
2. Choisir la langue et ajouter une description.
3. Sélectionner le dossier où sont stockés vos fichiers.

![Ajouter une bibliothèque]({{ site.baseurl }}/images/plexbibli.webp)

## Gestion du serveur Plex

### Lancer le serveur Plex

```bash
sudo service plexmediaserver start
```

### Arrêter le serveur Plex

```bash
sudo service plexmediaserver stop
```

### Redémarrer le serveur Plex

```bash
sudo service plexmediaserver restart
```

---

Ce guide vous permet de rapidement installer et configurer Plex sur votre VPS. Vous pourrez ainsi profiter de vos médias personnels où que vous soyez, et sur tous vos appareils.
