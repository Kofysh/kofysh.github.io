---
title: "OSPF et MPLS en lab avec FRRouting"
layout: post
date: 2026-09-19 20:30:00 +0200
categories: [Tutoriels, Réseau]
tags: [OSPF, MPLS, LDP, FRRouting, Debian 13, ingénierie réseau, homelab]
image: /assets/img/covers/ospf-mpls-lab.svg
description: "Construire un mini-backbone OSPF + MPLS/LDP avec FRRouting sur Debian 13 : découverte de voisinage, distribution de labels, et vérification des LSP en labo, sur trois routeurs Linux."
permalink: /posts/ospf-mpls-lab-frrouting/
---

## Ce que ce lab démontre

**OSPF** distribue les routes à l'intérieur d'un même réseau (un IGP), tandis que **MPLS** (avec **LDP** pour la distribution des labels) permet de commuter des paquets sur des chemins pré-calculés (LSP, Label Switched Paths) sans avoir à consulter la table de routage IP à chaque saut intermédiaire. C'est la base des architectures d'opérateur : MPLS s'appuie sur un IGP (OSPF ou IS-IS) pour connaître la topologie, puis LDP distribue les labels le long de ces routes.

Ce lab construit un mini-backbone à trois routeurs : deux **PE** (Provider Edge) et un **P** (Provider) au milieu, tous sous Debian 13 avec FRRouting.

## Prérequis

- Trois machines (VM ou VPS) sous **Debian 13**, chacune avec au moins deux interfaces réseau utilisables pour les liens du lab.
- Le noyau Linux doit supporter MPLS (`CONFIG_MPLS_ROUTING`, activé par défaut sur les noyaux Debian récents).
- FRRouting installé sur les trois machines (voir l'étape 1 du tuto BGP en homelab pour l'installation, identique ici).

## Topologie

```text
   PE1 ────────── P ────────── PE2
10.0.12.0/30   10.0.23.0/30
lo: 1.1.1.1    lo: 2.2.2.2    lo: 3.3.3.3
```

Chaque routeur a une adresse de loopback `/32`, utilisée comme router-id OSPF et comme adresse de transport LDP — une pratique standard qui garantit la stabilité même si une interface physique tombe.

## Étape 1 — Charger le module MPLS et activer les démons

Sur chacun des trois routeurs :

```bash
modprobe mpls_router
modprobe mpls_iptunnel
echo "mpls_router" >> /etc/modules
echo "mpls_iptunnel" >> /etc/modules
```

Activez les démons nécessaires dans FRR :

```bash
sed -i 's/^ospfd=no/ospfd=yes/' /etc/frr/daemons
sed -i 's/^ldpd=no/ldpd=yes/' /etc/frr/daemons
systemctl restart frr
```

Activez le forwarding MPLS sur chaque interface qui participera au backbone :

```bash
sysctl -w net.mpls.conf.eth1.input=1
sysctl -w net.mpls.platform_labels=100000
```

## Étape 2 — Adresser les liens et les loopbacks

Sur PE1 :

```bash
ip addr add 1.1.1.1/32 dev lo
ip addr add 10.0.12.1/30 dev eth1
```

Sur P :

```bash
ip addr add 2.2.2.2/32 dev lo
ip addr add 10.0.12.2/30 dev eth1
ip addr add 10.0.23.1/30 dev eth2
```

Sur PE2 :

```bash
ip addr add 3.3.3.3/32 dev lo
ip addr add 10.0.23.2/30 dev eth2
```

## Étape 3 — Configurer OSPF pour distribuer les loopbacks

Sur chaque routeur, via `vtysh` :

```text
configure terminal
router ospf
 ospf router-id 1.1.1.1
 network 1.1.1.1/32 area 0
 network 10.0.12.0/30 area 0
end
write memory
```

(adaptez le router-id et les réseaux annoncés à chaque machine : `2.2.2.2` + les deux liens sur P, `3.3.3.3` + le lien restant sur PE2).

Vérifiez la convergence :

```text
show ip ospf neighbor
show ip route ospf
```

Chaque routeur doit voir les loopbacks des deux autres dans sa table de routage — c'est le prérequis indispensable pour que LDP puisse établir ses sessions.

## Étape 4 — Configurer LDP

Toujours via `vtysh`, sur chaque routeur :

```text
configure terminal
mpls ldp
 router-id 1.1.1.1
 address-family ipv4
  discovery transport-address 1.1.1.1
  interface eth1
  exit-address-family
end
write memory
```

Sur P, deux interfaces participent à LDP (`eth1` et `eth2`) ; sur PE2, adaptez `router-id` à `3.3.3.3` et l'interface à `eth2`.

## Étape 5 — Vérifier les sessions et les labels

```text
show mpls ldp neighbor
show mpls ldp binding
show mpls table
```

`show mpls ldp neighbor` doit afficher un état `OPERATIONAL` pour chaque voisin direct. `show mpls table` liste les labels appris et l'action associée (swap, pop) pour chaque préfixe — c'est la preuve que le plan de données MPLS est opérationnel, indépendamment du plan de contrôle IP classique.

## Étape 6 — Tester le chemin commuté en label

Depuis PE1, tracez le chemin vers la loopback de PE2 :

```bash
ip route get 3.3.3.3
mtr -4 3.3.3.3
```

Sur le routeur intermédiaire P, un `tcpdump` sur l'interface transitaire confirme que le trafic circule encapsulé en MPLS (EtherType `0x8847`), sans qu'un lookup IP complet soit nécessaire à chaque saut :

```bash
tcpdump -i eth2 mpls -n
```

## Étape 7 — Aller plus loin : L3VPN (aperçu)

Une fois LDP opérationnel, l'étape suivante en environnement opérateur est le **L3VPN MPLS** (RFC 4364) : chaque client obtient une VRF (Virtual Routing and Forwarding) isolée sur les PE, avec des routes distinguées par un **Route Distinguisher** et propagées via **MP-BGP** plutôt que directement en IGP. FRRouting supporte les VRF Linux natives (`ip link add vrf-clientA type vrf table 10`) combinées à `router bgp ... vrf vrf-clientA` — un excellent sujet de tuto suivant si vous voulez creuser la virtualisation de backbone.

## Dépannage

1. `show ip ospf neighbor` reste vide → vérifiez que les deux interfaces sont dans la même area OSPF et que rien ne bloque les paquets multicast OSPF (224.0.0.5/224.0.0.6) entre les deux machines.
2. LDP ne passe pas en `OPERATIONAL` → l'adresse de transport (`discovery transport-address`) doit être **joignable** par le voisin, ce qui suppose qu'OSPF a bien convergé au préalable (LDP dépend de l'IGP).
3. `show mpls table` vide malgré des sessions LDP up → vérifiez que `net.mpls.conf.<interface>.input=1` a bien été appliqué sur **toutes** les interfaces du chemin, pas seulement celle du routeur de départ.

## Conclusion

Ce lab couvre le socle d'un backbone d'opérateur simplifié : OSPF pour la découverte de topologie et la distribution des loopbacks, LDP pour la distribution automatique des labels, et une vérification bout-en-bout du plan de données MPLS. C'est exactement la base théorique attendue en certification réseau, mais reproduite sur du vrai Linux avec FRRouting plutôt qu'en simulateur.

Bon labbing ! 🧪
