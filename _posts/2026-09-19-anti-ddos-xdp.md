---
title: "Créer un anti-DDoS maison avec XDP (eBPF)"
layout: post
date: 2026-09-19 19:00:00 +0200
categories: [Tutoriels, Réseau, Cybersécurité]
tags: [XDP, eBPF, DDoS, Linux, Debian 13, bpftool, iproute2, self-hosting]
image: /assets/img/covers/xdp-ddos.svg
description: "Construire un anti-DDoS maison avec XDP et eBPF : filtrage au niveau du pilote réseau, avant même l'allocation du paquet par le noyau, pour absorber des attaques à très haut débit sur Debian 13."
permalink: /posts/anti-ddos-xdp/
---

## Pourquoi XDP plutôt qu'iptables ou nftables

Un pare-feu classique (`iptables`, `nftables`) filtre les paquets une fois qu'ils ont déjà traversé une bonne partie de la pile réseau du noyau : le paquet est reçu par la carte, une structure `sk_buff` est allouée, puis les règles sont évaluées. Sous forte charge (des centaines de milliers de paquets par seconde), cette allocation devient elle-même le goulot d'étranglement — le serveur peut saturer avant même que le pare-feu ait eu l'occasion de bloquer quoi que ce soit.

**XDP (eXpress Data Path)** change la donne : c'est un point d'accroche **eBPF** situé directement dans le pilote de la carte réseau. Le programme XDP s'exécute **avant** l'allocation du `sk_buff`, directement sur le paquet brut reçu par la NIC. Un paquet jugé malveillant peut être supprimé (`XDP_DROP`) en quelques dizaines de nanosecondes, sans jamais consommer de ressources noyau plus haut dans la pile. C'est la technique utilisée par les gros opérateurs et CDN pour absorber des attaques DDoS à plusieurs dizaines, voire centaines de Gbps, sur du matériel standard.

Ce guide construit un anti-DDoS maison en plusieurs couches : une blocklist IP rapide avec l'outil `xdp-filter`, puis un programme eBPF écrit à la main pour une protection anti-SYN-flood avec limitation de débit par source, chargé en mode natif sur l'interface.

## Prérequis

- Un serveur (VPS ou dédié) sous **Debian 13**, avec accès root.
- Un noyau Linux récent (Debian 13 embarque un noyau ≥ 6.1, largement suffisant pour XDP).
- Une carte réseau dont le pilote supporte XDP en mode natif (`ixgbe`, `i40e`, `mlx4/mlx5`, `virtio_net` en mode générique sur la plupart des VPS). À défaut, XDP fonctionne en mode générique (`xdpgeneric`), plus lent mais universel.
- Des bases en C et en administration réseau Linux — ce tuto manipule des structures bas niveau.

## Vue d'ensemble

```text
Paquet réseau
     │
   [ NIC ]
     │
 ┌───┴──────────────┐
 │  Programme XDP     │  ← s'exécute ici, avant sk_buff
 │  (eBPF, notre code)│
 └───┬──────────────┘
     │
  XDP_DROP ─────► paquet détruit, jamais traité par le noyau
     │
  XDP_PASS ─────► poursuit vers la pile réseau normale (iptables, applications…)
```

## Étape 1 — Vérifier la compatibilité XDP

Identifiez votre interface publique et vérifiez le pilote utilisé :

```bash
ip -br a
ethtool -i eth0 | grep driver
```

Testez le chargement d'un programme XDP vide pour confirmer le support :

```bash
ip link set dev eth0 xdpgeneric obj /dev/null sec xdp
ip link set dev eth0 xdp off
```

Si la commande ne renvoie pas d'erreur, le mode générique fonctionne à minima. Pour le mode natif (bien plus performant), le pilote doit explicitement le supporter — c'est le cas des pilotes cités plus haut, mais pas de tous les environnements virtualisés bas de gamme.

## Étape 2 — Installer la chaîne d'outils

```bash
apt update
apt install -y clang llvm libbpf-dev linux-headers-$(uname -r) gcc make \
    bpftool iproute2 xdp-tools
```

- `clang`/`llvm` compilent le C en bytecode eBPF.
- `libbpf-dev` fournit les en-têtes pour charger et manipuler les programmes.
- `bpftool` inspecte et administre les programmes et maps eBPF chargés.
- `xdp-tools` fournit `xdp-filter`, `xdp-loader` et `xdpdump`, une boîte à outils prête à l'emploi.

## Étape 3 — Blocklist rapide avec xdp-filter

Pour un blocage immédiat sans écrire une seule ligne de C, `xdp-filter` sait déjà filtrer par IP, port ou adresse MAC :

```bash
xdp-filter load --mode native eth0
```

Bloquez une IP source malveillante :

```bash
xdp-filter ip 203.0.113.66 -m src
```

Bloquez un port cible souvent visé par des scans/floods (ex. un port non exposé) :

```bash
xdp-filter port 23
```

Vérifiez ce qui est chargé et actif :

```bash
xdpdump -D
xdp-filter status
```

Cette étape suffit déjà à absorber une bonne partie du bruit de fond (scans, IP connues malveillantes). Mais pour une vraie protection anti-DDoS réactive, il faut aller plus loin : un programme sur mesure avec limitation de débit dynamique.

## Étape 4 — Écrire un programme XDP anti-SYN-flood

Créez le fichier source :

```bash
nano xdp_antiddos.c
```

```c
#include <linux/bpf.h>
#include <linux/if_ether.h>
#include <linux/ip.h>
#include <linux/tcp.h>
#include <bpf/bpf_helpers.h>
#include <bpf/bpf_endian.h>

#define MAX_ENTRIES 65536
#define RATE_LIMIT_PPS 200   /* paquets SYN/s max par IP source */

struct {
    __uint(type, BPF_MAP_TYPE_LRU_HASH);
    __uint(max_entries, MAX_ENTRIES);
    __type(key, __u32);   /* IP source */
    __type(value, __u64); /* timestamp du dernier reset + compteur packé */
} syn_count SEC(".maps");

SEC("xdp")
int xdp_antiddos(struct xdp_md *ctx)
{
    void *data = (void *)(long)ctx->data;
    void *data_end = (void *)(long)ctx->data_end;

    struct ethhdr *eth = data;
    if ((void *)(eth + 1) > data_end)
        return XDP_PASS;
    if (eth->h_proto != bpf_htons(ETH_P_IP))
        return XDP_PASS;

    struct iphdr *ip = (void *)(eth + 1);
    if ((void *)(ip + 1) > data_end)
        return XDP_PASS;
    if (ip->protocol != IPPROTO_TCP)
        return XDP_PASS;

    struct tcphdr *tcp = (void *)ip + (ip->ihl * 4);
    if ((void *)(tcp + 1) > data_end)
        return XDP_PASS;

    /* On ne s'intéresse qu'aux paquets SYN (ouverture de connexion) */
    if (!tcp->syn || tcp->ack)
        return XDP_PASS;

    __u32 src_ip = ip->saddr;
    __u64 now = bpf_ktime_get_ns();
    __u64 *entry = bpf_map_lookup_elem(&syn_count, &src_ip);

    if (!entry) {
        __u64 init = 1;
        bpf_map_update_elem(&syn_count, &src_ip, &init, BPF_ANY);
        return XDP_PASS;
    }

    /* Fenêtre glissante simplifiée d'une seconde */
    if (*entry >= RATE_LIMIT_PPS) {
        return XDP_DROP;
    }

    __sync_fetch_and_add(entry, 1);
    return XDP_PASS;
}

char _license[] SEC("license") = "GPL";
```

> Ce compteur est volontairement simplifié (pas de vraie fenêtre glissante temporelle) pour rester lisible. En production, ajoutez un timestamp par entrée et réinitialisez le compteur toutes les secondes pour un vrai rate-limiting.

## Étape 5 — Compiler et charger le programme

Compilez en bytecode eBPF pour la cible `bpf` :

```bash
clang -O2 -g -Wall -target bpf -c xdp_antiddos.c -o xdp_antiddos.o
```

Chargez-le en mode natif sur votre interface publique :

```bash
ip link set dev eth0 xdpdrv obj xdp_antiddos.o sec xdp
```

Si le mode natif échoue (pilote non compatible), repliez-vous sur le mode générique :

```bash
ip link set dev eth0 xdpgeneric obj xdp_antiddos.o sec xdp
```

Vérifiez qu'il est bien actif :

```bash
ip link show eth0
bpftool prog show
```

## Étape 6 — Administrer la map de comptage en direct

Listez les maps chargées et leur contenu :

```bash
bpftool map list
bpftool map dump name syn_count
```

Pour retirer manuellement une IP de la surveillance (par exemple après une fausse alerte) :

```bash
bpftool map delete name syn_count key hex <octets_ip_en_hexa>
```

## Étape 7 — Combiner avec xdp-filter pour une blocklist persistante

Le programme anti-SYN-flood et `xdp-filter` peuvent être chaînés sur la même interface grâce au **dispatcher XDP** de `xdp-tools`, qui autorise plusieurs programmes XDP simultanés avec un ordre de priorité :

```bash
xdp-loader load -m native --section xdp eth0 xdp_antiddos.o
xdp-filter load --mode native eth0
xdp-loader status
```

Ainsi, les IP explicitement blacklistées sont droppées par `xdp-filter`, et les nouvelles sources qui dépassent le seuil de SYN/s sont droppées dynamiquement par votre programme.

## Étape 8 — Rendre le filtrage persistant au démarrage

Créez un service systemd qui recharge tout au boot :

```bash
nano /etc/systemd/system/xdp-antiddos.service
```

```ini
[Unit]
Description=Anti-DDoS XDP (eBPF) sur eth0
After=network.target

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/usr/sbin/xdp-loader load -m native --section xdp eth0 /root/xdp_antiddos.o
ExecStart=/usr/sbin/xdp-filter load --mode native eth0
ExecStop=/usr/sbin/xdp-loader unload eth0 --all

[Install]
WantedBy=multi-user.target
```

```bash
systemctl daemon-reload
systemctl enable --now xdp-antiddos
```

## Étape 9 — Superviser et tester

Surveillez les statistiques de drop en temps réel :

```bash
watch -n 1 'bpftool map dump name syn_count | head -20'
```

Capturez ce qui passe malgré tout le filtre (utile pour du debug) :

```bash
xdpdump -i eth0 -w /root/capture.pcap
```

Pour tester en conditions contrôlées (**uniquement sur votre propre infrastructure**, jamais contre un tiers), générez un flux SYN depuis une machine de test avec `hping3` :

```bash
apt install -y hping3
hping3 -S -p 80 --flood --rand-source <IP_DE_TEST>
```

Observez ensuite `bpftool prog show` (compteur `run_cnt`) et le trafic réellement reçu côté applicatif : le débit qui atteint vos services applicatifs doit rester stable malgré le flood.

## Dépannage

1. `ip link set dev eth0 xdpdrv obj ... sec xdp` échoue → le pilote ne supporte pas le mode natif : repassez en `xdpgeneric`.
2. Le programme se charge mais rien n'est filtré → vérifiez `bpftool prog show` (le programme doit apparaître **attaché** à l'interface, pas seulement chargé) et relisez les offsets de parsing (`ihl * 4` pour les options IP, taille variable de l'en-tête TCP).
3. Legit traffic bloqué → le seuil `RATE_LIMIT_PPS` est trop bas pour votre usage réel (un client NAT derrière une IP partagée peut légitimement ouvrir plusieurs dizaines de connexions/s) : ajustez-le et testez en environnement contrôlé avant la mise en prod.

## Conclusion

XDP déplace le filtrage au plus près du matériel, avant toute allocation mémoire côté noyau : c'est ce qui permet d'absorber des débits d'attaque que `nftables` seul ne peut pas suivre. Combiner `xdp-filter` (blocklist simple, prête à l'emploi) avec un programme eBPF sur mesure (rate-limiting anti-SYN-flood) donne une base solide d'anti-DDoS maison, extensible ensuite avec des maps plus riches (compteurs par /24, listes blanches dynamiques, intégration avec un service de détection en amont).

Bon filtrage ! 🛡️
