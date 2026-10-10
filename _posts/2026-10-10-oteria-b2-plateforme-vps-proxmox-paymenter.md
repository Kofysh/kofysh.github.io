---
title: Plateforme d'hébergement VPS sécurisée et automatisée sur Proxmox VE — dossier technique complet
date: 2026-10-10 18:48:00 +0200
categories: [Cybersécurité, Homelab]
tags: [OTERIA, Proxmox, Paymenter, VPS, Debian 13, Linux, NGINX, sécurité, cloud-init]
description: >-
  Dossier technique détaillé du projet B2 OTERIA : conception, installation, sécurisation,
  exploitation et recette d'une plateforme VPS Paymenter et Proxmox VE.
---

# Plateforme d'hébergement VPS sécurisée et automatisée sur Proxmox VE

**OTERIA — Bachelor 2 Cybersécurité — Projet individuel**  
**Documentation technique v2.0 — 10 octobre 2026**

Ce dossier explique comment concevoir et préparer une plateforme de vente de VPS fondée sur Paymenter et Proxmox VE. Il couvre le cadrage, l'architecture, la préparation du serveur, l'installation du portail, l'intégration Proxmox, la sécurité, l'exploitation et la recette.

Le résultat visé est un parcours où un client commande et règle un VPS dans Paymenter, puis une VM QEMU/KVM est provisionnée sur Proxmox après validation serveur d'un paiement. Une procédure décrite ici ne prouve pas qu'elle a été exécutée. Les résultats d'installation, versions, tests et preuves doivent être consignés tels qu'observés.

> **État et limite importante.** La documentation source distingue les versions de référence des versions réellement constatées. Elle marque plusieurs tests « Non testé » et demande d'identifier/versionner l'extension Paymenter-Proxmox avant d'affirmer le provisionnement automatique. Ce dossier long conserve ces limites : il ne transforme pas un plan d'implémentation en résultat de production.

## Sommaire

1. Objet, périmètre et règles du dossier
2. Architecture
3. Versions de référence et inventaire
4. Préparation du serveur Debian
5. Dépôts applicatifs
6. Pile applicative PHP, MariaDB, Redis et Composer
7. Déploiement de Paymenter
8. NGINX et TLS
9. Pare-feu de l'hôte Debian
10. Proxmox VE, inventaire, utilisateur et token API
11. Templates et cloud-init
12. Provisionnement automatisé et idempotence
13. Réseau des VPS et isolation
14. Sauvegarde et restauration
15. Journalisation et supervision
16. Mises à jour et retour arrière
17. Secrets, comptes et dépôt Git
18. Analyse des menaces et risques
19. Plan de recette
20. Contrôle de l'exposition externe
21. Incidents et rotation du token
22. Dépannage par symptômes
23. Exploitation quotidienne
24. Jalons et critères de sortie
25. Production des preuves et remise
26. Annexes : inventaire, fiches de tests, checklist, références et glossaire

---

## 1. Objet, périmètre et règles du dossier

### 1.1 Objectif

Le sujet est la conception d'une plateforme d'hébergement de VPS sécurisée et automatisée. Paymenter assure le portail client, le catalogue, les commandes, les factures et les paiements. Proxmox VE héberge les VM. Le provisionnement doit commencer uniquement après réception et validation serveur d'une notification de paiement authentifiée.

La vente manuelle d'un VPS implique de créer la VM, régler ses ressources, choisir son réseau, contrôler son démarrage et remettre des accès. La répétition manuelle entraîne des oublis, des doublons et des configurations différentes. L'automatisation standardise cette chaîne, mais augmente l'impact potentiel d'un webhook falsifié ou d'un token Proxmox trop puissant.

### 1.2 Inclus et exclus

| Inclus dans ce projet | Hors périmètre tant que non documenté et testé |
| --- | --- |
| VPS sous forme de VM QEMU/KVM | Serveurs de jeux |
| Paymenter autonome sur Debian 13 | Provisionnement LXC |
| NGINX, PHP-FPM, MariaDB et Redis | Extensions dont la source/version/compatibilité n'est pas établie |
| Intégration API Proxmox par token dédié | Toute promesse de disponibilité, débit ou capacité non mesurée |
| Templates cloud-init et isolation du réseau client | Opérations de production non couvertes par la recette |
| Sauvegarde, supervision, mises à jour, incidents | Garantie RPO/RTO non mesurée par restauration |

Une VM QEMU/KVM possède son propre noyau. Un conteneur LXC partage celui de l'hôte. Pour des clients qui sont administrateurs de leur VPS, la VM offre une séparation de noyau plus adaptée au risque étudié ; elle ne supprime pas les vulnérabilités de l'hyperviseur ou les erreurs de configuration réseau.

### 1.3 Statuts et preuves

| Statut | Signification |
| --- | --- |
| Réussi | Test exécuté, résultat conforme et preuve conservée |
| Partiel | Une partie du critère est validée ; limites décrites |
| Échoué | Test exécuté, résultat non conforme et anomalie tracée |
| Non testé | Aucune exécution à ce jour |
| À relever | Valeur réelle à collecter dans l'environnement |

Une procédure écrite n'est pas une preuve de réalisation. Une commande attendue ne signifie pas qu'elle a été lancée. Une preuve peut être une capture expurgée, un journal horodaté, une sortie de commande ou un résultat de restauration.

### 1.4 Conventions et placeholders

Les noms `panel.example.net`, `pve.example.net`, `ADMINCIDR`, les sous-réseaux `10.10.0.0/24` et `10.20.0.0/24`, les VMID, bridges, pools et stockages du dossier sont des exemples à remplacer après inventaire. Aucun secret réel (APPKEY, mot de passe SQL, clé de paiement, token API, clé SSH privée ou certificat privé) ne doit apparaître dans cette page, dans les captures ou dans Git.

Les commandes qui modifient SSH, le pare-feu, les ACL, les comptes ou les VM comportent un risque de coupure ou de perte. Vérifier la cible, l'accès console et la procédure de retour arrière avant exécution.

---

## 2. Architecture

### 2.1 Vue d'ensemble

Le navigateur résout le DNS du portail puis ouvre HTTPS vers NGINX. NGINX transmet les requêtes PHP à PHP-FPM par socket Unix. Paymenter utilise MariaDB et Redis en loopback. Un worker systemd exécute les tâches asynchrones, dont les opérations de provisionnement. Ce worker est le seul composant du portail qui doit appeler l'API Proxmox, sur un réseau de gestion privé.

Le portail doit pouvoir sauvegarder ses données vers une cible hors hôte. Les VM clientes ne doivent pas accéder à la base, au réseau d'administration, aux sauvegardes ou aux autres clients.

### 2.2 Zones réseau

| Zone | Composants | Exposition prévue |
| --- | --- | --- |
| Frontal | NGINX et TLS | Ports 80/443 depuis Internet, selon redirection et validation de certificat |
| Application | Paymenter, PHP-FPM, MariaDB, Redis, worker | Loopback ou flux internes documentés |
| Gestion | API Proxmox, SSH, hyperviseur | Réseau d'administration ou VPN seulement |
| VPS clients | VM QEMU/KVM | Bridge/VLAN dédié et filtré |
| Sauvegarde | Cible de sauvegarde distincte | Accès d'exploitation seulement |

Les adresses, VLAN, routes, bridges, ACL et règles finales doivent correspondre à l'infrastructure réelle. Un schéma générique n'est pas la preuve de la topologie en production.

### 2.3 Matrice de flux

| Source | Destination | Flux | Contrôle attendu |
| --- | --- | --- | --- |
| Internet | NGINX | HTTPS 443 | TLS, limitation de débit/WAF seulement si déployé |
| Prestataire | NGINX | Webhook HTTPS | Signature, identifiant et fraîcheur validés |
| NGINX | PHP-FPM | Socket Unix | Seul le code public est servi |
| Paymenter | MariaDB | TCP local/loopback | Compte applicatif dédié |
| Paymenter | Redis | Loopback | Redis non exposé |
| Worker | API Proxmox | HTTPS 8006 privé | Token restreint et certificat vérifié |
| VPS client | Gestion | Interdit | Absence de route, ACL et pare-feu |
| VPS client | Autres clients | Interdit par défaut | Séparation réseau locataire |

Si un reverse proxy distinct se trouve devant Paymenter, le backend ne fait confiance aux en-têtes `X-Forwarded-*` que depuis l'adresse de ce proxy. IPv6 est traité comme IPv4 : un filtrage IPv4 seul ne suffit pas lorsque le DNS possède un AAAA.

### 2.4 Chaîne de service

1. Le client commande un service et Paymenter attend le paiement.
2. Le prestataire appelle le webhook serveur-à-serveur.
3. Paymenter vérifie la signature, l'identifiant d'événement et la fraîcheur.
4. Une tâche unique liée à la commande est créée.
5. Le worker vérifie qu'il n'existe pas déjà de VM pour cette commande.
6. Le worker appelle l'API privée Proxmox pour cloner et configurer une VM.
7. L'état et le réseau de la VM sont vérifiés.
8. Le lien commande/VM est enregistré et le service activé.
9. Les accès sont remis de manière protégée.

La page de retour du navigateur n'est pas une preuve de paiement. Le lien commande/VM est enregistré après les contrôles de démarrage et de configuration, pas avant.

### 2.5 Principes d'exposition

- Le portail HTTPS est le seul service publié.
- Proxmox 8006, SSH, MariaDB 3306 et Redis 6379 restent hors d'Internet.
- Les VPS clientes n'ont pas de route vers la gestion ou les autres clients.
- Les règles IPv4 et IPv6 expriment la même intention de sécurité.
- Les en-têtes proxy ne sont fiables que depuis le proxy connu, s'il existe.
- Une défense en profondeur combine filtrage amont, pare-feu système, pare-feu Proxmox, ACL et absence de route.

### 2.6 Choix techniques et alternatives

| Besoin | Choix | Justification/limite |
| --- | --- | --- |
| Portail | Paymenter | Portail et gestion de commandes dans un outil libre ; dépend de sa version et de ses extensions |
| Déploiement | Installation directe sur Debian | Moins de couches à auditer ; les services et mises à jour restent à gérer |
| Hyperviseur | Proxmox VE | KVM, API REST, pools, ACL et tokens |
| Type de VPS | QEMU/KVM | Noyau dédié à chaque VM ; isolation réseau toujours nécessaire |
| Serveur web | NGINX/PHP-FPM | Rôles séparés et socket Unix locale |
| Base | MariaDB locale | Aucun flux réseau distant dans la topologie de référence |
| Files/cache | Redis local | Traitement asynchrone sans bloquer la requête web |
| Identité invité | cloud-init et clé SSH publique | Évite un secret partagé dans l'image |
| API | Token Proxmox dédié | Limite et révoque les droits de l'intégration |
| TLS | Let's Encrypt/Certbot | Certificat reconnu et renouvellement à tester |

---

## 3. Versions de référence et inventaire

Une faille ou incompatibilité est liée à une version précise. Le tableau sépare la référence documentaire de la valeur réellement constatée.

| Composant | Référence du dossier | Contrôle à exécuter | Valeur installée |
| --- | --- | --- | --- |
| Paymenter | v1.5.9 | Tag/release, `php artisan --version` si disponible | À relever |
| Debian | 13.7 | `cat /etc/debian_version` | À relever |
| PHP | 8.3 | `php -v` | À relever |
| MariaDB | 10.11 | `mariadb --version` | À relever |
| Redis | Paquet Debian | `redis-server --version` | À relever |
| NGINX | Paquet Debian | `nginx -v` | À relever |
| Composer | Version courante | `composer --version` | À relever |
| Proxmox VE | 9.2 comme référence | `pveversion -v` | À relever |
| Extension Proxmox | À identifier | Nom, tag, source, README, commit | À relever |

### 3.1 Inventaire sur Debian

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

### 3.2 Inventaire sur Proxmox

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

Épingler le tag Paymenter effectivement déployé et consigner URL, empreinte ou signature lorsque le projet en publie. Une URL `latest` change dans le temps. L'annexe A contient une fiche à remplir.

---

## 4. Préparation du serveur Debian

### 4.1 Installation et réseau

Installer Debian 13 minimal dans une VM dédiée au portail. Dimensionner CPU, RAM et disque selon la charge prévue, en tenant compte de PHP, de la base, des journaux, de la maintenance et des sauvegardes temporaires. Ne pas présenter une capacité non mesurée comme une garantie.

Configurer hostname, DNS, NTP et réseau statique ou réservation DHCP. Avant tout durcissement, vérifier l'accès console Proxmox ou hors bande.

### 4.2 Mise à jour et état initial

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
```

Le résultat attendu est une configuration cohérente avec le plan réseau, aucune unité inattendue en échec et aucune erreur critique inexpliquée. Conserver une sortie expurgée comme état initial.

### 4.3 Durcissement SSH

Installer d'abord la clé publique du compte opérateur et tester une deuxième session. Ensuite, créer une configuration dédiée :

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

`sshd -t` vérifie la syntaxe avant rechargement. Ne ferme pas la session active avant d'avoir validé la connexion par clé et confirmé la console de secours. La règle UFW de la section 9 doit ensuite limiter SSH au CIDR d'administration réel.

---

## 5. Dépôts applicatifs

Chaque dépôt tiers peut installer du code exécuté avec des privilèges élevés. Vérifier la provenance, l'empreinte de clé, la suite Debian supportée et les versions candidates. Garder une liste des fichiers source APT et supprimer les dépôts de test après validation.

### 5.1 PHP 8.3 depuis Sury

La documentation source propose Sury pour PHP 8.3. Comparer d'abord les instructions officielles courantes, l'empreinte et la prise en charge de la suite Debian installée. La méthode ci-dessous reprend la méthode du dossier avec un trousseau dédié :

```bash
sudo install -d -m 0755 /etc/apt/keyrings
sudo curl -fsSLo /etc/apt/keyrings/sury-php.gpg https://packages.sury.org/php/apt.gpg
gpg --show-keys --with-fingerprint /etc/apt/keyrings/sury-php.gpg
```

Comparer l'empreinte obtenue à celle publiée par le mainteneur avant d'ajouter la source :

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

`trixie` correspond à Debian 13 dans cette procédure ; si la distribution ou codename diffère, arrêter et vérifier la source au lieu de copier cette ligne aveuglément.

### 5.2 MariaDB 10.11

Le dossier recommande de télécharger et inspecter le script de dépôt MariaDB avant exécution, plutôt que d'exécuter du contenu distant directement dans un shell :

```bash
curl -fsSLo /tmp/mariadb_repo_setup https://downloads.mariadb.com/MariaDB/mariadb_repo_setup
sha256sum /tmp/mariadb_repo_setup
less /tmp/mariadb_repo_setup
```

Comparer le contrôle d'intégrité si le mainteneur en publie un. Après inspection et vérification de la compatibilité Debian 13 :

```bash
sudo bash /tmp/mariadb_repo_setup --mariadb-server-version=mariadb-10.11
sudo apt update
apt policy mariadb-server
```

Si le script ne prend pas en charge la suite Debian 13, utiliser une version de MariaDB officiellement compatible et consigner ce choix dans l'inventaire. Ne pas laisser plusieurs dépôts concurrents pour MariaDB.

---

## 6. Pile PHP, MariaDB, Redis et Composer

### 6.1 PHP et extensions

Les modules requis sont comparés au `.env.example` et à la documentation de la release Paymenter effectivement déployée. L'extrait du dossier prévoit common, CLI, GD, MySQL, mbstring, bcmath, XML, FPM, curl, zip, intl et Redis :

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

Cron, worker et NGINX/PHP-FPM doivent utiliser le même runtime. Exemple de réglages de départ à dimensionner ; cohérence avec `client_max_body_size` NGINX requise :

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

Ces limites sont des valeurs de départ documentaires, pas un dimensionnement garanti. Les adapter aux offres, à la mémoire disponible et aux recommandations Paymenter.

### 6.2 MariaDB locale

Quand Paymenter et MariaDB partagent une VM, la base écoute sur loopback. `utf8mb4` est utilisé pour le jeu de caractères.

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

Créer un compte dédié dans le client interactif :

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

Le secret est généré et conservé dans un coffre. Ne pas le taper dans une commande partagée ou l'historique. Le compte applicatif est limité à la base `paymenter`. Vérifier l'adresse d'écoute et l'authentification :

```bash
mariadb --version
sudo ss -lntp | grep 3306
mariadb -h 127.0.0.1 -u paymenter -p paymenter
```

### 6.3 Redis

Redis peut être utilisé pour files, cache ou sessions ; confirmer sa fonction avec la version Paymenter. Il reste local dans la topologie de référence.

```bash
sudo apt install -y redis-server
sudo systemctl enable --now redis-server
redis-cli ping
sudo ss -lntp | grep 6379
```

Résultat attendu : `PONG` et écoute loopback uniquement. Un Redis distant nécessite authentification/ACL, chiffrement et règles réseau adaptés.

### 6.4 Composer vérifié

Le dossier recommande l'installateur officiel et une vérification SHA-384 :

```bash
curl -fsSLo /tmp/composer-setup.php https://getcomposer.org/installer
curl -fsSLo /tmp/installer.sig https://composer.github.io/installer.sig
echo "$(cat /tmp/installer.sig)  /tmp/composer-setup.php" | sha384sum -c -
sudo php8.3 /tmp/composer-setup.php --install-dir=/usr/local/bin --filename=composer
rm -f /tmp/composer-setup.php /tmp/installer.sig
composer --version
```

Si la vérification échoue, ne pas installer le fichier. La version installée est inscrite dans l'inventaire.

---

## 7. Déploiement de Paymenter

### 7.1 Release épinglée

La procédure du dossier utilise une release explicite `v1.5.9`. Vérifier que cette archive existe encore, examiner les checksums/signatures publiés et consigner l'URL exacte. Une archive de `latest` n'est pas reproductible.

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

Contrôler que l'archive correspond à la release avant de poursuivre. Seul `/var/www/paymenter/public` sera publié par NGINX. Ne pas donner des droits `777`.

### 7.2 Dépendances de l'application

Si l'archive ne contient pas `vendor`, suivre la procédure officielle de la release pour installer les dépendances. La commande de référence du dossier :

```bash
cd /var/www/paymenter
sudo -u www-data env COMPOSER_CACHE_DIR=/tmp/composer-cache \
  composer install --no-dev --optimize-autoloader
```

Ne pas exécuter cette étape en production sans confirmer si les dépendances sont déjà fournies dans l'archive. Vérifier le code de retour et les journaux Composer.

### 7.3 Fichier `.env`

```bash
cd /var/www/paymenter
sudo -u www-data cp .env.example .env
sudoedit .env
sudo chown www-data:www-data .env
sudo chmod 640 .env
```

Extrait non secret à adapter au `.env.example` exact :

```dotenv
APP_ENV=production
APP_DEBUG=false
APP_URL=https://panel.example.net
DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=paymenter
DB_USERNAME=paymenter
DB_PASSWORD=REMPLACER_PAR_SECRET_DU_COFFRE
```

Compléter mail, queue, cache et sessions en fonction de la configuration choisie. `APP_DEBUG=false` est impératif en production. `APP_URL` doit correspondre au domaine HTTPS et aux URLs/webhooks du prestataire. Le fichier réel n'est jamais joint à Git ni capturé.

### 7.4 APPKEY, migrations et compte administrateur

Les commandes ci-dessous sont celles répertoriées dans le dossier source pour la release visée. Confirmer leur présence avec `php artisan list` et le guide Paymenter de la version installée avant exécution. Une migration modifie la base : effectuer une sauvegarde cohérente avant.

```bash
cd /var/www/paymenter
sudo -u www-data php artisan key:generate --force
sudo -u www-data php artisan storage:link
sudo -u www-data php artisan migrate --force --seed
sudo -u www-data php artisan db:seed --class=CustomPropertySeeder
sudo -u www-data php artisan app:init
sudo -u www-data php artisan app:user:create
```

`app:init` et `app:user:create` sont interactives selon la version et peuvent afficher des valeurs sensibles. Ne pas enregistrer leurs secrets dans une preuve. APPKEY est générée une fois, puis stockée dans le coffre et sauvegardée séparément de la base. Ne jamais générer une nouvelle APPKEY pour dépanner une installation existante : les données chiffrées pourraient devenir illisibles.

Créer un compte administrateur nominatif, un mot de passe unique, et activer MFA si la version le propose. Supprimer les comptes temporaires après l'initialisation.

### 7.5 Scheduler

Le scheduler Laravel s'exécute chaque minute sous `www-data` :

```bash
sudo crontab -u www-data -e
```

Ajouter la ligne :

```cron
* * * * * /usr/bin/php8.3 /var/www/paymenter/artisan schedule:run >/dev/null 2>&1
```

Vérifier :

```bash
sudo crontab -u www-data -l
```

### 7.6 Worker systemd

Créer `/etc/systemd/system/paymenter.service`. Les options sont à confronter à la version Laravel/Paymenter et à la configuration réelle de queue :

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

Démarrer puis vérifier l'unité :

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now paymenter.service
systemctl status paymenter.service --no-pager
sudo journalctl -u paymenter.service -n 100 --no-pager
```

Tester une tâche de démonstration en environnement de recette. Un redémarrage ne doit pas créer de doublon ; les options de worker ne remplacent pas l'idempotence métier.

---

## 8. NGINX et TLS

### 8.1 Préparation DNS

Créer les enregistrements A/AAAA pour le domaine contrôlé. S'assurer que le port 80 est accessible depuis Internet si la validation ACME HTTP-01 est retenue, et que l'AAAA ne pointe pas vers une IPv6 non filtrée. Le domaine `panel.example.net` dans le dossier est fictif.

### 8.2 Virtual host HTTP/HTTPS

Le serveur NGINX ne doit servir que le dossier `public`. La configuration finale ci-dessous reprend la structure du dossier :

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

Remplacer les domaines et chemins de certificat, confirmer le socket par `ss -xl` et installer le certificat avant de charger le bloc 443. HSTS démarre avec une durée courte ; l'augmenter après validation durable du TLS. Tester le fichier avant rechargement :

```bash
sudo nginx -t
sudo systemctl reload nginx
curl -I https://panel.example.net
curl -I http://panel.example.net
curl -s -o /dev/null -w '%{http_code}\n' https://panel.example.net/.env
sudo certbot renew --dry-run
```

Résultats attendus à vérifier : HTTPS répond, HTTP redirige, `.env` retourne une erreur 403/404 sans contenu, certificat valide et renouvellement de test réussi. Le résultat ne peut être marqué réussi qu'après observation.

---

## 9. Pare-feu de l'hôte Debian

### 9.1 Politique

Tout trafic entrant non nécessaire est refusé. HTTPS est public. SSH est accepté depuis le réseau d'administration seulement. MariaDB et Redis restent locaux ; Proxmox est joint par le worker sur le réseau privé, pas depuis Internet.

### 9.2 UFW

Avant activation, vérifier l'accès à la console, le CIDR réel et une deuxième session SSH. Le placeholder `ADMINCIDR` doit être remplacé ; ne pas exécuter la séquence telle quelle.

```bash
sudo apt install -y ufw
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow from ADMINCIDR to any port 22 proto tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw show added
sudo ufw status verbose
```

Après revue et validation de l'accès de secours :

```bash
sudo ufw enable
sudo ufw status numbered
```

Contrôler `IPV6` dans `/etc/default/ufw`. Le pare-feu local s'ajoute aux règles routeur, Proxmox, bridge, VM et IPv6 ; il ne les remplace pas. Une règle trop restrictive peut couper l'administration ; une règle trop large peut publier la base.

---

## 10. Proxmox VE : inventaire et accès API

### 10.1 Relevé initial

Sur le nœud Proxmox, relever versions, nœuds, pool, stockage, réseau, certificats, firewall, templates et état de sauvegarde :

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

La cible Proxmox est la plus sensible : un token API trop permissif peut permettre de contrôler l'hyperviseur et ses VM. Ne crée pas de permissions globales pour contourner une erreur d'intégration.

### 10.2 Rôle, utilisateur et token

Identifier d'abord l'extension, sa version et ses endpoints réellement appelés. La liste de permissions du dossier (allocation, clone, audit, alimentation, configuration CPU/mémoire/disque/réseau/cloud-init, stockage et réseau) est indicative : la vérifier contre l'API Viewer et le comportement de l'extension.

Créer un pool client et un rôle de moindre privilège avec les permissions retenues. Les noms de rôles et chemins doivent être validés sur la version Proxmox :

```bash
pveum pool add vps-clients --comment "VM clientes Paymenter"
pveum role add PaymenterVM --privs "VM.Allocate VM.Clone VM.Audit VM.PowerMgmt VM.Config.CPU VM.Config.Memory VM.Config.Disk VM.Config.Network VM.Config.Options VM.Config.Cloudinit Pool.Audit"
pveum user add paymenterpve@pve --comment "Provisioning Paymenter"
pveum user token add paymenterpve@pve provisioning --privsep 1 --expire 180d --comment "Paymenter provisioning"
```

Les permissions nommées ci-dessus doivent être contrôlées avec `pveum role list` ; si une permission n'existe pas ou n'est pas nécessaire à l'extension, ne pas la deviner. Avec séparation de privilèges active, les droits du token sont limités par l'intersection des ACL de l'utilisateur et du token.

Poser les ACL uniquement aux chemins nécessaires. Les chemins stockage, template et bridge doivent être remplacés par les identifiants réels et la syntaxe acceptée par la version installée :

```bash
pveum acl modify /pool/vps-clients --roles PaymenterVM --users paymenterpve@pve
pveum acl modify /pool/vps-clients --roles PaymenterVM --tokens 'paymenterpve@pve!provisioning'
pveum acl modify /vms/9000 --roles PaymenterVM --users paymenterpve@pve
pveum acl modify /vms/9000 --roles PaymenterVM --tokens 'paymenterpve@pve!provisioning'
```

Compléter uniquement avec les ACL de stockage et réseau nécessaires. Aucun droit n'est accordé sur `/`, `nodes`, `access` ou le bridge de gestion si l'extension n'en a pas besoin. Vérifier les droits calculés :

```bash
pveum user permissions paymenterpve@pve --path /pool/vps-clients
pveum user token permissions paymenterpve@pve provisioning --path /pool/vps-clients
pveum acl list
```

Le secret du token n'est affiché qu'une fois : le placer immédiatement dans le coffre. Ne le mettre ni dans `.env.example`, ni dans les journaux, captures, commandes partagées ou Git.

### 10.3 TLS et test de lecture

L'API Proxmox reste privée et son certificat est vérifié. Pour une CA privée, exporter le certificat CA public du cluster, le copier sous `/usr/local/share/ca-certificates/` sur le portail et actualiser le magasin système :

```bash
sudo install -m 0644 pve-root-ca.crt /usr/local/share/ca-certificates/pve-root-ca.crt
sudo update-ca-certificates
```

Remplacer le nom de fichier par celui exporté depuis l'environnement réel. Ne pas désactiver la vérification du certificat pour corriger un problème de nom ou de CA. Tester d'abord un appel API de lecture avec un client qui ne place pas le secret dans l'historique shell. Le format de l'en-tête est `Authorization: PVEAPIToken=USER@REALM!TOKENID=UUID`.

L'ordre des essais est : permissions de lecture, test négatif d'une ressource interdite, puis création d'une VM jetable. Aucun accès global `Administrator` ne doit être utilisé.

### 10.4 Extension d'intégration

Renseigner dans le rapport final : nom exact de l'extension, dépôt/source, release ou commit, mainteneur, documentation, version Paymenter compatible, version Proxmox testée, opérations réellement automatisées, limites, étapes encore manuelles et erreurs connues. La compatibilité n'est pas présumée à partir du seul nom d'un plugin.

---

## 11. Templates et cloud-init

### 11.1 Principes

Le template est une image figée clonée pour chaque client. Une clé privée, un mot de passe, un historique shell, un identifiant machine commun ou un compte temporaire présent dans l'image serait copié à l'identique dans toutes les VM.

Avant conversion, mettre l'image à jour et l'assainir. cloud-init génère une identité par instance : hostname, configuration réseau, DNS et clé SSH publique du client. Ne pas insérer de mot de passe root commun.

### 11.2 Télécharger et vérifier l'image Debian

L'exemple du dossier utilise Debian 13 Generic Cloud. Vérifier la disponibilité actuelle de l'URL et comparer le checksum à la somme officielle :

```bash
cd /var/tmp
curl -fLO https://cloud.debian.org/images/cloud/trixie/latest/debian-13-genericcloud-amd64.qcow2
curl -fLO https://cloud.debian.org/images/cloud/trixie/latest/SHA512SUMS
sha512sum -c --ignore-missing SHA512SUMS
```

Ne poursuivre que si la vérification de la somme est conforme. Les téléchargements, noms de fichiers et VMID doivent être consignés.

### 11.3 Créer le template

Exemple du dossier : VMID `9000`, stockage `local-lvm`, bridge client `vmbr1`. Vérifier qu'ils existent et que le VMID est libre :

```bash
qm list
pvesm status
```

Créer la VM et importer le disque :

```bash
qm create 9000 --name tpl-debian13 --memory 1024 --cores 1 --ostype l26 --scsihw virtio-scsi-single --net0 virtio,bridge=vmbr1 --agent enabled=1 --serial0 socket --vga serial0
qm disk import 9000 debian-13-genericcloud-amd64.qcow2 local-lvm
qm config 9000
```

Lire la sortie `qm config 9000` et relever le volume effectivement importé. Ne pas supposer le nom du volume : il dépend du stockage. L'attacher et ajouter cloud-init avec le volume constaté :

```bash
qm set 9000 --scsi0 VOLUME_IMPORTÉ,discard=on
qm set 9000 --boot order=scsi0
qm set 9000 --ide2 local-lvm:cloudinit
qm template 9000
```

Remplacer `VOLUME_IMPORTÉ` par le volume exact affiché par Proxmox et `local-lvm` par le stockage réel pour cloud-init. Tester un clone avant de considérer le template exploitable.

### 11.4 Nettoyer une image personnalisée

Dans l'invité source, si cette méthode s'applique à la distribution utilisée, nettoyer les éléments d'identité avant conversion :

```bash
sudo cloud-init clean --logs --seed
sudo truncate -s 0 /etc/machine-id
sudo rm -f /var/lib/dbus/machine-id /etc/ssh/ssh_host_*
sudo journalctl --rotate --vacuum-time=1s
history -c
```

Vérifier les effets avant conversion : cette étape s'exécute dans l'invité et non sur l'hôte Proxmox. Ne pas l'appliquer à une machine déjà en service.

---

## 12. Provisionnement automatisé et idempotence

### 12.1 Avant la création

Avant tout appel Proxmox, valider commande, paiement, produit, quotas, template, stockage, nœud, réseau et ACL. Les paramètres reçus du client sont convertis vers une configuration fixe validée : le client ne choisit ni VMID, ni bridge, ni stockage, ni token.

La tâche doit avoir une clé stable liée à l'identifiant de commande. Le traitement d'un même événement plusieurs fois doit retrouver la tâche ou la VM existante et ne jamais cloner à nouveau.

### 12.2 Pendant la création

Le comportement attendu est :

1. Vérifier une nouvelle fois l'état du paiement et la commande.
2. Chercher une VM portant le tag de commande avant clonage.
3. Cloner le template dans le pool dédié.
4. Appliquer ressources, cloud-init et réseau client autorisés.
5. Enregistrer le task ID, le VMID et l'étape courante sans secret.
6. Démarrer la VM et attendre un état exploitable.
7. Vérifier réseau et configuration avant activation du service.
8. Mettre à jour Paymenter et remettre les accès de manière sûre.

### 12.3 Après un timeout

Un timeout HTTP ne signifie pas que Proxmox n'a rien créé. Avant tout retry, rechercher le VMID, le task ID ou le tag de commande. Le dossier propose ces commandes d'inspection à adapter au nom réel du nœud :

```bash
pvesh get cluster/resources --type vm --output-format json
pvesh get nodes/NOM_REEL_DU_NOEUD/tasks --limit 20
```

Filtrer les résultats par VMID, nom et tag. Ne jamais supposer que la requête précédente a échoué côté hyperviseur.

### 12.4 Activation et remise des accès

Activer le service uniquement quand l'état de la VM, les ressources, le réseau et les paramètres de l'offre sont conformes. Remettre une clé SSH publique fournie par le client ou un secret unique avec rotation obligatoire. Aucun mot de passe root ne doit être enregistré en clair dans les journaux.

### 12.5 Webhook de paiement

- Configurer d'abord le prestataire en sandbox, avec des clés séparées de la production.
- Vérifier la signature serveur, l'identifiant d'événement et la fraîcheur.
- Traiter doublons, rejoués, événements retardés et erreurs réseau.
- Journaliser un identifiant de corrélation, pas le secret ni le corps complet du webhook.
- Ne jamais faire confiance à la page de retour navigateur comme preuve de règlement.

### 12.6 Limites de l'extension

Documenter l'extension exacte, ses hooks, ses appels API et ses étapes manuelles. Si elle ne garantit pas l'idempotence, l'ajouter dans une couche contrôlée ou ne pas activer le provisionnement automatique. Le dossier ne valide pas une extension donnée ; ne pas annoncer une fonctionnalité non testée.

---

## 13. Réseau VPS et isolation

### 13.1 Adressage, bridge et sortie Internet

Consigner plages IPv4/IPv6, réservations, passerelles, DNS, routes, bridges, VLAN et politique sortante réellement employés. Le bridge de gestion ne doit pas figurer dans les choix proposés aux clients. La sortie Internet doit permettre DNS et mises à jour attendues sans fournir de chemin vers les services internes.

### 13.2 Pare-feu Proxmox

Le pare-feu Proxmox agit sur le datacenter, le nœud, la VM et les interfaces selon sa configuration. Son activation peut changer la politique d'entrée de l'hôte et couper l'administration. Avant toute modification : vérifier accès console/hors bande, règles SSH et interface web depuis le CIDR réel, présence d'une session de secours et procédure de rollback.

Le dossier source donne un exemple de politique avec zones admin et VPS. Les noms d'IPSet et chemins de fichiers sont spécifiques à la version et à la configuration ; l'extrait ne doit pas être traité comme une règle universelle. Créer les règles IPv4 et IPv6 qui correspondent aux flux approuvés, puis confirmer leur effet depuis une VM de test.

### 13.3 Test d'isolation

Depuis une VM jetable sur le bridge client, avec autorisation, vérifier la passerelle et les destinations nécessaires. Tester que Proxmox, SSH d'administration, MariaDB, Redis et les autres VPS ne sont pas joignables :

```bash
ping -c 2 PASSERELLE_CLIENT_REELLE
nc -vz -w 3 PVE_IP_GESTION_REELLE 8006
nc -vz -w 3 PVE_IP_GESTION_REELLE 22
nc -vz -w 3 PORTAIL_IP_REELLE 3306
nc -vz -w 3 PORTAIL_IP_REELLE 6379
ping -c 2 AUTRE_VPS_REEL
curl -I https://deb.debian.org
```

Remplacer les valeurs par des cibles sous contrôle. Le résultat attendu dépend de la politique : passerelle accessible, gestion et autres locataires inaccessibles, Internet autorisé seulement si prévu. Consigner source, destination, date et résultat. Tester IPv6 séparément.

La destruction de la VM de recette est irréversible : vérifier deux fois son VMID et qu'aucune donnée n'est utile. La commande du dossier est :

```bash
qm config VMID_JETABLE
qm shutdown VMID_JETABLE --timeout 60
qm status VMID_JETABLE
```

Après confirmation de la cible seulement :

```bash
qm destroy VMID_JETABLE --purge 1
```

---

## 14. Sauvegarde et restauration

### 14.1 Contenu et protection

Sauvegarder la base, le `.env`, les données applicatives, personnalisations et éléments nécessaires à la reprise. L'APPKEY est aussi conservée chiffrée et séparément dans le coffre. La sauvegarde des VM clientes est un volet distinct, par exemple via la stratégie `vzdump` réellement configurée.

Définir fréquence, rétention, destination hors hôte, chiffrement, droits, copie secondaire et procédure d'effacement. Les objectifs RPO et RTO ne sont pas des garanties tant qu'ils n'ont pas été mesurés lors d'un test de restauration.

### 14.2 Exemple de sauvegarde chiffrée avec age

Exemple provenant du dossier source. Installer `age`, remplacer le destinataire par une clé publique valide et vérifier tous les chemins avant exécution. La clé privée reste hors serveur.

```bash
sudo apt install -y age
```

Créer `/usr/local/sbin/paymenter-backup.sh` en root, avec droits `0750`. Adapter le chemin `storage/app` si les données réelles de la version diffèrent :

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

Avant de planifier, tester le script en laboratoire, contrôler les droits et le destinataire, transférer la copie vers une cible hors hôte et valider l'intégrité. La purge de rétention peut supprimer les seules copies si son chemin est faux.

### 14.3 Contrôle de restauration

Ne restaure pas sur la base active. Utiliser une base séparée, par exemple `paymenter_restore`, sur une VM de recette isolée :

```bash
age -d -i /chemin/hors-hote/age-identity.txt db-AAAA-MM-JJ-HHMM.sql.gz.age \
  | gunzip > /tmp/paymenter-restore.sql
sudo mariadb -e "CREATE DATABASE paymenter_restore CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
sudo mariadb paymenter_restore < /tmp/paymenter-restore.sql
sudo mariadb -e "SHOW TABLES FROM paymenter_restore"
```

`age-identity.txt` représente la clé privée fournie par le coffre, accessible uniquement sur l'environnement isolé. Ne jamais la déposer dans Git ou sur le serveur de production.

### 14.4 Restauration complète en laboratoire

1. Créer une VM de reprise sans accès aux paiements réels, e-mails de production ou réseaux clients.
2. Installer les versions consignées, transférer les archives chiffrées et restaurer `.env`, base, permissions et APPKEY correspondante.
3. Garder le worker désactivé jusqu'à validation ; tester l'accès local, le compte fictif, le catalogue et les journaux.
4. Mesurer le temps de reprise, les données manquantes, erreurs, étapes manuelles et améliorations.
5. Consigner date, méthode, versions, durée et anomalies. La restauration n'est réussie qu'après l'exécution du test.

---

## 15. Journalisation et supervision

### 15.1 Contrôles et alertes

Surveiller : disponibilité HTTPS et expiration du certificat, NGINX, PHP-FPM, MariaDB, Redis, worker, tâches échouées, CPU, mémoire, disque, stockage Proxmox et dernière sauvegarde vérifiée.

Alertes minimales : service arrêté, espace disque bas, worker silencieux, erreurs répétées, certificat proche de l'expiration, sauvegarde en échec. Tester les alertes puis remettre le système à son état nominal.

Les journaux portent un identifiant de corrélation commande/tâche/VM, sans token, mot de passe, APPKEY, corps complet du webhook ou donnée de paiement. Restreindre l'accès et la rétention.

### 15.2 Commandes de diagnostic

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
openssl s_client -connect panel.example.net:443 -servername panel.example.net </dev/null 2>/dev/null | openssl x509 -noout -enddate
```

Remplacer le domaine. Ces commandes collectent un état ; elles ne prouvent ni la bonne disponibilité globale ni la restauration.

---

## 16. Mises à jour et retour arrière

### 16.1 Debian et composants

Avant mise à jour : lire les avis de sécurité, contrôler paquets candidats, sauvegarde et espace disque, préparer une fenêtre et un retour arrière. Tester sur clone si possible.

```bash
apt list --upgradable
apt policy php8.3-fpm mariadb-server nginx redis-server
df -h
sudo apt update
sudo apt upgrade
systemctl --failed
```

Après, vérifier PHP, base, Redis, NGINX, scheduler, worker, Paymenter, intégration API et journaux. Ne mélanger pas une mise à jour système et une migration majeure Paymenter.

### 16.2 Paymenter

Lire les notes de version, vérifier extension/thème, confirmer la disponibilité de l'APPKEY et d'une sauvegarde restaurable. Tester la mise à jour sur clone. La procédure exacte dépend de la release cible ; ne pas remplacer le tag par `latest` sans consigner sa résolution.

Squelette de maintenance à adapter à la procédure officielle de la version cible :

```bash
cd /var/www/paymenter
sudo -u www-data php artisan down
sudo /usr/local/sbin/paymenter-backup.sh
sudo -u www-data php artisan migrate --force --seed
sudo -u www-data php artisan optimize:clear
sudo chown -R www-data:www-data /var/www/paymenter
sudo -u www-data php artisan up
```

Ce squelette ne télécharge pas la release et ne remplace pas la procédure exacte de mise à niveau. Ne l'exécuter sur l'instance active qu'après validation du plan, du backup, de la commande de mise à niveau et du rollback. Après mise à jour, tester portail, catalogue, queue, paiements sandbox et appels Proxmox.

---

## 17. Secrets, comptes et dépôt Git

Les secrets sont une cible prioritaire : APPKEY, mots de passe SQL, clés de paiement, secret webhook, token Proxmox, SMTP, certificats privés et clés SSH privées. Les conserver dans un coffre ou fichier protégé, hors Git.

- `.env`, dumps SQL, archives, certificats privés, clés et exports sont exclus du dépôt.
- `.env.example` contient uniquement des valeurs fictives.
- Les comptes sont nominatifs, avec permissions minimales et MFA si disponible.
- Les accès temporaires sont révoqués après usage.
- Les commits et livrables sont scannés ; en cas de fuite, révoquer le secret d'abord, nettoyer ensuite l'historique.
- Les scripts annoncent leurs privilèges, prérequis, effets destructifs et contrôles d'erreur.

Exemple `.gitignore` à compléter selon le dépôt :

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

Ne pas versionner des preuves non expurgées ou une configuration opérationnelle sensible.

---

## 18. Analyse des menaces et risques

| Scénario | Actifs concernés | Mesures de réduction |
| --- | --- | --- |
| Compromission du portail | Application, commandes, clients, APPKEY | TLS, mises à jour, comptes nominatifs, MFA, restriction administration |
| Webhook forgé/rejoué | Paiement et provisioning | Signature, identifiant, fraîcheur, idempotence |
| Token Proxmox trop permissif/divulgué | API, VM et hôte | Moindre privilège, pool dédié, expiration, rotation/révocation |
| Console Proxmox exposée | Hyperviseur | API privée/VPN, pare-feu, absence de route publique |
| Isolation insuffisante | Gestion et autres clients | VLAN/bridge, firewall Proxmox, filtres MAC/IP, tests |
| Template compromis | VM clientes | Image officielle vérifiée, assainissement, correctifs |
| Sauvegarde inutilisable | Continuité | Chiffrement, copie hors hôte, restauration testée |
| Erreur humaine | Tous composants | Console secours, procédures, revue, preuve |

Les risques résiduels comprennent panne matérielle, coupure réseau/électrique, vulnérabilités inconnues, déni de service, erreur de configuration et dépendance fournisseur. Le dossier final doit décrire le risque réellement présent, pas prétendre le supprimer.

---

## 19. Plan de recette

### 19.1 Prérequis

Utiliser un compte client fictif, un produit de test, prestataire de paiement sandbox, VM jetable et fenêtre de test définie. Confirmer qu'aucune transaction ou suppression de production n'est possible.

Parcours nominal : commander une offre, vérifier facture et état, simuler le paiement, valider le webhook, observer le worker, puis vérifier VM, réseau et statut Paymenter.

Parcours d'échec : paiement refusé, webhook invalide, événement dupliqué, API indisponible, stockage plein en test contrôlé, worker arrêté. Aucun échec ne doit laisser une VM active non suivie. Rejouer un événement de test et vérifier une seule VM associée à la commande.

### 19.2 Cas de test initiaux

Tous les résultats du tableau restent `Non testé` tant qu'une exécution et une preuve ne sont pas archivées.

| ID | Test | Résultat attendu | Statut |
| --- | --- | --- | --- |
| F-01 | HTTPS | Certificat valide, redirection HTTP/HTTPS cohérente | Non testé |
| F-02 | Paiement refusé | Aucune VM créée | Non testé |
| F-03 | Paiement accepté | Une seule VM liée à la commande | Non testé |
| F-04 | Webhook rejoué/dupliqué | Aucun doublon | Non testé |
| F-05 | Webhook invalide | Rejet journalisé, aucune tâche | Non testé |
| F-06 | API Proxmox indisponible | Échec explicite, aucune VM active non suivie | Non testé |
| F-07 | Stockage plein en test contrôlé | Erreur propre et état cohérent | Non testé |
| F-08 | Worker arrêté | Tâche conservée et reprise sûre | Non testé |
| F-09 | Restauration complète | Portail utilisable en laboratoire | Non testé |
| S-01 | Proxmox depuis Internet | Inaccessible | Non testé |
| S-02 | MariaDB/Redis depuis l'extérieur | Inaccessibles | Non testé |
| S-03 | Isolation VPS | Pas d'accès gestion/autres clients | Non testé |
| S-04 | Accès à `.env` | Refusé par NGINX | Non testé |

Pour chaque fiche, inscrire objectif, environnement/date, préconditions, étapes, attendu, observé, preuve expurgée, verdict et anomalie. Un résultat négatif est consigné ; ne pas le transformer en réussite.

---

## 20. Contrôle de l'exposition externe

Scanner uniquement des domaines et IP sous contrôle, depuis une source autorisée. Exemple à adapter :

```bash
nmap -Pn -p 22,80,443,3306,6379,8006 panel.example.net
nmap -Pn -6 -p 22,80,443,3306,6379,8006 panel.example.net
curl -I https://panel.example.net
```

Une absence de réponse peut indiquer filtrage, panne ou problème de route : croiser avec les règles, interfaces en écoute et journaux. Vérifier IPv4 et IPv6 séparément. Masquer les adresses publiques dans le rapport partagé.

Résultat attendu de la politique : portail HTTPS joignable ; SSH uniquement depuis administration ; Proxmox, MariaDB et Redis injoignables depuis Internet. Documenter toute différence.

---

## 21. Incidents et rotation du token

### 21.1 Procédure d'incident

1. **Détection :** identifier alerte, heure, systèmes concernés et impact client. Préserver journaux avant rotation/nettoyage.
2. **Confinement :** isoler l'interface ou révoquer immédiatement token/clé suspecte. Un token divulgué est révoqué avant la fin de l'analyse.
3. **Rétablissement :** restaurer depuis un état connu, vérifier intégrité et sécurité, puis réactiver graduellement.
4. **Compte rendu :** chronologie, cause, impact, preuves, secrets concernés, actions et prévention ; expurger les données personnelles.

Ne pas arrêter arbitrairement un nœud sans identifier les VM clientes concernées.

### 21.2 Rotation du token Proxmox

Créer un nouveau token à privilèges minimaux et avec expiration. Conserver son secret dans le coffre, modifier l'intégration, tester un appel de lecture puis un provisionnement sur VM jetable, puis révoquer l'ancien token et contrôler la file des tâches. En cas de soupçon de fuite, révoquer l'ancien immédiatement.

```bash
pveum user token add paymenterpve@pve provisioning2 --privsep 1 --expire 180d
```

Ajouter les ACL nécessaires au token neuf avec le rôle/path retenu après vérification de la syntaxe de la version installée. Une fois le nouveau token testé et l'application reconfigurée :

```bash
pveum user token remove paymenterpve@pve provisioning
```

Tracer identifiant, date, raison, permissions et preuve, jamais le secret.

---

## 22. Dépannage par symptômes

| Symptôme | Vérifications dans l'ordre |
| --- | --- |
| NGINX 502 | PHP-FPM actif ; socket présent et lisible ; chemin PHP ; logs NGINX/PHP |
| Erreur SQL | MariaDB actif ; host/port ; user/database ; droits ; secret ; type socket/TCP |
| Données chiffrées illisibles | APPKEY restaurée correspondante ; ne jamais la régénérer |
| Provisionnement bloqué | Paiement ; webhook ; queue ; worker ; API ; token/ACL ; template ; capacité stockage ; chercher VM avant retry |
| VM sans réseau | Bridge/VLAN ; cloud-init ; IP ; route ; DNS ; firewall invité/amont |
| Worker arrêté | `systemctl`, `journalctl`, version PHP, Redis, tâche active avant redémarrage |
| Certificat expiré | Timer Certbot, DNS, accessibilité challenge, renouvellement test |

Commandes utiles, adapter les noms d'unités :

```bash
systemctl --failed
systemctl status nginx php8.3-fpm mariadb redis-server paymenter --no-pager
journalctl -u paymenter.service -n 100 --no-pager
journalctl -u nginx -n 100 --no-pager
ss -lntup
df -h
```

Avant une action destructive sur une VM bloquée, confirmer son VMID, le tag de commande, l'état de facturation et l'absence de service client actif.

---

## 23. Exploitation quotidienne

| Fréquence | Contrôles |
| --- | --- |
| Quotidienne | Alertes, worker, disque, disponibilité du portail, tâches en échec |
| Hebdomadaire | Sauvegardes, journaux, capacité, nouveaux comptes, mises à jour prioritaires |
| Périodique | ACL/tokens, certificats, versions, firewall, SSH, rétention, exercice de restauration |

Documenter l'ordre réel de démarrage/arrêt des services. Avant toute interruption, examiner les jobs actifs et informer les clients. La routine doit refléter les unités réellement installées, pas une liste générique.

---

## 24. Jalons et critères de sortie

| Jalon | Contenu | Livrable | Sortie attendue |
| --- | --- | --- | --- |
| 1. Cadrage | Sujet, périmètre, architecture, exigences et limites | Schéma et exigences | Revu |
| 2. Socle | Debian, DNS, réseau, comptes, dépendances, base, Redis | Inventaire versions/réseau | Contrôlé |
| 3. Application | Paymenter, `.env`, APPKEY, migrations, cron, worker, NGINX/TLS | Portail et jobs | Fonctionnel en test |
| 4. Intégration | Extension, token privé, template, sandbox, webhook | VM de test | Sans doublon |
| 5. Sécurité | Pare-feu, exposition, isolation, secrets, journaux, sauvegardes | Preuves expurgées | Tests vérifiés |
| 6. Recette | Tests, anomalies, démo, dossier final | Rapport final | Verdicts observés |

---

## 25. Production des preuves et remise

Les preuves partagées doivent être utiles sans divulguer de secrets :

- Capture d'état du service, version, VM de test et contrôles réseau ; masquer secrets, e-mails, identifiants, IP publiques et données personnelles.
- Extrait de journal limité aux lignes utiles, horodaté, avec ID de corrélation et résultat ; pas de corps complet de webhook ni token.
- Schéma des frontières et flux entre Internet, frontal, application, gestion Proxmox, VPS et sauvegarde ; ne noter des ports que s'ils sont réellement actifs.
- Résultats négatifs conservés ; distinguer réussi, partiel, échoué et non testé.
- Inventaire versions, extension et commits ; preuves de sauvegarde restaurée en laboratoire.

Avant remise, vérifier que `.env`, dumps, clés, certificats privés et données clients ne sont pas dans Git. Scanner les commits et livrables. En cas de fuite, révoquer/faire tourner le secret avant de nettoyer l'historique.

---

# Annexes

## Annexe A — Inventaire des versions

| Composant | Référence | Valeur constatée | Preuve |
| --- | --- | --- | --- |
| Paymenter | v1.5.9 | À relever | Tag/release ou commande |
| Debian | 13.7 | À relever | `/etc/debian_version` |
| PHP | 8.3 | À relever | `php -v` |
| MariaDB | 10.11 | À relever | `mariadb --version` |
| Redis | paquet Debian | À relever | `redis-server --version` |
| NGINX | paquet Debian | À relever | `nginx -v` |
| Composer | courant | À relever | `composer --version` |
| Proxmox VE | 9.2 référence | À relever | `pveversion -v` |
| Extension Proxmox | À identifier | À relever | dépôt, tag, hash, doc |

## Annexe B — Fiche de test vierge

| Champ | Valeur à saisir |
| --- | --- |
| ID et objectif | |
| Environnement et date | |
| Préconditions | |
| Étapes/commandes | |
| Résultat attendu | |
| Résultat observé | |
| Preuve expurgée | |
| Verdict | Réussi / partiel / échoué / non testé |
| Anomalie et ticket | |

## Annexe C — Checklist de fin

- [ ] Versions constatées et inventaire à jour.
- [ ] Proxmox non exposé à Internet.
- [ ] TLS vérifié et renouvellement testé.
- [ ] Webhook de paiement sandbox authentifié.
- [ ] Extension Proxmox identifiée et versionnée.
- [ ] Provisionnement sans doublon testé.
- [ ] Isolation des VPS testée en IPv4 et IPv6 si applicable.
- [ ] Sauvegarde restaurée en laboratoire.
- [ ] Secrets absents des livrables et du dépôt Git.
- [ ] Statuts de tests conformes aux observations réelles.

## Annexe D — Références techniques

- [Documentation d'installation Paymenter](https://paymenter.org/docs/installation/install)
- [Configuration NGINX de Paymenter](https://paymenter.org/docs/installation/webserver)
- [CLI Paymenter](https://paymenter.org/docs/guides/cli)
- [Développement des extensions serveur Paymenter](https://paymenter.org/development/extensions/server)
- [Versions Debian](https://www.debian.org/releases/)
- [Gestion des utilisateurs Proxmox VE](https://pve.proxmox.com/wiki/User_Management)
- [API Viewer Proxmox VE](https://pve.proxmox.com/pve-docs/api-viewer/)
- [Support Cloud-Init Proxmox VE](https://pve.proxmox.com/wiki/Cloud-Init_Support)
- [Manuel `pveum`](https://pve.proxmox.com/pve-docs/pveum.1.html)

## Annexe E — Glossaire

| Terme | Définition dans le projet |
| --- | --- |
| API | Interface utilisée par une application pour demander des opérations à un service |
| APPKEY | Clé applicative ; à protéger et sauvegarder séparément |
| Webhook | Notification d'événement envoyée par un service ; à authentifier |
| Worker | Processus asynchrone consommant une file de tâches |
| Idempotence | Propriété empêchant une opération répétée de produire plusieurs créations |
| Template | Image de référence utilisée pour créer une VM standardisée |
| RPO | Perte de données maximale visée, à mesurer en restauration |
| RTO | Délai de reprise visé, à mesurer en exercice |
| Plan de gestion | Réseau utilisé pour administrer hyperviseur et services internes |

> Les versions de référence ne sont pas des versions relevées. Confirmer l'environnement, l'extension exacte et les commandes avant usage. Ne déclarer aucune étape réalisée sans preuve.
