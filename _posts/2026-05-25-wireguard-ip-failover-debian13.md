---
title: "Tunnel WireGuard IP Failover — Adapté pour Debian 13 (nftables)"
date: 2026-05-25 22:00:00 +0200
categories: [Tutoriels, Réseau]
tags: [wireguard, vpn, réseau, vps, ip-failover, nftables, debian13, linux]
description: "Version mise à jour du tutoriel WireGuard IP Failover compatible Debian 13 Trixie, qui abandonne iptables au profit de nftables."
---

> **Basé sur :** Ce tutoriel est une adaptation de [ma documentation WireGuard IP Failover]({% post_url 2026-05-22-wireguard-ip-failover-tunnel %}) pour la compatibilité avec Debian 13 "Trixie". Le crédit original va à [Tristan BRINGUIER (creeper.fr)](https://creeper.fr/wireguard), licence [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/).
{: .prompt-info }

## Pourquoi ce nouveau tutoriel ?

Debian 13 "Trixie" **supprime le support natif d'`iptables`** et bascule définitivement sur **nftables** comme backend de filtrage. Les règles `PostUp`/`PostDown` à base d'`iptables` présentes dans le tutoriel original échouent silencieusement ou retournent des erreurs, cassant le routage du tunnel.

Il y a également un problème spécifique aux **conteneurs LXC sur Proxmox** avec Debian 13 : si le nesting est activé, `wg-quick@wg0` reste bloqué indéfiniment au démarrage.

Ce tutoriel documente les modifications nécessaires pour migrer vers Debian 13.

> **Si vous n'êtes pas encore sur Debian 13**, le [tutoriel original]({% post_url 2026-05-22-wireguard-ip-failover-tunnel %}) reste valide pour Debian 11 et 12.
{: .prompt-tip }

---

## Correction n°1 : Si vous êtes en LXC sur Proxmox

Sur Proxmox, avant toute installation, **désactiver le nesting** sur le conteneur LXC, sinon `wg-quick` restera bloqué au démarrage :

```bash
# Depuis le shell Proxmox (pas dans le CT)
pct set <CTID> --features nesting=0
```

Puis redémarrer le conteneur.

---

## Installation de WireGuard

La commande d'installation change sous Debian 13 : **`iptables` n'est plus nécessaire**, on installe uniquement `nftables` à la place.

```bash
apt update
apt full-upgrade -y
apt install wireguard-tools resolvconf nftables arping sudo bash curl wget -y
apt autoremove -y
reboot
```

> Sous Debian 13, `nftables` est déjà présent et actif par défaut. Le paquet `iptables` est optionnel et ne doit plus être utilisé comme backend principal.
{: .prompt-info }

Le déploiement du script d'installation WireGuard reste identique :

```bash
curl -O https://raw.githubusercontent.com/angristan/wireguard-install/master/wireguard-install.sh
chmod +x wireguard-install.sh
bash wireguard-install.sh
```

---

## Correction n°2 : Remplacer les règles iptables par nftables

C'est **le changement principal**. Dans le fichier `/etc/wireguard/wg0.conf`, toutes les lignes `PostUp` et `PostDown` à base d'`iptables` doivent être remplacées.

### Ancienne configuration (Debian 11/12 — ne fonctionne plus sur Debian 13)

```ini
PostUp = iptables -I FORWARD -i eth0 -o wg0 -s 10.66.66.0/24 -j ACCEPT; iptables -I FORWARD -i wg0 -d 10.66.66.0/24 -j ACCEPT; iptables -t nat -A POSTROUTING -o eth0 -s 10.66.66.0/24 -j MASQUERADE; iptables -I INPUT -p udp -s 10.66.66.0/24 -j ACCEPT
PostDown = iptables -D FORWARD -i eth0 -o wg0 -s 10.66.66.0/24 -j ACCEPT; iptables -D FORWARD -i wg0 -d 10.66.66.0/24 -j ACCEPT; iptables -t nat -D POSTROUTING -o eth0 -s 10.66.66.0/24 -j MASQUERADE; iptables -D INPUT -p udp -s 10.66.66.0/24 -j ACCEPT
```

### Nouvelle configuration (Debian 13 — nftables natif)

```ini
PostUp = nft add table ip wg_nat; nft add chain ip wg_nat postrouting { type nat hook postrouting priority 100 \; }; nft add rule ip wg_nat postrouting oifname "eth0" ip saddr 10.66.66.0/24 masquerade; nft add table ip wg_filter; nft add chain ip wg_filter forward { type filter hook forward priority 0 \; }; nft add rule ip wg_filter forward iifname "eth0" oifname "wg0" ip saddr 10.66.66.0/24 accept; nft add rule ip wg_filter forward iifname "wg0" ip daddr 10.66.66.0/24 accept
PostDown = nft delete table ip wg_nat; nft delete table ip wg_filter
```

> N'oubliez pas de remplacer `eth0` par le vrai nom de votre interface réseau (`ip a` pour la trouver) !
{: .prompt-warning }

### Configuration complète du VPS après modification

```ini
[Interface]
Address = 10.66.66.1/24,fd42:42:42::1/64
ListenPort = 62052
PrivateKey = <votre-clé-privée>
PostUp = nft add table ip wg_nat; nft add chain ip wg_nat postrouting { type nat hook postrouting priority 100 \; }; nft add rule ip wg_nat postrouting oifname "eth0" ip saddr 10.66.66.0/24 masquerade; nft add table ip wg_filter; nft add chain ip wg_filter forward { type filter hook forward priority 0 \; }; nft add rule ip wg_filter forward iifname "eth0" oifname "wg0" ip saddr 10.66.66.0/24 accept; nft add rule ip wg_filter forward iifname "wg0" ip daddr 10.66.66.0/24 accept
PostDown = nft delete table ip wg_nat; nft delete table ip wg_filter

### Client MaVM
[Peer]
PublicKey = <clé-publique-client>
PresharedKey = <preshared-key>
AllowedIPs = 10.66.66.2/32,fd42:42:42::2/128,<ip-supplémentaire>/32
```

---

## Correction n°3 : Configuration du client (PostUp MSS Clamping)

Sur le client Debian 13, la ligne `PostUp` pour le clamping MSS doit également être migrée vers nftables :

### Ancienne ligne (Debian 11/12)

```ini
PostUp = iptables -t mangle -A POSTROUTING -p tcp --tcp-flags SYN,RST SYN -o wg0 -j TCPMSS --clamp-mss-to-pmtu
```

### Nouvelle ligne (Debian 13 — nftables)

```ini
PostUp = nft add table ip wg_mss; nft add chain ip wg_mss postrouting { type filter hook postrouting priority mangle \; }; nft add rule ip wg_mss postrouting oifname "wg0" tcp flags syn tcp option maxseg size set rt mtu
PostDown = nft delete table ip wg_mss
```

### Configuration client complète

```ini
[Interface]
PrivateKey = <votre-clé-privée-client>
Address = <ip-supplémentaire>/32,fd42:42:42::2/128
DNS = 1.1.1.1,1.0.0.1
PostUp = nft add table ip wg_mss; nft add chain ip wg_mss postrouting { type filter hook postrouting priority mangle \; }; nft add rule ip wg_mss postrouting oifname "wg0" tcp flags syn tcp option maxseg size set rt mtu
PostDown = nft delete table ip wg_mss

[Peer]
PublicKey = <clé-publique-vps>
PresharedKey = <preshared-key>
Endpoint = <ip-vps>:62052
AllowedIPs = 0.0.0.0/0,::/0
```

---

## Déploiement sur un client Debian 13

```bash
# Installer wireguard et nftables (iptables retiré)
apt install wireguard-tools resolvconf nftables

# Créer le fichier de configuration wireguard
nano /etc/wireguard/wg0.conf
# (coller la configuration client modifiée)

# Activer et lancer au démarrage
systemctl enable wg-quick@wg0 --now

# Vérifier que l'IP est bien montée
ip a
curl ifconfig.me
```

---

## Alternative : garder iptables temporairement

Si vous souhaitez une solution de transition rapide sans réécrire les règles, vous pouvez réinstaller la couche de compatibilité `iptables` (qui utilise nftables en backend) :

```bash
apt install iptables
```

> Cette solution est **temporaire**. Le paquet `iptables` sur Debian 13 est un wrapper nftables, mais son support sera progressivement abandonné. Migrez vers la solution nftables native dès que possible.
{: .prompt-warning }

---

## Diagnostics spécifiques à Debian 13

### Vérifier les logs de wg-quick

```bash
sudo journalctl -u wg-quick@wg0 -xe
```

### Vérifier les règles nftables actives

```bash
# Lister toutes les tables et règles nftables actives
nft list ruleset

# Vérifier que les tables WireGuard ont bien été créées au démarrage
nft list table ip wg_nat
nft list table ip wg_filter
```

### Tester le MASQUERADE manuellement

```bash
# Appliquer manuellement la règle pour tester
nft add table ip wg_test
nft add chain ip wg_test postrouting { type nat hook postrouting priority 100 \; }
nft add rule ip wg_test postrouting oifname "eth0" masquerade

# Vérifier
nft list table ip wg_test

# Nettoyer le test
nft delete table ip wg_test
```

### LXC Proxmox : wg-quick bloqué au démarrage

Si `systemctl enable --now wg-quick@wg0` reste bloqué indéfiniment dans un LXC :

```bash
# Depuis le shell Proxmox (hôte, pas dans le CT)
pct set <CTID> --features nesting=0
pct reboot <CTID>
```

### Conflit avec Network Manager

Si Network Manager intercepte l'interface WireGuard avant `wg-quick` :

```bash
# Désactiver la gestion de wg0 par Network Manager
cat > /etc/NetworkManager/conf.d/wireguard-unmanaged.conf << 'EOF'
[keyfile]
unmanaged-devices=interface-name:wg*
EOF
systemctl restart NetworkManager
```

---

Le reste de la configuration (achat d'IPs supplémentaires, association côté serveur, script arping pour le routage HMS) reste **identique** au [tutoriel original]({% post_url 2026-05-22-wireguard-ip-failover-tunnel %}). Seules les règles de pare-feu changent.

---

*Adaptation pour Debian 13 par [Kofy](https://yipyip.fr) — [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/)*
