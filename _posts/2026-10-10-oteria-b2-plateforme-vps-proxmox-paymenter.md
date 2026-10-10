---
title: Plateforme VPS sécurisée et automatisée sur Proxmox VE — documentation complète
date: 2026-10-10 18:48:00 +0200
categories: [Cybersécurité, Homelab]
tags: [OTERIA, Proxmox, Paymenter, VPS, Debian 13, NGINX, Linux, cybersécurité]
description: >-
  Projet individuel Bachelor 2 OTERIA : documentation technique détaillée, avec commandes
  et configurations d'exemple pour déployer et sécuriser Paymenter avec Proxmox VE.
---

> **Important :** cet article reprend les procédures du dossier technique OTERIA v2.0. Il s'agit d'un guide de référence, pas d'une preuve que chaque commande a été exécutée ni que la plateforme est en production. Les noms de domaine, adresses, comptes, VMID, pools, stockage et interfaces sont des exemples. Remplace-les après inventaire, vérifie la documentation de la version installée et teste d'abord en laboratoire. Ne copie jamais de secret dans le dépôt.

## 1. Projet et périmètre

Projet individuel de Bachelor 2 cybersécurité à OTERIA : concevoir une plateforme d'hébergement de VPS sécurisée et automatisée. Un client commande et paie sur Paymenter ; après validation serveur du paiement, une VM QEMU/KVM est créée sur Proxmox VE.

Pile visée : Debian 13, NGINX, PHP-FPM, MariaDB, Redis, Paymenter v1.5.9 et Proxmox VE. Le portail est installé sans Docker. Le périmètre couvre les VPS en machines virtuelles, l'intégration API, les templates cloud-init, l'isolation, la sauvegarde, la supervision et la recette. Le provisionnement LXC et les serveurs de jeux sont hors périmètre tant que leur extension n'est pas identifiée, versionnée et testée.

Les quatre règles structurantes :

1. Le paiement est l'unique déclencheur, via un webhook authentifié côté serveur.
2. Proxmox reste privé ; Paymenter utilise un token dédié et limité.
3. Un webhook ou job rejoué ne doit pas produire une seconde VM.
4. Une procédure n'est pas une preuve : les résultats sont déclarés réussi, partiel, échoué ou non testé selon les preuves réellement recueillies.

Une VM possède son propre noyau, contrairement à un conteneur LXC qui partage celui de l'hôte. Pour un VPS dont le client est administrateur, QEMU/KVM est le choix retenu pour renforcer l'isolation, sans supprimer la nécessité de filtrage et de mises à jour.

## 2. Architecture et flux

Le portail est le seul service public : NGINX reçoit HTTPS et transmet PHP à PHP-FPM par socket Unix. Paymenter utilise MariaDB et Redis en loopback. Le worker systemd traite les tâches asynchrones et joint l'API Proxmox sur le réseau d'administration privé.

| Zone | Composants | Exposition attendue |
| --- | --- | --- |
| Frontal | NGINX, TLS | 80/443 depuis Internet selon le besoin HTTP/certificat |
| Application | Paymenter, PHP-FPM, worker, MariaDB, Redis | Loopback et communications internes requises |
| Gestion | API Proxmox, SSH, hyperviseur | Réseau d'administration ou VPN |
| VPS clients | VM QEMU/KVM | Bridge/VLAN client dédié, séparé de la gestion |
| Sauvegardes | Cible distincte | Accès limité, jamais depuis les VM clientes |

Ne pas publier Proxmox 8006, SSH, MariaDB 3306 ou Redis 6379. Une VM cliente ne doit joindre ni la gestion, ni les bases, ni un autre client. Documente les routes, bridges, VLAN et les règles IPv4 comme IPv6 réellement présents. Une règle générique n'est pas un plan réseau.

## 3. Inventaire initial

À exécuter sur le serveur Debian et, pour les commandes Proxmox, sur un nœud de gestion. Expurge les sorties avant partage.

```bash
cat /etc/debian_version
hostnamectl
ip -br address
ip route
timedatectl
systemctl --failed
ss -lntup
journalctl -p err -b --no-pager
df -h
free -h
php -v
mariadb --version
redis-server --version
nginx -v
composer --version
```

Sur Proxmox :

```bash
pveversion -v
pvesh get version
pvenode status
pvesm status
ip -br address
ip route
```

Consigne les versions effectivement observées. Paymenter v1.5.9, Debian 13.7, PHP 8.3, MariaDB 10.11 et Proxmox VE 9.2 sont des références du dossier, pas la preuve de versions installées. Note aussi la source, la version et les limites de l'extension Paymenter-Proxmox.

## 4. Préparer Debian et SSH

Installer Debian 13 minimal sur une VM dédiée, définir le nom d'hôte, le DNS, l'heure et une configuration réseau connue. Garder un accès console de secours.

```bash
sudo apt update
sudo apt full-upgrade -y
sudo apt install -y ca-certificates curl gnupg lsb-release unzip tar git
sudo timedatectl set-timezone Europe/Paris
```

Créer un compte opérateur nominatif et installer sa clé publique avant de désactiver les mots de passe. Exemple à adapter :

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

Garde la session actuelle ouverte. Depuis un second terminal, valide une nouvelle connexion avec la clé et le bon compte avant de fermer la première. Une erreur SSH ou pare-feu sans console de secours peut couper l'administration.

## 5. Dépôts et pile applicative

Les dépôts tiers exécutent du code privilégié. Vérifie la provenance et l'empreinte des clés selon les instructions officielles en vigueur, limite chaque clé au dépôt attendu avec `Signed-By` et évite les dépôts inutiles. La procédure du dossier propose Sury pour PHP 8.3 et le dépôt MariaDB pour 10.11 ; vérifie leur prise en charge de la suite Debian réellement utilisée avant installation. Les paquets Debian natifs peuvent être préférables si Paymenter les supporte.

### PHP et extensions

La liste exacte doit être comparée à `.env.example` et à la documentation de la release Paymenter installée.

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

Cron, worker et requêtes web doivent employer le même runtime PHP. Réglages de départ, à dimensionner et à comparer à la limite d'envoi NGINX :

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

### MariaDB

Configurer l'écoute locale si la base et Paymenter sont sur la même VM. Le choix de version et les options doivent être validés avec les paquets installés.

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

Créer une base et un compte dédié. Remplace le mécanisme d'exemple ci-dessous par une saisie sûre depuis le coffre : ne mets jamais de vrai mot de passe dans Git, l'historique ou une capture.

```sql
CREATE DATABASE paymenter CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'paymenter'@'127.0.0.1' IDENTIFIED BY 'REMPLACER_PAR_UN_SECRET_DU_COFFRE';
GRANT ALL PRIVILEGES ON paymenter.* TO 'paymenter'@'127.0.0.1';
FLUSH PRIVILEGES;
```

Vérifier :

```bash
mariadb --version
sudo ss -lntp | grep 3306
mariadb -h 127.0.0.1 -u paymenter -p paymenter
```

Le compte applicatif ne doit pas servir à l'administration SQL. MariaDB doit écouter sur loopback, pas sur une interface publique.

### Redis

```bash
sudo apt install -y redis-server
sudo systemctl enable --now redis-server
redis-cli ping
sudo ss -lntp | grep 6379
```

Résultat attendu : `PONG`, avec une écoute locale uniquement. Détermine d'abord si Paymenter emploie Redis pour la queue, le cache ou les sessions. Si Redis est distant, configure authentification/ACL, chiffrement et filtrage adaptés.

### Composer

Le dossier recommande l'installateur officiel après vérification de sa somme SHA-384. Les URLs et instructions doivent être vérifiées sur la documentation officielle courante avant exécution.

```bash
curl -fsSLo /tmp/composer-setup.php https://getcomposer.org/installer
curl -fsSLo /tmp/installer.sig https://composer.github.io/installer.sig
echo "$(cat /tmp/installer.sig)  /tmp/composer-setup.php" | sha384sum -c -
sudo php8.3 /tmp/composer-setup.php --install-dir=/usr/local/bin --filename=composer
rm -f /tmp/composer-setup.php /tmp/installer.sig
composer --version
```

## 6. Déployer Paymenter

Utilise un tag de release explicite, consigne l'URL et vérifie l'intégrité publiée par le projet. Ne remplace pas `VERSION` par `latest`. La procédure ci-dessous suit le principe du dossier ; confirme le nom et le contenu de l'archive pour la release choisie.

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

Si la release ne contient pas `vendor`, installer les dépendances selon la procédure officielle :

```bash
cd /var/www/paymenter
sudo -u www-data env COMPOSER_CACHE_DIR=/tmp/composer-cache \
  composer install --no-dev --optimize-autoloader
```

Créer puis éditer le fichier de configuration. Les valeurs ci-dessous sont des exemples et le format doit être vérifié dans le `.env.example` de la version déployée.

```bash
cd /var/www/paymenter
sudo -u www-data cp .env.example .env
sudoedit .env
sudo chown www-data:www-data .env
sudo chmod 640 .env
```

Extrait **sans secret réel** :

```dotenv
APP_ENV=production
APP_DEBUG=false
APP_URL=https://panel.example.net
DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=paymenter
DB_USERNAME=paymenter
DB_PASSWORD=REMPLACER_PAR_UN_SECRET_DU_COFFRE
```

`panel.example.net` est fictif. Complète les variables de courrier, queue, cache et sessions selon la configuration effective. Le vrai `.env` ne doit pas être publié.

Commandes de configuration applicative citées par le dossier ; l'ordre et la disponibilité des commandes Artisan sont à confirmer avec la release exacte. Exécuter dans un environnement sauvegardé et lire les sorties :

```bash
cd /var/www/paymenter
sudo -u www-data php artisan key:generate --force
sudo -u www-data php artisan storage:link
sudo -u www-data php artisan migrate --force --seed
sudo -u www-data php artisan db:seed --class=CustomPropertySeeder
sudo -u www-data php artisan app:init
sudo -u www-data php artisan app:user:create
```

La clé APPKEY est générée une seule fois, stockée dans le coffre puis sauvegardée séparément et chiffrée. Ne la régénère pas pour corriger un problème sur une instance existante. Les migrations modifient la base : sauvegarde d'abord, puis vérifie le code de retour et les journaux. Les commandes interactives et leurs sorties peuvent révéler des informations ; n'enregistre pas de secret dans les preuves.

### Scheduler

Le scheduler Laravel du dossier est planifié chaque minute sous `www-data`. Vérifie la syntaxe attendue par la version installée.

```bash
sudo crontab -u www-data -e
```

Ligne à ajouter :

```cron
* * * * * /usr/bin/php8.3 /var/www/paymenter/artisan schedule:run >/dev/null 2>&1
```

Vérification :

```bash
sudo crontab -u www-data -l
```

### Worker systemd

Exemple d'unité à comparer aux besoins et options du worker de la version installée :

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

Tester le redémarrage uniquement après avoir compris l'effet sur les jobs actifs. `--tries` ou `Restart=always` ne remplacent pas l'idempotence de la création de VM.

## 7. NGINX et TLS

DNS A/AAAA, filtrage et accessibilité du port 80 doivent être préparés avant le certificat. Installer les composants :

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
sudo rm -f /etc/nginx/sites-enabled/default
sudo tee /etc/nginx/conf.d/00-hardening.conf >/dev/null <<'EOF'
server_tokens off;
EOF
```

Créer un site HTTP temporaire pour le vrai domaine. Exemple à remplacer :

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name panel.example.net;
    root /var/www/paymenter/public;
}
```

Après validation de la configuration et du DNS, obtenir le certificat. N'utilise pas le domaine fictif ci-dessous :

```bash
sudo nginx -t
sudo systemctl enable --now nginx php8.3-fpm
sudo certbot certonly --nginx -d panel.example.net
sudo certbot renew --dry-run
```

Configuration de référence à adapter dans `/etc/nginx/sites-available/paymenter.conf`. Vérifie les chemins de certificat et socket PHP sur le système avant activation.

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

Active le site après avoir ajusté `server_name`, le domaine, le socket PHP et les certificats. HSTS est initialement court ; augmente-le seulement après validation durable du HTTPS. Test :

```bash
sudo ln -s /etc/nginx/sites-available/paymenter.conf /etc/nginx/sites-enabled/paymenter.conf
sudo nginx -t
sudo systemctl reload nginx
curl -I https://panel.example.net
curl -I http://panel.example.net
curl -s -o /dev/null -w '%{http_code}\n' https://panel.example.net/.env
```

Le `.env` doit être refusé. Les codes 200/302, la redirection et le renouvellement sont à noter comme preuves seulement après observation réelle.

## 8. Pare-feu Debian

La règle d'entrée est « deny incoming », avec SSH autorisé uniquement depuis le CIDR d'administration et HTTP/HTTPS selon le besoin. Remplace `ADMINCIDR` par un CIDR réel vérifié. Avant d'activer UFW, confirme console de secours, accès hors bande et seconde session SSH : une erreur de CIDR peut verrouiller l'accès.

```bash
sudo apt install -y ufw
grep IPV6 /etc/default/ufw
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow from ADMINCIDR to any port 22 proto tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw show added
sudo ufw enable
sudo ufw status numbered
```

Ce jeu de règles est un exemple, pas une configuration prête à coller. Vérifie l'IPv6, les règles amont, les bridges, le pare-feu Proxmox et les besoins de renouvellement TLS. 3306, 6379 et 8006 ne sont pas ouverts au public.

## 9. Proxmox : inventaire, utilisateur et token

Avant modification, relever les nœuds, pools, stockages, bridges, certificats et règles. Les noms et chemins d'exemple (`vps-clients`, VMID `9000`, `local-lvm`, bridge client) doivent être adaptés.

Le principe est de créer un pool dédié, un rôle contenant uniquement les privilèges nécessaires aux opérations observées de l'extension, puis un utilisateur/token à séparation de privilèges et des ACL ciblées. Les privilèges cités par le dossier sont indicatifs : allocation/clonage/audit, alimentation, configurations CPU/mémoire/disque/réseau/options/cloud-init, audit de pool, espace de stockage et usage du réseau. Vérifie les permissions reconnues par la version de Proxmox (`pveum role list`) et les endpoints utilisés par l'extension. N'attribue pas `Administrator` sur `/`.

Exemple conceptuel à valider sur une plateforme de test :

```bash
pveum pool add vps-clients --comment "VM clientes Paymenter"
pveum role add PaymenterVM --privs "VM.Allocate VM.Clone VM.Audit VM.PowerMgmt VM.Config.CPU VM.Config.Memory VM.Config.Disk VM.Config.Network VM.Config.Options VM.Config.Cloudinit Pool.Audit"
pveum user add paymenterpve --comment "Provisioning Paymenter"
pveum user token add paymenterpve provisioning --privsep 1 --expire 180d
```

Les ACL s'ajustent à la version et aux chemins réels ; exemples uniquement :

```bash
pveum acl modify /pool/vps-clients --roles PaymenterVM --users paymenterpve
pveum acl modify /vms/9000 --roles PaymenterVM --users paymenterpve
```

Avec `privsep`, contrôle les droits effectifs du token et la nécessité d'ACL spécifiques au token sur ta version. Ajoute seulement le stockage et le bridge approuvés, selon le format valide de la version Proxmox. Teste un appel de lecture, puis une opération sur une VM jetable et une opération censée être refusée.

Le secret est affiché une fois à la création : place-le immédiatement dans le coffre. Ne le colle ni dans le shell partagé, ni dans un ticket, ni dans ce post. Installe la CA Proxmox côté portail et vérifie le certificat ; ne désactive pas la validation TLS.

Rotation en cas d'expiration planifiée ou de soupçon de fuite : crée un token neuf avec des ACL minimales, place le secret en coffre, met à jour l'intégration, teste lecture et VM jetable, puis révoque l'ancien. Si fuite suspectée, la révocation passe d'abord. Ne publie pas la valeur du token.

## 10. Template cloud-init

L'image doit provenir de la source officielle, sa somme doit être vérifiée, puis le template est assaini avant conversion. Extrait de procédure documentaire ; URL, nom de fichier, VMID, stockage et bridge sont à vérifier au moment de l'utilisation :

```bash
cd /var/tmp
curl -fLO https://cloud.debian.org/images/cloud/trixie/latest/debian-13-genericcloud-amd64.qcow2
curl -fLO https://cloud.debian.org/images/cloud/trixie/latest/SHA512SUMS
sha512sum -c --ignore-missing SHA512SUMS
qm create 9000 --name tpl-debian13 --memory 1024 --cores 1 --ostype l26 --scsihw virtio-scsi-single --net0 virtio,bridge=vmbr1
qm disk import 9000 debian-13-genericcloud-amd64.qcow2 local-lvm
qm set 9000 --scsi0 local-lvm:vm-9000-disk-0,discard=on
qm set 9000 --boot order=scsi0
qm set 9000 --ide2 local-lvm:cloudinit
qm template 9000
```

L'extrait est une référence, pas une garantie de compatibilité avec chaque version/stockage Proxmox. Vérifie le nom exact du disque après import avant de l'attacher. Un template ne doit contenir aucune clé privée, aucun secret, compte provisoire ou historique sensible.

Exemple de clonage jetable issu du dossier :

```bash
qm clone 9000 1001 --name vps-test-0001 --pool vps-clients --full 1 --storage local-lvm
qm set 1001 --tags order-0001 --cores 2 --memory 2048 --ciuser debian --sshkeys /root/testkey.pub --ipconfig0 ip=10.20.0.50/24,gw=10.20.0.1 --nameserver 10.20.0.1 --net0 virtio,bridge=vmbr1,firewall=1
qm resize 1001 scsi0 20G
qm start 1001
qm status 1001
```

Les adresses, clé, pool, bridge et VMID sont des exemples à remplacer. Ne démarre pas ce bloc sur un hôte de production sans avoir vérifié les ressources, le réseau et l'absence de collision de VMID.

## 11. Webhook et provisionnement

Le flux logique est : commande en attente → notification signée → validation de l'identifiant et de la fraîcheur → création d'une tâche unique → vérification d'une VM/tag existant → clone/configuration → démarrage/contrôle → liaison commande-VM → activation et remise d'accès.

Ne déclenche jamais la création depuis la seule redirection du navigateur. Au retry après timeout, recherche d'abord tâche et VM par identifiant/tag de commande. Les paramètres client ne choisissent jamais librement le VMID, le bridge, le stockage ou les permissions. Toute erreur a un état explicite ; aucun service ne s'active avant contrôle réel de la VM.

L'extension exacte est à identifier et tester. L'article ne prétend pas qu'une API/webhook ou un plugin précis a été validé. Les secrets, corps complets de webhook et données de paiement ne doivent pas être inscrits dans les journaux.

## 12. Pare-feu et test d'isolation Proxmox

La segmentation est matérialisée dans les bridges, VLAN, routes, ACL et pare-feu. Avant activation globale du pare-feu, confirme l'accès console hors bande et les règles d'administration. L'extrait documentaire ci-dessous est une illustration de politique ; il ne doit pas être copié sans analyse de l'impact sur le cluster et l'accès au nœud.

Les essais se font depuis une VM jetable autorisée et vers des systèmes sous contrôle. Exemple de vérification réseau, utilisant des adresses fictives :

```bash
ping -c 2 10.20.0.1
nc -vz -w 3 10.10.0.10 8006
nc -vz -w 3 10.10.0.10 22
nc -vz -w 3 10.10.0.20 3306
nc -vz -w 3 10.10.0.20 6379
ping -c 2 10.20.0.51
curl -I https://deb.debian.org
```

Attendu selon la politique : passerelle autorisée, Proxmox/SSH/DB/Redis et autres VPS inaccessibles, Internet autorisé seulement si prévu. Consigne les résultats et compare-les aux routes et règles. Les adresses ci-dessus ne désignent pas une infrastructure réelle.

Ne détruis une VM qu'après vérification certaine de son identifiant et de son absence de données utiles. Les commandes suivantes sont destructives ; elles ne concernent que la VM jetable désignée après vérification :

```bash
qm config 1001
qm stop 1001
qm destroy 1001 --purge
```

Ne les lance jamais avec un VMID non confirmé.

## 13. Sauvegarde chiffrée et restauration

Sauvegarder la base, le `.env`, les données de service et les personnalisations nécessaires. L'APPKEY est conservée séparément, chiffrée et accessible uniquement aux opérateurs autorisés. Les sauvegardes de VM clientes relèvent d'une politique distincte. Les valeurs de rétention et RPO/RTO ne sont pas des garanties tant qu'une restauration chronométrée n'a pas été réalisée.

Exemple de script de sauvegarde extrait du dossier, à relire, adapter et tester sur un environnement de laboratoire. Le destinataire `age` est un placeholder et la destination locale doit ensuite être transférée hors hôte.

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

Les chemins de données doivent être confirmés pour l'installation effective. Protège la clé privée `age` hors du serveur. Valide le script, les droits, le transfert hors hôte, la rotation et l'intégrité avant de le planifier. Une suppression automatique mal réglée peut effacer les seules copies.

Test de restauration : crée une VM isolée, restaure fichiers et base avec l'APPKEY correspondante, désactive le worker jusqu'à validation, puis vérifie l'accès local, le catalogue et les journaux. N'importe jamais un dump de test par-dessus la base active.

## 14. Diagnostics et mises à jour

Commandes indicatives de diagnostic ; adapte les unités réellement installées :

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
openssl x509 -noout -enddate
```

Avant mise à jour : inventorier paquets candidats, lire les avis, confirmer sauvegarde et espace libre, tester sur clone et préparer retour arrière.

```bash
apt list --upgradable
apt policy php8.3-fpm mariadb-server nginx redis-server
df -h
sudo apt update
sudo apt upgrade
systemctl --failed
```

Une mise à jour système n'est pas mélangée à une migration majeure Paymenter. Vérifie services, queue, migrations, webhook sandbox et intégration API après chaque changement. Revenir en arrière par restauration cohérente plutôt que par downgrade improvisé.

## 15. Plan de recette

Tous les scénarios ci-dessous sont `Non testé` dans le dossier source et le restent jusqu'à preuve réelle. Utilise un compte client fictif, un prestataire en sandbox, une VM jetable et une fenêtre sans possibilité de toucher la production.

| ID | Test | Résultat attendu | Statut initial |
| --- | --- | --- | --- |
| F-01 | HTTPS | Certificat valide, HTTP redirigé vers HTTPS | Non testé |
| F-02 | Paiement refusé | Aucune VM créée | Non testé |
| F-03 | Paiement accepté | Une seule VM liée à la commande | Non testé |
| F-04 | Webhook rejoué | Aucun doublon | Non testé |
| F-05 | Webhook invalide | Rejet journalisé, aucune tâche | Non testé |
| F-06 | API indisponible | Échec géré, aucune VM active non suivie | Non testé |
| F-07 | Stockage plein en test contrôlé | Erreur explicite | Non testé |
| F-08 | Worker interrompu | Tâches conservées et reprise contrôlée | Non testé |
| F-09 | Restauration laboratoire | Base et portail de test utilisables | Non testé |
| S-01 | Proxmox depuis Internet | Inaccessible | Non testé |
| S-02 | MariaDB/Redis depuis l'extérieur | Inaccessibles | Non testé |
| S-03 | Isolation VPS | Gestion et autres clients inaccessibles | Non testé |
| S-04 | Requête vers `.env` | Refusée par NGINX | Non testé |

Pour chaque test, note préconditions, commandes, attendu, observé, horodatage, preuve expurgée, verdict et anomalie. Une procédure n'est pas une preuve d'exécution.

## 16. Exploitation et sécurité

- Quotidien : alertes, erreurs worker, espace disque, disponibilité et jobs de provisionnement en échec.
- Hebdomadaire : sauvegardes, capacité, journaux, tâches échouées, comptes et mises à jour importantes.
- Périodique : ACL et expiration des tokens, certificats, versions, règles réseau, SSH, rétention et restauration.
- Incidents : préserver les journaux, identifier l'impact, contenir, révoquer immédiatement un token suspect, restaurer un état connu et documenter la chronologie.
- Secrets : jamais dans Git, tickets, captures ou commandes partagées. En cas de fuite, révoquer/faire tourner avant le nettoyage de l'historique.

| Symptôme | Premières vérifications |
| --- | --- |
| NGINX 502 | PHP-FPM, socket, droits, runtime PHP et journaux |
| Erreur SQL | MariaDB, adresse, port, compte, droits et secret |
| Données illisibles | APPKEY correspondante ; ne jamais régénérer l'ancienne |
| Provisionnement bloqué | Paiement, webhook, queue, worker, API, token/ACL, extension, template, stockage ; chercher la VM avant retry |
| VM sans réseau | Bridge/VLAN, cloud-init, IP, route, DNS et pare-feu |
| Worker arrêté | Unité systemd, journaux, PHP, Redis et jobs actifs avant redémarrage |
| Certificat expiré | Timer certbot, test de renouvellement, DNS et accessibilité HTTP |

## 17. État du projet

La documentation technique v2.0 présente les procédures, mais ne prouve pas leur exécution. Les versions réellement installées, l'extension Paymenter-Proxmox, le provisionnement sans doublon, l'isolation réseau, la non-exposition de Proxmox, le renouvellement TLS et la restauration doivent être validés et accompagnés de preuves expurgées.

Le critère de réussite n'est pas seulement qu'une VM démarre : elle doit suivre un paiement authentifié, être reliée à la bonne commande, rester isolée, ne pas être dupliquée au retry et pouvoir être exploitée/restaurée. Les exemples de commandes qui modifient le pare-feu, les ACL, les comptes ou les VM sont à valider sur une plateforme de test avant tout usage réel.
