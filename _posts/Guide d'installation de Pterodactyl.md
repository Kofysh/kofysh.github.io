---
layout: post
title: "Guide d'installation du panel Pterodactyl et Wings sur un VPS"
description: "Découvrez comment installer et configurer le panel Pterodactyl et Wings pour gérer vos serveurs de jeux de manière efficace et sécurisée"
tags: vps
---

Pterodactyl est un panel conçu pour simplifier la gestion des serveurs de jeux et d'applications. Ce guide détaillé vous guidera à travers le processus d'installation du panel Pterodactyl et de Wings (Daemon) sur votre serveur.

## Prérequis

- Un serveur sous Ubuntu 20.04 ou une version ultérieure
- Un accès root ou un utilisateur avec des privilèges sudo
- Un nom de domaine pointant vers votre serveur
- Docker installé sur le serveur

## Étape 1 : Mise à jour du système

Avant de commencer, il est recommandé de mettre à jour votre système pour garantir que vous disposez des dernières versions des paquets et des dépendances.

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y software-properties-common curl apt-transport-https ca-certificates gnupg
```

## Étape 2 : Installation de Docker

Docker est un outil essentiel pour exécuter des applications dans des conteneurs isolés. Suivez les étapes ci-dessous pour installer Docker sur votre serveur.

```bash
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo apt-key add -
sudo add-apt-repository "deb [arch=amd64] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable"
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io
sudo systemctl start docker
sudo systemctl enable docker
```

## Étape 3 : Installation de Docker Compose

Docker Compose est un outil pour définir et exécuter des applications multi-conteneurs. Suivez les étapes ci-dessous pour installer Docker Compose.

```bash
sudo curl -L "https://github.com/docker/compose/releases/download/1.29.2/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
```

## Étape 4 : Installation de Pterodactyl Panel

### Installation des dépendances

Avant d'installer le panel Pterodactyl, vous devez installer certaines dépendances.

```bash
sudo apt install -y git curl redis-server mariadb-server mariadb-client
```

### Configuration de MariaDB

MariaDB est un système de gestion de base de données open source utilisé pour stocker les données du panel Pterodactyl. Suivez les étapes ci-dessous pour configurer MariaDB.

```bash
sudo mysql_secure_installation
sudo mysql -u root -p
CREATE DATABASE panel;
CREATE USER 'pterodactyl'@'localhost' IDENTIFIED BY 'password';
GRANT ALL PRIVILEGES ON panel.* TO 'pterodactyl'@'localhost' WITH GRANT OPTION;
FLUSH PRIVILEGES;
EXIT;
```

### Installation du panel Pterodactyl

Maintenant que MariaDB est configuré, vous pouvez installer le panel Pterodactyl.

```bash
cd /var/www
sudo mkdir -p pterodactyl
cd pterodactyl
sudo curl -Lo panel.tar.gz https://github.com/pterodactyl/panel/releases/latest/download/panel.tar.gz
sudo tar -xzvf panel.tar.gz
sudo chmod -R 755 storage/* bootstrap/cache/
sudo cp .env.example .env
sudo nano .env
```

Remplissez le fichier `.env` avec vos informations de base de données et autres configurations.

### Installation de Composer

Composer est un outil pour la gestion des dépendances PHP. Suivez les étapes ci-dessous pour installer Composer.

```bash
sudo curl -sS https://getcomposer.org/installer | php
sudo mv composer.phar /usr/local/bin/composer
```

### Installation des dépendances PHP

Installez les dépendances PHP nécessaires pour le panel Pterodactyl.

```bash
sudo apt install -y php8.0 php8.0-fpm php8.0-cli php8.0-mysql php8.0-gd php8.0-mbstring php8.0-xml php8.0-curl unzip
sudo systemctl start php8.0-fpm
sudo systemctl enable php8.0-fpm
sudo composer install --no-dev --optimize-autoloader
```

### Configuration de l'application

Configurez l'application Pterodactyl avec les commandes suivantes.

```bash
sudo php artisan key:generate --force
sudo php artisan p:environment:setup
sudo php artisan p:environment:database
sudo php artisan migrate --seed --force
sudo php artisan p:user:make
sudo chown -R www-data:www-data /var/www/pterodactyl/*
```

## Étape 5 : Configuration du serveur Web

### Configuration de Nginx

Nginx est un serveur web populaire utilisé pour servir le panel Pterodactyl. Suivez les étapes ci-dessous pour configurer Nginx.

```bash
sudo apt install -y nginx
sudo nano /etc/nginx/sites-available/pterodactyl.conf
```

Ajoutez la configuration suivante :

```nginx
server {
    listen 80;
    server_name votredomaine.com;

    root /var/www/pterodactyl/public;
    index index.php;

    access_log /var/log/nginx/pterodactyl.app-access.log;
    error_log  /var/log/nginx/pterodactyl.app-error.log error;

    location / {
        try_files $uri $uri/ /index.php?$query_string;
    }

    location ~ \.php$ {
        include snippets/fastcgi-php.conf;
        fastcgi_pass unix:/run/php/php8.0-fpm.sock;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
        include fastcgi_params;
    }

    location ~ /\.ht {
        deny all;
    }
}
```

Activez le site et redémarrez Nginx :

```bash
sudo ln -s /etc/nginx/sites-available/pterodactyl.conf /etc/nginx/sites-enabled/
sudo systemctl restart nginx
```

### Configuration de SSL avec Let's Encrypt

Pour sécuriser votre connexion, configurez SSL avec Let's Encrypt.

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d votredomaine.com
```

## Étape 6 : Installation de Wings

Wings est le composant serveur de Pterodactyl qui gère les conteneurs Docker pour vos serveurs de jeux. Suivez les étapes ci-dessous pour installer Wings.

```bash
sudo mkdir -p /etc/pterodactyl
sudo curl -Lo /usr/local/bin/wings https://github.com/pterodactyl/wings/releases/latest/download/wings_linux_amd64
sudo chmod +x /usr/local/bin/wings
sudo nano /etc/pterodactyl/config.yml
```

Configurez `config.yml` avec les informations de votre panel.

### Démarrage de Wings

Démarrez Wings avec la commande suivante :

```bash
sudo wings
```

Pour exécuter Wings en tant que service, créez un fichier de service systemd :

```bash
sudo nano /etc/systemd/system/wings.service
```

Ajoutez le contenu suivant :

```ini
[Unit]
Description=Pterodactyl Wings Daemon
After=docker.service
Requires=docker.service

[Service]
User=root
WorkingDirectory=/etc/pterodactyl
ExecStart=/usr/local/bin/wings
Restart=on-failure
StartLimitInterval=600

[Install]
WantedBy=multi-user.target
```

Activez et démarrez le service :

```bash
sudo systemctl enable wings
sudo systemctl start wings
```

## Conclusion

Vous avez maintenant installé et configuré le panel Pterodactyl et Wings sur votre serveur. Vous pouvez accéder à votre panneau de contrôle en visitant votre domaine. Suivez les instructions de la documentation officielle pour configurer vos serveurs de jeux et administrer votre infrastructure.
```
