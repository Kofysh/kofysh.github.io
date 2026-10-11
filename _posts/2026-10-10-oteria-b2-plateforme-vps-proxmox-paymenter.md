---
title: "Projet OTERIA B2 : plateforme VPS avec Paymenter et Proxmox VE"
date: 2026-10-10 18:48:00 +0200
last_modified_at: 2026-10-11 09:03:00 +0200
categories: [Cybersécurité, Homelab]
tags: [OTERIA, Proxmox, Paymenter, VPS, Debian, Linux, cloud-init]
description: >-
  Manuel technique du projet OTERIA B2 : architecture, installation de Paymenter,
  preparation Proxmox, securite, sauvegarde, exploitation et recette.
---

Auteur : Baki Sagir — OTERIA, Bachelor 2 cybersécurité — Projet individuel.

## Présentation et portée

Cette édition reconstruite remplace les versions précédentes du billet. Elle fournit un manuel de déploiement et d'exploitation, avec séparation des environnements, commandes, configurations, contrôles et procédures de reprise. Elle ne constitue pas une copie exacte du PDF révisé précédemment généré, ni un téléversement de ce PDF : c'est la version Markdown reconstruite pour le blog.

La procédure prépare Paymenter sur Debian 13 et Proxmox VE pour des VPS QEMU/KVM. Le parcours automatique commande → paiement → VM exige une extension Paymenter-Proxmox compatible. Son nom et sa version ne sont pas indiqués dans le dossier source ; ce point reste explicitement à établir. Les critères de recette sont des résultats attendus, pas des résultats d'exécution inventés.

Les références de commande sont les documentations Paymenter, Proxmox, Sury et le dossier technique fourni. Les valeurs propres au site sont renseignées par l'exploitant. Ne jamais publier les clés, tokens, mots de passe, données clients ou certificats privés.

## Sommaire

1. Objectif et périmètre
2. Architecture et flux
3. Préparation et inventaire
4. Debian et administration SSH
5. Dépôts et dépendances
6. PHP, MariaDB, Redis et Composer
7. Installation Paymenter
8. NGINX et certificats
9. Pare-feu du portail
10. Identité API et ACL Proxmox
11. Template cloud-init
12. Clone de recette
13. Intégration paiement et provisionnement
14. Isolation réseau des VPS
15. Sauvegarde et planification
16. Restauration en laboratoire
17. Journaux et supervision
18. Maintenance et retour arrière
19. Gestion des secrets
20. Analyse des risques
21. Recette fonctionnelle et sécurité
22. Exposition externe
23. Incident et rotation des tokens
24. Dépannage et exploitation
25. Livrables et preuves
26. Annexes et références

## 1. Objectif et périmètre

Le projet vise à vendre des VPS depuis un portail, puis à automatiser leur création après validation du paiement. Paymenter assure le catalogue, les clients, commandes et factures ; Proxmox fournit les machines virtuelles. Le déploiement du portail ne suffit pas à réaliser l'intégration entre ces deux systèmes.

Le périmètre comprend une VM Debian dédiée au portail, NGINX, PHP-FPM, MariaDB, Redis, un worker et un scheduler, un template Debian cloud-init, un compte API Proxmox dédié, la séparation réseau, les sauvegardes et la recette. Les conteneurs LXC et serveurs de jeux restent hors périmètre. Une VM possède son propre noyau ; cette séparation ne dispense pas de sécuriser l'hyperviseur et les réseaux.

Quatre exigences guident les procédures : le paiement authentifié est le seul déclencheur de création ; l'API Proxmox reste privée ; une commande rejouée ne produit pas une seconde VM ; les résultats de réalisation sont associés à des preuves réelles.

Une procédure décrit une action à effectuer. Un contrôle syntaxique vérifie une partie de sa forme. Une validation d'environnement démontre son résultat dans un système précis. Ces niveaux ne doivent pas être confondus dans le rendu.

## 2. Architecture et flux

Le navigateur contacte le frontal NGINX en HTTPS. NGINX publie exclusivement `/var/www/paymenter/public` et transmet les requêtes PHP à PHP-FPM. MariaDB et Redis restent locaux. Le worker appelle l'API Proxmox via le réseau de gestion ; les clients ne disposent pas d'accès à ce réseau.

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
                 API Proxmox privee
                         |
              template -> VM cliente

Portail -> sauvegarde chiffree -> cible hors hote
```

| Zone | Services | Accès prévu |
| --- | --- | --- |
| Frontal | NGINX, TLS | 443 public ; 80 pour redirection et ACME |
| Application | Paymenter, PHP-FPM, worker | Communications locales nécessaires |
| Données | MariaDB, Redis | Loopback, sans publication Internet |
| Gestion | API Proxmox, SSH | Réseau d'administration ou VPN |
| Locataires | VM QEMU/KVM | Réseau client séparé |
| Sauvegarde | Cible distincte | Exploitation uniquement |

Proxmox 8006, MariaDB 3306, Redis 6379 et SSH d'administration ne doivent pas être publiés sur Internet. Une politique IPv4 ne protège pas automatiquement les destinations IPv6 : vérifier les deux familles.

Si un reverse proxy externe est présent, le backend doit limiter ses accès à ce proxy et ne faire confiance aux en-têtes transférés que depuis cette origine. La topologie finale doit représenter les VLAN, bridges, routes et règles réels, pas uniquement ce schéma logique.

## 3. Préparation et inventaire

### 3.1 Conditions de départ

Prévoir un hôte Proxmox opérationnel, un stockage de disques VM, un réseau d'administration séparé du réseau client, une VM Debian 13 dédiée et un domaine contrôlé pointant vers le frontal. Garder une console de secours avant modification de SSH ou du pare-feu.

Le dimensionnement CPU/RAM/disque dépend de la charge, du nombre de services, des archives temporaires et des marges d'exploitation. Consigner les ressources choisies ; aucune capacité commerciale n'est déduite d'une configuration de démonstration.

### 3.2 Paramètres du site

| Paramètre | Valeur à déterminer |
| --- | --- |
| PANEL_FQDN | Domaine public du portail |
| ADMIN_CIDR | Réseau autorisé à administrer |
| ACME_EMAIL | Adresse de contact des certificats |
| PVE_FQDN | Nom privé correspondant au certificat Proxmox |
| PVE_NODE | Nœud cible |
| PVE_STORAGE | Stockage de disques VM |
| PVE_BRIDGE | Bridge client existant |
| TEMPLATE_VMID | VMID libre réservé au modèle |
| TEST_VMID | VMID libre réservé à la recette |
| CLIENT_IP, CLIENT_GATEWAY, CLIENT_DNS | Adressage alloué au clone |

Les variables shell sont locales à la session. Dans la VM portail, saisir les paramètres non secrets :

```bash
read -r -p 'Domaine public du portail : ' PANEL_FQDN
read -r -p 'CIDR d administration : ' ADMIN_CIDR
read -r -p 'Adresse e-mail ACME : ' ACME_EMAIL
: "${PANEL_FQDN:?Domaine obligatoire}"
: "${ADMIN_CIDR:?CIDR obligatoire}"
: "${ACME_EMAIL:?Adresse obligatoire}"
export PANEL_FQDN ADMIN_CIDR ACME_EMAIL
```

### 3.3 Versions

La procédure retient Paymenter v1.5.9 et PHP 8.3 comme références. Debian est décrit par sa branche 13 ; ne pas affirmer une version mineure installée sans relevé. La version Proxmox est celle constatée sur l'hôte.

```bash
cat /etc/os-release
cat /etc/debian_version
php -v
mariadb --version
redis-server --version
nginx -v
composer --version
```

Sur Proxmox :

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

`php artisan --version` donne la version du framework Laravel, pas nécessairement le numéro de release Paymenter. Consigner le tag et l'empreinte de l'archive séparément. Dans un cluster, vérifier les VMID sur l'ensemble des nœuds.

## 4. Debian et administration SSH

Les commandes de ce chapitre s'exécutent dans la VM Debian, avec sudo. Elles ne concernent pas le shell de l'hyperviseur.

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

Analyser les erreurs et unités en échec avant d'installer l'application. La synchronisation horaire est importante pour les logs, certificats et vérification de fraîcheur des événements.

Créer un compte nominatif. `operateur` est un exemple ; remplacer ce nom de manière cohérente dans la configuration :

```bash
sudo adduser operateur
sudo usermod -aG sudo operateur
```

Depuis le poste d'administration, installer la clé publique puis tester la connexion. Ne pas déposer la clé privée sur le serveur :

```bash
ssh-copy-id operateur@ADRESSE_DU_PORTAIL
ssh operateur@ADRESSE_DU_PORTAIL
```

Après validation de cette connexion et de la console de secours, durcir SSH :

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

Garder la session actuelle ouverte jusqu'à réussite d'une seconde connexion. Une configuration ou une règle réseau erronée peut couper l'administration. Le test syntaxique doit réussir avant rechargement.

## 5. Dépôts et dépendances

Un dépôt tiers fait partie de la chaîne de confiance. Vérifier sa provenance, sa suite Debian, ses clés et les versions candidates. Ne pas conserver plusieurs sources concurrentes pour le même dépôt.

### 5.1 PHP Sury

Sur une installation propre, la méthode du trousseau officiel est utilisée avec `signed-by` :

```bash
sudo apt-get update
sudo apt-get install -y lsb-release ca-certificates curl
curl -fSLo /tmp/debsuryorg-archive-keyring.deb https://packages.sury.org/debsuryorg-archive-keyring.deb
sudo dpkg -i /tmp/debsuryorg-archive-keyring.deb
printf 'deb [signed-by=/usr/share/keyrings/debsuryorg-archive-keyring.gpg] https://packages.sury.org/php/ %s main\n' "$(lsb_release -sc)" | sudo tee /etc/apt/sources.list.d/php.list
sudo apt-get update
apt-cache policy php8.3-fpm
```

Sur une machine déjà configurée, examiner les sources existantes avant d'ajouter `php.list`. Un candidat absent ou une erreur de signature doit être diagnostiqué ; ne pas désactiver les signatures pour continuer.

### 5.2 MariaDB

Le dossier source vise la branche MariaDB 10.11. Vérifier la prise en charge de la suite Debian par le dépôt officiel. Télécharger le script avant exécution :

```bash
curl -fsSLo /tmp/mariadb_repo_setup https://downloads.mariadb.com/MariaDB/mariadb_repo_setup
sha256sum /tmp/mariadb_repo_setup
less /tmp/mariadb_repo_setup
```

Comparer la somme à celle publiée par le mainteneur lorsqu'elle est disponible. Après inspection et validation de compatibilité :

```bash
sudo bash /tmp/mariadb_repo_setup --mariadb-server-version=mariadb-10.11
sudo apt update
apt-cache policy mariadb-server
```

Si cette combinaison n'est pas prise en charge, retenir une version compatible avec Paymenter et Debian et l'inscrire dans l'inventaire ; ne pas forcer des paquets d'une suite différente. Cette décision est un point de contrôle avant installation.

## 6. PHP, MariaDB, Redis et Composer

### 6.1 Runtime PHP

```bash
sudo apt install -y php8.3-cli php8.3-common php8.3-fpm \
  php8.3-gd php8.3-mysql php8.3-mbstring php8.3-bcmath \
  php8.3-xml php8.3-curl php8.3-zip php8.3-intl php8.3-redis
/usr/bin/php8.3 -v
/usr/bin/php8.3 -m
/usr/bin/php8.3 --ini
sudo systemctl enable --now php8.3-fpm
sudo ss -xl | grep php
```

La liste doit correspondre aux exigences de la release. Le guide appelle explicitement `/usr/bin/php8.3` dans le scheduler, le worker et Artisan pour éviter un runtime CLI différent de FPM.

Réglages de départ, à dimensionner selon la charge :

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

Les limites d'envoi doivent être cohérentes avec NGINX. Le worker conserve sa configuration CLI ; une modification du fichier FPM n'affecte pas automatiquement ses limites mémoire.

### 6.2 MariaDB locale

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

Utiliser un utilisateur applicatif limité à sa base. Générer un secret aléatoire, le conserver dans le coffre et le saisir dans le client SQL sans l'enregistrer dans une capture. Pour désactiver l'historique du client pendant cette session :

```bash
sudo env MYSQL_HISTFILE=/dev/null mariadb
```

Dans l'invite SQL :

```sql
CREATE DATABASE paymenter CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'paymenter'@'127.0.0.1' IDENTIFIED BY 'SECRET_UNIQUE_DU_COFFRE';
GRANT ALL PRIVILEGES ON paymenter.* TO 'paymenter'@'127.0.0.1';
QUIT;
```

Le mot de passe écrit ci-dessus est un emplacement à remplacer, pas une valeur à utiliser. Ne pas ajouter `WITH GRANT OPTION` au compte applicatif sans besoin justifié. Tester ensuite :

```bash
sudo ss -lntp | grep 3306
mariadb -h 127.0.0.1 -u paymenter -p paymenter -e 'SELECT 1;'
```

### 6.3 Redis local

```bash
sudo apt install -y redis-server
sudo systemctl enable --now redis-server
redis-cli ping
sudo ss -lntp | grep 6379
```

Le résultat attendu est `PONG` et une écoute locale. Confirmer `bind` et `protected-mode` dans la configuration Redis. Son utilisation pour queue, cache ou sessions est celle définie dans Paymenter ; ne pas supposer le pilote actif. Un Redis distant nécessite ACL, authentification, chiffrement et filtrage supplémentaires.

### 6.4 Composer

```bash
curl -fsSLo /tmp/composer-setup.php https://getcomposer.org/installer
curl -fsSLo /tmp/installer.sig https://composer.github.io/installer.sig
echo "$(cat /tmp/installer.sig)  /tmp/composer-setup.php" | sha384sum -c - && sudo /usr/bin/php8.3 /tmp/composer-setup.php --install-dir=/usr/local/bin --filename=composer
rm -f /tmp/composer-setup.php /tmp/installer.sig
composer --version
```

La condition `&&` empêche l'installation si la vérification échoue. Ne pas déclarer `composer install` sans effet sous prétexte que `vendor` existe : Composer peut modifier des dépendances et lancer des scripts.

## 7. Installation Paymenter

### 7.1 Release vérifiable

L'archive v1.5.9 et son digest SHA-256 ont été consultés sur GitHub. La somme ci-dessous s'applique exclusivement à cet asset ; une nouvelle version requiert une nouvelle vérification.

```bash
VERSION=v1.5.9
sudo install -d -o www-data -g www-data -m 0755 /var/www/paymenter
cd /var/www/paymenter
sudo -u www-data curl -fLo paymenter.tar.gz "https://github.com/Paymenter/Paymenter/releases/download/${VERSION}/paymenter.tar.gz"
printf '%s  paymenter.tar.gz\n' ed69a689338f112f163f8fff3254fd3a1fc6a947f5bdca15fa4a1d86b4344125 | sha256sum -c - && sudo -u www-data tar -xzf paymenter.tar.gz
```

Arrêter si le téléchargement, le checksum ou l'extraction échoue. Puis, après succès :

```bash
sudo rm -f /var/www/paymenter/paymenter.tar.gz
sudo chown -R www-data:www-data /var/www/paymenter
sudo find /var/www/paymenter -type d -exec chmod 0755 {} +
sudo find /var/www/paymenter -type f -exec chmod 0644 {} +
```

Une archive officielle peut embarquer les dépendances. Exécuter Composer seulement si la procédure de la release le demande :

```bash
cd /var/www/paymenter
sudo -u www-data env COMPOSER_CACHE_DIR=/tmp/composer-cache composer install --no-dev --optimize-autoloader
```

### 7.2 Configuration

Sur une installation neuve uniquement, créer .env. Sur une instance existante, ne pas écraser sa configuration :

```bash
cd /var/www/paymenter
sudo -u www-data cp .env.example .env
sudoedit .env
sudo chown www-data:www-data .env
sudo chmod 0640 .env
```

Renseigner les variables du modèle de la release. Extrait de configuration :

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

Remplacer domaine et secret. Compléter courrier, queue, cache et sessions selon les noms exacts de .env.example. Aucun .env réel n'est une pièce publique de documentation.

### 7.3 Initialisation

Les commandes sont exécutées depuis le répertoire Paymenter, avec le compte de service. Confirmer leur présence dans `artisan list` pour la release installée :

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

`key:generate` concerne uniquement l'installation neuve. Sauvegarder APP_KEY dans le coffre ; ne jamais la régénérer sur une installation existante. Une base restaurée avec une autre clé peut contenir des données impossibles à déchiffrer. Les migrations modifient la base : sauvegarder une installation existante avant usage.

Les commandes d'administration sont interactives. Ne pas conserver leurs sorties contenant des secrets. Créer un compte nominatif, un mot de passe unique et MFA si la version le permet.

### 7.4 Scheduler et worker

Installer et activer cron s'il n'est pas déjà présent :

```bash
sudo apt install -y cron
sudo systemctl enable --now cron
sudo crontab -u www-data -e
```

Ajouter une ligne unique :

```cron
* * * * * /usr/bin/php8.3 /var/www/paymenter/artisan schedule:run >/dev/null 2>&1
```

Contrôler le crontab et les tâches déclarées :

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
sudo journalctl -u paymenter.service -n 100 --no-pager
```

Les options du worker doivent être compatibles avec la release. Le redémarrage automatique n'assure pas l'idempotence des appels Proxmox ; celle-ci doit être implémentée par l'intégration.

## 8. NGINX et certificats

### 8.1 Site HTTP de départ

Installer les composants dans la VM portail :

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
sudo install -d -m 0755 /etc/nginx/sites-available /etc/nginx/sites-enabled
sudo tee /etc/nginx/conf.d/00-paymenter-hardening.conf >/dev/null <<'EOF'
server_tokens off;
EOF
```

Créer `/etc/nginx/sites-available/paymenter.conf`, remplacer `DOMAINE_DU_PORTAIL` par PANEL_FQDN. Ne pas publier l'administration ou saisir de vrais identifiants tant que HTTPS n'est pas en place :

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

Activer et valider ce site temporaire :

```bash
sudo ln -sfn /etc/nginx/sites-available/paymenter.conf /etc/nginx/sites-enabled/paymenter.conf
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

### 8.2 Émission du certificat

Le DNS et les règles amont doivent permettre le challenge HTTP. La configuration temporaire est modifiée par le plugin NGINX de Certbot pendant l'autorisation :

```bash
sudo certbot certonly --nginx --non-interactive --agree-tos --email "$ACME_EMAIL" -d "$PANEL_FQDN"
sudo test -s "/etc/letsencrypt/live/$PANEL_FQDN/fullchain.pem"
sudo test -s "/etc/letsencrypt/live/$PANEL_FQDN/privkey.pem"
```

Arrêter en cas d'échec et diagnostiquer DNS, IPv6, NAT, port 80 et logs Certbot. Ne pas charger une configuration 443 pointant vers des fichiers absents.

### 8.3 Configuration finale

Remplacer le site temporaire par ce bloc, après adaptation du domaine et des chemins de certificat :

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

Vérifier le socket effectif et la compatibilité des routes avec Paymenter. HSTS reste court au départ ; augmenter sa durée uniquement après validation durable. La configuration n'active pas HTTP/2, qui n'est pas nécessaire au fonctionnement et dépend de la version NGINX.

```bash
sudo nginx -t && sudo systemctl reload nginx
sudo certbot renew --dry-run
curl --silent --show-error --head "https://$PANEL_FQDN"
curl --silent --show-error --head "http://$PANEL_FQDN"
curl --silent --show-error --output /dev/null --write-out '%{http_code}\n' "https://$PANEL_FQDN/.env"
```

La requête .env doit retourner 403/404, sans exposition de son contenu. Un code 200 n'est pas un succès de ce test. La chaîne TLS, le nom de domaine et le renouvellement doivent être contrôlés séparément.

## 9. Pare-feu du portail

La règle d'entrée par défaut est restrictive ; SSH est limité au CIDR réel d'administration. Avant activation, garder une session et une console de secours. Vérifier que ADMIN_CIDR est correct :

```bash
sudo apt install -y ufw
grep IPV6 /etc/default/ufw
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow from "$ADMIN_CIDR" to any port 22 proto tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw show added
```

Après revue et confirmation de l'accès de secours :

```bash
sudo ufw enable
sudo ufw status numbered
```

Le portail doit joindre DNS, NTP, dépôts et services nécessaires. La politique sortante ouverte est un point de départ ; un filtrage sortant plus strict exige une matrice des dépendances. Ne pas ouvrir 3306/6379 au public. Les règles du routeur et de Proxmox sont distinctes d'UFW.

## 10. Identité API et ACL Proxmox

Les commandes de ce chapitre s'exécutent sur le nœud Proxmox. Le service utilise un compte dédié du realm `pve`, pas root. Le rôle VM ci-dessous est une base de travail pour clonage/configuration ; les endpoints de l'extension déterminent les droits supplémentaires réellement nécessaires.

```bash
pveum pool add vps-clients --comment 'VM clientes Paymenter'
pveum role add PaymenterVM --privs 'VM.Allocate VM.Clone VM.Audit VM.PowerMgmt VM.Config.CPU VM.Config.Memory VM.Config.Disk VM.Config.Network VM.Config.Options VM.Config.Cloudinit Pool.Audit'
pveum role add PaymenterStorage --privs 'Datastore.AllocateSpace Datastore.Audit'
pveum user add paymenter@pve --comment 'Provisioning Paymenter'
pveum user token add paymenter@pve provisioning --privsep 1 --expire "$(date -d '+180 days' +%s)"
```

L'expiration est un timestamp Unix calculé par `date`, jamais la chaîne `180d`. Le secret est affiché une fois : le déposer immédiatement au coffre. En cas de compte/pool existant, examiner et modifier la configuration existante plutôt que relancer les créations.

Exemples d'ACL pour le pool, le template 9000 et le stockage local-lvm ; ces ressources doivent être celles du site :

```bash
pveum acl modify /pool/vps-clients --roles PaymenterVM --users paymenter@pve --tokens 'paymenter@pve!provisioning'
pveum acl modify /vms/9000 --roles PaymenterVM --users paymenter@pve --tokens 'paymenter@pve!provisioning'
pveum acl modify /storage/local-lvm --roles PaymenterStorage --users paymenter@pve --tokens 'paymenter@pve!provisioning'
pveum user permissions paymenter@pve --path /pool/vps-clients
pveum user token permissions paymenter@pve provisioning --path /pool/vps-clients
pveum acl list
```

Avec privsep, les droits du token sont limités par ceux de l'utilisateur. Le réseau peut demander `SDN.Use` sur le chemin approprié ; ce chemin dépend de la version et du réseau configuré. Ne pas donner de droits globaux pour contourner un 403. Un appel de création dans un pool peut nécessiter une stratégie d'allocation propre au plugin : vérifier son code et l'API Viewer avant production.

### TLS et premier appel

Exporter le certificat public de la CA Proxmox depuis une source de confiance et le copier sur le portail. Dans la VM portail :

```bash
sudo install -m 0644 pve-root-ca.pem /usr/local/share/ca-certificates/pve-root-ca.crt
sudo update-ca-certificates
read -r -p 'Nom DNS prive Proxmox : ' PVE_FQDN
read -rs -p 'Secret du token : ' PVE_TOKEN
printf '\n'
printf 'header = "Authorization: PVEAPIToken=paymenter@pve!provisioning=%s"\n' "$PVE_TOKEN" | curl --fail --silent --show-error --config - "https://$PVE_FQDN:8006/api2/json/version"
unset PVE_TOKEN
```

Le secret est transmis à curl par son entrée de configuration plutôt que dans les arguments du processus. Ne pas activer xtrace, ne pas capturer le secret et ne pas désactiver la vérification TLS. Le nom DNS doit correspondre au certificat. Une lecture réussie ne prouve pas que les droits de clonage sont suffisants.

## 11. Template cloud-init

Une image doit être officielle, vérifiée et assainie. Aucun mot de passe commun, clé privée d'exploitation ou donnée client ne doit être intégré au modèle. Un administrateur root de l'invité peut lire les données cloud-init qui lui sont exposées : n'y déposer aucun secret du plan de gestion.

Sur Proxmox :

```bash
cd /var/tmp
curl -fLO https://cloud.debian.org/images/cloud/trixie/latest/debian-13-genericcloud-amd64.qcow2
curl -fLO https://cloud.debian.org/images/cloud/trixie/latest/SHA512SUMS
sha512sum -c --ignore-missing SHA512SUMS
```

Arrêter si la somme n'est pas conforme. Puis choisir un VMID libre, un stockage de disques VM et un bridge client existant :

```bash
read -r -p 'VMID libre du template : ' TEMPLATE_VMID
read -r -p 'Stockage images : ' PVE_STORAGE
read -r -p 'Bridge client : ' PVE_BRIDGE
[[ "$TEMPLATE_VMID" =~ ^[0-9]+$ ]] || { echo 'VMID invalide'; exit 1; }
pvesm status
qm list
ip link show "$PVE_BRIDGE"
```

Réserver le VMID dans l'ensemble du cluster. Cette méthode importe directement le disque sur scsi0 pour ne pas deviner son nom :

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

`import-from` nécessite une version Proxmox qui prend en charge cette option et un stockage compatible. L'alternative est `qm disk import`, puis lecture de `qm config` et attachement du volume exactement observé. Ne pas exécuter les deux méthodes sur le même disque.

Valider le modèle avec un clone. L'activation de l'option guest agent côté Proxmox ne l'installe pas dans l'invité : si l'agent est nécessaire, l'installer et le démarrer dans l'image, puis valider sur un clone neuf.

Pour une image personnalisée, nettoyer dans l'invité source avant son arrêt final :

```bash
sudo cloud-init clean --logs --seed
sudo truncate -s 0 /etc/machine-id
sudo rm -f /var/lib/dbus/machine-id /etc/ssh/ssh_host_*
history -c
sudo poweroff
```

Ces commandes ne s'exécutent jamais sur l'hyperviseur. Nettoyer également comptes provisoires et données sensibles avec une liste revue ; ne pas prétendre que ces quelques lignes suppriment tous les secrets.

## 12. Clone de recette

Les valeurs suivantes représentent un laboratoire de référence : template 9000, clone 1001, pool vps-clients, stockage local-lvm, bridge vmbr1, IP 10.20.0.50/24. Les remplacer par les valeurs réservées du site avant exécution.

Créer `/root/test-vps.pub` contenant exclusivement la clé SSH publique du testeur. Ne pas y copier une clé privée.

```bash
qm list
pvesm status
qm clone 9000 1001 --name vps-test-0001 --pool vps-clients --full 1 --storage local-lvm
qm set 1001 --tags order-test-0001 --cores 2 --memory 2048 --ciuser debian --sshkeys /root/test-vps.pub --ipconfig0 ip=10.20.0.50/24,gw=10.20.0.1 --nameserver 10.20.0.1 --net0 virtio,bridge=vmbr1,firewall=1
qm resize 1001 scsi0 20G
qm config 1001
qm start 1001
qm status 1001
```

Dans le clone, après connexion :

```bash
cloud-init status --wait
hostnamectl
ip -br address
ip route
systemctl --failed
```

Vérifier l'identité, la clé, les ressources, le réseau et la connectivité autorisée. La réussite de `qm start` ne prouve pas que le système ou SSH fonctionne.

La destruction du clone est irréversible. Après confirmation de son VMID et de l'absence de données utiles :

```bash
qm config 1001
qm shutdown 1001 --timeout 60
qm status 1001
```

Seulement lorsque la cible est confirmée et arrêtée :

```bash
qm destroy 1001 --purge 1
```

## 13. Intégration paiement et provisionnement

### 13.1 Informations indispensables

L'installation du plugin ne peut pas être décrite fidèlement tant que l'extension n'est pas identifiée. Le dossier doit enregistrer son nom, dépôt, mainteneur, version/commit, compatibilité Paymenter/Proxmox, procédure d'installation, paramètres, endpoints et droits. Les commandes `qm` du laboratoire ne remplacent pas cette intégration.

Le prestataire de paiement doit également être identifié : mode sandbox, mécanisme de signature, événements reconnus et politique de réessai. Les paramètres propres au prestataire sont documentés à partir de son intégration réelle, pas d'un webhook générique supposé.

### 13.2 Contrat attendu

1. Paymenter crée une commande et une facture en attente.
2. Le prestataire envoie une notification serveur authentifiée.
3. L'application vérifie signature, fraîcheur, identifiant, montant/devise et correspondance commande.
4. Un job stable lié à la commande est créé.
5. L'intégration valide offre, quotas, template, pool, stockage et réseau autorisés.
6. Elle recherche une VM déjà liée/taguée avant clonage ou retry.
7. Elle clone, configure, démarre et contrôle la VM.
8. Elle enregistre VMID et tâche, puis active le service.
9. Les accès sont remis par un mécanisme protégé.

Le retour navigateur ne constitue pas une preuve de paiement. Le client ne choisit jamais librement VMID, stockage, bridge ou compte API. La configuration d'offre doit traduire ses choix vers des paramètres approuvés.

### 13.3 Doublons et reprise

Un timeout côté portail n'indique pas que Proxmox n'a rien créé. Enregistrer task ID, VMID, tag et étape courante ; retrouver ces éléments avant réessai :

```bash
pvesh get /cluster/resources --type vm --output-format json
pvesh get /nodes/NOM_DU_NOEUD/tasks --limit 20
```

Remplacer le nom du nœud. Le tag est une aide au rapprochement ; il ne remplace pas un verrou ou une contrainte d'unicité dans le traitement des commandes concurrentes. Les échecs de stockage, de démarrage ou de remise d'accès doivent rester des états explicites et déclencher un diagnostic.

Aucun échec ne doit laisser une VM active non suivie. L'idempotence et les scénarios négatifs doivent être testés sur le plugin réellement installé.

## 14. Isolation réseau des VPS

### 14.1 Topologie

Décrire sous-réseaux, réservations, passerelles, DNS, routes, VLAN et bridges réels. Les réseaux d'administration et de sauvegarde ne sont pas accessibles aux locataires. Une interdiction inter-clients doit être exprimée et testée, y compris lorsque deux VM partagent un segment de niveau 2.

La segmentation et les pare-feux sont complémentaires. Le filtrage sortant peut réduire certains abus, mais ne doit pas casser DNS, mises à jour ou les fonctions contractuellement prévues. Une simple absence de réponse au ping ne prouve pas l'isolation TCP.

### 14.2 Contrôles Proxmox

Activer le pare-feu de la VM et de son interface selon le backend installé. Les options `macfilter` et `ipfilter` ne remplacent pas les règles d'accès. Avec IPFilter sur une VM, définir les adresses autorisées dans `ipfilter-net0`.

Extrait du fichier de la VM de recette `/etc/pve/firewall/1001.fw`, pour l'IP de référence :

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

Cet extrait limite l'identité réseau ; il ne bloque pas, à lui seul, l'accès à la gestion ni aux autres clients. Ajouter les règles inter-zones correspondant au plan réel dans le pare-feu choisi. Les adresses IPv6 autorisées et règles IPv6 doivent être traitées explicitement.

Avant activation au niveau datacenter/nœud, confirmer console hors bande, règles d'administration et rollback. Ne pas écraser un fichier cluster.fw existant avec un modèle générique : un cluster peut avoir des dépendances supplémentaires.

### 14.3 Tests depuis le clone

Sur la VM cliente de recette, installer les outils puis tester uniquement les cibles autorisées :

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

Ces IP sont des exemples : passerelle, Proxmox, portail et second VPS du laboratoire. Adapter les destinations et tester depuis les points d'observation pertinents. Consigner attendu et observé pour chaque flux ; vérifier IPv6 séparément.

## 15. Sauvegarde et planification

### 15.1 Périmètre

Sauvegarder base MariaDB, .env, données applicatives et personnalisations. Conserver APP_KEY séparément au coffre. La sauvegarde des VM clientes est un processus distinct ; une archive du portail ne sauvegarde pas leurs disques.

Définir fréquence, rétention, chiffrement, destination hors hôte, droits et exercice de restauration. Le RPO et le RTO sont des objectifs à mesurer, pas des garanties tirées de l'existence d'un timer.

### 15.2 Clé age

Générer l'identité de sauvegarde sur un poste sûr, hors du serveur de production :

```bash
umask 077
age-keygen -o paymenter-backup-identity.txt
age-keygen -y paymenter-backup-identity.txt
```

Installer age sur ce poste si nécessaire. Conserver le fichier d'identité privé au coffre et placer uniquement la clé publique destinataire sur le portail. Tester la récupération de cette identité avant dépendance opérationnelle.

Dans la VM portail :

```bash
sudo apt install -y age
sudo install -d -m 0700 /etc/paymenter-backup /var/backups/paymenter
sudoedit /etc/paymenter-backup/recipients.txt
sudo chmod 0600 /etc/paymenter-backup/recipients.txt
```

Le fichier recipients.txt contient la clé publique valide, une par ligne. Créer `/usr/local/sbin/paymenter-backup.sh` :

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

Le script s'exécute en root ; dans la configuration locale de référence, MariaDB utilise l'authentification d'administration par socket. Si ce n'est pas le cas, configurer un moyen d'authentification protégé, pas un mot de passe dans les arguments.

`set -o pipefail` rend visibles les erreurs du pipeline. Les fichiers `.partial` évitent de confondre une archive incomplète avec un résultat final. Le chemin storage/app doit couvrir les données réellement stockées par la release ; ajouter les personnalisations et autres fichiers nécessaires. Pour des données qui évoluent pendant l'export, déterminer une fenêtre de maintenance ou un mécanisme de cohérence adapté.

### 15.3 Timer

Créer l'unité `/etc/systemd/system/paymenter-backup.service` :

```ini
[Unit]
Description=Sauvegarde chiffree Paymenter

[Service]
Type=oneshot
ExecStart=/usr/bin/flock -n /run/paymenter-backup.lock /usr/local/sbin/paymenter-backup.sh
```

Créer `/etc/systemd/system/paymenter-backup.timer` :

```ini
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
sudo journalctl -u paymenter-backup.service -n 50 --no-pager
systemctl list-timers paymenter-backup.timer
sudo ls -lh /var/backups/paymenter
```

### 15.4 Copie hors hôte et rétention

Transférer les archives chiffrées vers une cible distincte, avec un compte restreint et une clé dédiée. Tester la connexion SSH et le fingerprint de la cible avant automatisation. Exemple de transport à adapter :

```bash
sudo rsync -av --ignore-existing /var/backups/paymenter/ backup@SERVEUR_DE_SAUVEGARDE:/CHEMIN_DE_SAUVEGARDE/
```

Ne pas utiliser `--delete` sans politique explicite. Vérifier les empreintes après transfert et tester la restauration depuis la copie distante. La clé de transport et le compte doivent être configurés pour l'environnement réel.

Définir la rétention avant d'ajouter une purge. Prévisualiser les fichiers ciblés, limiter le motif aux archives et conserver des copies restaurables hors hôte. Une sauvegarde chiffrée inaccessible faute de clé est inutilisable.

## 16. Restauration en laboratoire

### 16.1 Isolation

Créer une VM de reprise sans accès aux paiements, e-mails ou API Proxmox de production. Installer la même release et les dépendances consignées. Désactiver worker et scheduler jusqu'à validation. La copie .env contient des secrets : l'éditer localement, ne pas la joindre au rapport.

Dans un dossier privé du laboratoire :

```bash
umask 077
mkdir -p "$HOME/paymenter-reprise"
cd "$HOME/paymenter-reprise"
read -r -p 'Archive DB chiffree : ' DB_ARCHIVE
read -r -p 'Archive fichiers chiffree : ' FILES_ARCHIVE
read -r -p 'Identite privee age : ' AGE_IDENTITY
set -o pipefail
age -d -i "$AGE_IDENTITY" "$DB_ARCHIVE" | gzip -d > database.sql
age -d -i "$AGE_IDENTITY" "$FILES_ARCHIVE" > application.tar.gz
tar -tzf application.tar.gz
```

Contrôler le contenu de l'archive avant extraction. Les fichiers déchiffrés sont sensibles ; ils restent dans le laboratoire privé.

### 16.2 Réimporter sans écraser la base active

Créer une base de reprise séparée. Dans le laboratoire uniquement :

```bash
sudo systemctl stop paymenter.service
sudo mariadb -e 'CREATE DATABASE paymenter_restore CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;'
sudo mariadb paymenter_restore < database.sql
sudo mariadb -e 'SHOW TABLES FROM paymenter_restore;'
sudo tar -xzf application.tar.gz -C /var/www/paymenter
sudoedit /var/www/paymenter/.env
sudo chown -R www-data:www-data /var/www/paymenter
sudo chmod 0640 /var/www/paymenter/.env
```

Modifier DB_DATABASE pour viser paymenter_restore et donner au compte applicatif les droits sur cette seule base de laboratoire. Mettre l'URL du laboratoire, désactiver moyens de paiement réels, SMTP réel et intégration production. Garder APP_KEY identique à celle sauvegardée : ne pas la générer à nouveau.

```bash
cd /var/www/paymenter
sudo -u www-data /usr/bin/php8.3 artisan optimize:clear
sudo -u www-data /usr/bin/php8.3 artisan migrate:status
```

Ne pas appliquer de nouvelles migrations avant de vérifier la correspondance version/base. Tester compte fictif, catalogue, commandes attendues et données déchiffrables. Ne pas relancer le worker tant qu'il pourrait consommer des tâches de production restaurées.

Mesurer délai de reprise, dernière donnée récupérée, anomalies et interventions manuelles. Ces observations alimentent RTO/RPO et l'amélioration de la procédure. Supprimer les copies déchiffrées selon la politique du laboratoire après validation.

## 17. Journaux et supervision

Surveiller HTTPS, certificat, services, queue, CPU/RAM, disque, stockage Proxmox et dernière sauvegarde réussie. Les alertes utiles concernent service arrêté, worker silencieux, jobs répétés en échec, disque bas, certificat proche d'expiration et sauvegarde absente/échouée.

```bash
systemctl --failed
systemctl status nginx php8.3-fpm mariadb redis-server paymenter --no-pager
sudo journalctl -u nginx -n 100 --no-pager
sudo journalctl -u php8.3-fpm -n 100 --no-pager
sudo journalctl -u mariadb -n 100 --no-pager
sudo journalctl -u redis-server -n 100 --no-pager
sudo journalctl -u paymenter -n 100 --no-pager
sudo ss -lntup
df -h
free -h
```

Les traces applicatives doivent porter un identifiant de corrélation commande/job/VM, sans token, mot de passe, corps complet de webhook ou donnée de paiement. Restreindre accès et rétention. Un journal peut contenir des secrets malgré la politique prévue : relire avant publication.

Contrôle du certificat :

```bash
openssl s_client -connect "$PANEL_FQDN:443" -servername "$PANEL_FQDN" </dev/null 2>/dev/null | openssl x509 -noout -dates
```

Ce contrôle affiche les dates ; il ne remplace pas la vérification complète de la chaîne et du nom. Tester les alertes avec un scénario contrôlé, puis remettre le système à son état nominal.

## 18. Maintenance et retour arrière

Avant mise à jour, lire notes de version et avis de sécurité, vérifier extension/thème, disponibilité de la clé APP_KEY, sauvegarde restaurable, espace disque et fenêtre d'intervention.

```bash
sudo apt update
apt list --upgradable
apt-cache policy php8.3-fpm mariadb-server nginx redis-server
df -h
```

Tester sur clone si possible. Appliquer les correctifs système séparément d'une migration majeure Paymenter :

```bash
sudo apt upgrade
systemctl --failed
```

Une mise à jour applicative suit la procédure de sa version cible. Les commandes `artisan down`, `migrate`, `optimize:clear` et `up` ne téléchargent pas la release et ne constituent pas à elles seules une mise à niveau complète.

Préparer remplacement des fichiers, dépendances et migrations dans un état cohérent, puis contrôler connexion, catalogue, cron, worker, paiement sandbox et API. Consigner date, raison, versions avant/après et résultat.

Le rollback restaure ensemble fichiers, base et APP_KEY correspondant à la sauvegarde. Vérifier les commandes/paiements reçus pendant la fenêtre pour éviter perte et doublons. Ne pas improviser un downgrade de paquets comme substitut à une reprise cohérente.

## 19. Gestion des secrets

Le coffre contient APP_KEY, mot de passe SQL, token Proxmox, clés et secret webhook de paiement, SMTP et identités privées de sauvegarde. Les comptes sont nominatifs, les droits minimaux et les accès temporaires révoqués.

Exemple de règles d'exclusion pour un dépôt opérationnel, à adapter sans remplacer les règles existantes du blog :

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

Ne pas commiter les preuves brutes contenant des données personnelles. Scanner les changements et l'historique. Une clé divulguée doit être révoquée/renouvelée avant nettoyage de Git : supprimer une ligne ne retire pas les copies déjà récupérées.

La clé publique client peut être publiée selon le contexte, mais jamais sa clé privée. Les tokens API ne doivent pas apparaître dans les arguments partagés, captures, URL ou traces debug. Éviter xtrace lors du traitement des secrets.

## 20. Analyse des risques

| Menace | Actif | Mesures à mettre en œuvre |
| --- | --- | --- |
| Compromission du portail | Clients, commandes, APP_KEY | Mises à jour, TLS, MFA, droits de fichiers, administration limitée |
| Webhook falsifié/rejoué | Paiement et création VM | Signature, correspondance facture, idempotence, traces |
| Token excessif ou divulgué | Proxmox et VM | Realm dédié, privsep, ACL ciblées, expiration, révocation |
| Exposition de gestion | Hyperviseur | VPN/réseau privé, filtrage, absence de publication |
| Défaut d'isolation | Autres clients et données | Séparation réseau, règles, IP/MAC filters, tests |
| Template contaminé | Ensemble des clones | Image vérifiée, nettoyage, correctifs, clone de validation |
| Sauvegarde non restaurable | Continuité | Chiffrement, clé récupérable, copie hors hôte, exercice |
| Erreur humaine | Ensemble du service | Console, revue, cible confirmée, rollback |

Les risques résiduels comprennent matériel, énergie, connectivité, vulnérabilités inconnues, abus sortants et déni de service. Ne pas annoncer un niveau de disponibilité ou de sécurité que l'infrastructure et les tests ne démontrent pas.

## 21. Recette fonctionnelle et sécurité

Utiliser compte fictif, offre dédiée, paiement sandbox et VM jetable. Pour chaque essai, conserver préconditions, steps, attendu, observé, horodatage, preuve expurgée et verdict. Une ligne marquée Non testé signifie qu'aucun résultat réel n'a été fourni, pas que la procédure est fictive.

| ID | Essai | Critère attendu | Statut initial |
| --- | --- | --- | --- |
| F-01 | HTTPS et HTTP | Certificat valide, redirection cohérente | Non testé |
| F-02 | Paiement refusé | Aucune VM créée | Non testé |
| F-03 | Paiement accepté | Une VM liée à la bonne commande | Non testé |
| F-04 | Événement répété | Aucun doublon | Non testé |
| F-05 | Signature invalide | Rejet et absence de provisioning | Non testé |
| F-06 | API indisponible | Erreur explicite et reprise sans VM orpheline | Non testé |
| F-07 | Capacité insuffisante en laboratoire | Échec géré sans activation abusive | Non testé |
| F-08 | Worker interrompu | Job repris de manière sûre | Non testé |
| F-09 | Restauration | Portail cohérent dans le laboratoire | Non testé |
| S-01 | Gestion depuis Internet | Proxmox inaccessible | Non testé |
| S-02 | Bases depuis Internet | MariaDB/Redis inaccessibles | Non testé |
| S-03 | Depuis un VPS | Gestion et autres locataires inaccessibles | Non testé |
| S-04 | Fichier .env | 403/404, aucun contenu sensible | Non testé |

Tester aussi refus d'une opération API hors périmètre, réseau du clone, clé SSH et ressources de l'offre. Ne pas provoquer un remplissage de stockage ou un arrêt de worker sur la production pour illustrer un test : réaliser ces essais sur un périmètre isolé.

Les succès documentaires (syntaxe de commande, release existante) et les succès de déploiement sont des preuves différentes. Les verdicts de la recette ne changent qu'après résultat observé.

## 22. Exposition externe

Depuis un réseau distinct autorisé, scanner uniquement ses propres systèmes :

```bash
nmap -Pn -p 22,80,443,3306,6379,8006 DOMAINE_DU_PORTAIL
nmap -Pn -6 -p 22,80,443,3306,6379,8006 DOMAINE_DU_PORTAIL
curl -I https://DOMAINE_DU_PORTAIL
```

Tester IPv6 uniquement si elle est configurée et attribuée à la cible. Une absence de réponse peut venir du filtrage, d'une panne ou d'une route manquante : recouper avec les services en écoute et règles.

Le résultat attendu est 443 public, 80 selon ACME/redirection, gestion et bases non publiques. SSH doit être testé depuis une source autorisée et une source non autorisée. Pour Proxmox, un nom privé ne doit pas être considéré comme une preuve suffisante de non-exposition de son IP.

## 23. Incident et rotation des tokens

Préserver d'abord les journaux et établir chronologie, systèmes et impact. Contenir le composant compromis, révoquer un token suspect, restaurer un état connu puis réactiver progressivement. Ne pas arrêter arbitrairement un nœud sans identifier les services clients.

Rotation planifiée sur Proxmox :

```bash
pveum user token add paymenter@pve provisioning2 --privsep 1 --expire "$(date -d '+180 days' +%s)"
pveum acl modify /pool/vps-clients --roles PaymenterVM --tokens 'paymenter@pve!provisioning2'
pveum acl modify /vms/9000 --roles PaymenterVM --tokens 'paymenter@pve!provisioning2'
pveum acl modify /storage/local-lvm --roles PaymenterStorage --tokens 'paymenter@pve!provisioning2'
```

Adapter et compléter les droits réseau réellement requis. Stocker le nouveau secret, basculer l'intégration puis tester lecture, clone jetable et queue. Après validation :

```bash
pveum user token remove paymenter@pve provisioning
```

En cas de fuite suspectée, révoquer l'ancien immédiatement avant d'attendre la fin de la bascule. Tracer identifiant, raison, permissions et résultats sans inclure le secret.

## 24. Dépannage et exploitation

| Symptôme | Vérifications prioritaires |
| --- | --- |
| NGINX 502 | FPM actif, socket, droits, chemin, logs |
| Erreur SQL | MariaDB, hôte, port, base, compte, privilèges, secret |
| Erreur de déchiffrement | APP_KEY d'origine, sauvegarde cohérente ; ne pas régénérer |
| Paiement sans VM | Événement, job, worker, plugin, API, ACL, template et stockage |
| VM sans réseau | Bridge/VLAN, cloud-init, IP/route/DNS, firewall invité/amont |
| Worker arrêté | Unité, PHP CLI, Redis/pilote queue, job actif avant restart |
| Certificat expiré | Timer Certbot, challenge, DNS et test de renouvellement |
| Archive absente | Service/timer, erreur pipeline, droits, destinataire, disque |

Un job bloqué ne justifie pas un clonage manuel aveugle : rechercher la VM et la tâche Proxmox avant retry. Une VM supprimée manuellement doit être rapprochée de sa commande et de son état de facturation.

| Fréquence | Routine |
| --- | --- |
| Quotidienne | Alertes, worker, tâches, disque, HTTPS et sauvegarde récente |
| Hebdomadaire | Capacité, comptes, journaux, correctifs et copie distante |
| Périodique | ACL, tokens, certificats, règles, exercice de reprise et rétention |

Consigner l'ordre réel de démarrage/arrêt des services et leurs dépendances. Avant interruption, examiner jobs actifs, sauvegarde et impact client. Les processus d'exploitation doivent correspondre aux services effectivement installés.

## 25. Livrables et preuves

### 25.1 Collecte limitée

Les commandes suivantes lisent l'état du portail et créent uniquement des fichiers privés de collecte. Elles peuvent contenir IP et identifiants ; relire et expurger avant remise :

```bash
umask 077
EVIDENCE="$HOME/oteria-preuves-$(date +%Y%m%d-%H%M%S)"
mkdir -m 0700 "$EVIDENCE"
{
  date --iso-8601=seconds
  cat /etc/os-release
  /usr/bin/php8.3 -v
  mariadb --version
  redis-server --version
  nginx -v
  systemctl --failed --no-pager
  systemctl is-active nginx php8.3-fpm mariadb redis-server paymenter
} > "$EVIDENCE/inventaire-portail.txt" 2>&1
sudo nginx -t > "$EVIDENCE/nginx-syntaxe.txt" 2>&1
sudo ss -lntup > "$EVIDENCE/ecoutes.txt" 2>&1
sudo ufw status numbered > "$EVIDENCE/pare-feu.txt" 2>&1
```

Ne pas collecter automatiquement .env, création de token, clés, dumps, corps de webhooks ou logs bruts. Une capture peut révéler des secrets même si la commande paraît anodine.

### 25.2 Pièces du rendu

Le dossier technique décrit objectif, architecture, dépendances, procédures, sécurité, exploitation et reprise. Le rapport de réalisation apporte inventaire réel, schéma exact, plugin identifié, configuration non secrète, observations et résultats de recette.

Joindre les preuves de certificat/renouvellement, payment sandbox, lien commande-VM, absence de doublon, isolation, non-exposition et restauration chronométrée. Une longue documentation n'est pas un substitut à ces résultats ; ne pas fabriquer une attestation de réussite.

### 25.3 Jalons

| Jalon | Livrable | Critère de sortie |
| --- | --- | --- |
| Cadrage | Périmètre, exigences, architecture | Revue des choix |
| Socle | Debian, réseau, comptes, dépendances | Inventaire et contrôles |
| Portail | Paymenter, worker, cron, NGINX/TLS | Usage de test fonctionnel |
| Intégration | Plugin, compte API, template, paiement | VM de recette sans doublon |
| Sécurité | Règles, secrets, sauvegarde | Tests observés et anomalies traitées |
| Remise | Rapport, preuves, procédures | Verdicts traçables |

## Annexes

### A. Inventaire à compléter

| Composant | Référence de procédure | Valeur constatée / preuve |
| --- | --- | --- |
| Debian | 13 | À relever |
| Paymenter | v1.5.9, archive et digest vérifiés documentairement | Tag et archive installés à consigner |
| PHP | 8.3 | À relever |
| MariaDB | Branche compatible retenue | À relever |
| Redis | Paquet retenu | À relever |
| NGINX | Paquet retenu | À relever |
| Proxmox | Version réelle de l'hôte | À relever |
| Extension | Non identifiée dans le dossier source | Source/version/commit à établir |

### B. Fiche de test

| Champ | Contenu |
| --- | --- |
| Identifiant | ID de recette |
| Objectif | Propriété vérifiée |
| Environnement | Machines, versions, périmètre et date |
| Préconditions | Comptes fictifs, sandbox, sauvegarde, autorisation |
| Procédure | Commandes ou parcours précis |
| Attendu | Critère de réussite |
| Observé | Résultat réellement obtenu |
| Preuve | Artefact expurgé et horodaté |
| Verdict | Réussi, partiel, échoué ou non testé |
| Anomalie | Diagnostic, correction et retest |

### C. Checklist

- [ ] Inventaire et schéma correspondant au laboratoire.
- [ ] Domaine/TLS et renouvellement contrôlés.
- [ ] MariaDB et Redis non exposés.
- [ ] API Proxmox privée, certificat vérifié, token restreint.
- [ ] Plugin et prestataire identifiés et versionnés.
- [ ] Paiement accepté/refusé et webhook rejoué/invalide testés.
- [ ] VM unique par commande et reprise après erreur testées.
- [ ] Isolation client et IPv6, si utilisée, vérifiées.
- [ ] Copie hors hôte et restauration réussie documentées.
- [ ] Secrets et données personnelles exclus du dépôt et des preuves.

### D. Glossaire

| Terme | Sens dans le projet |
| --- | --- |
| API | Interface de demande d'opérations à un service |
| APP_KEY | Clé de chiffrement de l'application |
| Webhook | Notification serveur à serveur authentifiée |
| Worker | Processus exécutant les tâches asynchrones |
| Idempotence | Réexécution sans duplication de l'effet métier |
| Template | Modèle de machine virtuelle clonable |
| Cloud-init | Initialisation d'identité et réseau de l'invité |
| RPO | Objectif de perte de données admissible |
| RTO | Objectif de délai de reprise |
| Plan de gestion | Réseau d'administration distinct des locataires |

### E. Références

- Installation Paymenter : https://paymenter.org/docs/installation/install
- Serveur web Paymenter : https://paymenter.org/docs/installation/webserver
- CLI Paymenter : https://paymenter.org/docs/guides/cli
- Extensions serveur : https://paymenter.org/development/extensions/server
- Release Paymenter v1.5.9 : https://github.com/Paymenter/Paymenter/releases/tag/v1.5.9
- Dépôt Sury : https://packages.sury.org/php/README.txt
- Gestion utilisateur Proxmox : https://pve.proxmox.com/wiki/User_Management
- Manuel pveum : https://pve.proxmox.com/pve-docs/pveum.1.html
- Cloud-init Proxmox : https://pve.proxmox.com/wiki/Cloud-Init_Support
- Pare-feu Proxmox : https://pve.proxmox.com/pve-docs/chapter-pve-firewall.html
- API Viewer : https://pve.proxmox.com/pve-docs/api-viewer/
