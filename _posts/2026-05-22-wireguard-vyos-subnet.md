---
title: "Router un subnet IPv4 chez soi avec WireGuard + VyOS"
date: 2026-05-22 22:00:00 +0200
categories: [Tutoriels, Réseau]
tags: [wireguard, vyos, vpn, réseau, vps, proxmox, subnet, ipv4, linux]
description: "Router un subnet IPv4 complet chez soi via un tunnel WireGuard et un routeur VyOS sous Proxmox, pour assigner des IPs publiques à vos VMs sans installer WireGuard sur chacune."
image:
  path: /assets/img/covers/wireguard-vyos.svg
---

> **Crédit :** Ce tutoriel est une adaptation de la documentation originale rédigée par [Azernet](https://blog.azernet.xyz/router-un-subnet-ipv4-chez-soi-avec-wireguard-vyos-2/). Merci à lui pour ce travail !
{: .prompt-info }

## Introduction

Si vous souhaitez auto-héberger des services chez vous, vous allez rapidement vous retrouver limité par l'unique IPv4 publique fournie par votre opérateur. Il se peut même que votre opérateur ne permette l'accès à internet qu'à travers un [CG-NAT](https://fr.wikipedia.org/wiki/Carrier-grade_NAT), auquel cas vous partagez votre IP avec vos voisins et vous ne pourrez pas ouvrir de ports.

Ce tutoriel permet de mettre à disposition un **subnet IPv4 complet** sur votre réseau personnel, un bridge virtuel sous Proxmox, ou un VLAN dédié. Cela vous permet d'assigner une IP publique à des équipements qui ne permettent pas d'installer WireGuard directement.

> Ce tutoriel ne couvre pas la manipulation pour une seule IPv4 ou quelques VMs avec un tunnel monté sur chaque VM. Pour cela, consultez [le tutoriel WireGuard IP Failover](/posts/wireguard-ip-failover-tunnel) qui est plus simple mais nécessite un tunnel par VM.
{: .prompt-tip }

> Ce tutoriel est conçu pour **VyOS 1.4 Sagitta**. Vous devriez être familier avec le concept de routes statiques et la notation CIDR.
{: .prompt-warning }

## Prérequis matériel

- Un **VPS** chez un hébergeur (je recommande [HostMyServers](https://www.hostmyservers.fr/) pour leurs IPs à 2€ one-time et leurs VPS à bas prix avec grande bande passante)
- Un **serveur Proxmox** chez vous pour héberger la VM VyOS
- Un ou plusieurs **blocs d'IPs** achetés chez votre hébergeur

> **Prenez bien un bloc d'IPs et non une seule IP.** Pour ce tuto, nous utilisons un bloc `/30` (4 IPs, dont 2 utilisables : une pour VyOS en gateway, une pour vos VMs).
{: .prompt-warning }

Dans un bloc IP, il faut toujours soustraire :
- La **première IP** : adresse de sous-réseau (ne pas assigner)
- La **deuxième IP** (+1) : sera assignée à VyOS comme gateway
- La **dernière IP** : adresse de broadcast (bonne pratique de la laisser libre)

---

## Partie 1 — Configuration du VPS

### Installation de Debian & WireGuard

Installez Debian 12 sur votre VPS, puis exécutez les commandes suivantes :

```bash
apt-get update && apt-get install wireguard-tools resolvconf arping -y

echo "nameserver 1.1.1.1" > /etc/resolv.conf

echo -e "net.ipv4.ip_forward=1\nnet.ipv4.conf.all.proxy_arp=1\n" | sudo tee -a /etc/sysctl.conf > /dev/null

sysctl -p

curl -O https://raw.githubusercontent.com/angristan/wireguard-install/master/wireguard-install.sh
chmod +x wireguard-install.sh
bash wireguard-install.sh
```

Dans le script d'installation, laissez la configuration par défaut. Vérifiez que l'IPv4 publique de votre VPS est bien détectée, et dans les **Allowed IPs**, retirez l'IPv6 pour ne laisser que :

```
0.0.0.0/0
```

### Configuration de `wg0.conf`

Une fois WireGuard installé, éditez `/etc/wireguard/wg0.conf` :

```bash
nano /etc/wireguard/wg0.conf
```

Modifiez-le comme suit :
- Supprimez les blocs `PostUp` et `PostDown`
- Retirez l'IPv6 dans `Address`
- Ajoutez votre **bloc IP** dans `AllowedIPs` du client

```ini
[Interface]
Address = 10.66.66.1/24
ListenPort = 62052
PrivateKey = <votre-private-key>

### Client VyOS
[Peer]
PublicKey = <public-key-du-vyos>
PresharedKey = <preshared-key>
AllowedIPs = 10.66.66.2/32, <votre-bloc-ip>/<cidr>
```

Redémarrez WireGuard et activez-le au démarrage :

```bash
systemctl restart wg-quick@wg0
systemctl enable wg-quick@wg0
```

### Fichier client WireGuard

Mettez à jour le fichier `wg0-client-<nom>.conf` généré lors de l'installation (dans `/root`). Modifiez la section `Address` dans `[Interface]` pour qu'elle corresponde à la première IP utilisable de votre bloc (+1) :

```ini
[Interface]
PrivateKey = <private-key-du-client>
Address = <première-ip-du-bloc+1>/32
DNS = 1.1.1.1, 1.0.0.1

[Peer]
PublicKey = <public-key-du-vps>
PresharedKey = <preshared-key>
Endpoint = <ip-publique-vps>:<port>
AllowedIPs = 0.0.0.0/0
```

> **Attention :** Sans cette modification, l'IP de sortie de vos VMs sera l'IP principale du VPS HMS et non votre bloc IP. **Redémarrez votre VPS après cette étape.**
{: .prompt-warning }

### Script arping (optionnel mais recommandé)

Pour éviter des problèmes de routage ARP sur le VPS, créez un fichier `ips` dans `/root` avec une IP par ligne :

```
<ip-du-bloc-1>
<ip-du-bloc-2>
```

Ajoutez ensuite une crontab avec `crontab -e` :

```
*/5 * * * * for arg in $(< /root/ips); do arping -q -c1 -P $arg -S $arg -i eth0; done
```

> Remplacez `eth0` par le vrai nom de votre interface réseau si nécessaire.
{: .prompt-warning }

---

## Partie 2 — Préparation de Proxmox

### Créer un bridge dédié

Dans **Proxmox → Node → Network**, créez un nouveau bridge Linux (ex: `vmbr1`). Ce bridge servira de lien entre le VyOS et vos VMs/LXC. Ne lui assignez **pas d'adresse IP** — il sera géré par VyOS.

### Créer la VM VyOS

Téléchargez l'ISO VyOS 1.4 Sagitta depuis [GitHub Releases VyOS](https://github.com/vyos/vyos-rolling-release/releases) et uploadez-la dans Proxmox.

Créez une VM avec ces spécifications :

| Paramètre | Valeur |
|-----------|--------|
| ISO | VyOS 1.4 Sagitta |
| Graphic Card | Serial Terminal 0 |
| Disque | 32 Go |
| CPU | 2 cores, type `host` |
| RAM | 2048 Mo |
| Réseau 1 (eth0) | `vmbr0` (bridge vers votre box) |
| Réseau 2 (eth1) | `vmbr1` (bridge dédié VyOS) |

---

## Partie 3 — Installation & Configuration de VyOS

### Premièr démarrage

Démarrez la VM. Connectez-vous avec `vyos` / `vyos`, puis installez VyOS sur le disque :

```
install image
```

Changez le mot de passe de l'utilisateur `vyos` quand demandé, puis redémarrez :

```
reboot
```

### Vérification des interfaces

Une fois reconnecté, vérifiez que vos interfaces sont bien nommées `eth0` et `eth1` :

```
sh int
```

### Configuration de eth0 (accès internet via la box)

Entrez en mode configuration et configurez `eth0` en DHCP :

```
config

edit int eth eth0
set address dhcp
set dhcp-options no-default-route
exit

set prot stat route <ip-publique-vps>/32 next-hop <ip-de-votre-box>

commit
save
```

Testez en pinguant l'IP de votre VPS — ça doit fonctionner.

### Configuration du tunnel WireGuard

Prenez le contenu de votre fichier `wg0-client-<nom>.conf` et exécutez :

```
set int eth eth1 address <première-ip-du-bloc+1>/<cidr>

edit int wireg wg0
set address <première-ip-du-bloc+1>/32
set ip adjust-mss clamp-mss-to-pmtu
set private-key <votre-PrivateKey>
set peer serveur address <ip-publique-vps>
set peer serveur allowed-ips 0.0.0.0/0
set peer serveur port <port-WireGuard>
set peer serveur preshared-key <votre-PresharedKey>
set peer serveur public-key <PublicKey-du-vps>
exit

set prot stat route 0.0.0.0/0 interface wg0

commit
save
```

Vérifiez que le tunnel fonctionne avec :

```
mtr 1.1.1.1
```

Le **premier hop doit être `10.66.66.1`** (l'IP WireGuard du VPS). Si c'est le cas, le tunnel est opérationnel.

### Router le bloc IP vers eth1

Il ne reste qu'à dire à VyOS de router votre bloc vers le bridge `eth1` :

```
config
set prot stat route <votre-bloc>/<cidr> interface eth1
commit
save
```

### Configuration DNS & SSH

```
set sys name-server 1.1.1.1
set sys name-server 1.0.0.1
set serv ssh access allow user vyos
commit
save
exit
```

---

## Partie 4 — Tester avec une VM ou LXC

Créez une VM ou un conteneur LXC sur le bridge `vmbr1` (celui de VyOS) avec la configuration réseau suivante :

| Paramètre | Valeur |
|-----------|--------|
| Bridge | `vmbr1` |
| IP | Une IP de votre bloc (ex: `163.5.121.254`) |
| Masque | Le CIDR de votre bloc (ex: `/30`) |
| Gateway | La première IP utilisable du bloc (+1, assignée à VyOS) |
| DNS | `1.1.1.1` |

> Laissez la dernière IP du bloc libre (broadcast).
{: .prompt-tip }

Démarrez votre VM/LXC et testez :

```bash
ping 1.1.1.1
curl ifconfig.me
```

Votre IP publique devrait être celle de votre bloc, pas l'IP du VPS !

---

## Ajouter de nouveaux blocs d'IPs

Si vous rachetez un bloc d'IPs plus tard, ajoutez-le dans `/etc/wireguard/wg0.conf` sur le VPS dans `AllowedIPs` du peer VyOS :

```ini
AllowedIPs = 10.66.66.2/32, <bloc1>/<cidr>, <nouveau-bloc>/<cidr>
```

Redémarrez WireGuard sur le VPS :

```bash
systemctl restart wg-quick@wg0
```

Puis sur VyOS :

```
config
set int wireg wg0 address <première-ip-nouveau-bloc+1>/32
set int eth eth1 address <première-ip-nouveau-bloc+1>/<cidr>
set prot stat route <nouveau-bloc>/<cidr> interface eth1
commit
save
exit
```

Ajustez la gateway sur vos nouvelles VMs en conséquence.

---

*[Router un subnet IPv4 chez soi avec WireGuard + VyOS](https://blog.azernet.xyz/router-un-subnet-ipv4-chez-soi-avec-wireguard-vyos-2/) par [Azernet](https://blog.azernet.xyz/)*
