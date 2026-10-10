---
title: Plateforme VPS sécurisée sur Proxmox et Paymenter
date: 2026-10-10 18:48:00 +0200
categories: [Cybersécurité, Homelab]
tags: [OTERIA, Proxmox, Paymenter, VPS, Debian 13, cybersécurité]
description: >-
  Projet individuel Bachelor 2 OTERIA : concevoir une plateforme de vente de VPS
  où le paiement déclenche la création d'une VM, sans exposer Proxmox.
---

Projet individuel du Bachelor 2 cybersécurité à OTERIA, documenté le 10 octobre 2026. L'idée est simple à énoncer et pénible à bien faire : un client commande et paie un VPS, et sa machine virtuelle apparaît toute seule.

Vendre à la main ne passe pas à l'échelle. On oublie un réglage, on clone deux fois, on donne le mauvais réseau. L'automatisation supprime ces gestes, puis déplace le risque. Un paiement mal vérifié offre une VM gratuite. Un token trop puissant transforme une faille du portail en faille de l'hyperviseur. Tout le dossier est construit autour de ces deux risques.

## Quatre règles

1. Le paiement est le seul déclencheur. Aucune VM n'est créée sans une notification authentifiée côté serveur.
2. Proxmox reste privé. Paymenter l'atteint avec un token aux privilèges limités, sur le réseau d'administration, jamais depuis Internet.
3. Chaque opération est rejouable. Relancer une notification ou une tâche ne crée jamais une seconde VM.
4. Rien n'est affirmé sans preuve. Chaque étape porte un statut : réussi, partiel, échoué ou non testé.

## Architecture

Le portail tourne sur Debian 13, sans Docker. NGINX termine le TLS et passe les requêtes PHP à PHP-FPM par socket Unix. Paymenter v1.5.9 s'appuie sur MariaDB et Redis, tous deux en loopback. Un worker systemd exécute les tâches asynchrones, dont les appels à l'API Proxmox.

Cinq zones, une seule porte d'entrée publique.

| Zone | Contenu | Exposition |
| --- | --- | --- |
| Frontal | NGINX, TLS | 80 et 443 depuis Internet |
| Application | Paymenter, PHP-FPM, MariaDB, Redis, worker | Loopback uniquement |
| Gestion | API Proxmox, SSH, hyperviseur | Réseau d'administration ou VPN |
| VPS clients | Machines QEMU/KVM | Bridge dédié, aucun accès à la gestion |
| Sauvegardes | Cible hors hôte | Accessible depuis l'application, jamais depuis les VPS |

Un seul flux entre depuis Internet : HTTPS vers NGINX. Le webhook du prestataire de paiement emprunte la même porte, mais il est signé. La ligne la plus sensible est le worker vers Proxmox, parce qu'elle porte le pouvoir de créer des VM. D'où le réseau privé, la vérification du certificat, et des droits limités à un pool.

## Du paiement à la VM

La page de retour du navigateur peut être falsifiée ou perdue. La notification serveur à serveur, elle, est signée. C'est elle qui fait foi.

L'ordre compte.

1. Commande, facture, paiement en attente.
2. Webhook authentifié : signature, identifiant, fraîcheur.
3. Tâche unique, dont la clé dérive de l'identifiant de commande.
4. Vérification qu'aucune VM n'existe déjà pour cette commande.
5. Appel à l'API privée : clone du template, quotas, réseau client.
6. Démarrage et contrôle d'état.
7. Enregistrement du lien commande-VM, seulement après ce contrôle.
8. Activation du service et remise des accès.

En cas de timeout, on cherche d'abord la VM ou la tâche côté Proxmox, par un tag lié à la commande, avant tout nouvel essai. Un échec laisse un état explicite, jamais une réussite silencieuse, et jamais une VM active que personne ne suit.

Le client ne choisit ni l'identifiant de VM, ni le bridge, ni le stockage. Ces paramètres sont traduits en une configuration interne fixe.

## Choix techniques

| Besoin | Choix | Pourquoi |
| --- | --- | --- |
| Portail | Paymenter | Catalogue, commandes, factures et provisionnement dans un outil libre |
| Déploiement | Debian, sans Docker | Moins de couches à auditer, correctifs par apt |
| Hyperviseur | Proxmox VE | API REST, pools, ACL et tokens |
| Type de machine | VM QEMU/KVM | Noyau dédié : le client est root sans partager celui de l'hôte |
| Identité des VM | cloud-init et clé SSH | Une identité unique, pas de mot de passe partagé dans l'image |
| Accès API | Token dédié, séparation de privilèges | Révocable sans toucher un compte humain |
| Certificats | Let's Encrypt | Reconnus par les navigateurs, renouvellement automatique |

Les conteneurs LXC sont hors périmètre tant que l'extension qui les provisionnerait n'est pas identifiée, versionnée et testée. Un conteneur partage le noyau de l'hôte : quand des inconnus obtiennent les droits root, la VM est le choix prudent.

Les versions visées par le dossier (Paymenter 1.5.9, Debian 13, PHP 8.3, MariaDB 10.11, Proxmox VE 9.2 en référence) restent à relever sur la machine. Une référence documentaire n'est pas un constat.

## Ce qu'il faut empêcher

L'isolation répond à une question concrète : que peut faire un client depuis sa VM ? Scanner le réseau d'administration, usurper l'adresse d'un voisin, attaquer les autres clients, ou abuser de la sortie Internet. Trois couches se cumulent : segmentation, pare-feu de l'hyperviseur, filtrage MAC et IP sur chaque VM. Si l'une échoue, la suivante limite les dégâts.

| Scénario | Mesure |
| --- | --- |
| Compromission du panel | Comptes nominatifs, MFA si disponible, TLS, administration restreinte |
| Webhook forgé ou rejoué | Signature, identifiant, fraîcheur, idempotence |
| Token trop large ou divulgué | Moindre privilège, pool dédié, expiration, révocation immédiate |
| Console Proxmox exposée | API privée ou VPN, aucune route publique |
| Template compromis | Image officielle vérifiée, template assaini, correctifs |
| Sauvegarde inutilisable | Chiffrement, copie hors hôte, restauration testée |

Les secrets (clé applicative, token, clés de paiement, certificats privés) vivent dans un coffre ou un fichier protégé. Jamais dans Git, jamais dans une capture, jamais dans ce billet. En cas de fuite, on révoque avant d'effacer l'historique.

Un homelab garde des risques résiduels : panne matérielle, dépendance électrique et réseau, vulnérabilités inconnues. Les décrire vaut mieux que les nier.

## Recette

La recette compare un résultat attendu à un résultat observé. Les parcours d'échec comptent autant que le parcours nominal : c'est là que se cachent les VM en double ou orphelines.

| Test | Attendu | Statut |
| --- | --- | --- |
| HTTPS | Certificat valide, redirection HTTP vers HTTPS | Non testé |
| Paiement refusé | Aucune VM créée | Non testé |
| Paiement accepté | Une seule VM, liée à la commande | Non testé |
| Webhook rejoué | Aucun doublon | Non testé |
| Webhook invalide | Rejet journalisé, aucune tâche | Non testé |
| API indisponible | Erreur gérée, aucune VM active non suivie | Non testé |
| Isolation des VPS | Aucun accès à la gestion ni aux autres clients | Non testé |
| Exposition externe | Proxmox, MariaDB et Redis injoignables depuis Internet | Non testé |
| Restauration | Base utilisable en laboratoire | Non testé |

Ces statuts sont ceux du dossier au 10 octobre 2026. Le rapport final les remplacera par les verdicts réels. Les objectifs de perte de données et de délai de reprise ne deviennent des garanties qu'après un test de restauration chronométré.

## Où j'en suis

Le cadrage est posé : périmètre VPS uniquement, architecture en zones, chaîne de service, analyse de menaces et plan de recette. La documentation technique est en version 2.0.

Ce qui reste à prouver sur la machine : versions réellement installées, extension Paymenter-Proxmox identifiée et versionnée, provisionnement sans doublon, isolation testée, sauvegarde restaurée. Tant que ces preuves n'existent pas, le projet est un dossier de conception, pas une plateforme en production.
