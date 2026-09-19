---
title: "BGP en homelab avec FRRouting"
layout: post
date: 2026-09-19 20:00:00 +0200
categories: [Tutoriels, Réseau]
tags: [BGP, FRRouting, VyOS, Debian 13, homelab, VPS, ingénierie réseau]
image: /assets/img/covers/bgp-homelab.svg
description: "Monter une session BGP en homelab avec FRRouting sur Debian 13 : peering eBGP avec un transitaire, annonce de préfixes, sécurisation TTL/MD5, et bases du failover multi-uplink."
permalink: /posts/bgp-homelab-frrouting/
---

## Pourquoi apprendre BGP en homelab

BGP (Border Gateway Protocol) est le protocole qui fait tenir Internet : c'est lui qui décide comment un préfixe IP est atteint entre réseaux autonomes (AS). En entreprise ou chez un hébergeur, c'est BGP qui permet d'annoncer ses propres IP, de basculer automatiquement d'un uplink à l'autre en cas de panne, ou de faire du multihoming. Le monter en homelab avec **FRRouting** (la suite de routage open source qui a remplacé Quagga) permet de manipuler ces concepts sur du vrai matériel, avant de les revoir en certification ou en prod.

Ce guide part du principe que vous avez (ou simulez) un AS et un transitaire prêt à peerer avec vous — en pratique chez la plupart des hébergeurs qui proposent du BGP en LOA (VPS dédiés BGP, RIPE Atlas, ou simplement un lab entre deux VM).

## Prérequis

- Deux machines (VPS ou VM) sous **Debian 13**, avec accès root — l'une jouera le rôle de votre routeur, l'autre celle du "transitaire" si vous simulez tout en local.
- Un numéro d'AS (privé `64512-65534` pour du lab, ou un vrai ASN si vous avez fait la démarche RIPE/ARIN).
- Un bloc IP à annoncer (un `/24` de test en interne, ou un vrai bloc si vous avez une LOA chez un hébergeur BGP-friendly).
- Des bases en adressage IP et en routage statique.

## Vue d'ensemble du lab

```text
   AS 65001 (vous)                    AS 65002 (transitaire/lab)
┌─────────────────┐   eBGP    ┌─────────────────┐
│ FRRouting           │◄────────►│ FRRouting            │
│ Router-ID 10.0.0.1  │  10.0.0.0/30 │ Router-ID 10.0.0.2 │
│ annonce 203.0.113.0/24 │        │ reçoit les préfixes  │
└─────────────────┘           └─────────────────┘
```

## Étape 1 — Installer FRRouting

Sur chaque machine :

```bash
curl -s https://deb.frrouting.org/frr/keys.gpg | sudo tee /usr/share/keyrings/frrouting.gpg > /dev/null
echo "deb [signed-by=/usr/share/keyrings/frrouting.gpg] https://deb.frrouting.org/frr $(lsb_release -s -c) frr-stable" | \
  sudo tee /etc/apt/sources.list.d/frr.list
apt update
apt install -y frr frr-pythontools
```

Activez uniquement le démon BGP (les autres restent désactivés par défaut) :

```bash
sed -i 's/^bgpd=no/bgpd=yes/' /etc/frr/daemons
```

Activez le forwarding IP, indispensable pour router du trafic transitant par votre machine :

```bash
echo "net.ipv4.ip_forward=1" >> /etc/sysctl.d/99-frr.conf
sysctl -p /etc/sysctl.d/99-frr.conf
systemctl restart frr
```

## Étape 2 — Configurer le lien point-à-point entre les deux routeurs

Sur le routeur AS 65001 :

```bash
ip addr add 10.0.0.1/30 dev eth1
```

Sur le routeur AS 65002 :

```bash
ip addr add 10.0.0.2/30 dev eth1
```

Vérifiez la connectivité de base avant de toucher à BGP :

```bash
ping -c3 10.0.0.2
```

## Étape 3 — Configurer la session eBGP

Entrez dans le CLI unifié de FRR :

```bash
sudo vtysh
```

Sur le routeur AS 65001 :

```text
configure terminal
router bgp 65001
 bgp router-id 10.0.0.1
 no bgp default ipv4-unicast
 neighbor 10.0.0.2 remote-as 65002
 neighbor 10.0.0.2 description Peer-AS65002
 !
 address-family ipv4 unicast
  network 203.0.113.0/24
  neighbor 10.0.0.2 activate
 exit-address-family
end
write memory
```

Sur le routeur AS 65002 (miroir) :

```text
configure terminal
router bgp 65002
 bgp router-id 10.0.0.2
 no bgp default ipv4-unicast
 neighbor 10.0.0.1 remote-as 65001
 !
 address-family ipv4 unicast
  neighbor 10.0.0.1 activate
 exit-address-family
end
write memory
```

> `no bgp default ipv4-unicast` désactive l'activation automatique d'IPv4 pour tout voisin ajouté : vous contrôlez explicitement quelles address-families sont échangées avec chaque peer, une bonne pratique de sécurité et de lisibilité.

## Étape 4 — Vérifier que le préfixe est bien annoncé et reçu

Depuis `vtysh`, côté AS 65001 :

```text
show bgp summary
show bgp neighbors 10.0.0.2
```

Côté AS 65002, vérifiez que le préfixe `203.0.113.0/24` est bien reçu :

```text
show bgp ipv4 unicast
show ip route bgp
```

Un état `Established` dans `show bgp summary` confirme que la session tourne. Le préfixe doit apparaître avec `10.0.0.1` comme next-hop côté AS 65002.

## Étape 5 — Sécuriser la session (TTL, mot de passe, filtrage)

Une session BGP mal protégée est une porte ouverte à des injections de routes. Ajoutez au minimum :

```text
configure terminal
router bgp 65001
 neighbor 10.0.0.2 password VotreSecretMD5
 neighbor 10.0.0.2 ttl-security hops 1
end
```

Le `ttl-security hops 1` (GTSM) rejette tout paquet BGP dont le TTL a été décrémenté plus que prévu — utile contre le spoofing depuis un réseau distant, en plus du filtrage au niveau du pare-feu (n'autoriser le port TCP 179 que depuis l'IP du peer).

## Étape 6 — Filtrer ce que vous annoncez et acceptez

Ne jamais faire confiance à un peer par défaut : limitez précisément les préfixes échangés avec des `prefix-list` :

```text
configure terminal
ip prefix-list PL-OUT seq 5 permit 203.0.113.0/24
!
route-map RM-OUT permit 10
 match ip address prefix-list PL-OUT
!
router bgp 65001
 address-family ipv4 unicast
  neighbor 10.0.0.2 route-map RM-OUT out
 exit-address-family
end
```

Ainsi, même si votre table de routage locale contient d'autres préfixes, seul `203.0.113.0/24` sera annoncé au peer.

## Étape 7 — Simuler un failover multi-uplink

Pour du vrai failover, ajoutez un second peer (un deuxième transitaire ou un deuxième lien) et jouez sur les attributs de préférence de chemin :

```text
router bgp 65001
 neighbor 10.0.0.6 remote-as 65003
 address-family ipv4 unicast
  neighbor 10.0.0.6 activate
  neighbor 10.0.0.6 route-map RM-BACKUP-IN in
 exit-address-family
```

```text
route-map RM-BACKUP-IN permit 10
 set local-preference 50
```

Une `local-preference` plus basse rend ce chemin moins préféré : il ne sera utilisé qu'en cas d'indisponibilité du premier peer. Coupez l'interface du premier lien (`ip link set eth1 down`) et observez avec `show ip route bgp` le basculement automatique vers le second uplink.

## Dépannage

1. Session bloquée en `Active`/`Connect` → vérifiez la connectivité IP de base (`ping`) et que le port TCP 179 n'est pas bloqué par un pare-feu.
2. Le préfixe n'apparaît pas côté voisin → vérifiez qu'il existe bien dans la table de routage locale (`network` dans FRR ne fait qu'annoncer un préfixe déjà présent, il ne le crée pas) et que `neighbor ... activate` a été fait dans la bonne address-family.
3. Route reçue mais non installée → conflit avec une route statique de préférence supérieure, ou filtrage par une `route-map` mal écrite (`show route-map` pour vérifier).

## Conclusion

Ce lab reproduit le strict minimum d'une vraie session eBGP : peering, annonce filtrée, sécurisation TTL/MD5, et un début de politique de préférence pour le failover. C'est la même logique que celle utilisée par un hébergeur ou une entreprise multihomée, seule l'échelle change. Prochaine étape naturelle : rediffuser les préfixes appris en BGP vers un IGP interne (OSPF) pour du vrai transit — c'est justement le sujet du tuto MPLS/OSPF qui suit.

Bon peering ! 🛰️
