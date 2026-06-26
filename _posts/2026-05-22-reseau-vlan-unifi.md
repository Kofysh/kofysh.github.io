---
title: "Monter un environnement réseau complet avec UniFi"
date: 2026-05-22 21:00:00 +0200
categories: [Tutoriels, Réseau]
tags: [unifi, vlan, réseau, switch, wifi, firewall, ubiquiti, vpn, dhcp, proxmox]
description: "Guide complet pour déployer un réseau maison/homelab professionnel avec du matériel Ubiquiti UniFi : gateway, switch, Wi-Fi, VLANs, firewall et VPN."
image:
  path: /assets/img/covers/unifi-vlan.svg
pin: true
---

## Introduction

Quand on commence à héberger des services chez soi, on se retrouve rapidement avec une multitude d'appareils connectés au même réseau : serveurs, PCs, téléphones, caméras IP, objets connectés (IoT), consoles de jeu... Tout ce petit monde sur le même subnet, c'est pratique au début, mais rapidement problématique d'un point de vue sécurité.

Le matériel **Ubiquiti UniFi** est à mon sens le meilleur choix prosumer : interface unifiée pour tout gérer (gateway, switches, APs), écosystème cohérent, et rapport qualité/prix imbattable. Ce guide couvre l'installation complète d'un réseau UniFi from scratch, de la mise en route du controller jusqu'aux règles de firewall avancées.

## Matériel nécessaire

Pour un homelab typique, voici la stack que j'utilise :

| Rôle | Matériel | Prix indicatif |
|------|----------|----------------|
| Gateway / Routeur | [UDM SE](https://eu.store.ui.com/eu/en/category/all-unifi-cloud-gateways/products/udm-se) ou [UCG Ultra](https://eu.store.ui.com/eu/en/category/all-unifi-cloud-gateways/products/ucg-ultra) | 130€ – 350€ |
| Switch principal | [USW Lite 8 PoE](https://eu.store.ui.com/eu/en/category/switching/products/usw-lite-8-poe) | ~110€ |
| Switch secondaire | [USW Flex Mini](https://eu.store.ui.com/eu/en/category/switching/products/usw-flex-mini) | ~35€ |
| Point d'accès Wi-Fi | [U6+](https://eu.store.ui.com/eu/en/category/wifi/products/u6-plus) ou [U6 Lite](https://eu.store.ui.com/eu/en/category/wifi/products/u6-lite) | 80€ – 130€ |

> Le UDM (UniFi Dream Machine) intègre le controller UniFi directement. Si vous avez un UDM, vous n'avez pas besoin d'un serveur séparé pour héberger le controller.
{: .prompt-info }

> Si vous n'avez pas de UDM, vous pouvez installer le **UniFi Network Controller** sur un VPS, un Raspberry Pi ou votre serveur Proxmox.
{: .prompt-tip }

---

## Partie 1 — Installation du Controller

### Sur un UDM / UDM Pro / UDM SE

Le controller est déjà intégré. Branchez votre UDM, connectez-vous au réseau Wi-Fi `UniFi` affiché sur l'écran, puis ouvrez `https://192.168.1.1` dans votre navigateur pour lancer le setup initial.

### Sur Proxmox (Docker)

Si vous n'avez pas de UDM, vous pouvez héberger le controller sur votre serveur. Voici comment le déployer avec Docker Compose :

```yaml
services:
  unifi-network-application:
    image: lscr.io/linuxserver/unifi-network-application:latest
    container_name: unifi
    environment:
      - PUID=1000
      - PGID=1000
      - TZ=Europe/Paris
      - MONGO_USER=unifi
      - MONGO_PASS=unifipass
      - MONGO_HOST=unifi-db
      - MONGO_PORT=27017
      - MONGO_DBNAME=unifi
    volumes:
      - ./unifi-data:/config
    ports:
      - 8443:8443
      - 3478:3478/udp
      - 10001:10001/udp
      - 8080:8080
      - 1900:1900/udp
      - 8843:8843
      - 8880:8880
      - 6789:6789
    depends_on:
      - unifi-db
    restart: unless-stopped

  unifi-db:
    image: mongo:4.4
    container_name: unifi-db
    volumes:
      - ./unifi-db:/data/db
    restart: unless-stopped
```

Lancez-le avec :

```bash
docker compose up -d
```

Accédez ensuite à `https://<ip-serveur>:8443` pour finir la configuration.

---

## Partie 2 — Setup initial & connexion WAN

### Assistant de configuration

Au premier démarrage, UniFi vous propose un wizard. Voici les étapes clés :

1. **Créer un compte UniFi UI** ou se connecter (nécessaire pour le cloud management)
2. **Nommer votre site** (ex: `Maison`)
3. **Configurer le WAN** : dans la majorité des cas, laissez `DHCP` si votre box opérateur est en amont. Si vous avez une IP fixe ou une connexion PPPoE (fibre certains FAI), configurez-le ici
4. **Choisir le subnet LAN** par défaut (on va le modifier après)
5. **Créer votre premier SSID Wi-Fi**

### Configuration WAN avancée

Une fois le wizard terminé, allez dans **Settings → Internet** pour affiner :

- **DNS Primaire / Secondaire** : Je recommande `1.1.1.1` / `1.0.0.1` (Cloudflare) ou `9.9.9.9` (Quad9)
- **Smart Queues (QoS)** : Activez si vous avez de la congestion réseau, renseignez votre débit montant/descendant réel
- **IPv6** : Activez si votre FAI le supporte (la majorité en France le font désormais)

> Si votre box opérateur est en DMZ vers l'UDM, vous bénéficiez d'une IP publique directe sur l'UDM et l'Anti-DDoS de votre FAI ne s'applique plus. Double NAT à éviter.
{: .prompt-warning }

---

## Partie 3 — Architecture réseau & VLANs

### Pourquoi segmenter ?

Un appareil IoT compromis peut en théorie accéder à vos serveurs, NAS, fichiers personnels s'ils sont sur le même réseau. Les **VLANs** (Virtual Local Area Networks) permettent de cloisonner ces appareils dans des réseaux logiques distincts tout en utilisant la même infrastructure physique.

### Architecture proposée

| VLAN | Nom | Subnet | Usage |
|------|-----|--------|-------|
| 1 | Default | `192.168.1.0/24` | Management UniFi (UDM, switches, APs) |
| 10 | Trusted | `192.168.10.0/24` | PCs, laptops, téléphones de confiance |
| 20 | Servers | `192.168.20.0/24` | Proxmox, NAS, serveurs |
| 30 | IoT | `192.168.30.0/24` | Caméras, TV, objets connectés |
| 40 | Guest | `192.168.40.0/24` | Wi-Fi invités, accès internet uniquement |

### Créer les VLANs

Allez dans **Settings → Networks → Add New Network** et créez chaque réseau :

**Exemple pour le VLAN Servers (20) :**

| Champ | Valeur |
|-------|--------|
| Name | `Servers` |
| Network Type | `Standard` |
| VLAN ID | `20` |
| Gateway IP/Subnet | `192.168.20.1/24` |
| DHCP | Enabled |
| DHCP Range | `192.168.20.100` – `192.168.20.254` |
| DHCP Name Server | `Auto` (ou `1.1.1.1`) |

Répétez pour chaque VLAN. Laissez le VLAN ID vide pour le réseau `Default` (c'est le réseau natif non taggé, VLAN 1).

---

## Partie 4 — Configuration Wi-Fi

### Créer les SSIDs

Allez dans **Settings → WiFi → Add New WiFi Network** :

| SSID | Réseau (VLAN) | Sécurité | Options |
|------|--------------|----------|---------|
| `Maison` | Trusted (10) | WPA3/WPA2 | — |
| `Maison - IoT` | IoT (30) | WPA2 | Client Isolation ON |
| `Maison - Invités` | Guest (40) | WPA2 | Client Isolation ON |

> **Client Device Isolation** empêche les appareils d'un même SSID de se voir entre eux. Indispensable sur les réseaux IoT et Guest.
{: .prompt-tip }

### Band Steering & paramètres avancés

Dans les paramètres avancés de chaque SSID :

- **Band Steering** : Activez pour pousser les clients compatibles vers le 5 GHz ou 6 GHz (Wi-Fi 6E)
- **BSS Transition** : Activez pour améliorer le roaming entre APs (802.11r)
- **Minimum Data Rate** : Montez à `12 Mbps` minimum pour éviter les clients lents qui plombent le réseau
- **Multicast Enhancement** : Activez pour convertir le multicast en unicast (améliore la stabilité IoT)

### Canaux Wi-Fi

Allez dans **Settings → WiFi → RF Environment** ou configurez manuellement dans **Devices → AP → Radio**.

En France :
- **2.4 GHz** : Canaux 1, 6 ou 11 (non chevauchants)
- **5 GHz** : Canaux 36, 40, 44, 48 (U-NII-1) ou 100+ (U-NII-3), évitez les canaux DFS si instabilité
- **6 GHz** (Wi-Fi 6E) : Canaux 1 à 233, peu d'interférences, à privilégier si vous avez des clients compatibles

---

## Partie 5 — Configuration des Switches

### Profils de ports

Allez dans **Settings → Profiles → Port Profiles** et créez un profil par VLAN :

| Profil | Native Network | Tagged Networks |
|--------|---------------|-----------------|
| `Trusted` | Trusted (10) | — |
| `Servers` | Servers (20) | — |
| `IoT` | IoT (30) | — |
| `Trunk - All` | Default (1) | Trusted, Servers, IoT, Guest |
| `Trunk - AP` | Default (1) | Trusted, IoT, Guest |

### Assigner les profils aux ports

Allez dans **Devices → Switch → Ports** et assignez :

- **Port vers UDM ou autre switch** → profil `Trunk - All`
- **Port vers un AP** → profil `Trunk - AP`
- **Port vers un PC / laptop** → profil `Trusted`
- **Port vers Proxmox (trunk)** → profil `Trunk - All`
- **Port vers une caméra IP** → profil `IoT`

> Si votre switch est alimenté via PoE depuis un autre switch UniFi, le lien uplink est automatiquement configuré en trunk. Vous n'avez qu'à configurer les ports downlink.
{: .prompt-info }

---

## Partie 6 — Règles de Firewall

C'est l'étape la plus importante. Sans règles, tous vos VLANs communiquent librement via la gateway.

Allez dans **Settings → Firewall & Security → Firewall Rules**, onglet **LAN In**.

> L'ordre des règles est **crucial**. Elles sont évaluées de haut en bas, la première correspondance s'applique. Numérotez vos règles pour contrôler l'ordre.
{: .prompt-warning }

### Règle 1 — Autoriser les connexions établies (PRIORITÉ ABSOLUE)

| Champ | Valeur |
|-------|--------|
| Name | `Allow Established/Related` |
| Action | `Accept` |
| States | `Established`, `Related` |
| Source | Any |
| Destination | Any |

### Règle 2 — Bloquer IoT → réseaux locaux

| Champ | Valeur |
|-------|--------|
| Name | `Block IoT to RFC1918` |
| Action | `Drop` |
| Source Network | `IoT` (VLAN 30) |
| Destination | IP Range `192.168.0.0/16`, `10.0.0.0/8`, `172.16.0.0/12` |

### Règle 3 — Bloquer Guest → réseaux locaux

| Champ | Valeur |
|-------|--------|
| Name | `Block Guest to RFC1918` |
| Action | `Drop` |
| Source Network | `Guest` (VLAN 40) |
| Destination | IP Range `192.168.0.0/16`, `10.0.0.0/8`, `172.16.0.0/12` |

### Règle 4 — Bloquer accès au VLAN Management

| Champ | Valeur |
|-------|--------|
| Name | `Block Access to Management` |
| Action | `Drop` |
| Source | All (sauf Trusted explicitement autorisé avant) |
| Destination Network | `Default` (VLAN 1) |

### Règle 5 — Autoriser Trusted → Servers

| Champ | Valeur |
|-------|--------|
| Name | `Allow Trusted to Servers` |
| Action | `Accept` |
| Source Network | `Trusted` (VLAN 10) |
| Destination Network | `Servers` (VLAN 20) |

### Ordre final recommandé

```
1. Allow Established/Related        ← TOUJOURS EN PREMIER
2. Allow Trusted to Servers
3. Allow Trusted to Management
4. Block IoT to RFC1918
5. Block Guest to RFC1918
6. Block Access to Management
7. (Implicit Deny All)
```

---

## Partie 7 — Réservations DHCP

Pour vos serveurs, attribuez des IPs fixes via des réservations DHCP plutôt que de configurer l'IP statiquement sur chaque machine.

Allez dans **Settings → Networks → Servers → DHCP → Fixed IP Addresses** :

| Machine | MAC | IP Réservée |
|---------|-----|-------------|
| Proxmox | `AA:BB:CC:DD:EE:FF` | `192.168.20.10` |
| NAS | `...` | `192.168.20.11` |
| Pi-hole | `...` | `192.168.20.12` |

Avantage : si vous changez de machine, vous n'avez qu'à mettre à jour la réservation dans UniFi, pas la config réseau de la machine elle-même.

### DNS personnalisé

Si vous utilisez **Pi-hole** ou **AdGuard Home** comme serveur DNS local, renseignez son IP dans le champ **DHCP Name Server** de chaque réseau (sauf IoT, pour lequel vous pouvez laisser un DNS public).

---

## Partie 8 — VPN (accès à distance)

UniFi propose plusieurs solutions VPN intégrées directement dans le controller.

### Option 1 — Teleport (le plus simple)

**Teleport** est la solution propriétaire Ubiquiti. Elle crée automatiquement un tunnel chiffré entre votre appareil mobile et votre réseau UniFi, sans configuration port forwarding.

Activez-le dans **Settings → Teleport & VPN → Teleport**. Installez ensuite l'application **UniFi Network** sur votre smartphone et connectez-vous à votre site.

Limitation : fonctionne uniquement avec l'app UniFi, pas compatible avec d'autres clients VPN.

### Option 2 — WireGuard VPN (recommandé)

Pour un accès plus universel, activez le VPN WireGuard intégré :

Allez dans **Settings → Teleport & VPN → VPN Server** → choisissez **WireGuard**.

Configurez :
- **Listen Port** : `51820` (par défaut)
- **Tunnel IP** : `10.0.0.1/24` (subnet du tunnel)
- **Auto Firewall** : Activez

Puis créez un client (ex: votre laptop) :
- Cliquez **Create Client**
- Téléchargez le fichier `.conf` ou scannez le QR code avec l'app WireGuard

> Assurez-vous que le port `51820/UDP` est bien accessible depuis l'extérieur. Si votre UDM est derrière une box opérateur, ouvrez ce port en redirection de port sur votre box.
{: .prompt-warning }

### Option 3 — OpenVPN (compatibilité maximale)

Pour les environnements d'entreprise ou les cas où WireGuard n'est pas compatible, activez OpenVPN dans **Settings → Teleport & VPN → VPN Server → OpenVPN**.

---

## Partie 9 — Intégration Proxmox

Si votre serveur Proxmox est connecté en **trunk** (plusieurs VLANs), vous pouvez créer des interfaces VLAN directement dans Proxmox pour que chaque VM soit dans son VLAN.

### Configuration du bridge

Dans **Proxmox → Node → Network**, assurez-vous que votre bridge principal `vmbr0` est configuré en mode **VLAN aware** :

Éditez `vmbr0` et cochez **VLAN aware**.

### Assigner un VLAN à une VM

Dans la configuration réseau de chaque VM :

```
Bridge : vmbr0
VLAN Tag : 20    ← pour le VLAN Servers
```

La VM recevra automatiquement une IP dans le subnet `192.168.20.0/24` via DHCP de votre UDM.

### Créer des sous-interfaces VLAN (pour les conteneurs LXC)

Pour les conteneurs LXC, créez des interfaces VLAN dans **Node → Network → Add → Linux VLAN** :

```
Name        : vmbr0.20
VLAN raw    : vmbr0
VLAN tag    : 20
```

Puis assignez `vmbr0.20` comme bridge réseau dans la config du conteneur.

> Assurez-vous que le port de switch vers votre Proxmox est bien en mode **Trunk** (profil `Trunk - All`) pour que les VLANs taggés passent correctement.
{: .prompt-warning }

---

## Partie 10 — Vérifications & Tests

### Tester l'isolation des VLANs

```bash
# Depuis une machine en VLAN IoT (192.168.30.x)

# Doit ÉCHOUER (isolation firewall) :
ping 192.168.20.10   # Serveur Proxmox
ping 192.168.10.5    # PC en Trusted
ping 192.168.1.1     # Gateway Management

# Doit FONCTIONNER :
ping 8.8.8.8         # Internet
curl ifconfig.me     # IP publique
```

```bash
# Depuis une machine en VLAN Trusted (192.168.10.x)

# Doit FONCTIONNER :
ping 192.168.20.10   # Serveur Proxmox
ping 8.8.8.8         # Internet
ping 192.168.1.1     # Gateway Management

# Doit ÉCHOUER (pas de connexion initialisée depuis IoT) :
ping 192.168.30.50   # Appareil IoT
```

### Vérifier dans UniFi

- **Insights → Client Devices** : Vérifiez que chaque appareil est bien dans le bon VLAN
- **Insights → Traffic** : Visualisez le trafic par VLAN
- **Settings → Firewall → Traffic Stats** : Vérifiez que vos règles Drop bloquent bien du trafic (compteur > 0)

---

## Diagnostics courants

**Un appareil ne reçoit pas d'IP DHCP :**
- Vérifiez le profil du port de switch (bon VLAN natif ?)
- Vérifiez que le DHCP est activé sur le réseau UniFi correspondant
- Vérifiez que le lien trunk entre AP/switch et UDM passe bien le VLAN

**Deux VLANs peuvent se parler alors qu'ils ne devraient pas :**
- Vérifiez l'**ordre** de vos règles firewall (Allow Established doit être en premier)
- Vérifiez que vos règles sont en **LAN In** et non LAN Out ou WAN In

**Le Wi-Fi IoT a accès au LAN :**
- Vérifiez que le SSID IoT pointe bien vers le réseau VLAN 30
- Vérifiez que la règle `Block IoT to RFC1918` est active et positionnée après `Allow Established`

**Un AP n'est pas adopté :**
- Assurez-vous que l'AP et le controller sont sur le même réseau lors de l'adoption initiale
- Si l'AP est sur un VLAN différent, utilisez la commande `set-inform` en SSH :

```bash
ssh ubnt@<ip-ap>
# Mot de passe par défaut : ubnt
set-inform http://<ip-controller>:8080/inform
```

**Performance Wi-Fi dégradée :**
- Vérifiez les canaux utilisés (évitez les chevauchements)
- Désactivez le **Legacy Support** si tous vos clients sont en 802.11n minimum
- Montez le **Minimum Data Rate** à 12 Mbps
- Vérifiez la puissance d'émission (pas besoin de 100% en intérieur, ça crée des interférences)

---

## Conclusion

Vous disposez maintenant d'un réseau complet, segmenté et sécurisé avec du matériel UniFi. L'architecture VLAN proposée isole vos appareils IoT et invités de vos serveurs et machines de confiance, tout en offrant un accès VPN distant propre.

Le vrai atout d'UniFi réside dans la cohérence de l'écosystème : gérer gateway, switches, APs et règles firewall depuis une seule interface évite les erreurs de configuration que l'on retrouve quand tout est éclaté entre plusieurs interfaces constructeurs différents.

> **Aller plus loin :** Combinez cette infrastructure UniFi avec un serveur [Pi-hole](https://pi-hole.net/) ou [AdGuard Home](https://adguard.com/fr/adguard-home/overview.html) pour un blocage publicitaire DNS sur tout votre réseau, ou un [Suricata IDS](https://suricata.io/) via le module Threat Management de l'UDM pour de la détection d'intrusion.
{: .prompt-tip }
