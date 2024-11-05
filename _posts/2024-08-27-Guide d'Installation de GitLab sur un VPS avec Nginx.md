---
layout: post
title: Guide d'Installation de GitLab sur un VPS avec Nginx
description: Découvrez comment installer et configurer un serveur GitLab sur votre VPS exécutant Debian ou Ubuntu avec Nginx en tant que serveur web
tags: virt
---

# Guide d'Installation de GitLab sur un VPS avec Nginx

## Introduction

Ce guide vous aidera à installer et configurer un serveur GitLab sur votre VPS (Virtual Private Server) exécutant Debian ou Ubuntu. GitLab est un outil open-source de gestion de code source qui offre des fonctionnalités de contrôle de version, de gestion de projets, de suivi des bugs, et bien plus encore. Dans cette version du guide, nous allons également configurer Nginx comme serveur web pour GitLab, offrant une meilleure performance et une sécurité accrue.

## Prérequis

- Un VPS fonctionnant sous Debian ou Ubuntu.
- Un accès root ou sudo à votre VPS.
- Un nom de domaine configuré pour pointer vers votre VPS.
- Un certificat SSL valide pour votre nom de domaine (facultatif, mais recommandé pour des raisons de sécurité).

## Étape 1 : Mise à jour du Système

Avant de procéder à l'installation, il est essentiel de mettre à jour votre système. Exécutez les commandes suivantes dans votre terminal :

```bash
sudo apt update
sudo apt upgrade -y
sudo apt dist-upgrade -y
```

## Étape 2 : Installation de GitLab

### 2.1 Installation des Dépendances

Commencez par installer les dépendances nécessaires à l'exécution de GitLab :

```bash
sudo apt install -y curl openssh-server ca-certificates tzdata perl
```

### 2.2 Ajout du Dépôt GitLab

Ensuite, ajoutez le dépôt GitLab à votre VPS en exécutant la commande suivante :

```bash
curl https://packages.gitlab.com/install/repositories/gitlab/gitlab-ee/script.deb.sh | sudo bash
```

### 2.3 Installation de GitLab

Installez GitLab en exécutant la commande suivante :

```bash
sudo EXTERNAL_URL="https://votre-nom-de-domaine.com"
sudo apt install gitlab-ee
```

## Étape 3 : Configuration de Nginx

### 3.1 Installation de Nginx

Installez Nginx en exécutant la commande suivante :

```bash
sudo apt install nginx
```

### 3.2 Configuration de Nginx

Créez un fichier de configuration Nginx pour GitLab :

```bash
sudo nano /etc/nginx/sites-available/gitlab
```

Ajoutez la configuration suivante au fichier, en veillant à remplacer `votre-nom-de-domaine.com` par votre nom de domaine :

```
server {
  listen 80;
  server_name votre-nom-de-domaine.com;
  return 301 https://$server_name$request_uri;
}

server {
  listen 443 ssl;
  server_name votre-nom-de-domaine.com;

  ssl_certificate /etc/letsencrypt/live/votre-nom-de-domaine.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/votre-nom-de-domaine.com/privkey.pem;
  ssl_protocols TLSv1.2 TLSv1.3;
  ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384;
  ssl_prefer_server_ciphers on;
  ssl_session_cache shared:SSL:10m;
  ssl_session_timeout 5m;

  location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_set_header Host $http_host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 90;
  }
}
```

### 3.3 Activation du Fichier de Configuration Nginx

Activez le fichier de configuration Nginx pour GitLab en créant un lien symbolique :

```bash
sudo ln -s /etc/nginx/sites-available/gitlab /etc/nginx/sites-enabled/
```

### 3.4 Redémarrage de Nginx

Redémarrez Nginx pour appliquer les modifications :

```bash
sudo systemctl restart nginx
```

## Étape 4 : Configuration de GitLab

### 4.1 Modification de la Configuration GitLab

Modifiez la configuration GitLab pour utiliser Nginx :

```bash
sudo nano /etc/gitlab/gitlab.rb
```

Dans le fichier, recherchez la ligne suivante :

```
nginx['enable'] = false
```

Remplacez-la par :

```
nginx['enable'] = true
nginx['listen_port'] = 8080
nginx['listen_https'] = false
```

### 4.2 Reconfiguration de GitLab

Reconfigurez GitLab pour appliquer les modifications :

```bash
sudo gitlab-ctl reconfigure
```

## Conclusion

Vous avez maintenant installé et configuré un serveur GitLab sur votre VPS avec Nginx en tant que serveur web. Vous pouvez accéder à GitLab en utilisant le nom de domaine que vous avez configuré, par exemple `https://votre-nom-de-domaine.com`.

N'oubliez pas de suivre les meilleures pratiques de sécurité, telles que la mise en place de mots de passe forts, la gestion des utilisateurs et des groupes, et la configuration des paramètres de sécurité de GitLab.

Pour plus d'informations sur GitLab, consultez la [documentation officielle](https://docs.gitlab.com/). Pour plus d'informations sur Nginx, consultez la [documentation officielle](https://nginx.org/en/docs/).
