---
title: "Gérer ses serveurs de jeux avec Pterodactyl"
date: 2026-03-03 18:00:00 +0100
categories: [Tutoriels, Hosting]
tags: [pterodactyl, panel, game-server, linux, hosting]
---

Pterodactyl est un panel open-source pour gérer plusieurs serveurs de jeux (Minecraft, CS2, Valheim, Rust...) depuis une interface web propre et sécurisée. Idéal si tu veux héberger plusieurs serveurs sans tout faire à la main.

## Architecture

Pterodactyl fonctionne avec deux composants :

- **Panel** : l'interface web (Laravel/PHP) installée sur un serveur principal
- **Wings** : le daemon installé sur chaque nœud (serveur de jeux), il communique avec le Panel et gère les conteneurs Docker

> Les deux peuvent être sur la même machine pour commencer.

## Prérequis

- Debian 12 ou Ubuntu 22.04+
- Minimum **2 Go de RAM**, 20 Go de stockage
- Un nom de domaine pointant vers ton serveur (ex: `panel.mondomaine.fr`)
- Docker installé pour Wings

## 1. Installer les dépendances du Panel

```bash
sudo apt update && sudo apt install -y \
  php8.3 php8.3-{cli,gd,mysql,mbstring,bcmath,xml,fpm,curl,zip} \
  mariadb-server nginx curl tar unzip git redis-server
```

Active les services :

```bash
sudo systemctl enable --now mariadb redis-server nginx
```

## 2. Configurer la base de données

```bash
sudo mysql -u root -p
```

```sql
CREATE DATABASE panel;
CREATE USER 'pterodactyl'@'localhost' IDENTIFIED BY 'MOT_DE_PASSE_FORT';
GRANT ALL PRIVILEGES ON panel.* TO 'pterodactyl'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

## 3. Télécharger le Panel

```bash
mkdir -p /var/www/pterodactyl && cd /var/www/pterodactyl
curl -Lo panel.tar.gz https://github.com/pterodactyl/panel/releases/latest/download/panel.tar.gz
tar -xzvf panel.tar.gz
chmod -R 755 storage/* bootstrap/cache/
```

## 4. Configurer le Panel

Installe les dépendances PHP :

```bash
curl -sS https://getcomposer.org/installer | php -- --install-dir=/usr/local/bin --filename=composer
composer install --no-dev --optimize-autoloader
```

Copie et édite le fichier d'environnement :

```bash
cp .env.example .env
php artisan key:generate --force
```

Configure la base de données, le cache, et les paramètres :

```bash
php artisan p:environment:setup
php artisan p:environment:database
php artisan migrate --seed --force
```

Crée un administrateur :

```bash
php artisan p:user:make
```

## 5. Installer Wings

Sur le nœud (peut être la même machine), installe Wings :

```bash
curl -fsSL https://get.docker.com | bash
mkdir -p /etc/pterodactyl
curl -L -o /usr/local/bin/wings \
  https://github.com/pterodactyl/wings/releases/latest/download/wings_linux_amd64
chmod +x /usr/local/bin/wings
```

Dans le Panel, va dans **Admin > Nodes > Créer un nœud**, configure-le, puis copie le fichier de configuration généré dans `/etc/pterodactyl/config.yml`.

Démarre Wings :

```bash
sudo systemctl enable --now wings
```

## Documentation complète

La documentation officielle est très bien faite : [pterodactyl.io/docs](https://pterodactyl.io/docs)
