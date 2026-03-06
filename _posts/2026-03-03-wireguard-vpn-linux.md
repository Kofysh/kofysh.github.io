---
title: "Monter un VPN WireGuard sur Linux"
date: 2026-03-03 16:00:00 +0100
categories: [Tutoriels, Reseau]
tags: [wireguard, vpn, linux, reseau, securite]
---

WireGuard est un VPN moderne, rapide, et simple à configurer. Il est intégré directement dans le noyau Linux depuis la version 5.6, ce qui le rend bien plus performant que des solutions comme OpenVPN.

Dans ce tutoriel, on va configurer un serveur WireGuard sur Linux et connecter un client (PC, smartphone).

## Prérequis

- Un serveur sous Debian/Ubuntu avec une IP publique
- Un accès root ou sudo
- Le port **51820/UDP** ouvert dans ton pare-feu

## 1. Installer WireGuard

```bash
sudo apt update && sudo apt install -y wireguard
```

## 2. Générer les clés du serveur

WireGuard utilise un système de clés publique/privée (comme SSH).

```bash
cd /etc/wireguard
umask 077
wg genkey | tee server_private.key | wg pubkey > server_public.key
```

> Les fichiers de clés sont automatiquement créés avec les bonnes permissions grâce à `umask 077`.

Note les deux clés, tu en auras besoin :

```bash
cat server_private.key
cat server_public.key
```

## 3. Configurer le serveur

Crée le fichier de configuration :

```bash
sudo nano /etc/wireguard/wg0.conf
```

```ini
[Interface]
# Clé privée du serveur
PrivateKey = CLE_PRIVEE_SERVEUR

# Adresse IP du serveur dans le VPN
Address = 10.0.0.1/24

# Port d'écoute
ListenPort = 51820

# Active le forwarding pour router le trafic des clients
PostUp = iptables -A FORWARD -i wg0 -j ACCEPT; iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
PostDown = iptables -D FORWARD -i wg0 -j ACCEPT; iptables -t nat -D POSTROUTING -o eth0 -j MASQUERADE
```

> 💡 Remplace `eth0` par le nom de ton interface réseau principale (`ip a` pour la trouver).

## 4. Activer le forwarding IP

Pour que le serveur puisse router le trafic de ses clients :

```bash
echo "net.ipv4.ip_forward=1" | sudo tee -a /etc/sysctl.conf
sudo sysctl -p
```

## 5. Démarrer WireGuard

```bash
sudo systemctl enable --now wg-quick@wg0
sudo wg show
```

## 6. Ajouter un client

Génère les clés du client (sur le serveur ou directement sur le client) :

```bash
wg genkey | tee client_private.key | wg pubkey > client_public.key
```

Ajoute le client dans la config du serveur (`/etc/wireguard/wg0.conf`) :

```ini
[Peer]
# Clé publique du client
PublicKey = CLE_PUBLIQUE_CLIENT

# IP attribuée au client dans le VPN
AllowedIPs = 10.0.0.2/32
```

Recharge la config sans couper le VPN :

```bash
sudo wg syncconf wg0 <(wg-quick strip wg0)
```

## 7. Configurer le client

Sur la machine cliente, crée `/etc/wireguard/wg0.conf` :

```ini
[Interface]
PrivateKey = CLE_PRIVEE_CLIENT
Address = 10.0.0.2/24
DNS = 1.1.1.1

[Peer]
# Clé publique du SERVEUR
PublicKey = CLE_PUBLIQUE_SERVEUR
Endpoint = IP_PUBLIQUE_SERVEUR:51820
AllowedIPs = 0.0.0.0/0
PersistentKeepalive = 25
```

Démarre le VPN sur le client :

```bash
sudo wg-quick up wg0
```

> Pour un smartphone, génère un QR code avec `qrencode -t ansiutf8 < /etc/wireguard/wg0.conf` après avoir installé `qrencode` (`sudo apt install qrencode`).

## Bonnes pratiques

- **Un peer par appareil** : ne partage jamais la même clé entre plusieurs appareils
- **DNS** : utilise un résolveur DNS fiable dans la config client (`1.1.1.1`, `9.9.9.9`, ou ton propre Pi-hole)
- **Surveillance** : vérifie les connexions actives avec `sudo wg show`
- **Rotation des clés** : change régulièrement les clés de tes peers pour limiter l'impact d'une compromission
