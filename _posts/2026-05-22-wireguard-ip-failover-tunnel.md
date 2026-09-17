---
title: "Avoir des IP publiques dédiées à la maison avec un tunnel WireGuard — à jour pour Debian 13"
layout: post
date: 2026-05-22 10:00:00 +0200
last_modified_at: 2026-09-17 17:30:00 +0200
categories: [Tutoriels, Réseau]
tags: [WireGuard, VPN, Debian 13, IP failover, self-hosting, Proxmox, VPS, HostMyServers]
image: /assets/img/covers/wireguard-failover.svg
description: "Un VPS, un tunnel WireGuard, des IPv4 supplémentaires routées chez toi sans NAT — tutoriel adapté à Debian 13, avec les tarifs HostMyServers 2026 et les correctifs ARP."
permalink: /posts/wireguard-ip-failover-tunnel/
---

Quand tu héberges chez toi (Proxmox, VMs, serveurs de jeux, Jellyfin…), ta box te limite : une seule IP, du NAT, parfois du CG-NAT qui rend l'entrée impossible. La solution que j'utilise : louer des IPv4 supplémentaires sur un VPS à quelques euros, et les **router** chez moi via un tunnel **WireGuard**, sans NAT, avec l'anti-DDoS du VPS en bonus. Article mis à jour pour **Debian 13 « Trixie »** et les tarifs 2026.

## Architecture

```text
Internet
   │
IP failover dédiée (ex. 163.5.121.254)
   │
┌──┴───────────────┐
│ VPS Debian 13    │  ← serveur WireGuard (IP principale : 146.19.168.213)
│ wg0: 10.66.66.1  │
└──┬───────────────┘
   │ tunnel chiffré UDP
┌──┴───────────────┐
│ Machine chez toi │  ← wg0 porte directement 163.5.121.254/32
└──────────────────┘
```

L'IP publique est **routée**, pas NATée : chaque machine cliente a sa propre IP dédiée, joignable entrant comme sortant.

## Choix de l'hébergeur et budget

Je me base sur **HostMyServers** (infra française, anti-DDoS inclus). Depuis 2025-2026, les IP « one-shot à vie » n'existent plus : chaque VPS **inclut 6 IPv4** (frais d'activation uniques de 1,66 € HT pour celles-ci), puis **1,60 € TTC/mois par IPv4** au-delà. Ça reste bien moins cher qu'OVH (≈2,87 €/mois) ou Hetzner (1,70 €/mois + setup).

> ℹ️ Note à jour : tu n'as plus besoin d'anticiper des années de consommation — les IP au-delà de 6 sont réversibles d'un mois sur l'autre.

Depuis l'espace client → **Configuration** → **Commander IP Supplémentaires**. Note bien dans un coin :
- L'**IP principale du VPS** = celle avec le reverse DNS → endpoint du tunnel ;
- Les **IP supplémentaires** = celles que tu vas router chez toi.

## Préparation du VPS

⚠️ Ancienne étape supprimée : le script `preparevps.sh` servait à virer **netplan** des images Ubuntu. Une image **Debian 13 native n'a pas de netplan** — tu peux sauter cette étape complètement.

Vérifie juste le nom de ton interface publique :

```bash
ip -br a
# Chez HMS c'est souvent eth0, mais ça peut être ens3 / enp1s0
```

## Installation de WireGuard

```bash
apt update
apt full-upgrade -y
apt install wireguard-tools resolvconf iptables arping sudo bash curl wget -y
apt autoremove -y
reboot
```

> Sur Debian 13, `iptables` pointe vers `iptables-nft`. Les commandes ci-dessous fonctionnent **telles quelles**.

Déployons le serveur avec le script **angristan** (compatible Debian 13) :

```bash
curl -O https://raw.githubusercontent.com/angristan/wireguard-install/master/wireguard-install.sh
chmod +x wireguard-install.sh
bash wireguard-install.sh
```

Laisse les paramètres par défaut (adapte l'interface publique si besoin) et crée un premier client quand proposé — un fichier `wg0-client-MaVM.conf` sera généré.

## Ajustement de la config serveur (une seule fois)

Ouvre `/etc/wireguard/wg0.conf` et remplace le bloc `PostUp`/`PostDown` généré par celui-ci (adapte `eth0` à ton interface) :

```ini
PostUp = iptables -I FORWARD -i eth0 -o wg0 -s 10.66.66.0/24 -j ACCEPT; iptables -I FORWARD -i wg0 -d 10.66.66.0/24 -j ACCEPT; iptables -t nat -A POSTROUTING -o eth0 -s 10.66.66.0/24 -j MASQUERADE; iptables -I INPUT -p udp -s 10.66.66.0/24 -j ACCEPT; ip6tables -I FORWARD -i wg0 -j ACCEPT; ip6tables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
PostDown = iptables -D FORWARD -i eth0 -o wg0 -s 10.66.66.0/24 -j ACCEPT; iptables -D FORWARD -i wg0 -d 10.66.66.0/24 -j ACCEPT; iptables -t nat -D POSTROUTING -o eth0 -s 10.66.66.0/24 -j MASQUERADE; iptables -D INPUT -p udp -s 10.66.66.0/24 -j ACCEPT; ip6tables -D FORWARD -i wg0 -j ACCEPT; ip6tables -t nat -D POSTROUTING -o eth0 -j MASQUERADE
```

Active forwarding + proxy ARP :

```bash
cat >> /etc/sysctl.conf <<'EOF'
net.ipv4.ip_forward=1
net.ipv4.conf.all.proxy_arp=1
net.ipv6.conf.all.forwarding=1
EOF

reboot
```

## Associer l'IPv4 supplémentaire au client

Dans `/etc/wireguard/wg0.conf`, bloc `[Peer]` du client, ajoute l'IP publique dans `AllowedIPs` :

```ini
### Client MaVM
[Peer]
PublicKey = VApiknwvlZmUewjbwZGFYp/77M3XUOSVde8AGcAdgzg=
PresharedKey = t+rgwqN3j8LccHtgi7GULlwBrf8ghY8HAbZN6cagP8s=
AllowedIPs = 10.66.66.2/32,fd42:42:42::2/128,163.5.121.254/32
```

```bash
systemctl restart wg-quick@wg0
wg show
```

## Modifier le profil client

Dans `wg0-client-MaVM.conf` :

1. Remplace l'adresse interne par **ton IP publique** dans `Address` ;
2. Ajoute la règle MTU.

```ini
[Interface]
PrivateKey = MM2OFVfYrJFtdAgebfPJL2hDtjaslufqoJ1yzvdN+X8=
Address = 163.5.121.254/32,fd42:42:42::2/128
DNS = 1.1.1.1,1.0.0.1
PostUp = iptables -t mangle -A POSTROUTING -p tcp --tcp-flags SYN,RST SYN -o wg0 -j TCPMSS --clamp-mss-to-pmtu

[Peer]
PublicKey = udEYVLpHnWb4o7kgjZ4pCnfUaVjqd9inXAUmak9mXxM=
PresharedKey = t+rgwqN3j8LccHtgi7GULlwBrf8ghY8HAbZN6cagP8s=
Endpoint = 146.19.168.213:62052
AllowedIPs = 0.0.0.0/0,::/0
```

## Déployer sur la machine cliente

Sur la machine chez toi (Debian 13 aussi) :

```bash
apt install wireguard-tools resolvconf iptables -y
nano /etc/wireguard/wg0.conf   # colle le contenu du profil modifié
systemctl enable wg-quick@wg0 --now

ip a             # wg0 doit porter l'IP publique
curl ifconfig.me # doit renvoyer 163.5.121.254
wg show          # handshake récent ?
```

## Diagnostics : le correctif ARP

Si l'IP publique ne répond pas depuis Internet, le routeur de l'hébergeur a « oublié » ton VPS. On garde le lien chaud avec `arping` en boucle (⚠️ adapte `eth0`) :

```bash
sudo nano /root/ips
```
```text
163.5.121.254
163.5.121.253
```

```bash
sudo nano /usr/local/bin/arping-loop.sh
```
```bash
#!/bin/bash
while true; do
for arg in $(< /root/ips); do
arping -q -c1 -P $arg -S $arg -i eth0 &
done
sleep 1
wait
done
```

```bash
chmod +x /usr/local/bin/arping-loop.sh

sudo nano /etc/systemd/system/arping-loop.service
```
```ini
[Unit]
Description=ARP Loop for keep connection on additional IPs
After=network.target

[Service]
Type=simple
ExecStart=/usr/local/bin/arping-loop.sh
Restart=always

[Install]
WantedBy=multi-user.target
```

```bash
systemctl daemon-reload
systemctl enable --now arping-loop
```

Avec `proxy_arp=1`, ce service est théoriquement facultatif, mais je le garde : il évite les coupures après reboot ou changement réseau chez HMS.

## Plusieurs clients = plusieurs IP

Règle d'or : **1 IP publique = 1 peer**. Rejoue le script angristan pour créer un nouveau client, puis une entrée par IPv4 :

```ini
### Client MaVM
[Peer]
...
AllowedIPs = 10.66.66.2/32,fd42:42:42::2/128,163.5.121.254/32

### Client MaSecondeVM
[Peer]
...
AllowedIPs = 10.66.66.3/32,fd42:42:42::3/128,163.5.121.253/32
```

## Remarques IPv6

Le `fd42:42:42::/64` du tunnel est une plage **ULA privée** : parfait pour l'interne du tunnel, mais ce n'est pas une IPv6 publique. Pour du vrai IPv6 chez toi : demande un /64 routé à ton hébergeur, assigne des /128 dans `Address`/`AllowedIPs`, et surtout **pas de NAT** — c'est routé nativement.

## Ce qui a changé dans cette mise à jour

| Élément | Ancienne version | Version 2026 (Debian 13) |
|---|---|---|
| OS du VPS | Debian 12 | Debian 13 « Trixie » ✔ |
| Tarif IP HMS | ~2 € à vie | 6 incluses + 1,60 € TTC/mois au-delà |
| Étage `preparevps.sh` (netplan) | Obligatoire | Supprimé (image Debian 13 pure) |
| Interface | `eth0` | Vérifier avec `ip -br a` |
| `iptables` | iptables classique | `iptables-nft`, mêmes commandes |
| Service `arping-loop` | ✔ | ✔ Inchangé |

## Conclusion

Le principe n'a pas bougé : un VPS + WireGuard = des IP publiques dédiées sur tes machines à la maison, sans NAT, sans limite de ports. La version Debian 13 est même plus simple qu'avant (une étape de préparation en moins). Si tu bloques, ordre de check : `wg show` → `ip route get <ip_failover>` → `tcpdump -ni eth0 host <ip_failover>`. Si rien n'arrive jusqu'à l'interface, c'est un sujet chez l'hébergeur, pas chez toi.

Bon déploiement ! 🚀