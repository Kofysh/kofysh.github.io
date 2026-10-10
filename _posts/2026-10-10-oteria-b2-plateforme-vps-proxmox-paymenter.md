---
title: Déployer une plateforme VPS avec Paymenter et Proxmox VE
date: 2026-10-10 18:48:00 +0200
categories: [Cybersécurité, Homelab]
tags: [OTERIA, Proxmox, Paymenter, VPS, Debian 13, NGINX, Linux, cloud-init]
description: >-
  Guide de déploiement pas à pas du projet B2 OTERIA : portail Paymenter sur Debian 13,
  intégration Proxmox VE, templates cloud-init, sécurité et recette.
---

# Déployer une plateforme VPS avec Paymenter et Proxmox VE

Ce guide documente le projet individuel de Bachelor 2 cybersécurité à OTERIA : un portail Paymenter qui reçoit des commandes de VPS et une infrastructure Proxmox VE destinée à héberger les machines virtuelles. Il décrit l'installation du portail, la préparation de Proxmox, la création d'un template cloud-init, les contrôles de sécurité et la recette.

Le guide est écrit pour être repris par un autre administrateur. Les commandes d'installation suivent la documentation officielle de Paymenter et Proxmox consultée le 10 octobre 2026. Les valeurs qui dépendent du site (nom DNS, IP, interface réseau, stockage, VMID, certificats et clés) sont déclarées au début et doivent être remplacées par des valeurs existantes dans l'environnement cible. Aucun mot de passe ni token réel n'est inclus.

> **Important sur l'automatisation :** installer Paymenter et préparer Proxmox ne suffit pas à automatiser la création d'une VM. Il faut une extension Paymenter-Proxmox compatible et identifiée, qui implémente les opérations nécessaires. La documentation du projet n'établit pas encore quelle extension a été retenue ni que le parcours complet a été exécuté. Les commandes `qm` ci-dessous démontrent la procédure Proxmox manuelle de référence ; elles ne prétendent pas créer un webhook ou un plugin.

## 1. Périmètre et architecture

Le périmètre est limité aux VPS sous forme de VM QEMU/KVM. Les conteneurs LXC et serveurs de jeux ne sont pas annoncés comme provisionnés. Une VM possède son propre noyau, tandis qu'un conteneur partage celui de l'hôte ; le choix VM réduit le risque lié à un locataire administrateur, sans remplacer le cloisonnement réseau.

Le portail est installé directement sur une VM Debian 13, sans Docker. NGINX publie uniquement le répertoire `public` de Paymenter et transmet les requêtes PHP à PHP-FPM. MariaDB et Redis restent locaux au portail. Un worker systemd consomme les tâches asynchrones. Le worker qui exécute l'extension sera le seul composant autorisé à contacter l'API Proxmox sur le réseau de gestion.

| Zone | Composants | Accès attendu |
| --- | --- | --- |
| Internet | Clients et prestataire de paiement | HTTPS vers NGINX uniquement |
| Portail | NGINX, PHP-FPM, Paymenter, worker | Services applicatifs nécessaires |
| Données | MariaDB et Redis | Loopback ; aucun accès depuis Internet ou les VPS |
| Gestion | Proxmox API, SSH, interface d'administration | Réseau privé d'administration/VPN uniquement |
| Clients | VM QEMU/KVM | Bridge/VLAN client, pas d'accès à la gestion ni aux autres locataires |
| Sauvegarde | Cible distincte de l'hôte | Flux limités depuis l'exploitation |

Proxmox 8006, SSH, MariaDB 3306 et Redis 6379 ne doivent pas être publiés sur Internet. Le fournisseur de paiement envoie son webhook vers le portail HTTPS ; la signature et l'identifiant d'événement sont vérifiés côté serveur avant tout provisionnement.

## 2. Variables de déploiement

Avant de commencer, remplir cette fiche avec les valeurs réelles. Les valeurs ci-dessous sont des exemples de format, pas une configuration à copier.

| Variable | Exemple de format | Où la vérifier |
| --- | --- | --- |
| `PANEL_FQDN` | `panel.example.net` | DNS contrôlé par l'exploitant |
| `ADMIN_CIDR` | `192.0.2.0/24` | Réseau/VPN d'administration réel |
| `PVE_FQDN` | `pve.example.net` | DNS privé et certificat de Proxmox |
| `PVE_NODE` | nom du nœud | `pvesh get nodes` |
| `PVE_STORAGE` | identifiant de stockage | `pvesm status` |
| `PVE_BRIDGE` | bridge client | Inventaire réseau Proxmox |
| `PVE_POOL` | `vps-clients` | Pool dédié aux VPS |
| `TEMPLATE_VMID` | VMID libre réservé | `qm list` et allocation VMID |
| `TEST_VMID` | VMID libre de recette | `qm list` et allocation VMID |
| `CLIENT_CIDR` | sous-réseau client | Plan IP/VLAN approuvé |
| `CLIENT_GATEWAY` | passerelle client | Configuration réseau effective |

Utiliser les adresses réservées à la documentation (RFC 5737) uniquement comme illustrations. Avant d'exécuter des commandes avec une adresse, un VMID, un stockage ou un bridge, la remplacer par une valeur réellement allouée et vérifier qu'elle n'est pas déjà utilisée.

## 3. Préparer Debian 13

Installer Debian 13 minimal dans une VM dédiée au portail, configurer le nom d'hôte, l'adresse réseau, DNS et NTP. Garder un accès console Proxmox en cas d'erreur SSH. Puis mettre à jour les paquets :

```bash
sudo apt update
sudo apt full-upgrade -y
sudo apt install -y curl ca-certificates gnupg2 sudo lsb-release
sudo timedatectl set-timezone Europe/Paris
```

Vérifier l'état initial et sauvegarder ces sorties dans le dossier de preuves, en expurgeant les adresses publiques :

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
```

Créer un compte d'administration nominatif, poser sa clé publique SSH, puis durcir SSH. Ne désactiver les mots de passe qu'après un test de connexion par clé depuis une deuxième session.

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

Remplacer `operateur` par le compte réel. Garder la session existante ouverte, puis vérifier une nouvelle connexion SSH avec la clé. Si elle échoue, revenir par console et corriger le fichier avant de continuer.

## 4. Installer les dépendances de Paymenter

La documentation officielle Paymenter indique Debian 13 comme système pris en charge. Elle documente les paquets PHP 8.3, MariaDB 10.11, NGINX et Redis ci-dessous. Ces instructions utilisent le dépôt Sury et le script de dépôt MariaDB ; vérifie leurs instructions de signature et le support de la suite Debian avant exécution. Les dépôts tiers sont des dépendances privilégiées qu'il faut inscrire dans l'inventaire.

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

Vérifier les binaires, modules et services :

```bash
php -v
php -m
php --ini
php-fpm8.3 -v
mariadb --version
redis-server --version
nginx -v
systemctl status php8.3-fpm mariadb redis-server nginx --no-pager
```

La documentation source indique PHP 8.3 et MariaDB 10.11 comme pile visée. Les versions réellement obtenues dépendent des dépôts actifs ; enregistrer la sortie des commandes dans l'inventaire.

## 5. Créer la base de données

Ouvrir MariaDB en local :

```bash
sudo mariadb
```

Dans le client MariaDB interactif, créer l'utilisateur et la base. Remplacer le mot de passe d'exemple par un secret généré et conservé dans un coffre. Cette valeur ne doit apparaître ni dans le dépôt, ni dans l'historique partagé, ni dans une capture.

```sql
CREATE USER 'paymenter'@'127.0.0.1' IDENTIFIED BY 'REMPLACER_PAR_UN_SECRET_FORT';
CREATE DATABASE paymenter;
GRANT ALL PRIVILEGES ON paymenter.* TO 'paymenter'@'127.0.0.1' WITH GRANT OPTION;
QUIT;
```

`WITH GRANT OPTION` figure dans la procédure d'installation Paymenter consultée. Il autorise le compte à déléguer ses privilèges : évaluer ce besoin pour la version utilisée et appliquer le moindre privilège possible si l'application fonctionne sans cette option.

Contrôler l'écoute puis tester l'authentification. La valeur `127.0.0.1` doit correspondre à `DB_HOST` dans le `.env`.

```bash
sudo ss -lntp | grep 3306
mariadb -h 127.0.0.1 -u paymenter -p paymenter
```

Dans l'invite SQL du compte applicatif, `SELECT 1;` doit réussir. Quitter le client avec `QUIT;`. MariaDB ne doit pas écouter sur une adresse publique.

Démarrer Redis et vérifier sa disponibilité locale :

```bash
sudo systemctl enable --now redis-server
redis-cli ping
sudo ss -lntp | grep 6379
```

Attendu : `PONG`. Vérifier l'adresse d'écoute ; le service ne doit pas être exposé à Internet. Le rôle exact de Redis (queue, cache ou sessions) se confirme dans la configuration Paymenter de la release choisie.

## 6. Installer Paymenter

La documentation officielle utilise l'archive de dernière release. Pour reproduire exactement un déploiement, noter la release effectivement téléchargée et remplacer `latest` par une version/tag explicite si la release fournit une URL immuable et une empreinte vérifiable.

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

Créer le fichier `.env` depuis le modèle de la release puis l'éditer :

```bash
cd /var/www/paymenter
sudo -u www-data cp .env.example .env
sudoedit .env
sudo chown www-data:www-data .env
sudo chmod 640 .env
```

Renseigner au minimum les valeurs correspondant à la base créée, et l'URL HTTPS réelle :

```dotenv
APP_ENV=production
APP_DEBUG=false
APP_URL=https://PANEL_FQDN_REEL
DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=paymenter
DB_USERNAME=paymenter
DB_PASSWORD=SECRET_DE_VOTRE_COFFRE
```

Ceci est un extrait : le fichier `.env.example` de la version téléchargée fait autorité pour les autres variables, notamment mail, cache, queue et session. Ne publie jamais le `.env` réel.

Depuis le répertoire d'installation, exécuter les commandes initiales documentées par Paymenter :

```bash
cd /var/www/paymenter
sudo -u www-data php artisan key:generate --force
sudo -u www-data php artisan storage:link
sudo -u www-data php artisan migrate --force --seed
sudo -u www-data php artisan db:seed --class=CustomPropertySeeder
sudo -u www-data php artisan app:init
sudo -u www-data php artisan app:user:create
```

`app:init` et `app:user:create` sont interactives. Créer un compte administrateur nominatif. La clé APP_KEY est utilisée pour protéger les données sensibles : sauvegarder sa valeur hors du serveur et indépendamment de la base. Sa perte rend les données chiffrées irrécupérables. Ne la régénérer jamais sur une instance déjà initialisée.

Après installation, vérifier le statut des migrations et la page d'administration depuis un navigateur sur HTTPS une fois NGINX configuré. Ne présenter aucune commande comme réussie tant que sa sortie n'a pas été observée.

### Scheduler

La documentation Paymenter demande un cron exécuté chaque minute sous `www-data` :

```bash
sudo crontab -u www-data -e
```

Ajouter cette ligne dans l'éditeur :

```cron
* * * * * php /var/www/paymenter/artisan schedule:run >> /dev/null 2>&1
```

Contrôler :

```bash
sudo crontab -u www-data -l
```

### Worker systemd

Créer l'unité `/etc/systemd/system/paymenter.service` :

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

Recharger systemd et démarrer le worker ainsi que Redis :

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now paymenter.service
sudo systemctl enable --now redis-server
systemctl status paymenter.service --no-pager
sudo journalctl -u paymenter.service -n 100 --no-pager
```

Vérifier que `/usr/bin/php` correspond au runtime utilisé par Paymenter (`command -v php`, `php -v`). Les jobs de provisionnement doivent être idempotents : un redémarrage du worker ou une relance ne doit pas dupliquer une VM.

## 7. Configurer NGINX

Créer `/etc/nginx/sites-available/paymenter.conf`. Remplacer `PANEL_FQDN_REEL` par le nom DNS réel. La racine web doit être `/var/www/paymenter/public`, jamais `/var/www/paymenter`.

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name PANEL_FQDN_REEL;
    root /var/www/paymenter/public;

    add_header X-Frame-Options "SAMEORIGIN";
    add_header X-Content-Type-Options "nosniff";

    index index.php;
    charset utf-8;

    location / {
        try_files $uri $uri/ /index.php?$query_string;
    }

    location ~ ^/index\\.php(/|$) {
        fastcgi_pass unix:/var/run/php/php8.3-fpm.sock;
        fastcgi_param SCRIPT_FILENAME $realpath_root$fastcgi_script_name;
        include fastcgi_params;
        fastcgi_hide_header X-Powered-By;
    }
}
```

Écrire le fichier dans `/etc/nginx/sites-available/paymenter.conf`, puis activer le site et tester la syntaxe avant de recharger NGINX :

```bash
sudo ln -s /etc/nginx/sites-available/paymenter.conf /etc/nginx/sites-enabled/paymenter.conf
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx
sudo chown -R www-data:www-data /var/www/paymenter
```

Le fichier de configuration ci-dessus correspond au virtual host HTTP documenté par Paymenter. Pour TLS, obtenir un certificat valide pour le FQDN contrôlé, puis configurer le serveur HTTPS selon le guide TLS de Paymenter/Certbot. Ne déclare pas HTTPS fonctionnel avant d'avoir testé la chaîne de certificat et le renouvellement.

Contrôles après configuration :

```bash
sudo nginx -t
systemctl status nginx php8.3-fpm --no-pager
curl -I http://PANEL_FQDN_REEL
curl -I https://PANEL_FQDN_REEL
curl -i https://PANEL_FQDN_REEL/.env
```

`PANEL_FQDN_REEL` est un placeholder de shell à remplacer. La requête vers `.env` ne doit jamais exposer son contenu. Les codes de retour observés et l'état TLS sont consignés comme preuve.

## 8. Pare-feu de la VM portail

Avant d'activer un pare-feu distant, confirmer le CIDR d'administration réel, garder une console de secours accessible et tester la connexion SSH avec une deuxième session. Remplacer `ADMIN_CIDR_REEL` par un CIDR valide avant d'exécuter. Le jeu de règles doit aussi être cohérent avec les pare-feux amont et le filtrage IPv6.

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

Après contrôle des règles et de l'accès de secours :

```bash
sudo ufw enable
sudo ufw status numbered
```

Ne pas ajouter de règle publique pour 3306, 6379 ou 8006. Si SSH est géré par un VPN, la règle 22 doit être limitée à l'adresse/réseau VPN correspondant.

## 9. Préparer Proxmox VE

Sur le nœud Proxmox, faire l'inventaire avant toute création ou modification :

```bash
pveversion -v
pvesh get nodes
pvesm status
qm list
ip -br address
ip route
pveum role list
pveum acl list
```

Vérifier dans l'interface/API Proxmox la version, les nœuds, la capacité du stockage, le bridge/VLAN client, l'accès hors bande, le certificat TLS et le pare-feu. Ne pas utiliser les noms `local-lvm`, `vmbr0`, `9000` ou `1001` sans confirmer qu'ils existent et sont disponibles.

### Créer le pool de clients

Le pool regroupe les VM et simplifie l'application des ACL. Choisir un identifiant absent de `pveum pool list` :

```bash
pveum pool list
pveum pool add vps-clients --comment "VM clientes provisionnees par Paymenter"
pveum pool list --poolid vps-clients
```

Ajouter le stockage et les VM au pool selon les options disponibles dans la version Proxmox (`pveum help pool modify`).

### Rôle et token API

Les privilèges requis ne peuvent pas être déterminés de manière fiable sans connaître les endpoints réellement appelés par l'extension Paymenter-Proxmox. Proxmox documente chaque permission nécessaire dans l'API Viewer. Commencer par identifier l'extension, sa version et son code/documentation, puis créer un rôle de moindre privilège à partir des endpoints réellement utilisés.

Le modèle suivant montre la syntaxe des commandes `pveum`, mais `PRIVILEGES_VALIDES` est volontairement à remplacer par une liste calculée et testée, non à copier littéralement :

```bash
pveum role add PaymenterProvisioner --privs "PRIVILEGE_1 PRIVILEGE_2"
pveum user add paymenter@pve --comment "Paymenter provisioning service"
pveum user token add paymenter@pve provisioning --privsep 1 --expire EPOCH_UNIX --comment "Paymenter API token"
```

Pour générer une expiration dans 180 jours :

```bash
date -d '+180 days' +%s
```

Recopier la valeur entière obtenue dans `--expire`. Le secret du token est présenté une seule fois lors de sa création : le conserver immédiatement dans un coffre, hors Git et hors journaux.

Les ACL Proxmox s'appliquent sur un chemin, à l'utilisateur ou au token. Les tokens à privilèges séparés ont besoin d'ACL explicites et leurs permissions effectives sont l'intersection avec celles de l'utilisateur. La commande `pveum acl modify` documentée utilise `--users` et `--tokens` ; garder les deux ACL ciblées sur les ressources nécessaires :

```bash
pveum acl modify /pool/vps-clients --users paymenter@pve --roles PaymenterProvisioner
pveum acl modify /pool/vps-clients --tokens 'paymenter@pve!provisioning' --roles PaymenterProvisioner
```

Ne pas attribuer `Administrator` sur `/`. Le rôle donné au template, au stockage et au bridge dépend des appels API utilisés ; accorder seulement les privilèges nécessaires sur les chemins correspondants après validation. Contrôler les droits effectifs :

```bash
pveum user permissions paymenter@pve --path /pool/vps-clients
pveum user token permissions paymenter@pve provisioning --path /pool/vps-clients
pveum acl list
```

Tester une lecture autorisée, une opération de création sur une VM jetable, puis vérifier qu'une opération hors du périmètre est refusée. Ne placer aucun secret API dans le `.env` public ni dans le dépôt.

### API TLS

L'API Proxmox est utilisée en HTTPS et son certificat doit être vérifié. Si le cluster utilise une CA privée, installer la CA publique correspondante dans le magasin de confiance Debian du portail, puis mettre à jour les CA. Ne pas désactiver la vérification TLS.

```bash
sudo install -m 0644 pve-root-ca.crt /usr/local/share/ca-certificates/pve-root-ca.crt
sudo update-ca-certificates
```

`pve-root-ca.crt` est un nom de fichier à remplacer par le certificat CA réellement exporté depuis le cluster. La commande d'appel API dépend du client choisi ; utiliser le format d'en-tête documenté Proxmox `Authorization: PVEAPIToken=USER@REALM!TOKENID=UUID`, sans mettre le UUID du token dans un historique shell ou un dépôt.

## 10. Créer le template Debian cloud-init

La documentation Proxmox recommande une image cloud-init puis sa conversion en template. Les commandes suivantes reprennent la procédure `qm` Proxmox : le VMID, le stockage, le bridge et l'image doivent être disponibles et confirmés. Télécharger depuis la source Debian et vérifier le checksum publié avant import.

```bash
cd /var/tmp
curl -fLO https://cloud.debian.org/images/cloud/trixie/latest/debian-13-genericcloud-amd64.qcow2
curl -fLO https://cloud.debian.org/images/cloud/trixie/latest/SHA512SUMS
sha512sum -c --ignore-missing SHA512SUMS
```

Choisir un VMID libre (exemple 9000), un stockage qui accepte les disques VM et le bridge réellement dédié aux clients. Les paramètres ci-dessous sont les valeurs de l'exemple du projet :

```bash
qm create 9000 --name tpl-debian13 --memory 1024 --cores 1 --ostype l26 --scsihw virtio-scsi-single --net0 virtio,bridge=vmbr1 --agent enabled=1 --serial0 socket --vga serial0
qm disk import 9000 debian-13-genericcloud-amd64.qcow2 local-lvm
qm config 9000
```

Lire `qm config 9000` et relever le volume de disque importé. L'attacher en remplaçant `VOLUME_IMPORTÉ` par cette valeur exacte ; ne devine pas le nom du volume :

```bash
qm set 9000 --scsi0 VOLUME_IMPORTÉ,discard=on
qm set 9000 --boot order=scsi0
qm set 9000 --ide2 local-lvm:cloudinit
qm set 9000 --serial0 socket --vga serial0
qm template 9000
```

La séquence `qm create`, `qm disk import`, `qm set` et `qm template` suit le modèle cloud-init Proxmox. Le volume et les paramètres du stockage varient selon le backend, d'où l'étape de lecture de `qm config` avant attachement. Ne convertis pas en template avant d'avoir validé le boot de l'image et l'installation/présence de cloud-init dans l'invité.

## 11. Créer et valider une VM de test

Choisir un VMID libre et une adresse réservée pour le réseau client. Créer un fichier contenant la clé **publique** SSH du testeur (jamais la clé privée), par exemple `/root/test-vps.pub`. Vérifier la VMID, le pool, le stockage et l'adressage avant clonage :

```bash
qm list
pveum pool list
pvesm status
```

Créer et configurer une VM de recette depuis le template. Les valeurs ci-dessous (VMID 1001, `local-lvm`, `vmbr1`, IP/gateway) sont à remplacer par celles réservées dans l'inventaire :

```bash
qm clone 9000 1001 --name vps-test-0001 --pool vps-clients --full 1 --storage local-lvm
qm set 1001 --tags order-test-0001 --cores 2 --memory 2048 --ciuser debian --sshkeys /root/test-vps.pub --ipconfig0 ip=10.20.0.50/24,gw=10.20.0.1 --nameserver 10.20.0.1 --net0 virtio,bridge=vmbr1,firewall=1
qm resize 1001 scsi0 20G
qm config 1001
qm start 1001
qm status 1001
```

Valider depuis la console Proxmox ou par SSH que cloud-init a configuré l'utilisateur, la clé, le hostname et le réseau. Confirmer qu'aucune VM ne peut joindre les réseaux d'administration, les services du portail ou les autres VPS.

Après avoir vérifié qu'il s'agit bien de la VM jetable et qu'elle ne contient aucune donnée à conserver, arrêter/supprimer cette seule VM de test :

```bash
qm config 1001
qm shutdown 1001 --timeout 60
qm status 1001
```

La suppression est irréversible. Seulement après confirmation visuelle de l'ID et de l'état de test :

```bash
qm destroy 1001 --purge 1
```

Ne jamais copier ces commandes avec un VMID de production.

## 12. Provisionnement depuis Paymenter

Le scénario cible est :

1. Le client passe commande ; Paymenter attend la confirmation de paiement.
2. Le prestataire envoie son webhook HTTPS signé.
3. Paymenter vérifie signature, identifiant et fraîcheur de l'événement.
4. Une tâche idempotente, liée à l'identifiant de commande, est créée.
5. L'extension valide l'offre, les quotas, le template, le pool, le stockage et le réseau autorisés.
6. Elle recherche une VM déjà étiquetée avant tout retry, clone le template et configure cloud-init.
7. Elle démarre la VM et vérifie son état avant d'activer le service dans Paymenter.
8. L'accès est remis au client par clé SSH ou mécanisme de secret unique.

Paymenter expose des hooks d'extension serveur, mais le nom et la compatibilité de l'extension Proxmox du projet doivent être renseignés à partir du code réellement retenu. Ne présente pas les commandes `qm` de test comme une automatisation Paymenter. La mise en production exige de tester paiement refusé, accepté, webhook rejoué/invalide, API indisponible, worker arrêté et absence de VM double.

## 13. Sauvegarder et restaurer

Sauvegarder au minimum la base MariaDB, le `.env`, les données de l'application et l'APP_KEY. La clé privée de chiffrement des archives doit rester hors serveur. La copie de sauvegarde doit être hors hôte ; une sauvegarde locale seule ne couvre pas la panne du serveur.

Le dossier fournit un exemple `age`. Installer l'outil, remplacer le destinataire par une véritable clé publique de sauvegarde et vérifier les chemins de données de la release installée. Ne pas utiliser le placeholder comme s'il s'agissait d'une clé valide.

```bash
sudo apt install -y age
umask 077
STAMP=$(date +%F-%H%M)
DEST=/var/backups/paymenter
RECIPIENT=REMPLACER_PAR_LA_CLE_PUBLIQUE_AGE
sudo install -d -m 0700 "$DEST"
sudo mariadb-dump --single-transaction --routines --triggers paymenter \
  | gzip \
  | age -r "$RECIPIENT" -o "$DEST/db-$STAMP.sql.gz.age"
sudo tar -C /var/www/paymenter -czf - .env storage/app \
  | age -r "$RECIPIENT" -o "$DEST/files-$STAMP.tar.gz.age"
```

Adapter la destination, les droits et l'exclusion/rétention avant planification ; transférer ensuite les archives vers une cible distincte. Pour restaurer, créer une VM isolée de laboratoire, déchiffrer avec la clé privée conservée hors hôte, restaurer vers une base de test, rétablir les fichiers et la même APP_KEY, puis valider le portail. Garder le worker et les paiements de production désactivés durant l'essai. Consigner la durée, les erreurs et les étapes manuelles ; seuls ces résultats mesurent le RPO/RTO.

## 14. Pare-feu et tests de sécurité

Les essais réseau se font depuis une VM jetable autorisée, vers les adresses de l'infrastructure sous contrôle. Remplacer toutes les adresses d'exemple par le plan réel :

```bash
ping -c 2 CLIENT_GATEWAY_REEL
nc -vz -w 3 PVE_IP_GESTION_REELLE 8006
nc -vz -w 3 PVE_IP_GESTION_REELLE 22
nc -vz -w 3 PORTAIL_IP_REELLE 3306
nc -vz -w 3 PORTAIL_IP_REELLE 6379
curl -I https://deb.debian.org
```

Attendus selon le plan : passerelle et sorties prévues accessibles ; Proxmox, SSH d'administration, bases, Redis et autres clients inaccessibles depuis le réseau VPS. Tester IPv6 séparément s'il est configuré. Enregistrer source, destination, date et résultat, sans publier d'adresse publique sensible.

Ne pas activer une politique globale Proxmox/routeur sans console hors bande, règles d'administration vérifiées, procédure de retour arrière et tests en lab. Les règles de pare-feu dépendent de la topologie ; un bloc générique peut couper l'accès au nœud ou laisser passer IPv6.

## 15. Diagnostic et exploitation

Commandes de diagnostic sur la VM portail :

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

| Symptôme | Vérifications initiales |
| --- | --- |
| NGINX 502 | État PHP-FPM, socket `php8.3-fpm.sock`, droits et journaux |
| Connexion SQL refusée | MariaDB, DB_HOST, compte, privilèges, mot de passe |
| Erreur de déchiffrement | APP_KEY sauvegardée ; ne jamais générer une nouvelle clé pour remplacer l'ancienne |
| Provisionnement bloqué | Webhook, queue, worker, extension, API, ACL, stockage et template ; rechercher d'abord une VM existante |
| VM sans réseau | Bridge/VLAN, cloud-init, IP, route, DNS, pare-feu invité/amont |
| Certificat expiré | DNS, timer de renouvellement et test de renouvellement Certbot |

Avant une mise à jour, vérifier les avis de sécurité, versions candidates, espace disque et sauvegarde restaurable. Tester sur clone, puis vérifier web, base, Redis, scheduler, worker, paiement sandbox et intégration API. Ne pas mélanger une mise à jour système et une migration majeure de Paymenter.

## 16. Recette et preuves

Les statuts sont initialement **Non testé** dans le dossier technique. Les remplacer uniquement par le résultat observé et une preuve expurgée.

| Test | Résultat attendu | Statut initial |
| --- | --- | --- |
| Portail HTTPS | Certificat valide et redirection HTTP cohérente | Non testé |
| Paiement refusé | Aucune VM créée | Non testé |
| Paiement accepté | Une seule VM liée à la commande | Non testé |
| Webhook rejoué | Aucun doublon | Non testé |
| Webhook invalide | Rejeté, aucune tâche de provisionnement | Non testé |
| API Proxmox indisponible | Échec explicite, aucune VM active orpheline | Non testé |
| Worker redémarré | Tâche reprise sans duplication | Non testé |
| Proxmox depuis Internet | Inaccessible | Non testé |
| Isolation client | Gestion et autres VPS inaccessibles | Non testé |
| Restauration | Portail de test utilisable avec APP_KEY correspondante | Non testé |

Pour chaque cas, noter les préconditions, la commande ou les étapes, l'attendu, l'observé, l'heure, le résultat, la preuve expurgée et l'anomalie éventuelle. Masquer les secrets, tokens, adresses IP publiques, données de paiement et informations personnelles.

## Références techniques

- [Documentation d'installation de Paymenter](https://paymenter.org/docs/installation/install)
- [Configuration du serveur web NGINX Paymenter](https://paymenter.org/docs/installation/webserver)
- [Commandes CLI Paymenter](https://paymenter.org/docs/guides/cli)
- [Gestion des utilisateurs et permissions Proxmox VE](https://pve.proxmox.com/wiki/User_Management)
- [Support Cloud-Init Proxmox VE](https://pve.proxmox.com/wiki/Cloud-Init_Support)
- [Manuel `pveum`](https://pve.proxmox.com/pve-docs/pveum.1.html)
- [Extensions serveur Paymenter](https://paymenter.org/development/extensions/server)
