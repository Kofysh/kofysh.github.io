---
title: "WireGuard sur Linux : VPN moderne en 15 minutes"
date: 2026-04-07 10:00:00 +0100
categories: [Tutoriels, Réseau]
tags: [wireguard, vpn, linux, réseau, sécurité]
---

WireGuard est un VPN minimaliste et ultra-performant intégré au kernel Linux depuis la version 5.6. Sa configuration est simple et ses performances dépassent OpenVPN et IPsec.

## Installation

```bash
sudo apt install wireguard
```

## Côté serveur

### Génération des clés

```bash
cd /etc/wireguard
umask 077
wg genkey | tee server_private.key | wg pubkey > server_public.key
wg genkey | tee client1_private.key | wg pubkey > client1_public.key
cat server_private.key  # Note cette valeur
cat client1_public.key  # Note cette valeur
```

### Configuration du serveur (`/etc/wireguard/wg0.conf`)

```ini
[Interface]
Address = 10.0.0.1/24
ListenPort = 51820
PrivateKey = CLE_PRIVEE_SERVEUR

# Activer le routage IP
PostUp = iptables -A FORWARD -i %i -j ACCEPT; iptables -A FORWARD -o %i -j ACCEPT; iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
PostDown = iptables -D FORWARD -i %i -j ACCEPT; iptables -D FORWARD -o %i -j ACCEPT; iptables -t nat -D POSTROUTING -o eth0 -j MASQUERADE

[Peer]  # Client 1
PublicKey = CLE_PUBLIQUE_CLIENT1
AllowedIPs = 10.0.0.2/32
```

```bash
# Activer l'IP forwarding
echo 'net.ipv4.ip_forward=1' | sudo tee -a /etc/sysctl.conf
sudo sysctl -p

# Démarrer WireGuard
sudo systemctl enable --now wg-quick@wg0
sudo wg show
```

### Ouvrir le port dans le pare-feu

```bash
# UFW
sudo ufw allow 51820/udp comment 'WireGuard'

# OPNsense
# Firewall → Rules → WAN → Add → Protocol UDP, Dest Port 51820
```

## Côté client

Installe WireGuard sur Linux/Windows/Android/iOS, puis configure :

```ini
[Interface]
Address = 10.0.0.2/24
PrivateKey = CLE_PRIVEE_CLIENT1
DNS = 1.1.1.1

[Peer]
PublicKey = CLE_PUBLIQUE_SERVEUR
Endpoint = IP_SERVEUR:51820
AllowedIPs = 0.0.0.0/0  # Tout le trafic via VPN
# Ou pour split tunneling (seulement le réseau interne) :
# AllowedIPs = 10.0.0.0/24
PersistentKeepalive = 25
```

## Commandes utiles

```bash
# Voir les peers connectés et leur trafic
sudo wg show

# Recharger la config sans couper les connexions
sudo wg syncconf wg0 <(wg-quick strip wg0)

# Ajouter un peer à chaud
sudo wg set wg0 peer CLE_PUBLIQUE_NOUVEAU allowedips 10.0.0.3/32
```

> `PersistentKeepalive = 25` est indispensable pour les clients derrière NAT (box internet, mobile) — ça maintient le tunnel actif.
{: .prompt-tip }
