---
title: "Avoir des adresses IPv4/IPv6 chez soi avec un tunnel WireGuard"
date: 2026-05-22 20:00:00 +0200
categories: [Tutoriels, Réseau]
tags: [wireguard, vpn, réseau, vps, ip-failover, iptables, linux]
description: "Obtenir des adresses IP dédiées chez soi via un tunnel WireGuard vers un VPS, protégées par Anti-DDoS et peu chères."
---

> **Crédit :** Ce tutoriel est une adaptation de la documentation originale de [Tristan BRINGUIER (creeper.fr)](https://creeper.fr/wireguard), publiée sous licence [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/). Merci à lui pour ce travail !
{: .prompt-info }

## Introduction

J'ai chez moi un serveur sur lequel tourne [Proxmox](https://www.proxmox.com/), un hyperviseur qui me permet de créer des machines virtuelles et des [conteneurs Linux](https://linuxcontainers.org/) afin d'héberger différents services pour mes diverses activités d'auto-hébergement.

Seulement, avec un seul abonnement internet de particulier et une seule IP résidentielle, je suis vite limité par le nombre de ports disponibles. Certains opérateurs en France retirent l'ouverture de ports, et les box 4G/5G ne la proposent pas à cause du [CG-NAT](https://fr.wikipedia.org/wiki/Carrier-grade_NAT).

Ces limitations m'ont amené à mettre en place une solution pour avoir plusieurs adresses IP chez soi, dédiées, protégées par un Anti-DDoS et peu chères.

## Choix de l'hébergeur

J'ai choisi [HostMyServers](https://www.hostmyservers.fr/), un hébergeur français 🇫🇷 avec plusieurs années d'existence. Le premier [VPS SSD](https://www.hostmyservers.fr/vps-ssd) suffit amplement pour un trafic raisonnable (~250 Mbps) et inclut une protection Anti-DDoS basique.

Ce qui nous concerne le plus : les adresses IP supplémentaires coûtent **2€ à vie** chez HMS.

D'autres hébergeurs comme [RoyaleHosting](https://royalehosting.net/store/vps) ou [OVH](https://www.ovhcloud.com/fr/vps/) proposent un réseau de meilleure qualité mais à un prix bien plus important. Ce tutoriel se concentre sur HMS.

## Achat d'adresses IP supplémentaires

Depuis la rubrique **"Configuration"** sur votre VPS, cliquez sur **"Commander IP Supplémentaires"**.

> Je recommande de prendre des adresses IPv4 Supplémentaires **à l'unité** plutôt qu'en bloc.
{: .prompt-tip }

> ⚠️ Commandez raisonnablement des adresses IPv4, il n'y en a plus beaucoup et il est inutile d'en réserver si elles restent inutilisées.
{: .prompt-warning }

Notez bien :
- **IP principale** = celle qui possède un reverse DNS associé
- **IP supplémentaire** = celle sans reverse DNS

## Préparation du VPS

> Cette étape s'applique uniquement aux clients HMS / RoyaleHosting avec Debian 12. Si votre VPS utilise déjà systemd-networking, vous pouvez l'ignorer.
{: .prompt-info }

Une fois votre VPS livré, installez **Debian 12** depuis votre espace client, puis connectez-vous en SSH avec [PuTTY](https://www.putty.org/) ou [Termius](https://termius.com/).

Exécutez le script de préparation (désinstalle netplan, installe systemd-networking) :

```bash
curl -sSL https://forevercdn.creeper.fr/sh/preparevps.sh | bash
```

Le VPS redémarrera automatiquement.

## Installation de WireGuard

Mettez à jour et installez les paquets nécessaires :

```bash
apt update
apt full-upgrade -y
apt install wireguard-tools resolvconf iptables arping sudo bash curl wget -y
apt autoremove -y
reboot
```

Déployez ensuite le serveur WireGuard via le script angristan :

```bash
curl -O https://raw.githubusercontent.com/angristan/wireguard-install/master/wireguard-install.sh
chmod +x wireguard-install.sh
bash wireguard-install.sh
```

Laissez les paramètres par défaut lors du setup interactif. Quand il demande le nom du client, donnez-lui un nom (ex: `MaVM`) :

```
Client name: MaVM
Client wireguard IPv4: 10.66.66.2
Client wireguard IPv6: fd42:42:42::2
```

## Configuration du serveur WireGuard

Éditez la configuration :

```bash
nano /etc/wireguard/wg0.conf
```

Remplacez les lignes `PostUp` / `PostDown` générées par défaut par celles-ci :

```ini
PostUp = iptables -I FORWARD -i eth0 -o wg0 -s 10.66.66.0/24 -j ACCEPT; iptables -I FORWARD -i wg0 -d 10.66.66.0/24 -j ACCEPT; iptables -t nat -A POSTROUTING -o eth0 -s 10.66.66.0/24 -j MASQUERADE; iptables -I INPUT -p udp -s 10.66.66.0/24 -j ACCEPT; ip6tables -I FORWARD -i wg0 -j ACCEPT; ip6tables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
PostDown = iptables -D FORWARD -i eth0 -o wg0 -s 10.66.66.0/24 -j ACCEPT; iptables -D FORWARD -i wg0 -d 10.66.66.0/24 -j ACCEPT; iptables -t nat -D POSTROUTING -o eth0 -s 10.66.66.0/24 -j MASQUERADE; iptables -D INPUT -p udp -s 10.66.66.0/24 -j ACCEPT; ip6tables -D FORWARD -i wg0 -j ACCEPT; ip6tables -t nat -D POSTROUTING -o eth0 -j MASQUERADE
```

> Remplacez `eth0` par le vrai nom de votre interface réseau si nécessaire.
{: .prompt-warning }

Votre `wg0.conf` complet ressemble alors à :

```ini
[Interface]
Address = 10.66.66.1/24,fd42:42:42::1/64
ListenPort = 62052
PrivateKey = <votre-clé-privée>
PostUp = iptables -I FORWARD -i eth0 -o wg0 -s 10.66.66.0/24 -j ACCEPT; iptables -I FORWARD -i wg0 -d 10.66.66.0/24 -j ACCEPT; iptables -t nat -A POSTROUTING -o eth0 -s 10.66.66.0/24 -j MASQUERADE; iptables -I INPUT -p udp -s 10.66.66.0/24 -j ACCEPT
PostDown = iptables -D FORWARD -i eth0 -o wg0 -s 10.66.66.0/24 -j ACCEPT; iptables -D FORWARD -i wg0 -d 10.66.66.0/24 -j ACCEPT; iptables -t nat -D POSTROUTING -o eth0 -s 10.66.66.0/24 -j MASQUERADE; iptables -D INPUT -p udp -s 10.66.66.0/24 -j ACCEPT

### Client MaVM
[Peer]
PublicKey = <clé-publique-client>
PresharedKey = <preshared-key>
AllowedIPs = 10.66.66.2/32,fd42:42:42::2/128
```

## Activation de l'IP forwarding

```bash
echo 'net.ipv4.ip_forward=1
net.ipv4.conf.all.proxy_arp=1
net.ipv6.conf.all.forwarding=1' | tee -a /etc/sysctl.conf

reboot
```

## Association de l'IP supplémentaire

Après redémarrage, ajoutez l'IP supplémentaire dans les `AllowedIPs` du peer côté serveur :

```ini
### Client MaVM
[Peer]
PublicKey = <clé-publique-client>
PresharedKey = <preshared-key>
AllowedIPs = 10.66.66.2/32,fd42:42:42::2/128,163.5.121.254/32
```

Puis modifiez la config client (`wg0-client-MaVM.conf`) :
- Remplacez `10.66.66.2` par votre IP supplémentaire
- Ajoutez la ligne `PostUp` pour le clamp MTU

```ini
[Interface]
PrivateKey = <clé-privée-client>
Address = 163.5.121.254/32,fd42:42:42::2/128
DNS = 1.1.1.1,1.0.0.1
PostUp = iptables -t mangle -A POSTROUTING -p tcp --tcp-flags SYN,RST SYN -o wg0 -j TCPMSS --clamp-mss-to-pmtu

[Peer]
PublicKey = <clé-publique-serveur>
PresharedKey = <preshared-key>
Endpoint = <ip-principale-vps>:62052
AllowedIPs = 0.0.0.0/0,::/0
```

Redémarrez le serveur WireGuard :

```bash
systemctl restart wg-quick@wg0
```

Vérifiez l'état :

```bash
systemctl status wg-quick@wg0
wg show
```

## Déploiement du profil sur un client Linux (Debian)

```bash
# Installer les dépendances
apt install wireguard-tools resolvconf iptables

# Coller le profil client modifié
nano /etc/wireguard/wg0.conf

# Activer au démarrage et lancer
systemctl enable wg-quick@wg0 --now

# Vérifier que l'IP est bien montée
ip a
curl ifconfig.me
```

## Diagnostics : problèmes de routage HMS

Si le profil ne fonctionne pas, voici le correctif ARP à appliquer **sur le VPS HMS**.

### Étape 1 — Fichier des IPs

```bash
sudo nano /root/ips
```

Ajoutez vos IPs supplémentaires, une par ligne :

```
163.5.121.254
```

### Étape 2 — Script arping

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

> Remplacez `eth0` par le nom réel de votre interface.
{: .prompt-warning }

```bash
chmod +x /usr/local/bin/arping-loop.sh
```

### Étape 3 — Service systemd

```bash
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
systemctl enable arping-loop
systemctl start arping-loop
systemctl status arping-loop
```

## Conclusion & Remerciements

Vous avez maintenant des IP Failover disponibles chez vous, protégées par Anti-DDoS, déployables sur n'importe quel appareil !

Cette solution permet d'avoir la puissance de VPS avec des IPs dédiées à prix réduit et une qualité de service correcte.

> **Envie d'aller plus loin ?** Il est possible d'implémenter ces tunnels avec un routeur centralisé VyOS qui distribue ensuite les IPs aux VMs, évitant de déployer un profil WireGuard par client : [Router un subnet IPv4 chez soi avec WireGuard + VyOS](https://blog.azernet.xyz/router-un-subnet-ipv4-chez-soi-avec-wireguard-vyos-2/)
{: .prompt-tip }

Merci à tous les contributeurs originaux de cette documentation :
[@Aven678](https://github.com/Aven678),
[@DrKnaw](https://github.com/DrKnaw),
[@MaelMagnien](https://github.com/maelmagnien),
[@Gogow_](https://github.com/Gogowwww),
[@Diggyworld](https://github.com/Diggyworld),
[@titin](https://git.feelb.io/Titin),
[@Hecate](https://github.com/TheHecateII),
[@TheOrion-OVH](https://github.com/TheOrion-OVH)
et tous ceux qui ont contribué via Discord.

---

*[Avoir des adresses IPv4/IPv6 chez soi avec un tunnel Wireguard](https://creeper.fr/wireguard) par [Tristan BRINGUIER](https://creeper.fr/) — [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/)*
