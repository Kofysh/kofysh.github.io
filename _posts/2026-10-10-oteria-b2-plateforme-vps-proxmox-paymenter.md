---
title: "Projet OTERIA B2 : plateforme VPS avec Paymenter et Proxmox VE"
layout: post
date: 2026-10-10 18:48:00 +0200
last_modified_at: 2026-10-11 12:50:00 +0200
categories: [Tutoriels, Cybersécurité, Homelab]
tags: [OTERIA, Proxmox, Paymenter, VPS, Debian, Linux, cloud-init]
image: /assets/img/covers/oteria-b2-paymenter.svg
description: >-
  Tutoriel du projet B2 OTERIA : vendre un VPS, encaisser un paiement,
  puis provisionner automatiquement une machine sur Proxmox VE.
---

**Auteur :** Baki Sagir — OTERIA, Bachelor 2 cybersécurité — projet individuel.

## Introduction

Ce projet met en place une **mini-plateforme d’hébergement VPS**. Un client commande une machine depuis un portail web, paie, puis une VM Debian est créée automatiquement sur **Proxmox VE**.

| Brique | Rôle |
| --- | --- |
| **Paymenter** | Catalogue, comptes, commandes, factures, paiements |
| **Proxmox VE** | Hyperviseur : template cloud-init, clone, démarrage, réseau |

Le portail tourne sur une **VM Debian 13 dédiée** (NGINX, PHP-FPM 8.3, MariaDB, Redis, worker Laravel). L’hyperviseur n’est **jamais** exposé sur Internet. Seul un paiement authentifié déclenche la création d’une VM. Une commande rejouée ne doit **pas** produire une seconde machine.

Ce tutoriel couvre l’architecture, l’installation, la sécurité, la sauvegarde et la recette. Les secrets (mots de passe, tokens, `APP_KEY`, certificats privés) ne figurent jamais ici. Les cases de recette restent « non testé » tant qu’une preuve réelle n’est pas jointe au rapport.

**Hors périmètre :** conteneurs LXC, serveurs de jeux, cluster HA Proxmox. Le nom exact du plugin Paymenter ↔ Proxmox doit être identifié et versionné dans le rapport de réalisation.

## 1. Objectifs et exigences

**Objectif métier :** un client achète un VPS ; après paiement validé, une VM isolée est livrée.

**Objectif pédagogique :** concevoir et justifier une chaîne réelle (web, base, file d’attente, API d’hyperviseur, réseau, sauvegarde, recette sécurité).

Quatre règles :

1. Le paiement authentifié (webhook serveur, pas un retour navigateur) est le seul déclencheur de création.
2. L’API Proxmox (`8006`) reste sur le réseau d’administration.
3. L’intégration est **idempotente** : un retry ne clone pas une deuxième VM.
4. Chaque verdict de recette s’appuie sur une preuve observée.

Une procédure décrit *quoi faire*. Un `nginx -t` vérifie la *syntaxe*. Seul un test sur le lab prouve le *résultat*.

## 2. Architecture et flux

```text
Client / prestataire de paiement
            |
        HTTPS 443
            |
          NGINX
            |
        PHP-FPM / Paymenter
          |          |
      MariaDB      Redis / queue
                         |
                       worker
                         |
                 API Proxmox privée
                         |
              template → VM cliente

Portail → sauvegarde chiffrée → cible hors hôte
```

| Zone | Services | Accès |
| --- | --- | --- |
| Frontal | NGINX + TLS | 443 public ; 80 pour redirection et ACME |
| Application | Paymenter, PHP-FPM, worker | Local au portail |
| Données | MariaDB, Redis | Loopback uniquement |
| Gestion | API Proxmox, SSH | Admin / VPN |
| Locataires | VM QEMU/KVM | Bridge / VLAN client séparé |
| Sauvegarde | Archives `age` | Exploitation uniquement |

**À ne pas publier :** `8006`, `3306`, `6379`, SSH d’admin. Filtrer **IPv4 et IPv6**.

Si un reverse proxy amont existe, le backend n’accepte que ce proxy et ne fait confiance aux en-têtes `X-Forwarded-*` que depuis cette origine.

## 3. Prérequis et inventaire

### 3.1 Conditions de départ

- Hôte Proxmox VE, stockage VM, réseau **admin** ≠ réseau **client**
- VM Debian 13 dédiée au portail
- Domaine contrôlé pointant vers le frontal
- Console de secours (IPMI / noVNC) **avant** de durcir SSH ou UFW
- Offre de test, compte fictif, paiement **sandbox**

Consigner CPU / RAM / disque réellement alloués. Une démo n’est pas une capacité commerciale.

### 3.2 Paramètres du site

| Variable | Signification |
| --- | --- |
| `PANEL_FQDN` | Domaine public du portail |
| `ADMIN_CIDR` | Réseau autorisé à SSH |
| `ACME_EMAIL` | Contact Let's Encrypt |
| `PVE_FQDN` | Nom DNS **privé** Proxmox |
| `PVE_NODE` | Nœud cible |
| `PVE_STORAGE` | Stockage des disques VM |
| `PVE_BRIDGE` | Bridge client existant |
| `TEMPLATE_VMID` | VMID libre du modèle |
| `TEST_VMID` | VMID libre de recette |
| `CLIENT_IP`, `CLIENT_GATEWAY`, `CLIENT_DNS` | Adressage du clone |

```bash
read -r -p 'Domaine public du portail : ' PANEL_FQDN
read -r -p 'CIDR d administration : ' ADMIN_CIDR
read -r -p 'Adresse e-mail ACME : ' ACME_EMAIL
: "${PANEL_FQDN:?Domaine obligatoire}"
: "${ADMIN_CIDR:?CIDR obligatoire}"
: "${ACME_EMAIL:?Adresse obligatoire}"
export PANEL_FQDN ADMIN_CIDR ACME_EMAIL
```

### 3.3 Versions de référence

| Composant | Référence |
| --- | --- |
| Paymenter | **v1.5.9** |
| PHP | **8.3** (Sury) |
| Debian | branche **13** (relever la mineure installée) |
| MariaDB | viser **10.11** si le dépôt le permet |
| Proxmox | version constatée sur l’hôte |

Portail :

```bash
cat /etc/os-release
cat /etc/debian_version
php -v
mariadb --version
redis-server --version
nginx -v
composer --version
```

Proxmox :

```bash
pveversion -v
pvesh get /nodes
pvesm status
qm list
ip -br address
ip route
pveum role list
pveum acl list
```

`php artisan --version` donne Laravel, **pas** le tag Paymenter. Dans un cluster, un VMID doit être libre sur **tous** les nœuds.

## 4. Debian et administration SSH

Commandes **dans la VM Debian**, pas sur l’hyperviseur.

```bash
sudo apt update
sudo apt full-upgrade -y
sudo apt install -y ca-certificates curl gnupg sudo lsb-release unzip tar git
sudo timedatectl set-timezone Europe/Paris
hostnamectl
timedatectl
ip -br address
ip route
systemctl --failed
sudo ss -lntup
sudo journalctl -p err -b --no-pager
df -h
free -h
```

Corriger les unités en échec **avant** d’installer l’application. L’heure (NTP) compte pour les logs, TLS et anti-replay des webhooks.

```bash
sudo adduser operateur
sudo usermod -aG sudo operateur
```

`operateur` est un exemple. Depuis le poste d’admin, copier **uniquement** la clé publique :

```bash
ssh-copy-id operateur@ADRESSE_DU_PORTAIL
ssh operateur@ADRESSE_DU_PORTAIL
```

Durcir SSH ensuite. Garder la session actuelle ouverte jusqu’à succès d’une **seconde** connexion, console de secours disponible :

```bash
sudo install -d -m 0755 /etc/ssh/sshd_config.d
sudo tee /etc/ssh/sshd_config.d/10-durcissement.conf >/dev/null <<'EOF'
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
AllowUsers operateur
EOF
sudo sshd -t && sudo systemctl reload ssh
```

## 5. Dépôts et dépendances

Un dépôt tiers entre dans la chaîne de confiance : provenance, suite Debian, clé, versions candidates.

### 5.1 PHP Sury

```bash
sudo apt-get update
sudo apt-get install -y lsb-release ca-certificates curl
curl -fSLo /tmp/debsuryorg-archive-keyring.deb https://packages.sury.org/debsuryorg-archive-keyring.deb
sudo dpkg -i /tmp/debsuryorg-archive-keyring.deb
printf 'deb [signed-by=/usr/share/keyrings/debsuryorg-archive-keyring.gpg] https://packages.sury.org/php/ %s main\n' "$(lsb_release -sc)" | sudo tee /etc/apt/sources.list.d/php.list
sudo apt-get update
apt-cache policy php8.3-fpm
```

Ne pas désactiver les signatures si un candidat manque.

### 5.2 MariaDB

Télécharger le script, vérifier le SHA-256 publié, lire le script, puis :

```bash
curl -fsSLo /tmp/mariadb_repo_setup https://downloads.mariadb.com/MariaDB/mariadb_repo_setup
sha256sum /tmp/mariadb_repo_setup
less /tmp/mariadb_repo_setup
sudo bash /tmp/mariadb_repo_setup --mariadb-server-version=mariadb-10.11
sudo apt update
apt-cache policy mariadb-server
```

Si Debian 13 + 10.11 n’est pas supporté, retenir une version **compatible Paymenter** et l’écrire dans l’inventaire.

## 6. PHP, MariaDB, Redis et Composer

### 6.1 PHP 8.3

```bash
sudo apt install -y php8.3-cli php8.3-common php8.3-fpm \
  php8.3-gd php8.3-mysql php8.3-mbstring php8.3-bcmath \
  php8.3-xml php8.3-curl php8.3-zip php8.3-intl php8.3-redis
/usr/bin/php8.3 -v
/usr/bin/php8.3 -m
sudo systemctl enable --now php8.3-fpm
sudo ss -xl | grep php
```

Toujours appeler `/usr/bin/php8.3` (cron, worker, Artisan) pour rester aligné avec FPM.

```bash
sudo tee /etc/php/8.3/fpm/conf.d/90-paymenter.ini >/dev/null <<'EOF'
expose_php=Off
memory_limit=256M
upload_max_filesize=20M
post_max_size=25M
max_execution_time=60
EOF
sudo systemctl restart php8.3-fpm
```

Cohérent avec `client_max_body_size` NGINX. Le worker CLI n’hérite **pas** de ce fichier FPM.

### 6.2 MariaDB

```bash
sudo apt install -y mariadb-server
sudo systemctl enable --now mariadb
sudo mariadb-secure-installation
sudo tee /etc/mysql/mariadb.conf.d/99-paymenter.cnf >/dev/null <<'EOF'
[mysqld]
bind-address=127.0.0.1
character-set-server=utf8mb4
collation-server=utf8mb4_unicode_ci
EOF
sudo systemctl restart mariadb
```

Compte applicatif limité à sa base. Mot de passe unique au coffre, jamais dans une capture :

```bash
sudo env MYSQL_HISTFILE=/dev/null mariadb
```

```sql
CREATE DATABASE paymenter CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'paymenter'@'127.0.0.1' IDENTIFIED BY 'SECRET_UNIQUE_DU_COFFRE';
GRANT ALL PRIVILEGES ON paymenter.* TO 'paymenter'@'127.0.0.1';
QUIT;
```

```bash
sudo ss -lntp | grep 3306
mariadb -h 127.0.0.1 -u paymenter -p paymenter -e 'SELECT 1;'
```

### 6.3 Redis

```bash
sudo apt install -y redis-server
sudo systemctl enable --now redis-server
redis-cli ping
sudo ss -lntp | grep 6379
```

Attendu : `PONG`, écoute locale, `bind` + `protected-mode`. Un Redis distant exigerait ACL, auth, TLS et filtrage.

### 6.4 Composer (installeur vérifié)

```bash
curl -fsSLo /tmp/composer-setup.php https://getcomposer.org/installer
curl -fsSLo /tmp/installer.sig https://composer.github.io/installer.sig
echo "$(cat /tmp/installer.sig)  /tmp/composer-setup.php" | sha384sum -c - && sudo /usr/bin/php8.3 /tmp/composer-setup.php --install-dir=/usr/local/bin --filename=composer
rm -f /tmp/composer-setup.php /tmp/installer.sig
composer --version
```

## 7. Installation de Paymenter

### 7.1 Archive v1.5.9 + SHA-256

Somme valable **uniquement** pour cet asset GitHub. Une autre version = nouvelle vérification.

```bash
VERSION=v1.5.9
sudo install -d -o www-data -g www-data -m 0755 /var/www/paymenter
cd /var/www/paymenter
sudo -u www-data curl -fLo paymenter.tar.gz "https://github.com/Paymenter/Paymenter/releases/download/${VERSION}/paymenter.tar.gz"
printf '%s  paymenter.tar.gz\n' ed69a689338f112f163f8fff3254fd3a1fc6a947f5bdca15fa4a1d86b4344125 | sha256sum -c - && sudo -u www-data tar -xzf paymenter.tar.gz
sudo rm -f /var/www/paymenter/paymenter.tar.gz
sudo chown -R www-data:www-data /var/www/paymenter
sudo find /var/www/paymenter -type d -exec chmod 0755 {} +
sudo find /var/www/paymenter -type f -exec chmod 0644 {} +
```

Composer seulement si la release le demande :

```bash
cd /var/www/paymenter
sudo -u www-data env COMPOSER_CACHE_DIR=/tmp/composer-cache composer install --no-dev --optimize-autoloader
```

### 7.2 Fichier `.env`

Installation **neuve** uniquement (`cp .env.example` écrase une prod) :

```bash
cd /var/www/paymenter
sudo -u www-data cp .env.example .env
sudoedit .env
sudo chown www-data:www-data .env
sudo chmod 0640 .env
```

```dotenv
APP_ENV=production
APP_DEBUG=false
APP_URL=https://DOMAINE_DU_PORTAIL
DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=paymenter
DB_USERNAME=paymenter
DB_PASSWORD=SECRET_UNIQUE_DU_COFFRE
```

Compléter mail, queue, cache et sessions d’après `.env.example`. **Aucun `.env` réel dans le rendu.**

### 7.3 Initialisation

```bash
cd /var/www/paymenter
sudo -u www-data /usr/bin/php8.3 artisan list --raw
sudo -u www-data /usr/bin/php8.3 artisan key:generate --force
sudo -u www-data /usr/bin/php8.3 artisan storage:link
sudo -u www-data /usr/bin/php8.3 artisan migrate --force --seed
sudo -u www-data /usr/bin/php8.3 artisan db:seed --class=CustomPropertySeeder
sudo -u www-data /usr/bin/php8.3 artisan app:init
sudo -u www-data /usr/bin/php8.3 artisan app:user:create
sudo -u www-data /usr/bin/php8.3 artisan migrate:status
```

`key:generate` = install neuve. Sauvegarder `APP_KEY` au coffre. La régénérer sur une base existante rend des données illisibles. Compte admin nominatif + MFA si disponible. Ne pas coller les sorties interactives dans le rapport.

### 7.4 Scheduler et worker

```bash
sudo apt install -y cron
sudo systemctl enable --now cron
sudo crontab -u www-data -e
```

```cron
* * * * * /usr/bin/php8.3 /var/www/paymenter/artisan schedule:run >/dev/null 2>&1
```

```bash
sudo crontab -u www-data -l
cd /var/www/paymenter
sudo -u www-data /usr/bin/php8.3 artisan schedule:list
```

Créer `/etc/systemd/system/paymenter.service` :

```ini
[Unit]
Description=Paymenter Queue Worker
After=network.target mariadb.service redis-server.service
StartLimitIntervalSec=180
StartLimitBurst=30

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

```bash
sudo systemd-analyze verify /etc/systemd/system/paymenter.service
sudo systemctl daemon-reload
sudo systemctl enable --now paymenter.service
systemctl status paymenter.service --no-pager
```

`Restart=always` ne garantit **pas** l’idempotence Proxmox : c’est le plugin qui doit l’implémenter.

## 8. NGINX et certificats

### 8.1 Site HTTP temporaire (challenge ACME)

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
sudo tee /etc/nginx/conf.d/00-paymenter-hardening.conf >/dev/null <<'EOF'
server_tokens off;
EOF
```

`/etc/nginx/sites-available/paymenter.conf` :

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name DOMAINE_DU_PORTAIL;
    root /var/www/paymenter/public;
    location / {
        return 503;
    }
}
```

```bash
sudo ln -sfn /etc/nginx/sites-available/paymenter.conf /etc/nginx/sites-enabled/paymenter.conf
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

Ne pas publier l’admin ni des identifiants réels tant que HTTPS n’est pas en place.

### 8.2 Certificat Let's Encrypt

```bash
sudo certbot certonly --nginx --non-interactive --agree-tos --email "$ACME_EMAIL" -d "$PANEL_FQDN"
sudo test -s "/etc/letsencrypt/live/$PANEL_FQDN/fullchain.pem"
sudo test -s "/etc/letsencrypt/live/$PANEL_FQDN/privkey.pem"
```

### 8.3 Configuration finale

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name DOMAINE_DU_PORTAIL;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name DOMAINE_DU_PORTAIL;
    root /var/www/paymenter/public;
    index index.php;
    charset utf-8;

    ssl_certificate /etc/letsencrypt/live/DOMAINE_DU_PORTAIL/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/DOMAINE_DU_PORTAIL/privkey.pem;
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
        include fastcgi_params;
        fastcgi_param SCRIPT_FILENAME $realpath_root$fastcgi_script_name;
        fastcgi_pass unix:/run/php/php8.3-fpm.sock;
        fastcgi_hide_header X-Powered-By;
    }
    location ~ [.]php$ {
        return 404;
    }
    location ~ /[.](?!well-known) {
        deny all;
    }
}
```

HSTS court au départ ; allonger après stabilité. Vérifier le socket FPM réel.

```bash
sudo nginx -t && sudo systemctl reload nginx
sudo certbot renew --dry-run
curl --silent --show-error --head "https://$PANEL_FQDN"
curl --silent --show-error --head "http://$PANEL_FQDN"
curl --silent --show-error --output /dev/null --write-out '%{http_code}\n' "https://$PANEL_FQDN/.env"
```

`/.env` doit répondre **403 ou 404**, jamais 200 avec du contenu.

## 9. Pare-feu du portail (UFW)

Session SSH + console de secours ouvertes. `ADMIN_CIDR` déjà vérifié.

```bash
sudo apt install -y ufw
grep IPV6 /etc/default/ufw
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow from "$ADMIN_CIDR" to any port 22 proto tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw show added
sudo ufw enable
sudo ufw status numbered
```

Ne pas ouvrir `3306` / `6379`. UFW ≠ règles du routeur / Proxmox.

## 10. Identité API et ACL Proxmox

Sur le **nœud Proxmox**. Compte dédié `pve`, **pas** root.

```bash
pveum pool add vps-clients --comment 'VM clientes Paymenter'
pveum role add PaymenterVM --privs 'VM.Allocate VM.Clone VM.Audit VM.PowerMgmt VM.Config.CPU VM.Config.Memory VM.Config.Disk VM.Config.Network VM.Config.Options VM.Config.Cloudinit Pool.Audit'
pveum role add PaymenterStorage --privs 'Datastore.AllocateSpace Datastore.Audit'
pveum user add paymenter@pve --comment 'Provisioning Paymenter'
pveum user token add paymenter@pve provisioning --privsep 1 --expire "$(date -d '+180 days' +%s)"
```

L’expiration est un **timestamp Unix**, pas la chaîne `180d`. Le secret s’affiche **une fois** → coffre.

Adapter VMID template et stockage du site :

```bash
pveum acl modify /pool/vps-clients --roles PaymenterVM --users paymenter@pve --tokens 'paymenter@pve!provisioning'
pveum acl modify /vms/9000 --roles PaymenterVM --users paymenter@pve --tokens 'paymenter@pve!provisioning'
pveum acl modify /storage/local-lvm --roles PaymenterStorage --users paymenter@pve --tokens 'paymenter@pve!provisioning'
pveum user permissions paymenter@pve --path /pool/vps-clients
pveum user token permissions paymenter@pve provisioning --path /pool/vps-clients
pveum acl list
```

Avec `privsep`, le token est borné par l’utilisateur. Un 403 se corrige en lisant l’API Viewer / le plugin, pas en donnant `Administrator`.

### Premier appel TLS depuis le portail

Exporter `pve-root-ca.pem` depuis une source de confiance, puis :

```bash
sudo install -m 0644 pve-root-ca.pem /usr/local/share/ca-certificates/pve-root-ca.crt
sudo update-ca-certificates
read -r -p 'Nom DNS prive Proxmox : ' PVE_FQDN
read -rs -p 'Secret du token : ' PVE_TOKEN
printf '\n'
printf 'header = "Authorization: PVEAPIToken=paymenter@pve!provisioning=%s"\n' "$PVE_TOKEN" | curl --fail --silent --show-error --config - "https://$PVE_FQDN:8006/api2/json/version"
unset PVE_TOKEN
```

Ne pas désactiver la vérif TLS. Une lecture `/version` ne prouve pas les droits de clone.

## 11. Template cloud-init

Image officielle Debian, checksum, **aucun** secret d’exploitation dans le modèle. Un root invité lit cloud-init.

Sur Proxmox :

```bash
cd /var/tmp
curl -fLO https://cloud.debian.org/images/cloud/trixie/latest/debian-13-genericcloud-amd64.qcow2
curl -fLO https://cloud.debian.org/images/cloud/trixie/latest/SHA512SUMS
sha512sum -c --ignore-missing SHA512SUMS
```

```bash
read -r -p 'VMID libre du template : ' TEMPLATE_VMID
read -r -p 'Stockage images : ' PVE_STORAGE
read -r -p 'Bridge client : ' PVE_BRIDGE
[[ "$TEMPLATE_VMID" =~ ^[0-9]+$ ]] || { echo 'VMID invalide'; exit 1; }
pvesm status
qm list
ip link show "$PVE_BRIDGE"
```

```bash
IMAGE=/var/tmp/debian-13-genericcloud-amd64.qcow2
test -s "$IMAGE"
qm create "$TEMPLATE_VMID" --name tpl-debian13 --memory 1024 --cores 1 --ostype l26 --scsihw virtio-scsi-single --net0 "virtio,bridge=$PVE_BRIDGE"
qm set "$TEMPLATE_VMID" --scsi0 "$PVE_STORAGE:0,import-from=$IMAGE"
qm set "$TEMPLATE_VMID" --ide2 "$PVE_STORAGE:cloudinit"
qm set "$TEMPLATE_VMID" --boot order=scsi0
qm set "$TEMPLATE_VMID" --serial0 socket --vga serial0
qm config "$TEMPLATE_VMID"
qm template "$TEMPLATE_VMID"
```

`import-from` dépend de la version PVE. Alternative : `qm disk import` puis attacher le volume **observé**. Ne pas faire les deux.

Nettoyage d’une image custom (**dans l’invité**, jamais sur l’hyperviseur) :

```bash
sudo cloud-init clean --logs --seed
sudo truncate -s 0 /etc/machine-id
sudo rm -f /var/lib/dbus/machine-id /etc/ssh/ssh_host_*
history -c
sudo poweroff
```

## 12. Clone de recette (labo)

Valeurs d’exemple à remplacer : template `9000`, clone `1001`, pool `vps-clients`, `local-lvm`, `vmbr1`, `10.20.0.50/24`.

Clé **publique** uniquement dans `/root/test-vps.pub`.

```bash
qm clone 9000 1001 --name vps-test-0001 --pool vps-clients --full 1 --storage local-lvm
qm set 1001 --tags order-test-0001 --cores 2 --memory 2048 --ciuser debian --sshkeys /root/test-vps.pub --ipconfig0 ip=10.20.0.50/24,gw=10.20.0.1 --nameserver 10.20.0.1 --net0 virtio,bridge=vmbr1,firewall=1
qm resize 1001 scsi0 20G
qm config 1001
qm start 1001
qm status 1001
```

Dans le clone :

```bash
cloud-init status --wait
hostnamectl
ip -br address
ip route
systemctl --failed
```

`qm start` ≠ SSH fonctionnel. Destruction **irréversible**, VMID confirmé et VM arrêtée :

```bash
qm shutdown 1001 --timeout 60
qm destroy 1001 --purge 1
```

## 13. Intégration paiement → VM

Les commandes `qm` du lab **ne remplacent pas** le plugin. Le rapport doit indiquer : nom, dépôt, commit, compatibilité Paymenter/Proxmox, endpoints, droits, prestataire (sandbox, signature, retries).

### Contrat attendu

1. Commande + facture en attente
2. Webhook serveur authentifié
3. Vérif signature, fraîcheur, id, montant/devise, commande
4. Job stable lié à la commande
5. Contrôle offre, quotas, template, pool, stockage, réseau
6. Recherche VM déjà liée / taguée **avant** clone
7. Clone, config, start, contrôle
8. Enregistrement VMID + tâche, activation du service
9. Remise des accès par un canal protégé

Le client ne choisit jamais VMID, stockage, bridge ou compte API.

### Anti-doublon

Un timeout portail ≠ « Proxmox n’a rien créé ».

```bash
pvesh get /cluster/resources --type vm --output-format json
pvesh get /nodes/NOM_DU_NOEUD/tasks --limit 20
```

Le tag aide au rapprochement ; il ne remplace pas un verrou applicatif.

## 14. Isolation réseau des VPS

Admin et sauvegarde inaccessibles aux locataires. Tester aussi deux VM sur le **même** L2. Un ping qui échoue ne prouve pas l’isolation TCP.

Exemple `/etc/pve/firewall/1001.fw` (identité, pas les règles inter-zones) :

```ini
[OPTIONS]
enable: 1
macfilter: 1
ipfilter: 1
policy_in: ACCEPT
policy_out: ACCEPT

[IPSET ipfilter-net0]
10.20.0.50
```

Compléter les règles réelles (dont IPv6). Ne pas écraser un `cluster.fw` existant.

Depuis le clone (adapter les IP) :

```bash
sudo apt install -y netcat-openbsd curl
ping -c 2 10.20.0.1
nc -vz -w 3 10.10.0.10 8006
nc -vz -w 3 10.10.0.10 22
nc -vz -w 3 10.10.0.20 3306
nc -vz -w 3 10.10.0.20 6379
nc -vz -w 3 10.20.0.51 22
curl -I https://deb.debian.org
```

Attendu typique : passerelle / mises à jour OK ; Proxmox, SSH admin, MariaDB/Redis, voisin SSH **refusés**.

## 15. Sauvegarde

Périmètre portail : dump MariaDB, `.env`, `storage/app`, personnalisations. `APP_KEY` aussi au coffre. Les disques VPS clients sont un **autre** process.

RPO / RTO = mesures d’exercice, pas des garanties.

### Clé `age` (identité privée **hors** prod)

```bash
umask 077
age-keygen -o paymenter-backup-identity.txt
age-keygen -y paymenter-backup-identity.txt
```

Sur le portail : uniquement la **clé publique** dans `/etc/paymenter-backup/recipients.txt`.

`/usr/local/sbin/paymenter-backup.sh` :

```bash
#!/bin/bash
set -euo pipefail
umask 077
DEST=/var/backups/paymenter
RECIPIENTS=/etc/paymenter-backup/recipients.txt
STAMP=$(date +%Y%m%d-%H%M%S)
install -d -m 0700 "$DEST"
test -s "$RECIPIENTS"
DB_TMP="$DEST/db-$STAMP.sql.gz.age.partial"
FILES_TMP="$DEST/files-$STAMP.tar.gz.age.partial"
trap 'rm -f "$DB_TMP" "$FILES_TMP"' EXIT
mariadb-dump --single-transaction --routines --triggers paymenter | gzip | age -R "$RECIPIENTS" > "$DB_TMP"
tar -C /var/www/paymenter -czf - .env storage/app | age -R "$RECIPIENTS" > "$FILES_TMP"
mv "$DB_TMP" "$DEST/db-$STAMP.sql.gz.age"
mv "$FILES_TMP" "$DEST/files-$STAMP.tar.gz.age"
trap - EXIT
```

Timer quotidien `03:15`, `flock` anti-chevauchement, puis `rsync` **sans** `--delete` vers une cible hors hôte. Tester la restauration depuis la copie **distante**.

Unités systemd :

```ini
# /etc/systemd/system/paymenter-backup.service
[Unit]
Description=Sauvegarde chiffree Paymenter

[Service]
Type=oneshot
ExecStart=/usr/bin/flock -n /run/paymenter-backup.lock /usr/local/sbin/paymenter-backup.sh
```

```ini
# /etc/systemd/system/paymenter-backup.timer
[Unit]
Description=Sauvegarde quotidienne Paymenter

[Timer]
OnCalendar=*-*-* 03:15:00
Persistent=true

[Install]
WantedBy=timers.target
```

```bash
sudo chown root:root /usr/local/sbin/paymenter-backup.sh
sudo chmod 0750 /usr/local/sbin/paymenter-backup.sh
sudo systemd-analyze verify /etc/systemd/system/paymenter-backup.service /etc/systemd/system/paymenter-backup.timer
sudo systemctl daemon-reload
sudo systemctl enable --now paymenter-backup.timer
sudo systemctl start paymenter-backup.service
```

## 16. Restauration laboratoire

VM isolée : pas de paiement réel, pas d’SMTP prod, pas d’API Proxmox prod. Stopper worker et cron jusqu’à validation.

```bash
umask 077
mkdir -p "$HOME/paymenter-reprise"
cd "$HOME/paymenter-reprise"
age -d -i "$AGE_IDENTITY" "$DB_ARCHIVE" | gzip -d > database.sql
age -d -i "$AGE_IDENTITY" "$FILES_ARCHIVE" > application.tar.gz
tar -tzf application.tar.gz
```

Importer dans une base **`paymenter_restore`**, pas la prod. Garder **la même** `APP_KEY`. Désactiver les intégrations réelles. Mesurer délai, dernière donnée, manops → RTO/RPO.

```bash
sudo systemctl stop paymenter.service
sudo mariadb -e 'CREATE DATABASE paymenter_restore CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;'
sudo mariadb paymenter_restore < database.sql
sudo tar -xzf application.tar.gz -C /var/www/paymenter
sudoedit /var/www/paymenter/.env
```

## 17. Journaux et supervision

À surveiller : HTTPS, certificat, nginx/FPM/MariaDB/Redis/worker, disque, stockage PVE, dernière sauvegarde.

Alertes utiles : service down, worker silencieux, jobs en échec répétés, disque bas, cert bientôt expiré, backup manquant.

Les logs portent un id commande/job/VM — **sans** token, mot de passe ou corps de webhook.

```bash
systemctl --failed
systemctl status nginx php8.3-fpm mariadb redis-server paymenter --no-pager
openssl s_client -connect "$PANEL_FQDN:443" -servername "$PANEL_FQDN" </dev/null 2>/dev/null | openssl x509 -noout -dates
```

## 18. Maintenance

Avant MAJ : notes de version, plugin, `APP_KEY` récupérable, backup restaurable, espace disque, fenêtre. Tester sur clone. Correctifs OS ≠ migration majeure Paymenter. Rollback = **fichiers + base + APP_KEY** de la même sauvegarde.

## 19. Secrets

Coffre : `APP_KEY`, SQL, token PVE, secret webhook, SMTP, identité `age`.

```gitignore
.env
.env.*
!.env.example
*.sql
*.sql.gz
*.age
*.key
*.pem
*.tar.gz
```

Une clé fuitée se **révoque** avant de « nettoyer Git ». `set -x` interdit pendant le traitement de secrets.

## 20. Analyse des risques

| Menace | Actif | Mesures |
| --- | --- | --- |
| Compromission du portail | Clients, commandes, APP_KEY | MAJ, TLS, MFA, droits fichiers, SSH restreint |
| Webhook falsifié / rejoué | Paiement + VM | Signature, montant, idempotence |
| Token trop large ou fuité | Hyperviseur | Realm pve, privsep, ACL, expiration |
| Gestion exposée | Proxmox | VPN / VLAN admin, pas de 8006 public |
| Isolation défaillante | Autres clients | VLAN, FW, ip/mac filter, tests |
| Template contaminé | Tous les clones | Image officielle + checksum + clone test |
| Backup inutilisable | Continuité | Chiffrement, clé hors site, exercice |
| Erreur humaine | Service | Console, revue VMID, rollback |

Risques résiduels : hardware, électricité, lien, 0-day, abus sortant, DDoS. Ne pas promettre un SLA non mesuré.

## 21. Recette

Compte fictif, offre jetable, **sandbox**, VM de test. Pour chaque ID : préconditions, steps, attendu, observé, horodatage, preuve expurgée, verdict.

| ID | Essai | Attendu | Statut |
| --- | --- | --- | --- |
| F-01 | HTTPS / HTTP | Certificat + redirection | Non testé |
| F-02 | Paiement refusé | Aucune VM | Non testé |
| F-03 | Paiement accepté | Une VM liée à la commande | Non testé |
| F-04 | Webhook rejoué | Pas de doublon | Non testé |
| F-05 | Signature invalide | Rejet | Non testé |
| F-06 | API PVE down | Erreur + pas d’orpheline | Non testé |
| F-07 | Plus de capacité | Échec géré | Non testé |
| F-08 | Worker coupé | Reprise sûre | Non testé |
| F-09 | Restauration | Portail cohérent en lab | Non testé |
| S-01 | 8006 depuis Internet | Inaccessible | Non testé |
| S-02 | 3306 / 6379 Internet | Inaccessibles | Non testé |
| S-03 | Depuis un VPS | Admin + voisins inaccessibles | Non testé |
| S-04 | `/.env` | 403/404 | Non testé |

Ne pas remplir le stockage de **prod** pour illustrer F-07.

## 22. Scan d’exposition (ses propres IP uniquement)

```bash
nmap -Pn -p 22,80,443,3306,6379,8006 DOMAINE_DU_PORTAIL
nmap -Pn -6 -p 22,80,443,3306,6379,8006 DOMAINE_DU_PORTAIL
curl -I https://DOMAINE_DU_PORTAIL
```

Attendu : 443 public, 80 ACME/redir, bases et PVE fermés. SSH : source autorisée OK, source étrangère KO. Un FQDN privé ≠ IP non exposée.

## 23. Incident et rotation de token

Préserver les logs → chronologie → contenir → révoquer → restaurer un état connu → réactiver.

```bash
pveum user token add paymenter@pve provisioning2 --privsep 1 --expire "$(date -d '+180 days' +%s)"
pveum acl modify /pool/vps-clients --roles PaymenterVM --tokens 'paymenter@pve!provisioning2'
pveum acl modify /vms/9000 --roles PaymenterVM --tokens 'paymenter@pve!provisioning2'
pveum acl modify /storage/local-lvm --roles PaymenterStorage --tokens 'paymenter@pve!provisioning2'
```

Nouveau token, ACL, test clone, **puis** `pveum user token remove paymenter@pve provisioning`. Fuite suspecte : révoquer **tout de suite**.

## 24. Dépannage

| Symptôme | Pistes |
| --- | --- |
| 502 | FPM, socket, droits, `public/` |
| SQL | bind, user, secret, privileges |
| Decrypt fail | Mauvaise APP_KEY — ne pas régénérer |
| Payé sans VM | Webhook, queue, worker, plugin, ACL, template |
| VM sans réseau | bridge/VLAN, cloud-init, FW |
| Worker down | unit, PHP CLI, Redis |
| Cert expiré | timer certbot, DNS, port 80 |
| Pas d’archive | timer, pipefail, disque, recipients |

Job bloqué ≠ `qm clone` manuel. Chercher d’abord la tâche PVE.

| Fréquence | Routine |
| --- | --- |
| Quotidien | alertes, worker, disque, HTTPS, backup |
| Hebdo | capacité, comptes, logs, MAJ, copie distante |
| Périodique | ACL, tokens, certs, exercice de reprise |

## 25. Livrables

Collecte **privée** (relire / expurger) :

```bash
umask 077
EVIDENCE="$HOME/oteria-preuves-$(date +%Y%m%d-%H%M%S)"
mkdir -m 0700 "$EVIDENCE"
{
  date --iso-8601=seconds
  cat /etc/os-release
  /usr/bin/php8.3 -v
  mariadb --version
  nginx -v
  systemctl is-active nginx php8.3-fpm mariadb redis-server paymenter
} > "$EVIDENCE/inventaire-portail.txt" 2>&1
```

Ne pas joindre `.env`, dumps, tokens, webhooks bruts.

| Jalon | Livrable | Sortie |
| --- | --- | --- |
| Cadrage | Périmètre + schéma | Choix validés |
| Socle | Debian, SSH, dépôts | Inventaire |
| Portail | Paymenter + TLS | Accès de test |
| Intégration | Plugin + token + template | 1 VM / commande |
| Sécurité | FW, secrets, backup | Tests observés |
| Remise | Rapport + preuves | Verdicts traçables |

## Annexes

### A. Inventaire à compléter

| Composant | Référence | Constaté |
| --- | --- | --- |
| Debian | 13 | À relever |
| Paymenter | v1.5.9 + SHA-256 ci-dessus | Tag / archive à consigner |
| PHP | 8.3 | À relever |
| MariaDB | branche retenue | À relever |
| Redis / NGINX | paquets | À relever |
| Proxmox | `pveversion -v` | À relever |
| Plugin PVE | à identifier | Source / commit |

### B. Checklist remise

- [ ] Schéma = lab réel
- [ ] TLS + dry-run renew
- [ ] MariaDB/Redis/PVE non publics
- [ ] Token restreint + TLS vérifié
- [ ] Plugin et PSP identifiés
- [ ] F-02 à F-05 exécutés
- [ ] Isolation + IPv6 si utilisé
- [ ] Restauration hors hôte
- [ ] Secrets hors Git / hors PDF

### C. Glossaire

| Terme | Sens ici |
| --- | --- |
| APP_KEY | Clé de chiffrement Laravel |
| Webhook | Notif serveur→serveur signée |
| Worker | Consommateur de la queue |
| Idempotence | Retry sans 2e VM |
| Cloud-init | Identité + IP de l’invité |
| RPO / RTO | Perte max / délai de reprise |
| Plan de gestion | Réseau d’admin ≠ clients |

### D. Références

- [Installation Paymenter](https://paymenter.org/docs/installation/install)
- [Serveur web Paymenter](https://paymenter.org/docs/installation/webserver)
- [CLI Paymenter](https://paymenter.org/docs/guides/cli)
- [Extensions serveur](https://paymenter.org/development/extensions/server)
- [Release Paymenter v1.5.9](https://github.com/Paymenter/Paymenter/releases/tag/v1.5.9)
- [Dépôt Sury](https://packages.sury.org/php/README.txt)
- [Gestion utilisateur Proxmox](https://pve.proxmox.com/wiki/User_Management)
- [Cloud-init Proxmox](https://pve.proxmox.com/wiki/Cloud-Init_Support)
- [Pare-feu Proxmox](https://pve.proxmox.com/pve-docs/chapter-pve-firewall.html)
- [API Viewer](https://pve.proxmox.com/pve-docs/api-viewer/)
