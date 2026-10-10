---
title: Projet OTERIA B2 — plateforme VPS Paymenter et Proxmox VE
date: 2026-10-10 18:48:00 +0200
categories: [Cybersécurité, Homelab]
tags: [OTERIA, Proxmox, Paymenter, VPS, Debian 13, documentation technique]
description: >-
  Dossier technique de conception et de procédures pour une plateforme VPS Paymenter/Proxmox.
  Les procédures ne valent pas preuve d'exécution ; les résultats non constatés sont explicitement signalés.
---

# Projet OTERIA B2 — plateforme VPS Paymenter et Proxmox VE

**Dossier technique v2.0 — 10 octobre 2026**  
**Nature du document :** conception et guide de déploiement. Ce document ne doit pas être lu comme un procès-verbal de recette ni comme une attestation de mise en production.

## Statut du projet et portée des preuves

Le dossier source décrit une architecture cible et des procédures pour déployer Paymenter sur Debian et préparer Proxmox VE. Il distingue explicitement les versions de référence des versions relevées, et marque plusieurs essais de recette comme **Non testé**. En conséquence, la présence d'une commande dans ce guide signifie qu'il s'agit d'une procédure proposée ou de référence ; elle ne prouve pas que la commande a été exécutée ni que le résultat attendu a été obtenu.

Pour un dossier final à rendre, il faut présenter séparément :

- **Conception** : architecture, décisions et objectifs de sécurité.
- **Procédure** : étapes reproductibles et commandes à exécuter.
- **Résultat observé** : sortie réelle d'une exécution, datée et associée à l'environnement.
- **Preuve** : capture expurgée, journal, sortie de commande ou rapport de test permettant de vérifier le résultat.

Aucune preuve d'exécution n'est créée par la rédaction de cette page. Les valeurs d'environnement, sorties de commandes, captures et verdicts de test doivent provenir du système réellement installé. Les inventer rendrait la documentation trompeuse.

### État d'après les éléments disponibles

| Élément | Ce que le dossier source permet d'affirmer | Ce qui doit être établi pour un rapport d'implémentation |
| --- | --- | --- |
| Périmètre VPS QEMU/KVM | Défini comme périmètre de conception | Confirmer la configuration réellement utilisée |
| Debian, PHP, MariaDB, Redis, NGINX | Versions de référence listées | Fournir les versions constatées et leurs commandes de preuve |
| Paymenter | v1.5.9 est une référence documentaire | Fournir tag/release installé et preuve d'accès fonctionnel |
| Extension Paymenter-Proxmox | À identifier et versionner | Nom, source, version/commit, compatibilité et tests réels |
| TLS et exposition réseau | Politique cible décrite | Certificat, renouvellement, scans autorisés et règles observées |
| Paiement/webhook | Contrôles attendus décrits | Événements sandbox observés et traces expurgées |
| Provisionnement | Algorithme cible décrit | VM effectivement liée à une commande de test, sans doublon |
| Isolation VPS | Résultats attendus définis | Tests réseau IPv4/IPv6 réels et preuves expurgées |
| Sauvegarde/restauration | Procédures cibles décrites | Archive produite et restauration complète mesurée en laboratoire |

Tant que ces preuves ne sont pas ajoutées, le titre correct est « dossier de conception et de procédures », pas « plateforme validée » ou « production opérationnelle ».

## 1. Objet, périmètre et règles du dossier

### 1.1 Objectif

Le projet étudie la conception d'une plateforme d'hébergement de VPS automatisée. Paymenter fournit le portail, le catalogue, les commandes, les factures et les mécanismes de paiement. Proxmox VE est l'hyperviseur cible des VM QEMU/KVM.

Le scénario cible est le suivant : après qu'un paiement a été vérifié côté serveur, une tâche liée à la commande demande la création d'une VM dans un environnement Proxmox privé. La tâche doit éviter les doublons, appliquer les ressources prévues et vérifier la VM avant de déclarer le service actif.

Ce scénario décrit le comportement visé. Il ne permet pas à lui seul d'affirmer que le paiement, le webhook, le plugin ou le provisionnement ont fonctionné sur une machine réelle.

### 1.2 Inclus et exclus

| Périmètre prévu | Hors périmètre tant que non implémenté et testé |
| --- | --- |
| VPS sous forme de VM QEMU/KVM | Serveurs de jeux |
| Paymenter autonome sur Debian 13 | Provisionnement automatisé LXC |
| NGINX, PHP-FPM, MariaDB et Redis | Extension dont la source et la compatibilité ne sont pas établies |
| API Proxmox par compte/token dédié | Garanties de capacité, disponibilité ou performance non mesurées |
| Templates cloud-init et réseau client isolé | Affirmer qu'un parcours bout en bout fonctionne sans recette |
| Sauvegarde, supervision et procédures | Valeurs RPO/RTO non mesurées par restauration réelle |

Une VM utilise son propre noyau, tandis qu'un conteneur partage celui de l'hôte. Ce choix d'architecture vise une séparation adaptée aux VPS administrés par des clients ; il ne prouve pas que l'isolation est correctement configurée.

### 1.3 Statuts utilisés

| Statut | Signification |
| --- | --- |
| Réussi | Test exécuté, résultat conforme, preuve conservée |
| Partiel | Une partie du critère est vérifiée et les limites sont consignées |
| Échoué | Test exécuté, résultat non conforme, anomalie tracée |
| Non testé | Aucun résultat d'exécution disponible |
| À relever | Valeur système à collecter dans l'environnement cible |
| Procédure | Commande ou démarche proposée ; aucune exécution n'est implicitement affirmée |

Une procédure n'est pas une preuve. Une commande écrite dans le document ne signifie pas qu'elle a été lancée. Un résultat de test doit avoir une date, un environnement, un résultat attendu, un résultat observé et un artefact expurgé.

### 1.4 Placeholders et données sensibles

Les domaines, adresses, CIDR, VMID, bridges, pools et stockages présents dans les exemples sont des placeholders. Ils sont à remplacer après inventaire. Aucun secret ne doit figurer dans le document : APPKEY, mots de passe SQL, tokens, clés de paiement, clés SSH privées ou certificats privés.

Toute commande modifiant SSH, pare-feu, ACL, comptes ou VM peut interrompre un service ou supprimer des données. Vérifier la cible, l'accès console et le plan de retour arrière avant exécution.

## 2. Architecture cible

### 2.1 Composants

La conception cible comprend un portail Paymenter installé directement sur Debian 13, servi par NGINX et PHP-FPM. MariaDB et Redis restent sur le serveur applicatif et n'écoutent que sur les interfaces nécessaires. Un worker systemd traite les jobs asynchrones. L'API Proxmox n'est accessible que depuis le composant d'intégration par le réseau d'administration privé.

| Zone | Composants prévus | Exposition cible |
| --- | --- | --- |
| Frontal | NGINX et TLS | HTTPS public ; HTTP selon redirection/ACME |
| Application | Paymenter, PHP-FPM, worker | Flux locaux et internes uniquement |
| Données | MariaDB, Redis | Loopback dans la topologie de référence |
| Gestion | API Proxmox, SSH, hyperviseur | VPN ou réseau d'administration |
| Clients | VM QEMU/KVM | Bridge/VLAN client séparé |
| Sauvegarde | Cible hors hôte | Flux exploitation uniquement |

Cette table décrit l'architecture projetée. Pour le rendu, la remplacer ou la compléter par le schéma réel, les interfaces, routes, VLAN, règles et ports constatés.

### 2.2 Flux attendus

| Source | Destination | Flux prévu | Contrôle à démontrer |
| --- | --- | --- | --- |
| Internet | NGINX | HTTPS 443 | Certificat valide et serveur configuré |
| Prestataire de paiement | Webhook Paymenter | HTTPS | Signature et événement validés côté serveur |
| NGINX | PHP-FPM | Socket Unix | Seul `public` exposé |
| Paymenter | MariaDB | Local | Compte limité à la base de l'application |
| Paymenter | Redis | Local | Redis non publié |
| Worker | API Proxmox | HTTPS 8006 privé | Token limité, CA vérifiée, ACL justifiées |
| VM cliente | Réseau de gestion | Aucun flux prévu | Test depuis un invité de recette |
| VM cliente | Autre VM cliente | Aucun flux par défaut | Test d'isolation réel |

Les ports Proxmox 8006, SSH, MariaDB 3306 et Redis 6379 ne sont pas destinés à Internet. La configuration réelle doit être testée en IPv4 et IPv6 si cette dernière est active.

### 2.3 Chaîne de provisionnement cible

1. Une commande est créée dans Paymenter.
2. Le prestataire envoie une notification serveur-à-serveur.
3. Le webhook vérifie signature, identifiant et fraîcheur.
4. Un job idempotent est créé à partir d'un identifiant de commande stable.
5. Le worker cherche une VM déjà liée ou marquée avant tout retry.
6. Il clone un template et applique ressources cloud-init/réseau autorisées.
7. Il attend la fin des tâches et contrôle l'état de la VM.
8. Paymenter n'active le service qu'après le contrôle.
9. Les accès sont remis par clé publique ou procédure protégée.

C'est la conception du flux. Sa réalisation exige une extension Paymenter-Proxmox identifiée et un test bout en bout ; aucun plugin ne doit être supposé installé sans preuve.

## 3. Inventaire des versions

Les numéros ci-dessous sont les **références documentaires** du dossier, pas les versions d'un serveur dont les sorties n'ont pas été fournies.

| Composant | Référence documentaire | Commande/artefact pour constater la version | Statut actuel |
| --- | --- | --- | --- |
| Paymenter | v1.5.9 | Tag installé, release, sortie CLI selon version | À relever |
| Debian | 13.7 | `cat /etc/debian_version` | À relever |
| PHP | 8.3 | `php -v` | À relever |
| MariaDB | 10.11 | `mariadb --version` | À relever |
| Redis | Paquet Debian | `redis-server --version` | À relever |
| NGINX | Paquet Debian | `nginx -v` | À relever |
| Composer | Version courante | `composer --version` | À relever |
| Proxmox VE | 9.2 en référence | `pveversion -v` | À relever |
| Extension | Non identifiée dans les éléments source disponibles | URL, release/hash, documentation | À établir |

Commandes d'inventaire sur Debian :

```bash
cat /etc/debian_version
php -v
php -m
mariadb --version
redis-server --version
nginx -v
composer --version
systemctl --failed
```

Sur Proxmox :

```bash
pveversion -v
pvesh get version
pvesh get nodes
pvenode status
pvesm status
qm list
ip -br address
ip route
pveum role list
pveum acl list
```

Pour le rapport final, ajouter la sortie réellement recueillie, la date, le nœud ou serveur concerné et une preuve expurgée. Ne remplacer pas « À relever » par une valeur supposée.

## 4. Préparer le serveur Debian

### 4.1 Préparation de la VM

Créer une VM Debian 13 dédiée au portail dans Proxmox. Le dossier source ne fournit pas de mesure de charge permettant de fixer une taille CPU/RAM/disque universelle. Dimensionner selon les ressources disponibles et l'usage visé, consigner les valeurs choisies et vérifier leur adéquation après test.

Configurer le nom d'hôte, une adresse stable, le DNS et la synchronisation horaire. Conserver un accès console de secours avant de modifier SSH ou firewall.

### 4.2 Mise à jour et relev initial

```bash
sudo apt update
sudo apt full-upgrade -y
sudo apt install -y ca-certificates curl gnupg2 sudo lsb-release unzip tar git
sudo timedatectl set-timezone Europe/Paris
cat /etc/debian_version
hostnamectl
ip -br address
ip route
timedatectl
systemctl --failed
sudo ss -lntup
sudo journalctl -p err -b --no-pager
df -h
free -h
```

Cette procédure de relev ne démontre pas qu'elle a été exécutée. Pour la preuve, conserver les sorties datées et masquer les données sensibles. Analyser les unités en échec et erreurs avant l'installation applicative.

### 4.3 Accès SSH

Installer un compte opérateur nominatif et sa clé publique, puis tester une deuxième session. Le nom `operateur` est un exemple à remplacer :

```bash
sudo adduser operateur
sudo usermod -aG sudo operateur
sudo install -d -m 0755 /etc/ssh/sshd_config.d
sudo tee /etc/ssh/sshd_config.d/10-durcissement.conf >/dev/null <<'EOF'
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
AllowUsers operateur
EOF
sudo sshd -t
sudo systemctl reload ssh
```

Garder la session initiale ouverte, établir une seconde connexion par clé et vérifier la console avant de fermer. Si `sshd -t` échoue, ne pas recharger.

## 5. Dépôts applicatifs

Le dossier source utilise Sury pour PHP 8.3 et le dépôt MariaDB pour la branche 10.11. Un dépôt tiers a la capacité d'installer des paquets exécutés avec privilèges élevés. Avant usage, vérifier la documentation courante, le support de Debian 13, la clé et son empreinte. Noter chaque source dans l'inventaire.

### 5.1 Dépôt PHP Sury

Procédure issue du dossier avec keyring dédié. Comparer l'empreinte affichée à celle publiée par le mainteneur avant d'ajouter la source :

```bash
sudo install -d -m 0755 /etc/apt/keyrings
sudo curl -fsSLo /etc/apt/keyrings/sury-php.gpg https://packages.sury.org/php/apt.gpg
gpg --show-keys --with-fingerprint /etc/apt/keyrings/sury-php.gpg
```

Après validation de l'empreinte et du codename Debian :

```bash
sudo tee /etc/apt/sources.list.d/sury-php.sources >/dev/null <<'EOF'
Types: deb
URIs: https://packages.sury.org/php/
Suites: trixie
Components: main
Signed-By: /etc/apt/keyrings/sury-php.gpg
EOF
sudo apt update
apt policy php8.3-fpm
```

`trixie` est la suite Debian 13 visée par cette procédure. Si le serveur utilise une autre suite, ne pas copier la valeur : consulter le dépôt et sélectionner une suite supportée.

### 5.2 Dépôt MariaDB

Télécharger et inspecter le script officiel du dépôt au lieu de l'exécuter directement depuis un pipe shell :

```bash
curl -fsSLo /tmp/mariadb_repo_setup https://downloads.mariadb.com/MariaDB/mariadb_repo_setup
sha256sum /tmp/mariadb_repo_setup
less /tmp/mariadb_repo_setup
```

Après inspection et validation de compatibilité de la suite :

```bash
sudo bash /tmp/mariadb_repo_setup --mariadb-server-version=mariadb-10.11
sudo apt update
apt policy mariadb-server
```

Comparer le SHA-256 à une valeur officielle lorsqu'elle est publiée. Si le script ne prend pas en charge la version de Debian, choisir une version compatible documentée et consigner la décision, plutôt que forcer le dépôt.

## 6. Installer PHP, MariaDB, Redis et Composer

### 6.1 PHP

La liste des extensions doit être confrontée à `.env.example` et aux instructions de la release Paymenter réellement installée :

```bash
sudo apt install -y \
  php8.3-common php8.3-cli php8.3-gd php8.3-mysql \
  php8.3-mbstring php8.3-bcmath php8.3-xml php8.3-fpm \
  php8.3-curl php8.3-zip php8.3-intl php8.3-redis
php -v
php -m
php --ini
php-fpm8.3 -v
update-alternatives --display php
systemctl status php8.3-fpm --no-pager
sudo ss -xl | grep php
```

Cron, worker et PHP-FPM doivent utiliser des runtimes compatibles. Exemple de limites de départ provenant du dossier, à ajuster selon charge et limites NGINX :

```bash
sudo tee /etc/php/8.3/fpm/conf.d/90-paymenter.ini >/dev/null <<'EOF'
expose_php = Off
memory_limit = 256M
upload_max_filesize = 20M
post_max_size = 25M
max_execution_time = 60
EOF
sudo systemctl restart php8.3-fpm
```

Ces chiffres sont des réglages de référence, non une mesure de capacité ou un résultat de test.

### 6.2 MariaDB

Pour une base locale, configurer l'écoute sur loopback. Confirmer que les paramètres sont pris en charge par la version effectivement installée :

```bash
sudo apt install -y mariadb-server
sudo systemctl enable --now mariadb
sudo mariadb-secure-installation
sudo tee /etc/mysql/mariadb.conf.d/99-paymenter.cnf >/dev/null <<'EOF'
[mysqld]
bind-address = 127.0.0.1
character-set-server = utf8mb4
collation-server = utf8mb4_unicode_ci
EOF
sudo systemctl restart mariadb
```

Créer la base et l'utilisateur dans une session interactive :

```bash
sudo mariadb
```

```sql
CREATE DATABASE paymenter CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'paymenter'@'127.0.0.1' IDENTIFIED BY 'REMPLACER_PAR_SECRET_DU_COFFRE';
GRANT ALL PRIVILEGES ON paymenter.* TO 'paymenter'@'127.0.0.1';
FLUSH PRIVILEGES;
QUIT;
```

Le mot de passe est un placeholder, pas un secret réel. Le compte applicatif est limité à la base Paymenter. Vérifier écoute et connexion :

```bash
mariadb --version
sudo ss -lntp | grep 3306
mariadb -h 127.0.0.1 -u paymenter -p paymenter
```

La preuve doit démontrer une écoute locale et une connexion réussie sans divulguer le mot de passe.

### 6.3 Redis

Le rôle de Redis (queue, cache ou sessions) dépend du `.env` et de la release Paymenter. Vérifier ce rôle avant de modifier les pilotes :

```bash
sudo apt install -y redis-server
sudo systemctl enable --now redis-server
redis-cli ping
sudo ss -lntp | grep 6379
```

Résultat attendu de la procédure : `PONG`, Redis joignable depuis le portail et écoute locale uniquement. Tant que cette sortie n'est pas collectée, résultat non attesté.

### 6.4 Composer

Le dossier source installe Composer avec l'installateur officiel et valide SHA-384 :

```bash
curl -fsSLo /tmp/composer-setup.php https://getcomposer.org/installer
curl -fsSLo /tmp/installer.sig https://composer.github.io/installer.sig
echo "$(cat /tmp/installer.sig)  /tmp/composer-setup.php" | sha384sum -c -
sudo php8.3 /tmp/composer-setup.php --install-dir=/usr/local/bin --filename=composer
rm -f /tmp/composer-setup.php /tmp/installer.sig
composer --version
```

Si la vérification échoue, ne pas installer. Enregistrer la version obtenue uniquement après exécution.

## 7. Déployer Paymenter

### 7.1 Release et répertoire

Le dossier source vise Paymenter v1.5.9. Confirmer la disponibilité du tag et du nom d'archive sur la source officielle. La commande ci-dessous est une procédure de téléchargement, pas une preuve d'installation :

```bash
VERSION=v1.5.9
sudo install -d -o www-data -g www-data -m 0755 /var/www/paymenter
cd /var/www/paymenter
sudo -u www-data curl -fLo /tmp/paymenter.tar.gz \
  "https://github.com/Paymenter/Paymenter/releases/download/${VERSION}/paymenter.tar.gz"
sha256sum /tmp/paymenter.tar.gz
sudo -u www-data tar -xzf /tmp/paymenter.tar.gz -C /var/www/paymenter
rm -f /tmp/paymenter.tar.gz
sudo chown -R www-data:www-data /var/www/paymenter
sudo chmod -R 755 /var/www/paymenter
sudo chmod -R 775 /var/www/paymenter/storage /var/www/paymenter/bootstrap/cache
```

Vérifier l'empreinte si Paymenter en publie une. Seul `public` sera publié par NGINX. Éviter les permissions `777`.

### 7.2 Dépendances

Confirmer si l'archive comprend déjà `vendor`. Si l'installation de dépendances est requise par la procédure de cette release :

```bash
cd /var/www/paymenter
sudo -u www-data env COMPOSER_CACHE_DIR=/tmp/composer-cache \
  composer install --no-dev --optimize-autoloader
```

### 7.3 Fichier `.env`

```bash
cd /var/www/paymenter
sudo -u www-data cp .env.example .env
sudoedit .env
sudo chown www-data:www-data .env
sudo chmod 640 .env
```

Extrait indicatif sans secret :

```dotenv
APP_ENV=production
APP_DEBUG=false
APP_URL=https://PANEL_FQDN_REEL
DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=paymenter
DB_USERNAME=paymenter
DB_PASSWORD=SECRET_DU_COFFRE
```

Utiliser le `.env.example` exact comme référence pour les autres variables. Renseigner mail, queue, cache et sessions selon le déploiement réel. Le `.env` ne doit jamais être commité ni ajouté aux preuves.

### 7.4 Initialisation

Les commandes présentes dans le dossier source doivent être confirmées par la version installée (`php artisan list`) avant usage. Elles peuvent modifier la base ; réaliser une sauvegarde avant les migrations.

```bash
cd /var/www/paymenter
sudo -u www-data php artisan key:generate --force
sudo -u www-data php artisan storage:link
sudo -u www-data php artisan migrate --force --seed
sudo -u www-data php artisan db:seed --class=CustomPropertySeeder
sudo -u www-data php artisan app:init
sudo -u www-data php artisan app:user:create
```

Les deux dernières commandes sont interactives. Créer un compte administrateur nominatif. Sauvegarder l'APPKEY une seule fois, dans le coffre et séparément de la base. Ne jamais la régénérer pour résoudre un incident d'une installation déjà initialisée.

### 7.5 Cron

```bash
sudo crontab -u www-data -e
```

Ligne de scheduler indiquée par le dossier source :

```cron
* * * * * /usr/bin/php8.3 /var/www/paymenter/artisan schedule:run >/dev/null 2>&1
```

Contrôle :

```bash
sudo crontab -u www-data -l
```

### 7.6 Worker

Exemple d'unité à comparer à la release et à la configuration queue :

```ini
[Unit]
Description=Paymenter Queue Worker
After=network.target mariadb.service redis-server.service

[Service]
User=www-data
Group=www-data
WorkingDirectory=/var/www/paymenter
ExecStart=/usr/bin/php8.3 /var/www/paymenter/artisan queue:work --sleep=3 --tries=3 --max-time=3600
Restart=always
RestartSec=5s
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

Enregistrer sous `/etc/systemd/system/paymenter.service`, puis :

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now paymenter.service
systemctl status paymenter.service --no-pager
sudo journalctl -u paymenter.service -n 100 --no-pager
```

Le worker doit être testé en environnement de recette. Un redémarrage n'établit pas à lui seul que les jobs sont idempotents.

## 8. NGINX et TLS

### 8.1 DNS et certificat

Créer les enregistrements A/AAAA pour un domaine contrôlé. Si la validation ACME HTTP-01 est choisie, le port 80 doit être accessible pour le challenge. Vérifier IPv6 indépendamment. Le domaine dans les exemples n'est pas un domaine réel du projet.

### 8.2 Configuration NGINX

Le fichier doit servir uniquement `/var/www/paymenter/public`. Exemple du dossier, à adapter au FQDN, socket et certificats réels :

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name panel.example.net;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name panel.example.net;
    root /var/www/paymenter/public;
    index index.php;

    ssl_certificate /etc/letsencrypt/live/panel.example.net/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/panel.example.net/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    add_header Strict-Transport-Security "max-age=86400" always;
    add_header X-Frame-Options SAMEORIGIN always;
    add_header X-Content-Type-Options nosniff always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;
    client_max_body_size 20m;

    location / {
        try_files $uri $uri/ /index.php?$query_string;
    }

    location = /index.php {
        fastcgi_pass unix:/run/php/php8.3-fpm.sock;
        fastcgi_param SCRIPT_FILENAME $realpath_root$fastcgi_script_name;
        include fastcgi_params;
        fastcgi_hide_header X-Powered-By;
    }

    location ~ \.php$ {
        return 404;
    }

    location ~ /\. {
        deny all;
    }
}
```

Créer et activer la configuration, après installation effective du certificat :

```bash
sudo ln -s /etc/nginx/sites-available/paymenter.conf /etc/nginx/sites-enabled/paymenter.conf
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

Contrôles à exécuter et à documenter :

```bash
curl -I https://PANEL_FQDN_REEL
curl -I http://PANEL_FQDN_REEL
curl -i https://PANEL_FQDN_REEL/.env
sudo certbot renew --dry-run
```

Attendu : TLS valide, redirection prévue, refus de `.env`, renouvellement de test réussi. Sans sortie réelle, ces critères demeurent non vérifiés. HSTS est d'abord court ; l'augmenter uniquement après validation durable de TLS.

## 9. Pare-feu Debian

Politique visée : refus entrant par défaut, SSH depuis le réseau d'administration, HTTP/HTTPS selon l'usage, aucun accès public à 3306/6379/8006. `ADMINCIDR` doit être remplacé par le réseau réellement utilisé avant toute commande :

```bash
sudo apt install -y ufw
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow from ADMINCIDR_REEL to any port 22 proto tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw show added
sudo ufw status verbose
```

Avant l'activation, confirmer l'accès console et une deuxième session SSH :

```bash
sudo ufw enable
sudo ufw status numbered
```

Ces commandes peuvent couper l'accès distant si le CIDR ou les règles sont erronés. Le filtrage IPv6 et les pare-feux amont/Proxmox/VM doivent aussi être vérifiés. Aucune preuve d'exécution n'est contenue dans la procédure elle-même.

## 10. Proxmox VE, compte et token API

### 10.1 Inventaire

Sur le nœud Proxmox :

```bash
pveversion -v
pvesh get version
pvesh get nodes
pvenode status
pvesm status
qm list
ip -br address
ip route
pveum role list
pveum acl list
```

Collecter les valeurs réelles des nœuds, pools, stockages, bridges/VLAN, certificats et pare-feu. Les valeurs de démonstration `local-lvm`, `vmbr1`, VMID `9000` et `1001` ne doivent pas être prises pour des composants effectivement configurés.

### 10.2 Rôle et permissions

Les droits requis dépendent des appels réellement exécutés par l'extension Paymenter-Proxmox. Avant de créer un rôle, établir la liste des endpoints et privilèges d'après l'API Viewer, la documentation/code du plugin et des tests en environnement isolé. Les privilèges indicatifs de la documentation source couvrent VM allocation/clone/audit/power/configuration, cloud-init, pool, stockage et réseau ; cette liste n'est pas une preuve de compatibilité.

Créer une identité dédiée et un token avec séparation des privilèges après avoir validé la syntaxe pour la version installée :

```bash
pveum pool add vps-clients --comment "VM clientes Paymenter"
pveum role add PaymenterVM --privs "PRIVILEGES_VALIDES_DEPUIS_API_VIEWER"
pveum user add paymenterpve@pve --comment "Paymenter provisioning"
pveum user token add paymenterpve@pve provisioning --privsep 1 --expire 180d --comment "Paymenter provisioning"
```

`PRIVILEGES_VALIDES_DEPUIS_API_VIEWER` est un placeholder explicite : cette ligne n'est pas exécutable telle quelle. Le remplacer par la liste exacte déterminée pour le plugin et la version. N'attribuer aucun rôle global `Administrator`.

Avec `--privsep 1`, accorder uniquement les ACL nécessaires à l'utilisateur et au token sur le pool et ressources concernés. Les exemples ci-dessous sont le format de la CLI `pveum`; les chemins de stockage, template et bridge doivent être confirmés :

```bash
pveum acl modify /pool/vps-clients --roles PaymenterVM --users paymenterpve@pve
pveum acl modify /pool/vps-clients --roles PaymenterVM --tokens 'paymenterpve@pve!provisioning'
```

Contrôler permissions effectives après adaptation :

```bash
pveum user permissions paymenterpve@pve --path /pool/vps-clients
pveum user token permissions paymenterpve@pve provisioning --path /pool/vps-clients
pveum acl list
```

Le secret de token n'est affiché qu'à la création : le stocker immédiatement dans le coffre, jamais dans Git, capture ou historique shell. En cas de suspicion de fuite, révoquer d'abord.

### 10.3 TLS API

Le worker doit utiliser HTTPS et vérifier le certificat Proxmox. Si le cluster utilise une CA privée, exporter son certificat public et l'installer sur la VM portail. Le nom de fichier ci-dessous est un exemple à remplacer :

```bash
sudo install -m 0644 pve-root-ca.crt /usr/local/share/ca-certificates/pve-root-ca.crt
sudo update-ca-certificates
```

Ne jamais désactiver la validation TLS pour contourner une erreur de nom ou CA. Tester d'abord un appel API de lecture avec un client qui n'enregistre pas le UUID/token dans l'historique. Le format attendu du header Proxmox est `Authorization: PVEAPIToken=USER@REALM!TOKENID=UUID`.

### 10.4 Extension à identifier

Pour qu'un document de rendu affirme l'automatisation, il faut ajouter les faits observés : nom du plugin, URL source, tag/commit, compatibilité Paymenter/Proxmox, méthode d'installation, variables de configuration non secrètes, appels API, permissions accordées et limites. Le document source ne fournit pas de preuve permettant d'inventer ces valeurs.

## 11. Templates et cloud-init

### 11.1 Préparer l'image

Le template doit être minimal, corrigé et débarrassé de données de test, secrets, comptes provisoires, clés privées, identifiants machine et historiques. cloud-init injecte une identité propre à chaque clone : nom d'hôte, réseau, DNS et clé SSH publique.

### 11.2 Télécharger et vérifier Debian cloud

Exemple du dossier pour Debian 13 Generic Cloud ; confirmer disponibilité et somme publiée :

```bash
cd /var/tmp
curl -fLO https://cloud.debian.org/images/cloud/trixie/latest/debian-13-genericcloud-amd64.qcow2
curl -fLO https://cloud.debian.org/images/cloud/trixie/latest/SHA512SUMS
sha512sum -c --ignore-missing SHA512SUMS
```

Ne poursuivre que si le checksum est validé. Cette vérification doit être enregistrée comme preuve avec date et origine.

### 11.3 Créer le template

Choisir un VMID libre, un storage image-capable et un bridge client inventorié. Les valeurs ci-dessous reprennent le dossier et sont des exemples :

```bash
qm list
pvesm status
qm create 9000 --name tpl-debian13 --memory 1024 --cores 1 --ostype l26 --scsihw virtio-scsi-single --net0 virtio,bridge=vmbr1 --agent enabled=1 --serial0 socket --vga serial0
qm disk import 9000 debian-13-genericcloud-amd64.qcow2 local-lvm
qm config 9000
```

Lire le volume réellement importé dans `qm config`. Ne pas deviner son nom :

```bash
qm set 9000 --scsi0 VOLUME_IMPORTÉ,discard=on
qm set 9000 --boot order=scsi0
qm set 9000 --ide2 local-lvm:cloudinit
qm template 9000
```

Remplacer `VOLUME_IMPORTÉ` et les noms de stockage/bridge par les valeurs constatées et acceptées par le backend utilisé. Démarrer un clone de test pour valider l'image et cloud-init avant conversion définitive en template si la méthode le nécessite.

### 11.4 Nettoyage d'une image personnalisée

Dans l'invité source, et seulement si ces commandes conviennent à la distribution/configuration utilisée :

```bash
sudo cloud-init clean --logs --seed
sudo truncate -s 0 /etc/machine-id
sudo rm -f /var/lib/dbus/machine-id /etc/ssh/ssh_host_*
sudo journalctl --rotate --vacuum-time=1s
history -c
```

Ces commandes sont exécutées dans l'invité source, pas sur l'hôte Proxmox. Vérifier l'état avant conversion. Ne pas les exécuter sur un service en production.

## 12. Provisionnement et idempotence

### 12.1 Préconditions

Avant une création, vérifier commande, paiement, produit, quotas, template, stockage, nœud, réseau et ACL. Le client ne choisit pas directement le VMID, le bridge, le stockage ou les permissions. Les valeurs d'offre sont converties vers une configuration interne autorisée.

### 12.2 Séquence attendue

1. Recevoir un webhook signé du prestataire.
2. Vérifier signature, identifiant d'événement et fraîcheur.
3. Créer une tâche unique dérivée de l'identifiant de commande.
4. Rechercher commande/VM/tag existant avant chaque retry.
5. Cloner le template dans le pool dédié.
6. Appliquer ressources, cloud-init et réseau approuvés.
7. Enregistrer task ID, VMID et étape, sans secret.
8. Démarrer, contrôler l'état et le réseau.
9. Activer le service dans Paymenter et remettre les accès.

### 12.3 Timeout et reprise

Un appel API peut avoir abouti côté Proxmox malgré un timeout. Chercher les VM et tâches avant de relancer :

```bash
pvesh get cluster/resources --type vm --output-format json
pvesh get nodes/NOM_REEL_DU_NOEUD/tasks --limit 20
```

Remplacer le nœud par le nom réel et retrouver le tag/VMID de la commande. Une erreur de stockage ou d'API doit rester un état explicite ; aucune VM active non suivie ne doit être considérée comme réussie.

### 12.4 Webhook et paiements

Utiliser un environnement sandbox, des clés séparées de la production et des comptes fictifs. Le retour navigateur n'est pas la source de vérité. Les notifications retardées, rejouées, dupliquées et invalides doivent être traitées. Les logs gardent un identifiant de corrélation, pas les corps complets ou secrets.

### 12.5 Extension

Le flux automatique dépend du plugin réellement choisi. Documenter son nom, sa version, source, endpoints, permissions, opérations prises en charge et étapes manuelles. Sans ces données et les tests exécutés, ne pas présenter le provisionnement automatique comme réalisé.

## 13. Réseau client et isolation

### 13.1 Plan réseau

Consigner plages IPv4/IPv6, passerelles, DNS, routes, VLAN, bridges, trunks et flux sortants. Le bridge de gestion ne doit pas être sélectionnable par les locataires. La politique d'égress doit permettre les usages prévus sans accès à la gestion.

### 13.2 Pare-feu Proxmox

L'activation au niveau datacenter peut modifier la politique d'entrée de l'hôte. Avant toute activation, garantir console hors bande, règles d'accès SSH/UI, CIDR réel et retour arrière. Les exemples du dossier ne sont pas des règles universelles : adapter les IPSet, ports, chemins et politiques à la version Proxmox et à la topologie réelle.

### 13.3 Test depuis un VPS jetable

Les tests sont autorisés uniquement depuis une VM jetable et vers des systèmes sous contrôle :

```bash
ping -c 2 PASSERELLE_CLIENT_REELLE
nc -vz -w 3 PVE_IP_GESTION_REELLE 8006
nc -vz -w 3 PVE_IP_GESTION_REELLE 22
nc -vz -w 3 PORTAIL_IP_REELLE 3306
nc -vz -w 3 PORTAIL_IP_REELLE 6379
ping -c 2 AUTRE_VPS_REEL
curl -I https://deb.debian.org
```

Remplacer toutes les valeurs. Attendu selon la politique : passerelle et Internet autorisé disponibles ; Proxmox, SSH, DB, Redis et autres VPS inaccessibles. Tester IPv6 à part, consigner date/source/destination/résultat.

### 13.4 Nettoyer le VPS de recette

Vérifier à deux reprises le VMID et l'absence de données utiles avant une suppression. Les commandes sont destructives :

```bash
qm config VMID_JETABLE
qm shutdown VMID_JETABLE --timeout 60
qm status VMID_JETABLE
```

Après confirmation que la VM est bien jetable et arrêtée :

```bash
qm destroy VMID_JETABLE --purge 1
```

Ne jamais exécuter avec un identifiant non vérifié.

## 14. Sauvegarde et restauration

### 14.1 Données et objectifs

Sauvegarder base, `.env`, données d'application, personnalisations et APPKEY. La clé est conservée chiffrée et séparément. Les sauvegardes de VM clientes sont un processus distinct. Fréquence, rétention, copie hors hôte, chiffrement et contrôle d'accès doivent être décidés et consignés.

RPO (perte de données visée) et RTO (délai de reprise visé) sont des objectifs, pas des engagements, tant qu'un exercice de restauration n'a pas mesuré ces valeurs.

### 14.2 Script age de référence

Extrait du dossier source ; vérifier les chemins de données et installer `age`. La clé privée demeure hors serveur. `RECIPIENT` est un placeholder qui doit être remplacé par une clé publique valide :

```bash
#!/bin/bash
set -euo pipefail
umask 077
DEST=/var/backups/paymenter
RECIPIENT=age1REMPLACER_PAR_LA_CLE_PUBLIQUE
STAMP=$(date +%F-%H%M)
install -d -m 0700 "$DEST"
mariadb-dump --single-transaction --routines --triggers paymenter | gzip | age -r "$RECIPIENT" -o "$DEST/db-$STAMP.sql.gz.age"
tar -C /var/www/paymenter -czf - .env storage/app | age -r "$RECIPIENT" -o "$DEST/files-$STAMP.tar.gz.age"
find "$DEST" -type f -mtime +14 -delete
```

Tester le script en laboratoire, contrôler que la base exportée est cohérente, vérifier les permissions et transférer les archives vers une cible hors hôte. La purge peut détruire d'anciennes copies : vérifier sa politique de rétention avant planification.

### 14.3 Restauration

La restauration ne se fait jamais par-dessus la base active. Exemple de test vers une base isolée :

```bash
age -d -i /chemin/hors-hote/age-identity.txt db-AAAA-MM-JJ-HHMM.sql.gz.age | gunzip > /tmp/paymenter-restore.sql
sudo mariadb -e "CREATE DATABASE paymenter_restore CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
sudo mariadb paymenter_restore < /tmp/paymenter-restore.sql
sudo mariadb -e "SHOW TABLES FROM paymenter_restore"
```

Restaurer les fichiers et la même APPKEY dans une VM de laboratoire isolée, laisser le worker arrêté jusqu'à vérification, puis tester login fictif, catalogue et logs. Mesurer durée, données manquantes, erreurs et actions manuelles. Ne pas connecter l'environnement de restauration au vrai prestataire de paiement ou au réseau des clients.

## 15. Journaux et supervision

Surveiller disponibilité HTTPS, certificat, unités NGINX/PHP-FPM/MariaDB/Redis/worker, tâches échouées, ressources, capacité de stockage Proxmox et dernière sauvegarde vérifiée.

Alertes minimales : service arrêté, saturation disque, worker silencieux, erreurs répétées, certificat proche expiration et sauvegarde en échec. Tester les alertes et revenir ensuite à l'état normal.

Les logs doivent relier une commande, une tâche et une VM via identifiant de corrélation ; ils ne doivent pas contenir token, mot de passe, APPKEY, données de paiement ou corps complet de webhook. Restreindre l'accès et la rétention.

Commandes de diagnostic indicatives :

```bash
systemctl --failed
systemctl status nginx php8.3-fpm mariadb redis-server paymenter --no-pager
journalctl -u nginx -n 100 --no-pager
journalctl -u php8.3-fpm -n 100 --no-pager
journalctl -u mariadb -n 100 --no-pager
journalctl -u redis-server -n 100 --no-pager
journalctl -u paymenter -n 100 --no-pager
ss -lntup
df -h
free -h
openssl s_client -connect panel.example.net:443 -servername panel.example.net </dev/null
```

Remplacer le domaine fictif. Les sorties doivent être collectées dans l'environnement réel avant d'attester l'état.

## 16. Mises à jour et retour arrière

Avant mise à jour : lire avis de sécurité, relever versions candidates, confirmer sauvegarde et espace disque, préparer fenêtre/rollback et tester sur clone si possible.

```bash
apt list --upgradable
apt policy php8.3-fpm mariadb-server nginx redis-server
df -h
sudo apt update
sudo apt upgrade
systemctl --failed
```

Après mise à jour, contrôler PHP, base, Redis, NGINX, scheduler, worker, Paymenter, API et logs. Ne pas combiner mise à jour système avec migration majeure Paymenter.

Une mise à niveau de Paymenter suit les instructions précises de la release cible. Un nom `latest` n'est pas un tag immuable. Sauvegarder d'abord et tester sur clone. Le squelette de maintenance du dossier est indicatif, non exécutable aveuglément :

```bash
cd /var/www/paymenter
sudo -u www-data php artisan down
sudo /usr/local/sbin/paymenter-backup.sh
sudo -u www-data php artisan migrate --force --seed
sudo -u www-data php artisan optimize:clear
sudo chown -R www-data:www-data /var/www/paymenter
sudo -u www-data php artisan up
```

La restauration cohérente des fichiers, de la base et de l'APPKEY est préférable à un downgrade improvisé. Consigner date, motif, backup, versions et tests post-changement.

## 17. Secrets, comptes et Git

Les secrets comprennent APPKEY, mots de passe SQL, clés de paiement, secret webhook, token Proxmox, SMTP, certificats privés et clés SSH privées. Les conserver dans un coffre ou fichier protégé hors Git.

- `.env`, dumps, archives, clés et exports sont exclus du dépôt.
- `.env.example` ne contient que des valeurs fictives.
- Utiliser comptes nominatifs, permissions minimales et MFA si disponible.
- Révoquer les accès temporaires.
- Scanner les commits/livrables ; en cas de fuite, révoquer le secret d'abord, analyser puis nettoyer l'historique.
- Chaque script annonce ses privilèges, prérequis, effets destructifs et contrôles d'erreur.

Exemple `.gitignore` à adapter :

```gitignore
.env
.env.*
!.env.example
*.sql
*.sql.gz
*.age
*.pem
*.key
*.tar.gz
/storage
```

## 18. Menaces et risques

| Scénario | Actifs | Mesures prévues |
| --- | --- | --- |
| Compromission du portail | Application, clients, commandes, APPKEY | TLS, mises à jour, MFA, comptes nominatifs, administration restreinte |
| Webhook forgé/rejoué | Paiement, provisionnement | Signature, ID, fraîcheur, idempotence |
| Token API trop large/divulgué | Hyperviseur, VM | Moindre privilège, pool dédié, expiration, rotation/révocation |
| Console Proxmox exposée | Hyperviseur | VPN/réseau privé, pare-feu, absence de route publique |
| Isolation insuffisante | Gestion et locataires | Segmentation, firewall Proxmox, filtres MAC/IP, tests |
| Template compromis | Toutes VM clonées | Image vérifiée, nettoyage, correctifs |
| Sauvegarde inutilisable | Continuité | Chiffrement, copie hors hôte, exercice de restauration |
| Erreur opérateur | Tous composants | Console secours, procédure, revue de changement, preuve |

Risques résiduels : panne électrique/matérielle, perte réseau, vulnérabilité inconnue, déni de service, erreur de règle et dépendance fournisseur. Le rapport doit décrire ceux qui demeurent réellement.

## 19. Plan de recette

### 19.1 Prérequis

Compte client fictif, offre de test, prestataire sandbox, VM jetable et fenêtre de recette. Vérifier qu'aucune transaction ou suppression de production n'est possible.

Parcours nominal : commande, facture, paiement sandbox, webhook, worker, VM, réseau, état de service. Parcours d'échec : refus de paiement, webhook invalide/dupliqué, API indisponible, stockage plein contrôlé, worker arrêté. Aucun échec ne doit laisser une VM active non suivie.

### 19.2 Tests initiaux

Les valeurs « Non testé » viennent du dossier source et ne sont pas des résultats d'échec ni de succès. Elles restent ainsi jusqu'à exécution et collecte d'une preuve.

| ID | Test | Résultat attendu | Statut source |
| --- | --- | --- | --- |
| F-01 | HTTPS | Certificat valide, redirection HTTP cohérente | Non testé |
| F-02 | Paiement refusé | Aucune VM créée | Non testé |
| F-03 | Paiement accepté | Une VM liée à la commande | Non testé |
| F-04 | Webhook rejoué/dupliqué | Aucun doublon | Non testé |
| F-05 | Webhook invalide | Rejet journalisé, aucune tâche | Non testé |
| F-06 | API Proxmox indisponible | Erreur gérée, pas de VM orpheline active | Non testé |
| F-07 | Stockage plein contrôlé | État d'erreur explicite | Non testé |
| F-08 | Worker arrêté | Tâches conservées et reprise sûre | Non testé |
| F-09 | Restauration labo | Portail et base de test utilisables | Non testé |
| S-01 | Proxmox depuis Internet | Inaccessible | Non testé |
| S-02 | MariaDB/Redis depuis l'extérieur | Inaccessibles | Non testé |
| S-03 | Isolation VPS | Gestion/autres clients inaccessibles | Non testé |
| S-04 | `.env` HTTP | Refusé par NGINX | Non testé |

Pour chaque test, noter préconditions, étapes/commandes, attendu, observé, date, preuve expurgée, verdict et anomalie. Aucun verdict n'est changé sans résultat réel.

## 20. Contrôle d'exposition externe

Scanner seulement des domaines et adresses sous contrôle, avec autorisation :

```bash
nmap -Pn -p 22,80,443,3306,6379,8006 panel.example.net
nmap -Pn -6 -p 22,80,443,3306,6379,8006 panel.example.net
curl -I https://panel.example.net
```

Une absence de réponse peut signaler filtrage, panne ou problème de route ; croiser avec interfaces en écoute, règles et logs. Vérifier IPv6 séparément. Résultat cible : HTTPS portail joignable, SSH limité, Proxmox/DB/Redis injoignables depuis Internet. Documenter les écarts avec résultats réels.

## 21. Incidents et rotation du token

### 21.1 Incident

1. Détection : identifier alerte, heure, systèmes et impact ; préserver les logs.
2. Confinement : isoler le composant ou révoquer immédiatement un token suspect.
3. Rétablissement : restaurer depuis un état connu, vérifier sécurité/intégrité et réactiver graduellement.
4. Compte rendu : chronologie, cause, impact, preuves et actions ; expurger données personnelles.

Ne pas arrêter un nœud sans examiner les VM et tâches clients.

### 21.2 Rotation

Créer un token neuf avec ACL minimales/expiration, conserver le secret dans le coffre, mettre à jour l'intégration, tester lecture et VM jetable, puis révoquer l'ancien. En cas de fuite suspectée, révoquer d'abord.

```bash
pveum user token add paymenterpve@pve provisioning2 --privsep 1 --expire 180d
```

Poser les ACL nécessaires au nouveau token selon les chemins réels et vérifier les droits. Après test et bascule :

```bash
pveum user token remove paymenterpve@pve provisioning
```

Tracer date, raison, permissions et preuve, pas le secret.

## 22. Dépannage par symptômes

| Symptôme | Vérifications initiales |
| --- | --- |
| NGINX 502 | PHP-FPM, socket, droits, runtime et journaux |
| Erreur SQL | MariaDB, hôte/port, compte, droits, secret et mode connexion |
| Données chiffrées illisibles | APPKEY correspondante ; ne jamais la régénérer |
| Provisionnement bloqué | Paiement, webhook, queue, worker, API, token/ACL, template, stockage ; rechercher une VM avant retry |
| VM sans réseau | Bridge/VLAN, cloud-init, adresse, route, DNS, firewall invité/amont |
| Worker arrêté | systemd/journalctl, PHP, Redis, tâche active avant redémarrage |
| Certificat expiré | DNS, timer, challenge et renouvellement certbot |

```bash
systemctl --failed
systemctl status nginx php8.3-fpm mariadb redis-server paymenter --no-pager
journalctl -u paymenter.service -n 100 --no-pager
journalctl -u nginx -n 100 --no-pager
ss -lntup
df -h
```

Adapter les unités et domaines à l'installation. Avant suppression d'une VM, vérifier VMID, commande, paiement et état client.

## 23. Exploitation régulière

| Fréquence | Points de contrôle proposés |
| --- | --- |
| Quotidienne | Alertes, worker, disque, disponibilité, jobs échoués |
| Hebdomadaire | Sauvegardes, journaux, capacité, comptes, mises à jour critiques |
| Périodique | ACL/token, certificats, versions, pare-feu, SSH, rétention, restauration |

Documenter l'ordre réel de démarrage/arrêt et examiner les jobs avant maintenance. Informer les clients avant interruption. Ce calendrier est une proposition jusqu'à intégration dans une routine réelle.

## 24. Jalons du projet

| Jalon | Travaux | Livrable attendu | Critère de sortie |
| --- | --- | --- | --- |
| 1. Cadrage | Sujet, périmètre, architecture, attentes/limites | Schéma et exigences | Revu |
| 2. Socle | Debian, réseau, comptes, dépendances, DB, Redis | Inventaire versions/réseau | Contrôlé |
| 3. Application | Paymenter, APPKEY, migrations, cron, worker, NGINX/TLS | Portail de test | Fonctionnel en test |
| 4. Intégration | Extension, token, template, sandbox, webhook | VM de test | Sans doublon |
| 5. Sécurité | Firewall, exposition, isolation, secrets, sauvegarde | Preuves expurgées | Tests observés |
| 6. Recette | Cas de test, anomalies, démonstration, dossier final | Rapport de recette | Verdicts étayés |

## 25. Preuves et remise

Pour qu'un dossier d'implémentation soit vérifiable, joindre uniquement des preuves provenant de l'environnement réel :

- sorties horodatées des commandes de versions et services ;
- configuration réseau et schéma correspondant au système réellement installé ;
- NGINX/TLS vérifié et renouvellement observé ;
- résultats des paiements sandbox et webhooks, sans secret ni donnée client ;
- extension, version/commit, permissions et traces de création de VM ;
- tests de non-exposition et d'isolation, IPv4/IPv6 si utilisés ;
- archive de sauvegarde et restauration de laboratoire chronométrée ;
- fiches de tests avec attendu, observé, statut et anomalie.

Masquer tokens, APPKEY, mots de passe, clés privées, certificats privés, adresses publiques, courriels, transactions et données personnelles. Vérifier que `.env`, dumps, clés et archives ne sont pas dans Git. Scanner les commits. En cas de fuite, révoquer le secret d'abord.

---

# Annexes

## Annexe A — Fiche d'inventaire des versions

| Composant | Référence | Version constatée | Commande/preuve |
| --- | --- | --- | --- |
| Paymenter | v1.5.9 | À relever | Tag/release et sortie CLI si disponible |
| Debian | 13.7 | À relever | `cat /etc/debian_version` |
| PHP | 8.3 | À relever | `php -v` |
| MariaDB | 10.11 | À relever | `mariadb --version` |
| Redis | Debian | À relever | `redis-server --version` |
| NGINX | Debian | À relever | `nginx -v` |
| Composer | courant | À relever | `composer --version` |
| Proxmox VE | 9.2 référence | À relever | `pveversion -v` |
| Extension | À identifier | À relever | source, tag/commit, documentation |

## Annexe B — Fiche de test

| Champ | À renseigner |
| --- | --- |
| ID et objectif | |
| Environnement/date | |
| Préconditions | |
| Étapes/commandes | |
| Résultat attendu | |
| Résultat observé | |
| Preuve expurgée | |
| Verdict | Réussi / partiel / échoué / non testé |
| Anomalie/ticket | |

## Annexe C — Checklist de fin

- [ ] Versions réellement constatées et inventaire à jour.
- [ ] Proxmox inaccessible depuis Internet.
- [ ] Certificat TLS vérifié et renouvellement testé.
- [ ] Webhook sandbox authentifié.
- [ ] Extension Proxmox identifiée, versionnée et compatible.
- [ ] Provisionnement sans doublon réellement testé.
- [ ] Isolation VPS testée, IPv6 comprise si actif.
- [ ] Sauvegarde restaurée en laboratoire.
- [ ] Secrets absents du dépôt et livrables.
- [ ] Tous les verdicts correspondent à des preuves.

## Annexe D — Références

- [Documentation d'installation Paymenter](https://paymenter.org/docs/installation/install)
- [Serveur web NGINX Paymenter](https://paymenter.org/docs/installation/webserver)
- [CLI Paymenter](https://paymenter.org/docs/guides/cli)
- [Extensions serveur Paymenter](https://paymenter.org/development/extensions/server)
- [Versions Debian](https://www.debian.org/releases/)
- [Gestion utilisateur Proxmox VE](https://pve.proxmox.com/wiki/User_Management)
- [API Viewer Proxmox](https://pve.proxmox.com/pve-docs/api-viewer/)
- [Cloud-Init Proxmox](https://pve.proxmox.com/wiki/Cloud-Init_Support)
- [Manuel pveum](https://pve.proxmox.com/pve-docs/pveum.1.html)

## Annexe E — Glossaire

| Terme | Définition |
| --- | --- |
| API | Interface permettant à un logiciel de demander des opérations à un service |
| APPKEY | Clé d'application à protéger et sauvegarder indépendamment |
| Webhook | Notification d'événement serveur-à-serveur à authentifier |
| Worker | Processus asynchrone consommant une file de tâches |
| Idempotence | Une opération rejouée ne produit pas plusieurs effets/créations |
| Template | Image de référence clonée pour produire une VM standardisée |
| RPO | Perte de données maximale visée, mesurée en exercice |
| RTO | Délai de reprise visé, mesuré en exercice |
| Plan de gestion | Réseau d'administration des services internes et hyperviseur |

> Les versions de référence ne sont pas des versions observées. Les procédures décrivent ce qu'il faut faire ; les faits de réalisation doivent être ajoutés à partir des journaux, captures et résultats réels. Ne jamais transformer une étape prévue en étape réussie sans preuve.
