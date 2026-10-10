---
title: Plateforme VPS sécurisée et automatisée avec Paymenter et Proxmox VE
date: 2026-10-10 18:48:00 +0200
categories: [Cybersécurité, Homelab]
tags: [OTERIA, Proxmox, Paymenter, VPS, Debian 13, NGINX, Linux, cybersécurité]
description: >-
  Projet individuel de Bachelor 2 OTERIA : documentation détaillée et commandes de référence
  pour déployer Paymenter sur Debian 13 et l'intégrer à Proxmox VE.
---

> **Périmètre de ce guide.** Les commandes d'installation de Paymenter et de gestion des utilisateurs/tokens Proxmox ci-dessous suivent leur documentation officielle consultée pour cet article. Les paramètres réseau, domaines, certificats, stockage, bridges et privilèges précis restent propres à chaque installation. Vérifie-les avant exécution. Le dossier technique indique plusieurs tests comme non testés : aucune commande de cette page ne constitue une preuve que le déploiement a été effectué.

## Présentation

Projet individuel de Bachelor 2 cybersécurité à OTERIA : concevoir une plateforme de vente de VPS automatisée. Le client commande et paie sur Paymenter ; après validation du paiement côté serveur, une VM QEMU/KVM est provisionnée sur Proxmox VE.

Pile de référence : Debian 13, NGINX, PHP-FPM, MariaDB, Redis, Paymenter v1.5.9 et Proxmox VE. Le portail est installé sans Docker. Les VPS sont des VM, avec templates cloud-init, réseau client distinct, sauvegardes, supervision et plan de recette. LXC et serveurs de jeux sont hors périmètre tant qu'une extension n'a pas été identifiée, versionnée et testée.

Quatre règles guident le projet :

1. Le paiement authentifié par notification serveur est le seul déclencheur de création.
2. Proxmox n'est pas exposé à Internet ; l'API utilise un token dédié, limité et révocable.
3. Une notification rejouée ne doit pas créer un doublon.
4. Une procédure n'est pas une preuve : les résultats sont notés réussi, partiel, échoué ou non testé selon les observations.

## Architecture

NGINX est l'unique point d'entrée public. Il sert `public` et transmet PHP à PHP-FPM par socket Unix. Paymenter utilise MariaDB et Redis en local. Un worker systemd traite les tâches asynchrones et le provisionnement ; seul ce composant joint l'API Proxmox, sur le réseau de gestion privé.

| Zone | Composants | Exposition prévue |
| --- | --- | --- |
| Frontal | NGINX et TLS | HTTPS public ; HTTP selon redirection et challenge de certificat |
| Application | Paymenter, PHP-FPM, worker, MariaDB, Redis | Interne/loopback ; bases non publiques |
| Gestion | API et SSH Proxmox | VPN ou réseau d'administration uniquement |
| Clients | VPS QEMU/KVM | Bridge/VLAN client, sans route vers la gestion |
| Sauvegardes | Cible hors hôte | Accès réservé à l'exploitation, jamais aux VPS |

Proxmox 8006, SSH, MariaDB 3306 et Redis 6379 ne doivent pas être ouverts à Internet. La segmentation IPv4 et IPv6, les VLAN, bridges, routes et règles réellement en place doivent être inventoriés avant de produire le schéma final.

## Inventaire initial

Sur Debian :

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

Sur un nœud Proxmox :

```bash
pveversion -v
pvesh get version
pvenode status
pvesm status
ip -br address
ip route
pveum role list
```

Les versions Debian 13.7, PHP 8.3, MariaDB 10.11, Proxmox VE 9.2 et Paymenter v1.5.9 sont des références du dossier, pas nécessairement les versions installées. Consigne les valeurs observées et l'identité exacte de l'extension Paymenter-Proxmox.

## Installation Debian

Installer Debian 13 minimal sur une VM dédiée au portail, puis définir hostname, DNS, réseau et heure. Vérifier l'accès console avant de durcir SSH.

```bash
sudo apt update
sudo apt full-upgrade -y
sudo apt install -y curl ca-certificates gnupg2 sudo lsb-release
sudo timedatectl set-timezone Europe/Paris
```

Créer un compte opérateur nominatif et installer sa clé SSH publique avant la désactivation des mots de passe :

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

Garder la session ouverte et tester une deuxième connexion par clé avant de fermer la première. Remplacer `operateur` par le compte réel. En cas d'erreur, la console de secours doit rester accessible.

## Dépendances officielles Paymenter

La documentation Paymenter consultée indique Debian 13 comme système supporté et fournit les commandes suivantes pour Debian 13. Elles installent notamment le dépôt PHP Sury et le dépôt MariaDB 10.11. Chaque dépôt tiers augmente la surface de confiance : examine les scripts, les clés et la prise en charge de la suite Debian avant de les utiliser, et suis toute mise à jour des consignes officielles.

```bash
sudo apt -y install curl ca-certificates gnupg2 sudo lsb-release

echo "deb https://packages.sury.org/php/ $(lsb_release -sc) main" \
  | sudo tee /etc/apt/sources.list.d/sury-php.list
curl -fsSL https://packages.sury.org/php/apt.gpg \
  | sudo gpg --dearmor -o /etc/apt/trusted.gpg.d/sury-keyring.gpg

curl -sSL https://downloads.mariadb.com/MariaDB/mariadb_repo_setup \
  | sudo bash -s -- --mariadb-server-version="mariadb-10.11"

sudo apt update
sudo apt install -y php8.3 php8.3-{common,cli,gd,mysql,mbstring,bcmath,xml,fpm,curl,zip,intl,redis} mariadb-server nginx tar unzip git redis-server
```

La procédure officielle publiée actuellement emploie ces commandes ; pour un durcissement supplémentaire des dépôts, vérifie la méthode de keyring `Signed-By` recommandée actuellement par Sury. Ne mélange pas plusieurs sources concurrentes pour un même paquet.

Vérifier les composants :

```bash
php -v
php -m
php --ini
php-fpm8.3 -v
systemctl status php8.3-fpm mariadb redis-server nginx --no-pager
sudo ss -lntup
```

## Base MariaDB et Redis

La procédure Paymenter crée un utilisateur, une base et les privilèges correspondants. Exécuter le client SQL de manière interactive ; ne pas publier le mot de passe.

```bash
sudo mariadb
```

Dans l'invite SQL, remplacer le placeholder par une valeur forte générée et conservée dans un gestionnaire de secrets :

```sql
CREATE USER 'paymenter'@'127.0.0.1' IDENTIFIED BY 'REMPLACER_PAR_UN_SECRET_FORT';
CREATE DATABASE paymenter;
GRANT ALL PRIVILEGES ON paymenter.* TO 'paymenter'@'127.0.0.1' WITH GRANT OPTION;
QUIT;
```

Le guide officiel montre `WITH GRANT OPTION`; dans un déploiement à privilèges minimaux, évalue si ce droit est réellement requis par l'application et préfère l'omettre s'il ne l'est pas. Vérifie que MariaDB écoute uniquement sur les interfaces prévues :

```bash
sudo ss -lntp | grep 3306
mariadb -h 127.0.0.1 -u paymenter -p paymenter
```

Redis :

```bash
sudo systemctl enable --now redis-server
redis-cli ping
sudo ss -lntp | grep 6379
```

Attendu : `PONG` et écoute limitée au périmètre local prévu. Vérifie dans le `.env` de la version Paymenter comment Redis est utilisé (queue, cache ou sessions) avant de modifier le pilote.

## Installation Paymenter

La méthode ci-dessous suit la documentation officielle Paymenter : archive de dernière release, extraction, permissions, configuration et migrations. Pour un déploiement reproductible, préférer une release/tag précis si le projet la publie, consigner le tag et vérifier la somme/signature lorsqu'elle est disponible. Ne considère pas `latest` comme un numéro de version immuable.

```bash
sudo mkdir -p /var/www/paymenter
sudo chown -R www-data:www-data /var/www/paymenter
cd /var/www/paymenter
sudo -u www-data curl -Lo paymenter.tar.gz \
  https://github.com/paymenter/paymenter/releases/latest/download/paymenter.tar.gz
sudo -u www-data tar -xzvf paymenter.tar.gz
sudo rm -f paymenter.tar.gz
sudo chown -R www-data:www-data /var/www/paymenter
sudo -u www-data chmod -R 755 storage/* bootstrap/cache/
```

Créer `.env`, puis l'éditer sans copier les secrets dans Git :

```bash
cd /var/www/paymenter
sudo -u www-data cp .env.example .env
sudoedit .env
sudo chown www-data:www-data .env
sudo chmod 640 .env
```

Renseigner selon le `.env.example` de la release : `APP_URL` en HTTPS, paramètres `DB_DATABASE=paymenter`, `DB_USERNAME=paymenter`, `DB_PASSWORD` provenant du coffre, mode production, debug désactivé et paramètres Redis/mail réellement requis. Ne colle pas le contenu réel du `.env` dans un rapport ou une capture.

Initialisation indiquée par la documentation Paymenter :

```bash
cd /var/www/paymenter
sudo -u www-data php artisan key:generate --force
sudo -u www-data php artisan storage:link
sudo -u www-data php artisan migrate --force --seed
sudo -u www-data php artisan db:seed --class=CustomPropertySeeder
sudo -u www-data php artisan app:init
sudo -u www-data php artisan app:user:create
```

L'APP_KEY est essentielle au chiffrement des données sensibles. Sauvegarde-la hors serveur et séparément de la base ; si elle est perdue, certaines données chiffrées peuvent être irrécupérables. Ne la régénère jamais pour dépanner une installation existante. Les migrations modifient la base : réalise une sauvegarde cohérente avant de les exécuter.

### Cron du scheduler

La documentation Paymenter demande un scheduler chaque minute sous `www-data` :

```bash
sudo crontab -u www-data -e
```

Ajouter la ligne :

```cron
* * * * * php /var/www/paymenter/artisan schedule:run >> /dev/null 2>&1
```

Contrôler :

```bash
sudo crontab -u www-data -l
```

### Worker systemd

Créer `/etc/systemd/system/paymenter.service` avec le contenu documenté par Paymenter :

```ini
[Unit]
Description=Paymenter Queue Worker

[Service]
User=www-data
Group=www-data
Restart=always
ExecStart=/usr/bin/php /var/www/paymenter/artisan queue:work
StartLimitInterval=180
StartLimitBurst=30
RestartSec=5s

[Install]
WantedBy=multi-user.target
```

Charger et démarrer :

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now paymenter.service
sudo systemctl enable --now redis-server
systemctl status paymenter.service --no-pager
sudo journalctl -u paymenter.service -n 100 --no-pager
```

Les noms d'utilisateur et chemin PHP peuvent varier ; adapte-les au résultat de l'inventaire. Le redémarrage du worker ne remplace pas l'idempotence des tâches de provisionnement.

## NGINX et TLS

La configuration NGINX ci-dessous suit le webserver guide Paymenter. Remplace `example.com` par le domaine réellement contrôlé et vérifie le socket PHP-FPM.

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name example.com;
    root /var/www/paymenter/public;

    add_header X-Frame-Options "SAMEORIGIN";
    add_header X-Content-Type-Options "nosniff";

    index index.php;
    charset utf-8;

    location / {
        try_files $uri $uri/ /index.php?$query_string;
    }

    location ~ ^/index\.php(/|$) {
        fastcgi_pass unix:/var/run/php/php8.3-fpm.sock;
        fastcgi_param SCRIPT_FILENAME $realpath_root$fastcgi_script_name;
        include fastcgi_params;
        fastcgi_hide_header X-Powered-By;
    }
}
```

Enregistrer dans `/etc/nginx/sites-available/paymenter.conf`, puis activer comme indiqué par le guide :

```bash
sudo ln -s /etc/nginx/sites-available/paymenter.conf /etc/nginx/sites-enabled/paymenter.conf
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx
sudo chown -R www-data:www-data /var/www/paymenter/*
```

Pour TLS, le guide Paymenter donne aussi un bloc 80 redirigeant vers HTTPS et un bloc 443 avec certificats sous `/etc/letsencrypt/live/example.com/`. Obtiens d'abord un certificat valide pour le domaine réel avec Certbot, puis configure le bloc TLS. Ne copie pas le domaine d'exemple. Teste la configuration et le renouvellement :

```bash
sudo nginx -t
sudo systemctl reload nginx
sudo certbot renew --dry-run
curl -I https://example.com
curl -I http://example.com
curl -i https://example.com/.env
```

Le dernier test doit retourner un refus ou une absence de fichier, jamais son contenu. Le résultat réel reste à consigner.

## UFW, exposition et précautions

N'active pas un pare-feu avec un CIDR d'exemple. Détermine d'abord l'adresse réelle d'administration, la console de secours et la politique IPv6. Exemple de séquence UFW du dossier à adapter et tester :

```bash
sudo apt install -y ufw
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow from ADMIN_CIDR_REEL to any port 22 proto tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw show added
sudo ufw status verbose
```

Seulement après validation du CIDR et d'une session SSH de secours :

```bash
sudo ufw enable
sudo ufw status numbered
```

Ne pas ouvrir publiquement 3306, 6379, 8006 ou SSH. Vérifie également les pare-feux routeur, Proxmox et VM ; une règle Debian ne décrit pas toute la chaîne réseau.

## Proxmox : rôle, utilisateur, token et ACL

Les commandes suivantes utilisent la syntaxe documentée `pveum` (rôles, ACL et tokens). Le jeu de privilèges métier exact dépend des appels réellement faits par l'extension Paymenter : ne crée pas le rôle de production avant de l'avoir vérifié dans l'API Viewer et sur un environnement de test. Le token à privilèges séparés reçoit des ACL propres ; ses droits effectifs sont l'intersection des ACL du token et de l'utilisateur.

Exemple minimal de création d'identité/token ; le realm `pve` et les noms sont à confirmer :

```bash
pveum user add paymenterpve@pve --comment "Paymenter VPS provisioning"
pveum user token add paymenterpve@pve provisioning --privsep 1 --comment "Paymenter provisioning"
```

Le token est affiché une seule fois : enregistre immédiatement le secret dans un coffre, ne le mets pas dans un fichier versionné ou une capture. Crée ensuite un rôle basé uniquement sur les privilèges requis et assigne ACL à des chemins restreints. Syntaxe documentée :

```bash
pveum role add PaymenterVM --privs "PRIVILEGE_1 PRIVILEGE_2"
pveum acl modify /pool/POOL_REEL --users paymenterpve@pve --roles PaymenterVM
pveum acl modify /vms/VMID_TEMPLATE --users paymenterpve@pve --roles PaymenterVM
pveum acl modify /pool/POOL_REEL --tokens 'paymenterpve@pve!provisioning' --roles PaymenterVM
```

`PRIVILEGE_1`, `POOL_REEL` et `VMID_TEMPLATE` sont des placeholders explicites, pas des valeurs valides à exécuter telles quelles. Ne les remplace qu'après inventaire et validation du moindre privilège. Des ACL séparées peuvent aussi être nécessaires pour le stockage et le réseau ; les paths/privileges exacts sont à vérifier avec la version de Proxmox et l'extension.

Vérifier les permissions effectives :

```bash
pveum user permissions paymenterpve@pve --path /pool/POOL_REEL
pveum user token permissions paymenterpve@pve provisioning --path /pool/POOL_REEL
pveum acl list
```

Test API de lecture : Proxmox emploie l'en-tête `Authorization: PVEAPIToken=USER@REALM!TOKENID=UUID`. Ne mets jamais le UUID du token dans l'historique ou un dépôt. La connexion doit utiliser HTTPS et vérifier le certificat CA Proxmox ; ne désactive pas la validation TLS. Vérifie le format selon l'outil API utilisé.

Pour révoquer le token, syntaxe documentée :

```bash
pveum user token remove paymenterpve@pve provisioning
```

## Template et VM jetable

Inventorie d'abord le stockage, les bridges, le VMID libre, les ressources et les règles. Les lignes suivantes sont des commandes `qm` issues du dossier : elles ne sont pas un substitut au contrôle des options acceptées par ta version Proxmox et au choix du bon storage/bridge. Image, VMID, stockage et bridge doivent être vérifiés avant exécution.

```bash
cd /var/tmp
curl -fLO https://cloud.debian.org/images/cloud/trixie/latest/debian-13-genericcloud-amd64.qcow2
curl -fLO https://cloud.debian.org/images/cloud/trixie/latest/SHA512SUMS
sha512sum -c --ignore-missing SHA512SUMS
qm create 9000 --name tpl-debian13 --memory 1024 --cores 1 --ostype l26 --scsihw virtio-scsi-single --net0 virtio,bridge=vmbr1 --agent enabled=1 --serial0 socket --vga serial0
qm disk import 9000 debian-13-genericcloud-amd64.qcow2 local-lvm
qm set 9000 --scsi0 local-lvm:vm-9000-disk-0,discard=on
qm set 9000 --boot order=scsi0
qm set 9000 --ide2 local-lvm:cloudinit
qm template 9000
```

Pour une image personnalisée, nettoie l'instance source avant conversion au template (exécuter dans l'invité avec procédure adaptée) :

```bash
sudo cloud-init clean --logs --seed
sudo truncate -s 0 /etc/machine-id
sudo rm -f /var/lib/dbus/machine-id /etc/ssh/ssh_host_*
sudo journalctl --rotate --vacuum-time=1s
history -c
```

Le clonage de référence ci-dessous crée et démarre une VM jetable :

```bash
qm clone 9000 1001 --name vps-test-0001 --pool vps-clients --full 1 --storage local-lvm
qm set 1001 --tags order-0001 --cores 2 --memory 2048 --ciuser debian --sshkeys /root/testkey.pub --ipconfig0 ip=10.20.0.50/24,gw=10.20.0.1 --nameserver 10.20.0.1 --net0 virtio,bridge=vmbr1,firewall=1
qm resize 1001 scsi0 20G
qm start 1001
qm status 1001
```

Les valeurs sont des exemples fictifs. `qm resize`, `qm start` et surtout `qm destroy` modifient l'infrastructure : vérifie le VMID et l'absence de données avant toute action. Ne lance ces commandes que sur une VM jetable que tu possèdes.

## Provisionnement : comportement attendu

Le webhook signé est validé côté serveur (signature, identifiant, fraîcheur). Une tâche unique dérivée de l'identifiant de commande est créée. Avant tout clonage/retry, Paymenter vérifie s'il existe déjà une VM ou une tâche étiquetée pour cette commande. Les paramètres client sont convertis vers un pool, template, stockage et bridge autorisés. La VM est activée dans Paymenter seulement après vérification de son état et de son réseau.

L'extension Paymenter-Proxmox doit être nommée, versionnée et testée. Le dossier ne prouve pas sa compatibilité ni la chaîne automatique. Les commandes `qm` ci-dessus servent de référence manuelle et de recette, pas d'implémentation du webhook.

## Tests réseau autorisés

Les tests sont à lancer depuis une VM de recette et uniquement vers tes propres adresses autorisées. Les adresses sont fictives :

```bash
ping -c 2 10.20.0.1
nc -vz -w 3 10.10.0.10 8006
nc -vz -w 3 10.10.0.10 22
nc -vz -w 3 10.10.0.20 3306
nc -vz -w 3 10.10.0.20 6379
ping -c 2 10.20.0.51
curl -I https://deb.debian.org
```

Attendu selon la politique : passerelle accessible, réseau d'administration et autres locataires inaccessibles, sortie Internet permise selon la configuration. Un résultat de scan seul ne prouve pas l'absence de route ; compare avec les règles effectives, y compris IPv6.

## Sauvegarde et restauration

Sauvegarder base, données de l'application et configuration sensible, avec APP_KEY dans un coffre séparé. La sauvegarde doit être chiffrée, copiée hors hôte et restaurée en laboratoire. Les chemins et rétention doivent être ajustés à l'installation.

Exemple documentaire avec `age` : le destinataire est un placeholder et la clé privée ne doit pas rester sur le serveur. Vérifie que `age` est installé, que la base est cohérente et que la commande d'archivage correspond aux données réellement stockées avant toute planification.

```bash
sudo apt install age
umask 077
STAMP=$(date +%F-%H%M)
DEST=/var/backups/paymenter
RECIPIENT=age1REMPLACER_PAR_CLE_PUBLIQUE
sudo install -d -m 0700 "$DEST"
sudo mariadb-dump --single-transaction --routines --triggers paymenter \
  | gzip \
  | age -r "$RECIPIENT" -o "$DEST/db-$STAMP.sql.gz.age"
sudo tar -C /var/www/paymenter -czf - .env storage/app \
  | age -r "$RECIPIENT" -o "$DEST/files-$STAMP.tar.gz.age"
```

Ne restaure pas directement par-dessus la base active. Crée une VM isolée, restaure base et fichiers avec la bonne APP_KEY, laisse le worker arrêté jusqu'aux vérifications, puis consigne temps, erreurs, étapes manuelles et résultat. Les objectifs RPO/RTO sont mesurés par cet exercice, pas supposés.

## Exploitation et diagnostic

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
```

Avant une mise à jour, relever les paquets candidats, vérifier la sauvegarde, l'espace disque et la fenêtre de maintenance. Tester sur clone, puis vérifier PHP, MariaDB, Redis, NGINX, scheduler, worker, Paymenter et intégration Proxmox. Séparer mises à jour système et migrations majeures de Paymenter.

| Symptôme | Vérifications prioritaires |
| --- | --- |
| NGINX 502 | PHP-FPM, socket, droits, chemin PHP et journaux |
| Erreur SQL | MariaDB, DB_HOST/DB_PORT, compte et privilèges |
| Données chiffrées illisibles | APP_KEY correspondante ; ne pas la régénérer |
| Provisionnement bloqué | Paiement, webhook, worker, file, API, token/ACL, template et stockage ; rechercher la VM avant retry |
| VM sans réseau | Bridge/VLAN, cloud-init, adresse, route, DNS et pare-feu |
| Certificat expiré | DNS, accès challenge, timer et `certbot renew --dry-run` |

## Recette et statut

Dans le dossier technique, les tests suivants sont initialement **Non testés**. Ils restent ainsi tant que tu n'as pas capturé les résultats réels.

| Test | Résultat attendu | Statut initial |
| --- | --- | --- |
| HTTPS | Certificat valide, HTTP redirigé | Non testé |
| Paiement refusé | Aucune VM créée | Non testé |
| Paiement accepté | Une VM liée à la commande | Non testé |
| Webhook rejoué/invalide | Aucun doublon, rejet approprié | Non testé |
| API indisponible / worker arrêté | Erreur gérée, reprise sûre | Non testé |
| Proxmox depuis Internet | Inaccessible | Non testé |
| Isolation VPS | Gestion et autres clients inaccessibles | Non testé |
| Restauration | Portail de test utilisable | Non testé |

Pour chaque essai, consigne l'environnement, les préconditions, les commandes, le résultat attendu et observé, l'heure et une preuve expurgée. Masque clés, mots de passe, adresses publiques, e-mails et données de paiement.

## Références des commandes

Les commandes Paymenter sont basées sur ses guides d'installation et de configuration NGINX ; la syntaxe de token/ACL s'appuie sur le manuel `pveum`. Vérifie toujours les instructions et les options propres à la release effectivement installée avant une opération de production.
