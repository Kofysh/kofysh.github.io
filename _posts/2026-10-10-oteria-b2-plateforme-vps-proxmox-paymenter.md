---
title: Plateforme VPS sécurisée et automatisée sur Proxmox VE — documentation complète
date: 2026-10-10 18:48:00 +0200
categories: [Cybersécurité, Homelab]
tags: [OTERIA, Proxmox, Paymenter, VPS, Debian 13, NGINX, Linux, cybersécurité]
description: >-
  Documentation détaillée de mon projet individuel de Bachelor 2 OTERIA : concevoir,
  déployer, sécuriser et tester une plateforme de vente de VPS automatisée avec Paymenter
  et Proxmox VE.
---

## Présentation du projet

Ce projet individuel de Bachelor 2 cybersécurité à OTERIA porte sur la conception d'une plateforme d'hébergement de VPS sécurisée et automatisée. Le dossier technique v2.0, daté du 10 octobre 2026, décrit comment transformer un serveur Proxmox VE en plateforme de vente : le client commande et paie depuis Paymenter, puis une machine virtuelle QEMU/KVM est créée sans intervention manuelle.

Le périmètre est volontairement limité aux VPS sous forme de machines virtuelles. Paymenter est installé directement sur Debian 13, sans Docker, avec NGINX, PHP-FPM, MariaDB et Redis. Proxmox héberge les VM clientes et est joint par son API uniquement depuis un chemin d'administration privé.

Le projet couvre l'architecture, la préparation du système, le déploiement de l'application, l'intégration Proxmox, l'isolation réseau, la sauvegarde, la supervision, les incidents et la recette. Les serveurs de jeux et le provisionnement LXC sont exclus tant qu'une extension n'est pas identifiée, versionnée et testée.

## Objectifs et principes

La vente manuelle d'un VPS consiste à créer une VM, appliquer les ressources de l'offre, régler son réseau puis transmettre les accès. Répéter ces opérations à la main augmente les risques d'oubli, de doublon et de mauvaise configuration. Automatiser améliore la reproductibilité, mais rend les contrôles du paiement et les privilèges de l'API Proxmox particulièrement sensibles.

Quatre principes structurent le projet :

1. Le paiement est l'unique déclencheur du provisionnement. Une page de retour navigateur n'est pas une preuve de paiement ; la notification serveur à serveur doit être authentifiée.
2. Proxmox reste privé. L'application utilise un token dédié, aux privilèges minimaux, sur un réseau de gestion inaccessible aux clients et à Internet.
3. Les opérations sont idempotentes. Une notification ou une tâche rejouée ne doit jamais créer une seconde VM pour la même commande.
4. Toute affirmation doit être étayée. Une procédure écrite n'est pas une preuve d'exécution ; les résultats sont marqués réussi, partiel, échoué ou non testé.

## Périmètre et limites

| Inclus | Hors périmètre à ce stade |
| --- | --- |
| VPS sous forme de VM QEMU/KVM | Provisionnement automatisé de conteneurs LXC |
| Paymenter installé directement sur Debian 13 | Serveurs de jeux et offres non documentées |
| Intégration de l'API Proxmox par token dédié | Extension dont la compatibilité n'a pas été vérifiée |
| Templates cloud-init et réseau client isolé | Garantie de disponibilité ou de capacité non mesurée |
| Sauvegarde, supervision et plan de recette | Mise en production avant validation des tests |

Le choix de VM plutôt que de conteneurs est motivé par l'isolation : une VM possède son noyau, tandis qu'un conteneur LXC partage celui de l'hôte. Lorsqu'un client dispose des privilèges root dans son système, le noyau dédié réduit le risque qu'une compromission affecte l'hyperviseur ou d'autres locataires. Cela ne supprime pas les risques de configuration ou de vulnérabilité.

Les valeurs d'adressage, les noms d'hôtes, les domaines, les identifiants de VM, les pools et les stockages cités dans les procédures détaillées sont des exemples. Ils doivent être remplacés par les valeurs réelles après inventaire. Aucun secret réel n'est publié dans cet article.

## Architecture d'ensemble

Le navigateur résout le nom DNS du portail et ouvre une session HTTPS vers NGINX. NGINX transmet les requêtes dynamiques à PHP-FPM au moyen d'une socket Unix. Paymenter utilise MariaDB et Redis en local. Un worker systemd traite les tâches asynchrones, dont le provisionnement. Seul ce composant doit joindre l'API Proxmox, par le réseau d'administration privé.

| Zone | Composants | Exposition prévue |
| --- | --- | --- |
| Frontal | NGINX et TLS | HTTPS public sur 443 ; HTTP peut servir à la redirection et au renouvellement des certificats |
| Application | Paymenter, PHP-FPM, worker, MariaDB, Redis | Services applicatifs et bases en loopback ; pas d'accès public direct |
| Gestion | API Proxmox, SSH et hyperviseur | Réseau d'administration ou VPN uniquement |
| Clients | VM VPS QEMU/KVM | Bridge ou VLAN client dédié, séparé du plan de gestion |
| Sauvegardes | Cible distincte de l'hôte | Accessible aux composants autorisés ; jamais aux VM clientes |

La règle générale est qu'un seul flux entre depuis Internet : HTTPS vers le frontal. Le prestataire de paiement envoie son webhook au portail par ce même point d'entrée. MariaDB, Redis, SSH et l'API Proxmox ne doivent pas être ouverts à Internet. Les clients VPS ne doivent pas pouvoir joindre l'interface Proxmox, le portail de gestion, les bases de données ou les autres locataires.

Une segmentation utile doit être décrite avec les VLAN, bridges, routes, règles, plages IPv4 et IPv6 réellement en place. Un schéma générique ne remplace pas l'inventaire. IPv6 doit être traité explicitement : un filtrage correct en IPv4 ne protège pas automatiquement une interface joignable en IPv6.

## Flux réseau

| Source | Destination | Flux attendu | Contrôle principal |
| --- | --- | --- | --- |
| Client Internet | NGINX | HTTPS 443 | TLS, durcissement HTTP, limitation de débit/WAF si déployé |
| Prestataire de paiement | NGINX | Webhook HTTPS | Signature, identifiant d'événement, fraîcheur et traitement des doublons |
| NGINX | PHP-FPM | Socket Unix | Répertoire public uniquement et droits de socket maîtrisés |
| Paymenter | MariaDB | TCP local ou socket | Compte dédié, droits limités à la base de l'application |
| Paymenter | Redis | TCP local | Écoute loopback, rôle défini et aucun accès public |
| Worker | API Proxmox | HTTPS 8006 privé | Token à privilèges limités, certificat vérifié, pare-feu et ACL |
| VM cliente | Réseau de gestion | Aucun flux | Absence de route et filtrage inter-zones |
| VM cliente | Autres VM clientes | Aucun flux par défaut | Isolation réseau et pare-feu |

Si un reverse proxy distinct se trouve devant Paymenter, le backend ne doit accepter que les connexions nécessaires venant de ce frontal et ne doit faire confiance aux en-têtes `X-Forwarded-*` que depuis son adresse. Les règles exactes sont à adapter à l'architecture réelle.

## Choix techniques

| Besoin | Choix retenu | Justification et limite |
| --- | --- | --- |
| Portail de commande | Paymenter | Gère portail, catalogue, commandes, factures et paiements ; les capacités exactes dépendent de la version et des extensions |
| Système du portail | Debian 13 | Base système maintenue ; ses paquets et leur compatibilité doivent être inventoriés |
| Serveur web | NGINX et PHP-FPM | Sépare le frontal de l'exécution PHP ; seul `public` est publié |
| Base de données | MariaDB | Utilisateur dédié et écoute locale lorsque la base est sur la même VM |
| Files/cache | Redis | Exécution asynchrone et cache selon la configuration réelle de Paymenter |
| Hyperviseur | Proxmox VE | Machines virtuelles, API, pools, ACL et tokens |
| Isolation locataire | QEMU/KVM | Noyau distinct par VM ; les règles réseau et d'hôte restent nécessaires |
| Personnalisation VM | cloud-init et clé SSH | Identité unique au clonage ; pas de mot de passe commun intégré au template |
| Chiffrement web | TLS avec certificat reconnu | Renouvellement contrôlé et testé |
| Sauvegarde | Copie chiffrée hors hôte | Une sauvegarde n'est considérée valide qu'après restauration d'essai |

Les versions indiquées dans le dossier sont des références, pas nécessairement des versions installées : Paymenter v1.5.9, Debian 13.7, PHP 8.3, MariaDB 10.11 et Proxmox VE 9.2 en référence. L'annexe d'inventaire doit contenir les sorties réellement constatées (`cat /etc/debian_version`, `php -v`, `mariadb --version`, `nginx -v`, `redis-server --version`, `pveversion -v`, ainsi que la version de l'extension). Le tag déployé doit être épinglé ; une URL `latest` peut désigner une autre version ultérieurement.

Debian 13 fournit ses propres versions de composants. Le dossier étudie des dépôts tiers pour certaines versions précises ; chaque dépôt supplémentaire augmente la surface de confiance et de maintenance. Il faut vérifier l'empreinte de la clé, la suite Debian prise en charge et les versions candidates, puis limiter les dépôts au strict nécessaire.

## Préparer Debian

Le serveur Paymenter est une VM dédiée. Avant l'installation applicative, l'inventaire comprend le nom d'hôte, l'adresse et la route, le DNS, l'heure, l'espace disque, les services en écoute et l'état des unités systemd. Le dimensionnement CPU/RAM/disque est choisi selon la charge, puis validé par mesure plutôt que présenté comme une capacité garantie.

Le système est mis à jour avant le déploiement. Un compte opérateur nominatif reçoit une clé SSH publique. La connexion directe de root et l'authentification SSH par mot de passe sont désactivées seulement après validation d'une seconde session par clé et vérification de la console de secours. Une erreur de pare-feu ou de SSH ne doit pas rendre l'administration irrécupérable.

Commandes d'observation à adapter à l'environnement :

```bash
cat /etc/debian_version
hostnamectl
ip -br address
ip route
systemctl --failed
ss -lntup
journalctl -p err -b --no-pager
```

Le résultat est conservé comme état initial, expurgé des adresses et informations sensibles si le document est partagé. Les erreurs sont analysées avant de poursuivre ; une commande qui s'exécute sans erreur ne suffit pas à démontrer que la configuration est correcte.

### Dépôts et dépendances

Chaque dépôt tiers doit être traité comme une dépendance exécutée avec des privilèges élevés. La clé est stockée dans un trousseau dédié et référencée avec `Signed-By`, son empreinte est comparée à la source officielle, et la suite Debian prise en charge est vérifiée. Il faut éviter d'ajouter plusieurs dépôts concurrents pour un même composant.

La pile applicative inclut PHP-FPM et les extensions requises par Paymenter, MariaDB, Redis et Composer. La liste exacte d'extensions est comparée au fichier `.env.example` et à la documentation de la version déployée. Le cron, le worker et les requêtes web doivent utiliser le même runtime PHP.

Les vérifications portent sur la version, les modules chargés, la configuration active, le socket PHP-FPM, l'état des services et les ports d'écoute. Les réglages PHP de départ (limite mémoire, tailles d'upload et durée d'exécution) sont ajustés à l'usage, cohérents avec la limite NGINX et consignés.

### MariaDB et Redis

MariaDB est configurée pour écouter uniquement sur loopback lorsque Paymenter réside sur la même machine. La base utilise `utf8mb4`. Le compte d'application est distinct du compte d'administration, avec des privilèges limités à la base Paymenter et une connexion locale. Le secret est généré aléatoirement, conservé dans un coffre, saisi sans l'inscrire à l'historique du shell, et exclu des captures.

Redis est lui aussi limité à loopback. Son rôle (queue, cache ou sessions) doit être déterminé à partir de la configuration de la version utilisée avant de modifier les pilotes. Si une base ou Redis devient distant, il faut ajouter filtrage réseau, authentification/ACL et chiffrement adaptés ; une écoute ouverte sur Internet est exclue.

Les contrôles incluent la version du serveur, l'adresse d'écoute, le test de connexion depuis le portail et les journaux du service. Pour Redis, `PING` doit renvoyer `PONG` dans les conditions prévues.

## Déployer Paymenter

La release choisie est téléchargée depuis une URL versionnée, vérifiée et consignée. Le répertoire applicatif appartient au compte de service approprié. Seul le sous-répertoire `public` est exposé par NGINX ; le code source, `.env`, les caches et les sauvegardes restent hors de portée HTTP.

Le fichier `.env` est créé à partir de `.env.example`, puis configuré avec les valeurs réelles. En production, le mode debug est désactivé et l'URL canonique est en HTTPS. Les variables de base, de file, de cache, de session et de courrier sont vérifiées pour la version déployée. Les mots de passe et clés sont fournis depuis le coffre, jamais copiés dans ce billet.

L'APPKEY est générée une fois et sauvegardée séparément, de manière chiffrée. Sa perte peut rendre certaines données illisibles même après restauration de la base. Elle ne doit pas être régénérée pendant un dépannage normal. Les migrations de base sont précédées d'une sauvegarde cohérente, et leur résultat est contrôlé.

La procédure comprend ensuite la création du compte administrateur nominatif, la configuration du scheduler et l'installation du worker queue sous systemd. Les options du worker sont validées contre la version Laravel/Paymenter utilisée. Un worker qui redémarre sans contrôle peut rejouer des tâches ; l'idempotence métier reste donc indispensable.

| Composant | Rôle | Conséquence d'un arrêt |
| --- | --- | --- |
| NGINX/PHP-FPM | Sert le portail et reçoit les webhooks | Portail et notifications indisponibles |
| MariaDB | Stocke commandes, clients et factures | Application inutilisable |
| Redis | Queue, cache ou sessions selon configuration | Tâches ou sessions affectées selon son rôle |
| Worker | Consomme les tâches asynchrones | Commandes payées susceptibles de rester en attente |
| Scheduler | Lance les tâches planifiées | Tâches périodiques retardées |

Le compte de service ne doit pas avoir de privilèges inutiles. Les droits de fichiers sont aussi restreints que possible ; `777` est évité. Les erreurs du worker et les tâches bloquées sont surveillées.

## NGINX et TLS

NGINX sert le répertoire public de Paymenter et transmet le contrôleur frontal à PHP-FPM. Le serveur renvoie les routes applicatives vers `index.php`, refuse les fichiers cachés et n'exécute pas arbitrairement d'autres scripts PHP déposés dans `public`. La limite de corps de requête est cohérente avec la configuration PHP.

Le certificat est émis pour le nom DNS réellement configuré, puis son renouvellement est testé. La redirection HTTP vers HTTPS, la chaîne de certificat, les en-têtes de sécurité et le refus des fichiers sensibles sont vérifiés. HSTS est activé progressivement après validation du HTTPS, car une mauvaise durée ou un mauvais périmètre peut rendre l'accès difficile à corriger côté navigateur.

Contrôles indicatifs après configuration :

```bash
nginx -t
systemctl status nginx php8.3-fpm --no-pager
curl -I https://panel.example.net
curl -I http://panel.example.net
curl -s -o /dev/null -w '%{http_code}\n' https://panel.example.net/.env
```

`panel.example.net` est un nom fictif d'exemple. Les tests doivent employer le domaine autorisé et les résultats réels. Le fichier `.env` doit être refusé. Une réponse 200/302 sur le portail et une redirection HTTP ne prouvent pas à elles seules que les routes de paiement et l'application fonctionnent.

## Pare-feu et exposition

La politique de l'hôte suit le refus par défaut pour les flux entrants, puis autorise seulement les services nécessaires. HTTPS est public. SSH est autorisé depuis le réseau d'administration. MariaDB, Redis et l'API Proxmox ne sont pas publiés. Le filtrage est contrôlé à plusieurs niveaux : routeur, système, Proxmox, VM invitée et IPv6.

Avant activation d'une politique susceptible de couper l'accès, vérifier le CIDR, garder une session de secours et confirmer l'accès console. Les règles proposées dans le document sont des exemples et ne doivent pas être copiées sans correspondance avec l'adressage réel. Une règle erronée peut verrouiller l'opérateur ou exposer un service.

Le contrôle externe est effectué depuis une source autorisée, vers des systèmes contrôlés. Il vérifie les ports attendus et les ports qui doivent rester fermés. Un scan ponctuel ne constitue pas une preuve complète ; il est recoupé avec les règles effectives et les journaux. Le contrôle IPv6 est séparé.

## Intégrer Proxmox

Proxmox est l'actif le plus sensible : un accès API trop large peut permettre de contrôler les VM et les ressources de l'hôte. L'inventaire préalable relève la version, les nœuds, les pools, les stockages, les bridges, les templates, le certificat, le pare-feu et les sauvegardes.

Un utilisateur et un token API dédiés à Paymenter sont créés avec séparation de privilèges. Les ACL de l'utilisateur et du token doivent être comprises comme configurées dans Proxmox. Les permissions sont limitées au pool client, au template, au stockage et au réseau nécessaires. Les privilèges envisagés (allocation, clonage, audit, gestion d'alimentation, configuration CPU/mémoire/disque/réseau/cloud-init et allocation de stockage) doivent être ajustés aux appels réellement effectués par l'extension, puis testés. Aucun rôle d'administration globale n'est attribué.

Le secret du token n'est affiché qu'à la création. Il est placé immédiatement dans le coffre et n'apparaît ni dans une commande partagée, ni dans un journal, ni dans un rapport. La connexion API utilise HTTPS et vérifie le certificat Proxmox ; désactiver la vérification TLS n'est pas une solution.

Le test progresse du plus petit privilège : appel de lecture, puis VM jetable, puis vérification qu'une opération interdite est bien refusée. Le nom, la source, la version et les limites de l'extension Paymenter-Proxmox sont documentés. Sa compatibilité avec Paymenter v1.5.9 et la version de Proxmox est à confirmer expérimentalement.

## Templates et cloud-init

Le template est une image de référence clonée pour les clients. Toute donnée présente dans le template risque d'être reproduite. Avant sa conversion, il est mis à jour et assaini : comptes provisoires, historiques, clés privées, secrets, identifiants machine et données temporaires sont supprimés selon une procédure adaptée à l'image.

L'image téléchargée est vérifiée à l'aide de la somme publiée par sa source. cloud-init fournit une identité unique : nom d'hôte, configuration réseau et clé SSH publique du client. Aucun mot de passe root commun n'est intégré à toutes les VM. Le disque, le stockage, le nombre de CPU, la mémoire et les options de démarrage suivent les offres et les quotas validés.

Le bridge client est le seul réseau sélectionnable par le provisionnement. Le réseau d'administration n'est jamais proposé au client. Les valeurs du template, du stockage et du bridge dans le dossier sont des exemples à remplacer après inventaire Proxmox.

## Provisionnement idempotent

Le flux de création se déclenche après validation serveur du paiement, jamais depuis le seul retour navigateur. Le webhook est vérifié (signature, identifiant et fraîcheur), puis la commande et l'offre sont validées. Une clé de tâche stable dérivée de la commande empêche les notifications répétées de produire plusieurs opérations.

Avant de cloner, le worker vérifie si une VM est déjà liée ou marquée par un tag associé à la commande. Les paramètres du client sont validés et traduits vers des valeurs internes autorisées. Le clone est créé dans le pool, reçoit les ressources et la configuration cloud-init, est attaché au réseau client, puis démarré. L'état réel de la VM est contrôlé avant d'activer le service et de communiquer les informations d'accès.

Le task ID Proxmox, le VMID, l'identifiant de commande et l'étape en cours sont consignés sans secret. En cas de timeout, l'appel peut avoir abouti côté hyperviseur ; la VM et la tâche sont recherchées avant toute relance. Les échecs de quota, stockage, API ou démarrage doivent produire un état clair, une alerte et une procédure de reprise. Aucune erreur ne doit laisser une VM active mais non suivie ou non facturée.

| Événement | Réponse attendue |
| --- | --- |
| Signature invalide | Rejet journalisé, aucune tâche ni VM |
| Webhook en doublon | Réponse idempotente, aucun clone supplémentaire |
| Paiement refusé | Aucun provisionnement |
| Timeout API | Recherche de la VM/tâche avant retry |
| Stockage plein | Erreur explicite, aucune activation silencieuse |
| VM qui ne démarre pas | Service non activé, alerte et diagnostic |
| Envoi des accès en échec | Réessai sécurisé, aucun mot de passe en clair dans les logs |

Les accès sont remis à l'aide de la clé SSH publique du client ou d'une procédure de secret unique protégée. Le mot de passe root en clair ne doit pas être écrit dans les journaux ou partagé sans canal sécurisé.

## Isolation réseau des VPS

Le plan client est séparé du plan de gestion par bridge/VLAN, routes et règles de pare-feu. Le pare-feu de l'hyperviseur, les filtres par VM et les protections contre l'usurpation d'adresse MAC/IP se complètent. Les règles IPv4 et IPv6 sont cohérentes avec les services réellement fournis.

Les tests d'isolation se font depuis une VM jetable et avec autorisation. Ils vérifient que la passerelle et les destinations permises sont accessibles, tandis que Proxmox, SSH de gestion, MariaDB, Redis et les autres locataires ne le sont pas. La sortie Internet est contrôlée selon la politique retenue. Les résultats, l'heure, la source et la destination sont enregistrés ; les adresses publiques sont expurgées dans le compte rendu destiné à être partagé.

L'activation globale d'un pare-feu Proxmox peut modifier la politique d'entrée de l'hôte. Elle ne se fait qu'après vérification de la console hors bande, des règles d'administration et de la procédure de retour arrière. Les extraits de règles du dossier ne sont pas une configuration universelle.

## Sauvegardes et restauration

La sauvegarde du portail inclut la base de données, les données de service, les personnalisations et la configuration nécessaire à la reprise. L'APPKEY est sauvegardée séparément et chiffrée. Les sauvegardes des VM clientes constituent un volet différent, par exemple avec la stratégie vzdump retenue sur l'infrastructure.

Les sauvegardes sont chiffrées, copiées hors de l'hôte et protégées par des droits d'accès limités. La fréquence, la rétention, la destination secondaire et la procédure de suppression sont documentées. Les objectifs RPO (perte de données tolérée) et RTO (temps de reprise) ne sont pas des garanties avant d'être mesurés.

Une restauration est testée dans un environnement isolé sans accès aux paiements, courriels ou réseaux clients de production. La base est restaurée avec l'APPKEY correspondante ; le compte et le catalogue de test sont vérifiés. Le worker reste arrêté jusqu'à validation pour éviter des tâches ou notifications réelles. La durée, les étapes manuelles, les données manquantes et les anomalies sont consignées. La restauration n'est déclarée réussie qu'après ce test.

## Journaux et supervision

La supervision couvre la disponibilité HTTPS, l'expiration du certificat, NGINX, PHP-FPM, MariaDB, Redis, le worker, la file des tâches, le CPU, la mémoire, l'espace disque, le stockage Proxmox et le résultat de la dernière sauvegarde. Les alertes minimales concernent un service arrêté, un worker silencieux, un disque saturé, des échecs répétés ou un certificat proche de l'expiration.

Les journaux doivent permettre de relier une commande à une tâche et à une VM par un identifiant de corrélation, sans enregistrer de secrets, de corps complet de webhook, de mot de passe ou de données de paiement. L'accès et la rétention des journaux sont limités. Une alerte est réellement testée puis l'état nominal est rétabli.

## Secrets et comptes

L'APPKEY, les mots de passe SQL, les clés de paiement, le secret du webhook, le token Proxmox, les identifiants SMTP, les clés SSH privées et les certificats privés restent dans un coffre ou un fichier protégé hors Git. Les fichiers `.env`, dumps, clés, archives de sauvegarde et exports sont exclus du dépôt. `.env.example` contient uniquement des valeurs fictives.

Les comptes sont nominatifs, dotés des permissions minimales, protégés par MFA lorsque disponible et revus périodiquement. Les accès temporaires sont révoqués. Les commits et livrables sont contrôlés pour détecter les secrets ; en cas de fuite, la priorité est de révoquer/faire tourner le secret, puis d'analyser et nettoyer le dépôt.

Les scripts opérationnels doivent annoncer leurs prérequis, privilèges, effets de bord et opérations destructrices. Ils doivent valider les entrées, produire des erreurs utiles et être rejouables sans effet inattendu.

## Analyse des menaces

| Scénario | Actifs concernés | Mesures de réduction du risque |
| --- | --- | --- |
| Compromission du panel | Application, clients, factures, APPKEY | Mises à jour, MFA si disponible, comptes nominatifs, TLS, administration restreinte |
| Webhook forgé ou rejoué | Paiement et provisionnement | Validation de signature, identifiant, fraîcheur, idempotence |
| Token trop permissif ou divulgué | API Proxmox et VM | Moindre privilège, pool dédié, expiration, rotation et révocation |
| Interface Proxmox exposée | Hyperviseur | API privée/VPN, pare-feu, absence de route publique |
| Isolation insuffisante | Réseau de gestion et autres clients | Segmentation, règles Proxmox, filtres MAC/IP, tests |
| Template compromis | Toutes les VM clonées | Source vérifiée, assainissement, mises à jour et contrôle |
| Sauvegarde inutilisable | Continuité du service | Chiffrement, copie hors hôte, exercice de restauration |
| Erreur opérateur | Tous les composants | Console de secours, procédures, revue de changement, preuve |

Le risque résiduel comprend les pannes matérielles, les coupures réseau/électriques, les vulnérabilités inconnues, la saturation et les dépendances tierces. Le projet documente les risques réels et les limites au lieu de prétendre les supprimer.

## Mises à jour et retour arrière

Les mises à jour corrigent des vulnérabilités mais peuvent provoquer des incompatibilités. Avant une fenêtre de maintenance : lire les avis, relever les versions candidates, vérifier les sauvegardes et l'espace disque, préparer un retour arrière et tester sur un clone si possible. Une mise à jour système ne doit pas être mélangée à une migration majeure de Paymenter.

Après mise à jour, vérifier les versions, les unités systemd, les journaux, PHP, la base, Redis, NGINX, le scheduler, le worker, Paymenter et l'accès API. En cas d'échec, privilégier une restauration cohérente à une rétrogradation hasardeuse de paquets. Chaque changement porte une date, une raison, une sauvegarde préalable et un résultat post-changement.

## Incidents et dépannage

En incident, préserver d'abord les journaux et établir l'heure, l'impact et les systèmes concernés. Contenir ensuite : isoler un composant compromis ou révoquer immédiatement un token soupçonné. Restaurer depuis un état connu après contrôle. Le compte rendu contient une chronologie, la cause, l'impact, les preuves et les mesures préventives, avec données personnelles expurgées.

| Symptôme | Vérifications prioritaires |
| --- | --- |
| NGINX retourne 502 | PHP-FPM, socket, droits, chemin et version PHP, journaux |
| Erreur SQL | MariaDB, adresse/port, compte, privilèges et configuration de connexion |
| Données chiffrées illisibles | Vérifier l'APPKEY correspondante ; ne jamais en générer une nouvelle pour remplacer l'ancienne |
| Provisionnement bloqué | Paiement, webhook, queue, worker, token, ACL, extension, template et stockage ; rechercher une VM avant un retry |
| VM sans réseau | Bridge/VLAN, cloud-init, IP, route, DNS, pare-feu invité et règles amont |
| Worker arrêté | Unité et journaux systemd, runtime PHP, Redis et tâche en cours avant redémarrage |
| Certificat expiré | Timer de renouvellement, test certbot, DNS et accessibilité HTTP requise |

Ces vérifications sont un point de départ. Toute action destructive (suppression d'une VM, de données ou d'une file) nécessite une identification certaine de la ressource et une validation des commandes et dépendances.

## Exploitation régulière

| Fréquence | Contrôles proposés |
| --- | --- |
| Quotidienne | Alertes, erreurs worker, disque, disponibilité, tâches de provisionnement échouées |
| Hebdomadaire | Sauvegardes, capacité, journaux, jobs en échec, nouveaux comptes, mises à jour importantes |
| Périodique | ACL et expiration des tokens, certificats, versions, règles réseau, accès SSH, rétention et reprise |

L'ordre de démarrage et d'arrêt est documenté d'après les unités réellement présentes. Avant une interruption, examiner les tâches actives et prévenir les clients concernés. Les contrôles doivent être adaptés à la taille du service et aux engagements réellement pris.

## Plan de recette

La recette utilise des comptes fictifs, un prestataire en sandbox, des VM jetables et une fenêtre de test où aucune opération de production n'est possible. Chaque fiche note les préconditions, étapes, résultats attendus et observés, heure, preuve expurgée, verdict et anomalie.

| ID | Test | Résultat attendu | Statut dans le dossier |
| --- | --- | --- | --- |
| F-01 | HTTPS | Certificat valide, HTTP redirigé vers HTTPS | Non testé |
| F-02 | Paiement refusé | Aucune VM créée | Non testé |
| F-03 | Paiement accepté | Une seule VM liée à la commande | Non testé |
| F-04 | Webhook rejoué/dupliqué | Aucun doublon | Non testé |
| F-05 | Webhook invalide | Rejet journalisé, aucune tâche | Non testé |
| F-06 | API Proxmox indisponible | Échec géré, aucune VM active non suivie | Non testé |
| F-07 | Stockage plein en test contrôlé | Erreur explicite, état cohérent | Non testé |
| F-08 | Worker arrêté puis relancé | Tâches conservées et reprise contrôlée | Non testé |
| F-09 | Restauration laboratoire | Base et portail de test utilisables | Non testé |
| S-01 | Proxmox depuis Internet | Inaccessible | Non testé |
| S-02 | MariaDB/Redis depuis l'extérieur | Inaccessibles | Non testé |
| S-03 | Isolation des VPS | Gestion et autres clients inaccessibles | Non testé |
| S-04 | Accès HTTP à `.env` | Refusé par NGINX | Non testé |

Les statuts sont les valeurs initiales de la documentation au 10 octobre 2026. Ils ne signifient pas que les tests ont réussi. Une preuve est une sortie de commande, un journal horodaté, une capture expurgée ou une restauration observée ; elle ne doit révéler ni secret, ni adresse publique, ni donnée personnelle.

## Jalons du projet

| Jalon | Travaux | Livrable | Critère de sortie |
| --- | --- | --- | --- |
| 1. Cadrage | Périmètre, architecture, objectifs, limites et attentes de l'école | Schéma et périmètre | Revu |
| 2. Socle | Debian, DNS, réseau, comptes, dépendances, base et Redis | Inventaire des versions/réseaux | Contrôlé |
| 3. Application | Paymenter, APPKEY, migrations, scheduler, worker, NGINX et TLS | Portail et tâches | Fonctionnel en test |
| 4. Intégration | Extension identifiée, token, template, sandbox et webhook | VM de test | Sans doublon |
| 5. Sécurité | Pare-feu, exposition, isolation, secrets, journaux et sauvegardes | Preuves expurgées | Tests vérifiés |
| 6. Recette | Scénarios, anomalies, démonstration et documentation finale | Rapport de résultats | Verdicts observés |

## État et conclusion

Le dossier technique v2.0 formalise la conception, les choix, les procédures, les risques et les tests à réaliser. Il ne prétend pas que la plateforme est opérationnelle : les versions effectivement installées, l'extension exacte, le provisionnement automatisé, l'isolation et la restauration doivent être prouvés sur l'environnement réel.

Le critère de réussite n'est pas seulement « une VM démarre ». Il faut qu'elle ne soit créée qu'après paiement vérifié, qu'elle soit liée à la bonne commande, qu'elle ne puisse pas atteindre la gestion ou un autre client, que l'opération puisse être rejouée sans doublon et que l'exploitant puisse restaurer le service. Une procédure honnête et vérifiable est une partie du projet au même titre que la configuration.
