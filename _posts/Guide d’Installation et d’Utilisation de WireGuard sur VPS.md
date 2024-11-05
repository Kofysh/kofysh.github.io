---
layout: post
title: "Comprendre et déployer WireGuard sur un VPS : Un VPN performant et sécurisé"
description: "Découvrez comment comprendre et déployer WireGuard, un VPN performant et sécurisé, pour protéger vos données et optimiser vos connexions réseau"
tags: vpn
---

WireGuard est un protocole VPN basé sur UDP. Il est compatible avec de nombreuses plateformes, extrêmement léger, facile à déployer et offre des performances supérieures à ses concurrents tout en garantissant une sécurité optimale. En tant que nouvelle solution open-source, WireGuard a su prouver son efficacité au cours des dernières années.

## Avantages de WireGuard

- Compatibilité étendue : Fonctionne sur diverses plateformes (Windows, macOS, Linux, Android, iOS).
- Légèreté : Consommation de ressources minimisée.
- Facilité de déploiement : Installation et configuration simples et rapides.
- Performances élevées : Débits supérieurs comparés aux autres VPN.
- Sécurité accrue : Protection efficace des données grâce à des protocoles modernes et robustes.

## Dépendance à la Qualité du Réseau

La performance de WireGuard dépendra de la qualité de votre connexion réseau. Bien que WireGuard soit conçu pour maintenir un débit élevé sans nécessiter une connexion internet optimale, il est important de prendre en compte le temps de latence entre votre connexion et le serveur (ping).

![Comparaison des Performances](https://korben.info/app/uploads/2020/02/bench.png)

## Prérequis

Pour suivre ce guide, assurez-vous d'utiliser Debian 12 ou une version ultérieure.

## Grille Tarifaire d'HMS (au 01/07/2024)

| Modèle  | vCPU | Processeur                        | Mémoire RAM | Stockage NVMe | Bande passante | Prix mensuel (TTC) |
|---------|------|-----------------------------------|-------------|---------------|----------------|---------------------|
| SSD-1   | 1    | E5-2697A v4 - 2.60 / 3.60 GHz     | 2 Go        | 20 Go         | 250 Mbps       | 2,99€ / mois        |
| SSD-2   | 2    | E5-2697A v4 - 2.60 / 3.60 GHz     | 4 Go        | 40 Go         | 500 Mbps       | 5,99€ / mois        |
| SSD-4   | 4    | E5-2697A v4 - 2.60 / 3.60 GHz     | 8 Go        | 60 Go         | 800 Mbps       | 9,99€ / mois        |
| SSD-8   | 8    | E5-2697A v4 - 2.60 / 3.60 GHz     | 16 Go       | 120 Go        | 1 Gbps         | 19,99€ / mois       |
| SSD-12  | 12   | E5-2697A v4 - 2.60 / 3.60 GHz     | 24 Go       | 160 Go        | 2 Gbps         | 29,99€ / mois       |
| SSD-12' | 12   | E5-2697A v4 - 2.60 / 3.60 GHz     | 32 Go       | 200 Go        | 4 Gbps         | 39,99€ / mois       |

Ces offres permettent une commande illimitée d'IP Failover, coûtant 1,99€ à vie.

## Commande d'IP Additionnelle

Pour commander une IP additionnelle après la livraison de votre VPS, accédez à l'Espace Client : **Votre VPS → Configuration → Commander une Nouvelle IP**. Un email de confirmation vous sera envoyé après la commande.

## Configuration de WireGuard

### Étape 1 : Installation

1. Mettez à jour votre système :
    ```bash
    sudo apt update && sudo apt upgrade
    ```
2. Installez WireGuard :
    ```bash
    sudo apt install wireguard
    ```

### Étape 2 : Configuration du Serveur

1. Créez les clés privées et publiques :
    ```bash
    wg genkey | tee /etc/wireguard/privatekey | wg pubkey > /etc/wireguard/publickey
    ```

2. Configurez le fichier `/etc/wireguard/wg0.conf` :
    ```ini
    [Interface]
    PrivateKey = votre_clé_privée
    Address = 10.0.0.1/24
    ListenPort = 51820

    [Peer]
    PublicKey = clé_publique_du_client
    AllowedIPs = 10.0.0.2/32
    ```

### Étape 3 : Démarrage de WireGuard

1. Démarrez le service :
    ```bash
    sudo wg-quick up wg0
    ```

2. Activez le service au démarrage :
    ```bash
    sudo systemctl enable wg-quick@wg0
    ```

### Étape 4 : Configuration du Client

1. Installez WireGuard sur le client :
    ```bash
    sudo apt install wireguard
    ```

2. Configurez le fichier `/etc/wireguard/wg0.conf` :
    ```ini
    [Interface]
    PrivateKey = votre_clé_privée
    Address = 10.0.0.2/24

    [Peer]
    PublicKey = clé_publique_du_serveur
    Endpoint = adresse_du_serveur:51820
    AllowedIPs = 0.0.0.0/0
    ```

3. Démarrez le service :
    ```bash
    sudo wg-quick up wg0
    ```

## Remerciements

Un grand merci à tous ceux qui ont contribué à cette documentation :
- [@Aven678](https://github.com/Aven678) : Simplification de la gestion des IPs et création de profils.
- [@DrKnaw](https://github.com/DrKnaw) : Correction des bugs initiaux.
- [@Mael](https://github.com/maelmagnien) : Tests et validation du tutoriel.
- @Twistky, @Diggyworld, @titin : Aide précieuse et solutions aux problèmes rencontrés.
- [@MichelBaie](https://github.com/MichelBaie) : Documentation de base et aide précieuse sur de nombreux aspects.

## Liens Utiles

- [Documentation WireGuard](https://github.com/pirate/wireguard-docs)

Merci d'avoir suivi cette documentation, en espérant qu'elle vous sera utile.
