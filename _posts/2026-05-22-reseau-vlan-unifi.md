---
title: "Segmenter son réseau avec des VLANs sur UniFi"
date: 2026-05-22 21:00:00 +0200
categories: [Tutoriels, Réseau]
tags: [unifi, vlan, réseau, switch, wifi, firewall, ubiquiti, sécurité]
description: "Mettre en place une segmentation réseau propre avec des VLANs sur du matériel UniFi : UDM, switches et points d'accès Wi-Fi."
---

## Introduction

Quand on commence à héberger des services chez soi, on se retrouve rapidement avec une multitude d'appareils connectés au même réseau : serveurs, PCs, téléphones, caméras IP, objets connectés (IoT), consoles de jeu... Tout ce petit monde sur le même subnet, c'est pratique au début, mais rapidement problématique.

Un appareil IoT compromis peut en théorie accéder à vos serveurs, vos NAS, vos fichiers personnels. La segmentation via des **VLANs** (Virtual Local Area Networks) permet de cloisonner ces appareils dans des réseaux logiques distincts, tout en continuant à les faire passer par la même infrastructure physique.

Dans ce tutoriel, nous allons mettre en place une segmentation réseau complète avec du matériel **Ubiquiti UniFi**, qui est à mon sens le meilleur rapport qualité/prix/facilité pour du matériel réseau prosumer.

## Prérequis matériel

Pour suivre ce tutoriel, vous aurez besoin d'au minimum :

- Un **routeur/gateway UniFi** : [UDM SE](https://eu.store.ui.com/eu/en/category/all-unifi-cloud-gateways/products/udm-se), [UDM Pro](https://eu.store.ui.com/eu/en/category/all-unifi-cloud-gateways/products/udm-pro), [UDM Base](https://eu.store.ui.com/eu/en/category/all-unifi-cloud-gateways/products/udm) ou même un simple [UCG Ultra](https://eu.store.ui.com/eu/en/category/all-unifi-cloud-gateways/products/ucg-ultra)
- Un **switch UniFi managé** : n'importe quel [USW](https://eu.store.ui.com/eu/en/category/switching) (Lite 8 PoE, Flex Mini, etc.)
- Des **points d'accès UniFi** (optionnel si vous ne faites que du filaire) : [U6 Lite](https://eu.store.ui.com/eu/en/category/wifi/products/u6-lite), [U6+](https://eu.store.ui.com/eu/en/category/wifi/products/u6-plus), etc.
- Le tout piloté via **UniFi Network** (application locale ou cloud)

> Si vous avez un UDM (UniFi Dream Machine), le controller est intégré directement dedans. Pas besoin d'un serveur séparé.
{: .prompt-info }

## Principe des VLANs

Un VLAN est un réseau local virtuel. Concrètement, c'est une façon de dire à votre switch : *"les trames qui portent le tag VLAN 20 appartiennent au réseau IoT, isole-les des trames VLAN 10 qui appartiennent au réseau principal"*.

Chaque VLAN possède :
- Un **ID** (nombre entre 1 et 4094)
- Un **subnet** dédié (ex: `192.168.20.0/24`)
- Son propre serveur **DHCP** (géré par la gateway UniFi)
- Des règles de **firewall** qui définissent ce qu'il peut ou ne peut pas joindre

Les ports de switch peuvent être en mode **Access** (un seul VLAN, pour les appareils terminaux) ou **Trunk** (plusieurs VLANs taggés, pour les liens vers d'autres switches ou APs).

## Architecture proposée

Voici la segmentation que nous allons mettre en place :

| VLAN | Nom | Subnet | Usage |
|------|-----|--------|-------|
| 1 | Default | `192.168.1.0/24` | Management réseau (UDM, switches, APs) |
| 10 | Trusted | `192.168.10.0/24` | PCs, laptops, téléphones de confiance |
| 20 | Servers | `192.168.20.0/24` | Serveurs, Proxmox, NAS |
| 30 | IoT | `192.168.30.0/24` | Objets connectés, caméras, TV |
| 40 | Guest | `192.168.40.0/24` | Wi-Fi invités, accès internet uniquement |

La règle générale est la suivante :
- **Trusted** peut accéder à **Servers**
- **Servers** ne peut pas initier de connexion vers **Trusted**
- **IoT** est totalement isolé, accès internet uniquement
- **Guest** est totalement isolé, accès internet uniquement
- Personne ne peut accéder au VLAN **Default** (management) sauf depuis **Trusted**

## Création des VLANs dans UniFi

Connectez-vous à votre interface UniFi Network (via `https://<ip-udm>` ou [unifi.ui.com](https://unifi.ui.com)).

Rendez-vous dans **Settings → Networks**, puis cliquez sur **Add New Network**.

Pour chaque VLAN, remplissez les champs comme suit :

**Exemple pour le VLAN Servers (20) :**

| Champ | Valeur |
|-------|--------|
| Name | `Servers` |
| Network Type | `Standard` |
| VLAN ID | `20` |
| Gateway IP/Subnet | `192.168.20.1/24` |
| DHCP | Enabled |
| DHCP Range | `192.168.20.100` – `192.168.20.254` |

Répétez l'opération pour chaque VLAN du tableau ci-dessus.

> Laissez le VLAN ID à vide (ou `1`) pour le réseau Default, c'est le réseau natif non taggé.
{: .prompt-tip }

## Configuration des SSIDs Wi-Fi

Allez dans **Settings → WiFi**, puis créez ou modifiez vos SSIDs.

Pour chaque SSID, vous pouvez assigner un VLAN dans le champ **Network** :

- `Maison` → réseau **Trusted** (VLAN 10)
- `Maison - IoT` → réseau **IoT** (VLAN 30)
- `Maison - Invités` → réseau **Guest** (VLAN 40)

Les APs UniFi gèrent automatiquement le tagging VLAN sur le lien trunk vers le switch. Vous n'avez rien d'autre à configurer côté AP.

> Activez l'option **Client Device Isolation** sur les SSIDs IoT et Guest pour empêcher les appareils de se voir entre eux sur le même VLAN.
{: .prompt-tip }

## Configuration des ports de switch

Allez dans **Devices**, sélectionnez votre switch, puis allez dans l'onglet **Ports**.

Pour chaque port, vous pouvez définir un **Port Profile** :

- **Lien vers l'UDM / un autre switch** → profil `All` (trunk, tous les VLANs taggés)
- **Port PC ou laptop** → profil `Trusted` (access VLAN 10, non taggé)
- **Port serveur Proxmox** → profil `Servers` (access VLAN 20) ou `All` si le serveur gère lui-même ses VLANs
- **Port caméra ou switch IoT** → profil `IoT` (access VLAN 30)

Pour créer un profil de port, allez dans **Settings → Profiles → Port Profiles** et créez un profil par VLAN avec le Native Network correspondant.

## Règles de Firewall

C'est l'étape la plus importante. Sans règles de firewall, tous vos VLANs peuvent se parler librement via la gateway. Allez dans **Settings → Firewall & Security → Firewall Rules**.

Nous allons travailler sur les règles **LAN In** (trafic entrant depuis les réseaux locaux vers la gateway ou vers d'autres réseaux).

### Règle 1 — Autoriser les sessions établies

Créez cette règle **en premier** (elle doit avoir la priorité la plus haute) :

| Champ | Valeur |
|-------|--------|
| Name | `Allow Established/Related` |
| Action | `Accept` |
| States | `Established`, `Related` |
| Source | Any |
| Destination | Any |

Cela permet aux connexions déjà établies de continuer à fonctionner.

### Règle 2 — Bloquer IoT vers réseaux locaux

| Champ | Valeur |
|-------|--------|
| Name | `Block IoT to LAN` |
| Action | `Drop` |
| Source Network | `IoT` (VLAN 30) |
| Destination | `192.168.0.0/16` |

### Règle 3 — Bloquer Guest vers réseaux locaux

| Champ | Valeur |
|-------|--------|
| Name | `Block Guest to LAN` |
| Action | `Drop` |
| Source Network | `Guest` (VLAN 40) |
| Destination | `192.168.0.0/16` |

### Règle 4 — Bloquer accès au VLAN Management

| Champ | Valeur |
|-------|--------|
| Name | `Block Access to Management VLAN` |
| Action | `Drop` |
| Source Network | All (sauf Trusted) |
| Destination Network | `Default` (VLAN 1) |

> L'ordre des règles est crucial dans UniFi. Les règles sont évaluées de haut en bas, la première qui correspond s'applique. Mettez toujours la règle **Allow Established** en tout premier.
{: .prompt-warning }

## DHCP statique (réservations IP)

Pour vos serveurs, il est recommandé d'attribuer des IPs fixes via des réservations DHCP plutôt que de configurer l'IP statiquement sur chaque machine.

Allez dans **Settings → Networks**, sélectionnez votre réseau **Servers**, puis dans **DHCP** descendez jusqu'à **Fixed IP Addresses**.

Cliquez sur **Add Fixed IP**, renseignez l'adresse MAC de votre serveur et l'IP souhaitée (ex: `192.168.20.10` pour votre Proxmox).

Avantage : si vous changez de machine, vous n'avez qu'à mettre à jour la réservation dans UniFi, pas la config réseau de la machine.

## Configuration côté Proxmox

Si votre serveur Proxmox est connecté en trunk (plusieurs VLANs), vous pouvez créer des interfaces VLAN directement dans Proxmox pour que chaque VM soit dans son VLAN.

Dans **Proxmox → Node → Network**, créez un **Linux VLAN** :

```
Nom : vmbr0.20
VLAN raw device : vmbr0
VLAN tag : 20
```

Puis dans la configuration de chaque VM, assignez l'interface réseau au bridge `vmbr0` avec le **VLAN Tag** correspondant :

```
Bridge : vmbr0
VLAN Tag : 20
```

Ainsi votre VM atterrira directement dans le VLAN Servers (192.168.20.0/24) et recevra une IP via DHCP de votre UDM.

> Assurez-vous que le port du switch vers votre Proxmox est bien en mode **Trunk** (profil `All`) pour que les VLANs taggés passent correctement.
{: .prompt-warning }

## Vérification

Une fois tout configuré, vérifiez que l'isolation fonctionne correctement :

```bash
# Depuis une machine en VLAN IoT (192.168.30.x)
# Doit échouer :
ping 192.168.20.10   # Serveur dans VLAN Servers
ping 192.168.10.5    # PC dans VLAN Trusted

# Doit fonctionner :
ping 8.8.8.8         # Internet
curl ifconfig.me     # IP publique
```

```bash
# Depuis une machine en VLAN Trusted (192.168.10.x)
# Doit fonctionner :
ping 192.168.20.10   # Serveur dans VLAN Servers
ping 8.8.8.8         # Internet

# Doit échouer :
ping 192.168.30.50   # Appareil IoT (pas de connexion initialisée depuis Trusted)
```

Dans UniFi, vous pouvez également aller dans **Insights → Client Devices** pour vérifier que chaque appareil a bien été assigné au bon VLAN.

## Diagnostics courants

**Un appareil ne reçoit pas d'IP DHCP :**
- Vérifiez le profil du port de switch
- Vérifiez que le DHCP est bien activé sur le réseau UniFi correspondant
- Vérifiez que le lien entre l'AP/switch et l'UDM est bien en trunk

**Deux VLANs peuvent se parler alors qu'ils ne devraient pas :**
- Vérifiez l'ordre de vos règles firewall
- La règle `Allow Established` doit être en premier
- Vérifiez que vos règles sont bien en **LAN In** et non LAN Out ou WAN

**Le Wi-Fi IoT a accès au LAN :**
- Vérifiez que le SSID IoT pointe bien vers le réseau VLAN 30
- Vérifiez que la règle `Block IoT to LAN` est active

## Conclusion

Vous disposez maintenant d'une segmentation réseau solide qui protège vos serveurs et machines de confiance de vos appareils IoT et de vos invités. Cette architecture est évolutive : vous pouvez ajouter autant de VLANs que nécessaire (VLAN domotique séparé, VLAN caméras, VLAN lab, etc.) en répétant simplement les mêmes étapes.

Le matériel UniFi brille particulièrement ici : la gestion des VLANs, ports de switch et règles firewall dans une seule interface unifiée est un réel confort par rapport à d'autres solutions où tout est éclaté entre plusieurs interfaces.

> **Aller plus loin :** Combinez cette segmentation VLAN avec un tunnel WireGuard sur votre UDM pour accéder à distance à vos VLANs sécurisés depuis n'importe où. UniFi propose une solution VPN intégrée (Teleport ou WireGuard VPN) directement dans le controller.
{: .prompt-tip }
