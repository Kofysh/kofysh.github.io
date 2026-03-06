---
title: "Pi-hole : Bloquer les Pubs sur tout votre Réseau"
date: 2025-03-20 10:00:00 +0100
categories: [Selfhost, Réseau]
tags: [pihole, dns, publicités, vie-privée, réseau]
---

## Qu'est-ce que Pi-hole ?

Pi-hole est un serveur DNS qui bloque les publicités et les traqueurs **pour tout votre réseau**. Tous vos appareils (TV, téléphones, PC, consoles) bénéficient du blocage sans installer d'extension.

## Installation avec Docker

```bash
mkdir -p ~/docker/pihole && cd ~/docker/pihole
```

```yaml
# docker-compose.yml
services:
  pihole:
    image: pihole/pihole:latest
    container_name: pihole
    environment:
      - TZ=Europe/Paris
      - WEBPASSWORD=VotreMotDePasse123!
      - PIHOLE_DNS_=1.1.1.1;8.8.8.8
      - DNSMASQ_LISTENING=all
      - FTLCONF_LOCAL_IPV4=IP_DU_SERVEUR
    volumes:
      - ./pihole:/etc/pihole
      - ./dnsmasq:/etc/dnsmasq.d
    ports:
      - "53:53/tcp"
      - "53:53/udp"
    networks:
      - proxy
      - interne
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.pihole.rule=Host(`pihole.mondomaine.fr`)"
      - "traefik.http.services.pihole.loadbalancer.server.port=80"
    cap_add:
      - NET_ADMIN
    restart: unless-stopped

networks:
  proxy:
    external: true
  interne:
    driver: bridge
```

> Désactivez le résolveur DNS systemd avant de démarrer :
{: .prompt-warning }

```bash
sudo systemctl disable --now systemd-resolved
sudo rm /etc/resolv.conf
echo "nameserver 1.1.1.1" | sudo tee /etc/resolv.conf

docker compose up -d
```

## Configuration du réseau

### Option 1 : Via votre box (recommandé)

Dans votre box internet, modifiez le serveur DNS DHCP pour qu'il pointe vers l'IP de votre serveur Pi-hole. Tous les appareils du réseau l'utiliseront automatiquement.

### Option 2 : Appareil par appareil

Configurez manuellement le DNS sur chaque appareil :

```
DNS principal : IP_DU_SERVEUR
DNS secondaire : 1.1.1.1 (fallback)
```

## Listes de blocage recommandées

Dans l'interface Pi-hole → Adlists :

```
# Listes essentielles
https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts
https://adaway.org/hosts.txt
https://v.firebog.net/hosts/AdguardDNS.txt
https://v.firebog.net/hosts/Easylist.txt

# Anti-tracking
https://v.firebog.net/hosts/Easyprivacy.txt
https://raw.githubusercontent.com/crazy-max/WindowsSpyBlocker/master/data/hosts/spy.txt

# Malware
https://v.firebog.net/hosts/Prigent-Crypto.txt
```

Puis mettez à jour :

```bash
docker exec pihole pihole -g
```

## DNS-over-HTTPS avec Cloudflared

Pour chiffrer vos requêtes DNS :

```yaml
  cloudflared:
    image: cloudflare/cloudflared:latest
    container_name: cloudflared
    command: proxy-dns --port 5053 --upstream https://1.1.1.1/dns-query
    networks:
      - interne
    restart: unless-stopped
```

Puis dans Pi-hole, changez le DNS upstream vers `cloudflared:5053`.

## Statistiques

Pi-hole affiche en temps réel :
- % de requêtes bloquées (en général 15-25%)
- Top des domaines bloqués
- Top des clients
- Graphiques sur 24h

> En moyenne, Pi-hole bloque **20% des requêtes DNS** sur un réseau domestique typique.
{: .prompt-info }
