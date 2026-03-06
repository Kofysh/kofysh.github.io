---
title: "WireGuard : Votre VPN Personnel en 10 Minutes"
date: 2025-03-10 10:00:00 +0100
categories: [Selfhost, Réseau]
tags: [wireguard, vpn, réseau, sécurité, selfhost]
---

## Pourquoi un VPN maison ?

- Accéder à vos services depuis l'extérieur **sans les exposer sur Internet**
- Sécuriser votre connexion sur un Wi-Fi public
- Contourner les restrictions réseau
- Zéro abonnement mensuel

## WireGuard vs OpenVPN

| Critère | WireGuard | OpenVPN |
|---------|-----------|---------|
| Performance | Excellente | Bonne |
| Configuration | Simple | Complexe |
| Sécurité | Très bonne | Bonne |
| Audit de code | Oui (~4000 lignes) | Difficile |
| Mobile | Natif iOS/Android | Application tierce |

## Installation avec WG-Easy (Docker)

La façon la plus simple d'installer WireGuard avec une interface web.

```bash
mkdir -p ~/docker/wireguard && cd ~/docker/wireguard
```

```bash
# .env
WG_HOST=vpn.mondomaine.fr
PASSWORD_HASH=$$2y$$10$$hash-bcrypt-de-votre-mot-de-passe

# Générer le hash :
# docker run --rm ghcr.io/wg-easy/wg-easy wgpw VotreMotDePasse
```

```yaml
# docker-compose.yml
services:
  wg-easy:
    image: ghcr.io/wg-easy/wg-easy:latest
    container_name: wireguard
    environment:
      - LANG=fr
      - WG_HOST=${WG_HOST}
      - PASSWORD_HASH=${PASSWORD_HASH}
      - WG_DEFAULT_DNS=1.1.1.1,8.8.8.8
      - WG_DEFAULT_ADDRESS=10.8.0.x
      - WG_ALLOWED_IPS=0.0.0.0/0
      - UI_TRAFFIC_STATS=true
    volumes:
      - ./data:/etc/wireguard
    ports:
      - "51820:51820/udp"
    networks:
      - proxy
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.wireguard.rule=Host(`vpn.mondomaine.fr`)"
      - "traefik.http.services.wireguard.loadbalancer.server.port=51821"
    cap_add:
      - NET_ADMIN
      - SYS_MODULE
    sysctls:
      - net.ipv4.conf.all.src_valid_mark=1
      - net.ipv4.ip_forward=1
    restart: unless-stopped

networks:
  proxy:
    external: true
```

N'oubliez pas d'ouvrir le port UDP sur votre pare-feu :

```bash
sudo ufw allow 51820/udp comment 'WireGuard'
```

Et sur votre box : port **51820 UDP** → IP du serveur.

## Utilisation

1. Accédez à `https://vpn.mondomaine.fr`
2. Créez un client (ex: "iPhone", "PC-Bureau")
3. Scannez le QR code avec l'app WireGuard mobile
4. Ou téléchargez le fichier `.conf` pour PC

## Installation manuelle (sans Docker)

```bash
sudo apt install wireguard

# Générer les clés serveur
wg genkey | tee /etc/wireguard/privatekey | wg pubkey > /etc/wireguard/publickey

cat /etc/wireguard/publickey
```

```ini
# /etc/wireguard/wg0.conf
[Interface]
Address = 10.8.0.1/24
ListenPort = 51820
PrivateKey = CLE_PRIVEE_SERVEUR

[Peer]
# PC Bureau
PublicKey = CLE_PUBLIQUE_CLIENT
AllowedIPs = 10.8.0.2/32
```

```bash
sudo systemctl enable --now wg-quick@wg0
```

## Test de connexion

```bash
# Depuis votre téléphone (données mobiles, Wi-Fi coupé)
ping 10.8.0.1

# Vérifier l'IP publique
curl ifconfig.me  # Doit afficher l'IP de votre serveur
```

> WireGuard est **stateless** : si votre IP change, la connexion reprend automatiquement.
{: .prompt-tip }
