---
title: "Créer des IP publiques dédiées chez soi avec un tunnel WireGuard (Debian 13)"
layout: post
date: 2026-05-22 10:00:00 +0200
categories: [Tutoriels, Réseau]
tags: [WireGuard, VPN, Debian 13, IP failover, self-hosting, Proxmox, VPS, HostMyServers]
image: /assets/img/covers/wireguard-failover.svg
description: "Guide complet, pas à pas, pour router des adresses IPv4 publiques depuis un VPS jusqu'à votre réseau local via un tunnel WireGuard, sans NAT, sur Debian 13."
permalink: /posts/wireguard-ip-failover-tunnel/
---

## Le problème

Quand on héberge des services chez soi (serveurs de jeux, Proxmox, Jellyfin, sites web…), la connexion Internet fournie par une box grand public pose deux limites :

- On ne dispose généralement que d'**une seule adresse IP publique**, partagée par tout le foyer.
- Cette IP est souvent derrière du **NAT** (voire du **CG-NAT** chez certains opérateurs), ce qui rend impossible ou très limitée l'ouverture de ports depuis l'extérieur.

## La solution

L'idée est simple : louer des adresses IPv4 supplémentaires auprès d'un hébergeur de VPS, puis les **acheminer** (« router ») jusqu'à une machine chez soi via un tunnel chiffré **WireGuard**. Contrairement à une redirection de port classique, l'IP publique arrive directement sur la machine locale, sans passer par du NAT : tous les ports sont utilisables, dans les deux sens.

En bonus, le trafic passe par l'infrastructure anti-DDoS du VPS avant d'arriver chez vous, ce qui protège votre connexion personnelle.

Ce guide est rédigé pour **Debian 13 (« Trixie »)**, à la fois sur le VPS et sur la machine locale.

## Prérequis

Avant de commencer, assurez-vous d'avoir :

- Un **VPS sous Debian 13**, avec un accès root (SSH).
- Une **machine chez vous** (physique ou virtuelle), également sous Debian 13, connectée à votre réseau local.
- Un **compte chez un hébergeur** permettant de commander des adresses IPv4 supplémentaires (ce guide utilise HostMyServers à titre d'exemple).
- Des notions de base en ligne de commande Linux (édition de fichiers, gestion de services avec `systemctl`).

## Vue d'ensemble de l'architecture

```text
Internet
   │
IP publique dédiée (ex. 163.5.121.254)
   │
┌──┴───────────────┐
│ VPS Debian 13    │  ← serveur WireGuard (IP principale : 146.19.168.213)
│ wg0: 10.66.66.1  │
└──┬───────────────┘
   │ tunnel chiffré (UDP)
┌──┴───────────────┐
│ Machine chez vous│  ← l'interface wg0 porte directement 163.5.121.254/32
└──────────────────┘
```

Deux points importants à retenir :

- L'**IP principale du VPS** sert uniquement de point d'entrée pour le tunnel (l'« endpoint » WireGuard).
- Les **IP supplémentaires** commandées auprès de l'hébergeur sont celles que l'on va router vers la machine locale ; chacune sera directement utilisable comme si elle était branchée sur cette machine.

## Étape 1 — Commander les adresses IPv4 supplémentaires

Rendez-vous dans l'espace client de votre hébergeur, puis dans la section **Configuration → Commander des IP supplémentaires**.

À titre d'exemple, chez HostMyServers, chaque VPS inclut 6 IPv4 (frais d'activation unique d'environ 1,66 € HT par IP), puis environ 1,60 € TTC/mois par IPv4 additionnelle — un tarif nettement inférieur à celui d'OVH (≈2,87 €/mois) ou Hetzner (≈1,70 €/mois, avec frais de mise en service).

Notez précieusement deux informations pour la suite :

- L'**IP principale** du VPS (avec son reverse DNS) : ce sera l'adresse à laquelle le tunnel WireGuard se connectera.
- Les **IP supplémentaires** que vous venez de commander : ce sont elles qui seront routées vers votre machine.

## Étape 2 — Vérifier l'interface réseau du VPS

Avant toute manipulation, identifiez le nom exact de l'interface réseau publique du VPS (elle est utilisée dans plusieurs commandes plus bas) :

```bash
ip -br a
```

Chez la plupart des hébergeurs, cette interface s'appelle `eth0`, mais elle peut aussi porter un nom comme `ens3` ou `enp1s0` selon la virtualisation utilisée. Remplacez `eth0` par le nom réel dans toutes les commandes de ce guide.

Sur une image Debian 13 « propre » (fournie nativement par l'hébergeur), aucune configuration réseau préalable n'est nécessaire : l'interface est prête à l'emploi.

## Étape 3 — Installer WireGuard sur le VPS

Connectez-vous en SSH au VPS, puis mettez le système à jour et installez les paquets nécessaires :

```bash
apt update
apt full-upgrade -y
apt install wireguard-tools resolvconf iptables arping sudo bash curl wget -y
apt autoremove -y
reboot
```

> Sur Debian 13, la commande `iptables` s'appuie sur le moteur `iptables-nft`. Cela ne change rien à la syntaxe des commandes utilisées dans ce guide, elles fonctionnent telles quelles.

## Étape 4 — Déployer le serveur WireGuard

Le script d'installation communautaire **angristan/wireguard-install** automatise la création du serveur WireGuard et reste compatible avec Debian 13 :

```bash
curl -O https://raw.githubusercontent.com/angristan/wireguard-install/master/wireguard-install.sh
chmod +x wireguard-install.sh
bash wireguard-install.sh
```

Pendant l'installation :

1. Conservez les valeurs par défaut proposées, sauf pour l'interface publique si celle-ci diffère de `eth0` (voir étape 2).
2. Lorsque le script propose de créer un premier client, acceptez : il générera un fichier `wg0-client-MaVM.conf`, qui servira de base pour la machine locale.

## Étape 5 — Adapter la configuration du serveur

Le script génère par défaut des règles `PostUp`/`PostDown` pensées pour du NAT. Ici, on souhaite du **routage direct**, il faut donc les remplacer.

Ouvrez le fichier de configuration :

```bash
nano /etc/wireguard/wg0.conf
```

Remplacez le bloc `PostUp`/`PostDown` existant par celui-ci (pensez à adapter `eth0` si votre interface a un autre nom) :

```ini
PostUp = iptables -I FORWARD -i eth0 -o wg0 -s 10.66.66.0/24 -j ACCEPT; iptables -I FORWARD -i wg0 -d 10.66.66.0/24 -j ACCEPT; iptables -t nat -A POSTROUTING -o eth0 -s 10.66.66.0/24 -j MASQUERADE; iptables -I INPUT -p udp -s 10.66.66.0/24 -j ACCEPT; ip6tables -I FORWARD -i wg0 -j ACCEPT; ip6tables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
PostDown = iptables -D FORWARD -i eth0 -o wg0 -s 10.66.66.0/24 -j ACCEPT; iptables -D FORWARD -i wg0 -d 10.66.66.0/24 -j ACCEPT; iptables -t nat -D POSTROUTING -o eth0 -s 10.66.66.0/24 -j MASQUERADE; iptables -D INPUT -p udp -s 10.66.66.0/24 -j ACCEPT; ip6tables -D FORWARD -i wg0 -j ACCEPT; ip6tables -t nat -D POSTROUTING -o eth0 -j MASQUERADE
```

Activez ensuite le routage IP et le **proxy ARP** (indispensable pour que le VPS réponde aux requêtes ARP concernant les IP qu'il route vers vos machines) :

```bash
cat >> /etc/sysctl.conf <<'EOF'
net.ipv4.ip_forward=1
net.ipv4.conf.all.proxy_arp=1
net.ipv6.conf.all.forwarding=1
EOF

reboot
```

## Étape 6 — Associer une IP publique à un client

Dans `/etc/wireguard/wg0.conf`, repérez le bloc `[Peer]` correspondant à votre client, et ajoutez l'IP publique que vous souhaitez lui attribuer dans le champ `AllowedIPs` :

```ini
### Client MaVM
[Peer]
PublicKey = VApiknwvlZmUewjbwZGFYp/77M3XUOSVde8AGcAdgzg=
PresharedKey = t+rgwqN3j8LccHtgi7GULlwBrf8ghY8HAbZN6cagP8s=
AllowedIPs = 10.66.66.2/32,fd42:42:42::2/128,163.5.121.254/32
```

Appliquez le changement et vérifiez que le tunnel est actif :

```bash
systemctl restart wg-quick@wg0
wg show
```

## Étape 7 — Configurer la machine locale

Reprenez le fichier `wg0-client-MaVM.conf` généré à l'étape 4, et apportez deux modifications :

1. Remplacez l'adresse IP interne par **votre IP publique** dans le champ `Address`.
2. Ajoutez une règle de correction MTU (`PostUp`), pour éviter des problèmes de fragmentation sur certaines connexions.

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

Installez WireGuard et déployez cette configuration sur la machine locale (elle aussi sous Debian 13) :

```bash
apt install wireguard-tools resolvconf iptables -y
nano /etc/wireguard/wg0.conf   # collez le contenu du profil modifié ci-dessus
systemctl enable wg-quick@wg0 --now
```

Vérifiez que tout fonctionne correctement :

```bash
ip a             # l'interface wg0 doit porter l'IP publique
curl ifconfig.me # doit renvoyer 163.5.121.254
wg show          # un handshake récent doit apparaître
```

## Étape 8 — Corriger les éventuels problèmes ARP

Si l'IP publique reste injoignable depuis Internet malgré une configuration correcte, c'est généralement que le routeur de l'hébergeur n'a pas encore mis à jour sa table ARP pour associer cette IP au VPS. La solution consiste à maintenir cette association active avec des requêtes `arping` périodiques.

Créez la liste des IP à surveiller :

```bash
sudo nano /root/ips
```
```text
163.5.121.254
163.5.121.253
```

Créez le script qui envoie les requêtes ARP en boucle (adaptez `eth0` si nécessaire) :

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

Rendez le script exécutable, puis transformez-le en service systemd pour qu'il démarre automatiquement :

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

Activez et démarrez le service :

```bash
systemctl daemon-reload
systemctl enable --now arping-loop
```

Avec `proxy_arp` activé (étape 5), ce service est théoriquement facultatif — mais il est recommandé de le conserver, car il évite des coupures après un redémarrage ou un changement réseau côté hébergeur.

## Étape 9 — Gérer plusieurs machines et plusieurs IP

La règle à retenir est simple : **une IP publique correspond à un client (« peer ») WireGuard**. Pour ajouter une nouvelle machine :

1. Relancez le script `wireguard-install.sh` sur le VPS pour créer un nouveau client.
2. Ajoutez une entrée `[Peer]` par IPv4 supplémentaire dans `/etc/wireguard/wg0.conf` :

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

## Aller plus loin avec IPv6

La plage `fd42:42:42::/64` utilisée à l'intérieur du tunnel est une plage **ULA privée** (usage interne uniquement, non routable sur Internet). Pour disposer d'une véritable IPv6 publique chez vous :

- Demandez à votre hébergeur un préfixe **/64 routé**.
- Assignez des adresses **/128** issues de ce préfixe dans les champs `Address` et `AllowedIPs`.
- Comme pour l'IPv4, tout se fait en **routage direct, sans NAT**.

## Dépannage

Si une IP publique ne répond pas comme attendu, procédez dans cet ordre :

1. `wg show` — le tunnel affiche-t-il un handshake récent avec le bon peer ?
2. `ip route get <ip_publique>` — la route vers cette IP est-elle correcte côté VPS et côté machine locale ?
3. `tcpdump -ni eth0 host <ip_publique>` (sur le VPS) — le trafic arrive-t-il seulement jusqu'à l'interface publique du VPS ?

Si le trafic n'atteint même pas l'interface du VPS à cette dernière étape, le problème se situe côté hébergeur (routage réseau) plutôt que dans votre configuration.

## Conclusion

Le principe reste simple malgré le nombre d'étapes : un VPS et un tunnel WireGuard permettent d'obtenir de véritables IP publiques dédiées sur vos machines à la maison, sans NAT et sans limitation de ports. Sur Debian 13, la mise en place est directe, sans étape de préparation réseau supplémentaire — suivez les étapes dans l'ordre et vérifiez chaque point avec les commandes de contrôle indiquées.

Bon déploiement ! 🚀
