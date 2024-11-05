---
layout: post
title: "Avoir des IPv4 chez soi : Ouvrir son HomeLab à tous"
description: "Proxmox est un super hyperviseur très puissant. Mais il faut savoir l'utiliser !"
tags: virt
---

## Introduction

J'ai un serveur chez moi sur lequel j'ai installé [Proxmox](https://www.proxmox.com/en/proxmox-ve), un hyperviseur qui me permet de créer plusieurs machines virtuelles. Ces machines virtuelles hébergent divers services pour moi et pour d'autres utilisateurs.

Cependant, avec une seule IP résidentielle, je suis rapidement limité par le nombre de ports disponibles et par les services que je souhaite faire tourner dans des conditions optimales. J'ai donc cherché un moyen d'obtenir des IP dédiées, protégées par un Anti-DDOS et à coût réduit. Ne trouvant pas de solution satisfaisante, j'ai décidé de créer la mienne.

## Les différentes approches

Nous allons aborder plusieurs approches pour obtenir des IP chez soi et publier son HomeLab. Avec la pénurie actuelle d'IPv4, il est important de ne pas commander massivement des adresses inutilisées, privant ainsi d'autres utilisateurs. Voici les approches traitées dans cette documentation :

1. **Méthode originale** : Associer à n'importe quelle machine une adresse IP publique via un profil WireGuard dédié.
2. **Méthode alternative** : Utiliser un tunnel VPN pour assigner des IP publiques.

![Schéma explicatif](https://via.placeholder.com/800x400?text=Schéma+explicatif)

## Génération de certificats SSL

Les certificats SSL gratuits permettent d'avoir l'HTTPS sur vos services. Voici les prérequis :

- Un nom de domaine
- Le contrôle de la zone DNS (Cloudflare est recommandé)
- Une règle DNS A pointant vers l'IP principale du VPS HMS

![Préparation des certificats SSL](https://via.placeholder.com/800x400?text=Préparation+des+certificats+SSL)

### Étape 1 : Générer un certificat SSL

1. Accédez à la rubrique **SSL Certificates** via la barre de navigation.
   
   ![SSL Certificates](https://via.placeholder.com/800x400?text=SSL+Certificates)
   
2. Cliquez sur **Add SSL Certificate**.
   
   ![Ajouter un certificat SSL](https://via.placeholder.com/800x400?text=Ajouter+un+certificat+SSL)

3. Entrez le nom de domaine du service que vous souhaitez sécuriser. Pour un sous-domaine, utilisez par exemple `*.votredomaine.fr` et suivez le DNS Challenge pour valider le certificat.

   ![DNS Challenge](https://via.placeholder.com/800x400?text=DNS+Challenge)

   ![Validation du certificat](https://via.placeholder.com/800x400?text=Validation+du+certificat)

### Étape 2 : Créer le service associé

1. Une fois le certificat généré, accédez à la rubrique **Hosts**.
   
   ![Hosts](https://via.placeholder.com/800x400?text=Hosts)

2. Cliquez sur **Add Proxy Host**.
   
   ![Ajouter un Proxy Host](https://via.placeholder.com/800x400?text=Ajouter+un+Proxy+Host)

3. Configurez les paramètres :
   - **Domain Names** : `sousdomaine.votresite.fr`
   - **Scheme** : `http`
   - **Forward IP** : L'IP locale (par exemple, `http://ip:8123`)
   - **Forward Port** : `8123`
   
   Activez les options "Block Common Exploits" et "Websockets Support".

   ![Configuration du Proxy Host](https://via.placeholder.com/800x400?text=Configuration+du+Proxy+Host)

4. Dans la rubrique SSL, sélectionnez le certificat SSL généré précédemment, et cochez "Force SSL" et "HTTP/2 Support".

   ![Configuration SSL](https://via.placeholder.com/800x400?text=Configuration+SSL)

5. Sauvegardez en cliquant sur **Save**.

   ![Sauvegarder la configuration](https://via.placeholder.com/800x400?text=Sauvegarder+la+configuration)

---

Cette documentation vous guide à travers les étapes pour obtenir plusieurs IP Failover et sécuriser vos services avec des certificats SSL. En suivant ces instructions, vous pouvez optimiser votre HomeLab et héberger plusieurs services avec une meilleure gestion des ressources réseau. Pour toute question ou assistance supplémentaire, n'hésitez pas à consulter les ressources et communautés en ligne.
