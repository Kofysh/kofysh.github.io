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

Seulement, ne possédant qu'un seul abonnement internet de particulier, et par conséquent une seule IP résidentielle, je suis vite limité par le nombre de ports disponibles et je ne peux pas faire tourner tous les services que je souhaite dans les meilleures conditions.

Encore heureux, je peux ouvrir mes ports, mais certains opérateurs en France retirent cette option au fil du temps, ou bien les box 4G/5G ne proposent pas cette option à cause du [CG-NAT](https://fr.wikipedia.org/wiki/Carrier-grade_NAT).

Ces limitations m'ont amené à mettre en place une solution pour avoir plusieurs adresses IP chez soi, dédiées, protégées par un Anti-DDoS et peu chères. N'ayant trouvé aucune solution existante, j'ai bidouillé et mis en place la mienne.

## Principe de fonctionnement

![Schéma de principe du tunnel WireGuard vers HMS](https://forevercdn.creeper.fr/img/docs/wireguarddoc/doc-schema-hms.avif)

## Le choix de l'hébergeur

J'ai choisi [HostMyServers](https://www.hostmyservers.fr/), un hébergeur français 🇫🇷 avec plusieurs années d'existence, car ils proposent des tarifs très intéressants au niveau du réseau et la qualité de service est correcte. Le premier [VPS SSD](https://www.hostmyservers.fr/vps-ssd) suffit amplement pour un traffic raisonnable (~250Mbps) dans le tunnel et inclus une protection Anti-DDOS basique contre les attaques simples. Leur support via le site est relativement réactif, mais je n'ai pas rencontré de problèmes après plus de deux ans chez eux.

Ce qui nous concerne le plus, c'est le tarif des adresses IP supplémentaires. Chez HMS, elles coûtent **2€ à vie**.

![Tarifs VPS SSD HMS](https://forevercdn.creeper.fr/img/docs/wireguarddoc/doc-prixhms.avif)

D'autres hébergeurs comme [RoyaleHosting](https://royalehosting.net/store/vps) ou [OVH](https://www.ovhcloud.com/fr/vps/) peuvent proposer un réseau de meilleure qualité mais à un prix bien plus important. Ce tutoriel se concentrera sur HMS.

## Achat d'adresses IP supplémentaire

Pour faire marcher cette documentation, il est nécessaire d'avoir plusieurs adresses IPv4 sur le VPS.

Depuis la rubrique **"Configuration"** sur votre VPS vous pouvez cliquer sur **"Commander IP Supplémentaires"** afin d'en acheter.

Voici les tarifs proposés par HostMyServers :

![Tarifs des IPs supplémentaires HMS](https://forevercdn.creeper.fr/img/docs/wireguarddoc/doc-prixiphms.avif)

Je vous recommande de prendre des adresses IPv4 Supplémentaires **à l'unité**. (les blocs ne sont pas assez intuitifs à mon goût dans l'espace client pour le moment)

Une fois l'adresse IP achetée, votre panel devrait ressembler à ceci :

![Panel HMS - vue générale avec IP principale](https://forevercdn.creeper.fr/img/docs/wireguarddoc/doc-ip1.avif)

![Panel HMS - vue configuration avec IP principale et IP secondaire](https://forevercdn.creeper.fr/img/docs/wireguarddoc/doc-ip2.avif)

Notez bien pour la suite du tutoriel que :
- L'adresse **IP principale** du VPS est celle qui possède un reverse DNS associée.
- L'adresse **IP supplémentaire** est celle qui ne possède pas de reverse DNS.

Notez sur un bloc note quelle IP est laquelle afin de ne pas vous emmêler les pinceaux dans la suite du tuto.

> **Attention ⚠️ :** Commandez raisonnablement des adresses IPv4, il n'y en a plus beaucoup, et il est inutile d'en claim si elles restent inutilisées.
{: .prompt-warning }

## Préparation du VPS

> Cette partie de la documentation s'applique uniquement aux clients HMS / RoyaleHosting. Si vous avez un VPS avec Debian 12 et systemd-networking, vous pouvez ignorer cette étape.
{: .prompt-info }

Une fois votre VPS livré, rendez-vous dans votre espace client pour choisir sa distribution. Nous installons Debian 12.

![Panel HMS - Installation du VPS avec Debian 12](https://forevercdn.creeper.fr/img/docs/wireguarddoc/doc-panelhmsinstallvps.avif)

Une fois le VPS installé, vous recevrez les identifiants pour s'y connecter sur votre adresse email client.

![Email de livraison HMS avec identifiants SSH](https://forevercdn.creeper.fr/img/docs/wireguarddoc/doc-hmsmailinstalled.avif)

Connectez-vous y avec un client SSH comme [PuTTY](https://www.putty.org/) ou [Termius](https://termius.com/).

Nous allons d'abord préparer le VPS en désinstallant netplan et réinstallant systemd-networking. J'ai déjà préparé un script qui fais tout cela automatiquement, il vous suffit d'effectuer la commande ci-dessous :

```bash
curl -sSL https://forevercdn.creeper.fr/sh/preparevps.sh | bash
```

Le VPS redémarrera automatiquement une fois la préparation effectuée.

## Installation de Wireguard

Une fois votre VPS préparé, nous pouvons nous y connecter en SSH grâce à un client SSH comme [PuTTY](https://www.putty.org/) ou [Termius](https://termius.com/).

Commençons par mettre à jour et installer les paquets principaux sur le VPS :

```bash
apt update
apt full-upgrade -y
apt install wireguard-tools resolvconf iptables arping sudo bash curl arping wget -y
apt autoremove -y
reboot
```

Une fois notre VPS redémarré, nous pouvons déployer le serveur Wireguard :

```bash
curl -O https://raw.githubusercontent.com/angristan/wireguard-install/master/wireguard-install.sh
chmod +x wireguard-install.sh
bash wireguard-install.sh
```

Un long setup va démarrer, nous pouvons laisser les paramètres par défaut.

```
Welcome to the wireguard installer!
The git repository is available at: https://github.com/angristan/wireguard-install

I need to ask you a few questions before starting the setup.
You can keep the default options and just press enter if you are ok with them.

IPv4 or IPv6 public address: 146.19.168.213
Public interface: eth0
wireguard interface name: wg0
Server wireguard IPv4: 10.66.66.1
Server wireguard IPv6: fd42:42:42::1
Server wireguard port [1-65535]: 62052
First DNS resolver to use for the clients: 1.1.1.1
Second DNS resolver to use for the clients (optional): 1.0.0.1

wireguard uses a parameter called AllowedIPs to determine what is routed over the VPN.
Allowed IPs list for generated clients (leave default to route everything): 0.0.0.0/0,::/0

Okay, that was all I needed. We are ready to setup your wireguard server now.
You will be able to generate a client at the end of the installation.
Press any key to continue...
```

Une fois ceci-fait, il nous demandera le nom de notre profil wireguard :

```
The client name must consist of alphanumeric character(s). It may also include underscores or dashes and can't exceed 15 chars.
Client name: MaVM
```

On laisse les adresses IP proposées par défaut :

```
Client wireguard IPv4: 10.66.66.2
Client wireguard IPv6: fd42:42:42::2
```

Une fois le client créé, un QR-Code vous sera affiché et un fichier aura été créé dans le répertoire actuel.

Préparons notre serveur wireguard. Vous n'avez qu'à faire cette étape une seule fois.

```bash
nano /etc/wireguard/wg0.conf
```

Voici à quoi ressemble notre fichier `wg0.conf` initial :

```ini
[Interface]
Address = 10.66.66.1/24,fd42:42:42::1/64
ListenPort = 62052
PrivateKey = qA0nlMcMHLUGLgbsQ7zsVlvg2NartzikMUMJRNwdeVs=
PostUp = iptables -I INPUT -p udp --dport 62052 -j ACCEPT
PostUp = iptables -I FORWARD -i eth0 -o wg0 -j ACCEPT
PostUp = iptables -I FORWARD -i wg0 -j ACCEPT
PostUp = iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
PostUp = ip6tables -I FORWARD -i wg0 -j ACCEPT
PostUp = ip6tables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
PostDown = iptables -D INPUT -p udp --dport 62052 -j ACCEPT
PostDown = iptables -D FORWARD -i eth0 -o wg0 -j ACCEPT
PostDown = iptables -D FORWARD -i wg0 -j ACCEPT
PostDown = iptables -t nat -D POSTROUTING -o eth0 -j MASQUERADE
PostDown = ip6tables -D FORWARD -i wg0 -j ACCEPT
PostDown = ip6tables -t nat -D POSTROUTING -o eth0 -j MASQUERADE

### Client MaVM
[Peer]
PublicKey = VApiknwvlZmUewjbwZGFYp/77M3XUOSVde8AGcAdgzg=
PresharedKey = t+rgwqN3j8LccHtgi7GULlwBrf8ghY8HAbZN6cagP8s=
AllowedIPs = 10.66.66.2/32,fd42:42:42::2/128
```

Nous devons simplement remplacer les lignes `PostUp` et `PostDown` par celles ci-dessous :

```ini
PostUp = iptables -I FORWARD -i eth0 -o wg0 -s 10.66.66.0/24 -j ACCEPT; iptables -I FORWARD -i wg0 -d 10.66.66.0/24 -j ACCEPT; iptables -t nat -A POSTROUTING -o eth0 -s 10.66.66.0/24 -j MASQUERADE; iptables -I INPUT -p udp -s 10.66.66.0/24 -j ACCEPT; ip6tables -I FORWARD -i wg0 -j ACCEPT; ip6tables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
PostDown = iptables -D FORWARD -i eth0 -o wg0 -s 10.66.66.0/24 -j ACCEPT; iptables -D FORWARD -i wg0 -d 10.66.66.0/24 -j ACCEPT; iptables -t nat -D POSTROUTING -o eth0 -s 10.66.66.0/24 -j MASQUERADE; iptables -D INPUT -p udp -s 10.66.66.0/24 -j ACCEPT; ip6tables -D FORWARD -i wg0 -j ACCEPT; ip6tables -t nat -D POSTROUTING -o eth0 -j MASQUERADE
```

> N'oubliez pas de remplacer `eth0` par le vrai nom de votre interface (cela peut changer en fonction de l'OS / provider) !
{: .prompt-warning }

Voici à quoi ressemble notre fichier de configuration après modification :

```ini
[Interface]
Address = 10.66.66.1/24,fd42:42:42::1/64
ListenPort = 62052
PrivateKey = qA0nlMcMHLUGLgbsQ7zsVlvg2NartzikMUMJRNwdeVs=
PostUp = iptables -I FORWARD -i eth0 -o wg0 -s 10.66.66.0/24 -j ACCEPT; iptables -I FORWARD -i wg0 -d 10.66.66.0/24 -j ACCEPT; iptables -t nat -A POSTROUTING -o eth0 -s 10.66.66.0/24 -j MASQUERADE; iptables -I INPUT -p udp -s 10.66.66.0/24 -j ACCEPT
PostDown = iptables -D FORWARD -i eth0 -o wg0 -s 10.66.66.0/24 -j ACCEPT; iptables -D FORWARD -i wg0 -d 10.66.66.0/24 -j ACCEPT; iptables -t nat -D POSTROUTING -o eth0 -s 10.66.66.0/24 -j MASQUERADE; iptables -D INPUT -p udp -s 10.66.66.0/24 -j ACCEPT

### Client MaVM
[Peer]
PublicKey = VApiknwvlZmUewjbwZGFYp/77M3XUOSVde8AGcAdgzg=
PresharedKey = t+rgwqN3j8LccHtgi7GULlwBrf8ghY8HAbZN6cagP8s=
AllowedIPs = 10.66.66.2/32,fd42:42:42::2/128
```

Après avoir sauvegardé le fichier, nous pouvons activer l'ip forwarding :

```bash
echo 'net.ipv4.ip_forward=1
net.ipv4.conf.all.proxy_arp=1
net.ipv6.conf.all.forwarding=1' | tee -a /etc/sysctl.conf
```

On peut ensuite redémarrer notre VPS HMS :

```bash
reboot
```

## Association de l'IP supplémentaire

Nous pouvons maintenant modifier la configuration serveur et client pour associer l'ip supplémentaire.

```bash
nano /etc/wireguard/wg0.conf
```

Nous avons créé le client MaVM précédemment, il faut maintenant ajouter dans les `AllowedIPs` l'adresse ip supplémentaire.

```ini
AllowedIPs = 10.66.66.2/32,fd42:42:42::2/128,163.5.121.254/32
```

Voici à quoi ressemble le fichier modifié :

```ini
[Interface]
Address = 10.66.66.1/24,fd42:42:42::1/64
ListenPort = 62052
PrivateKey = qA0nlMcMHLUGLgbsQ7zsVlvg2NartzikMUMJRNwdeVs=
PostUp = iptables -I FORWARD -i eth0 -o wg0 -s 10.66.66.0/24 -j ACCEPT; iptables -I FORWARD -i wg0 -d 10.66.66.0/24 -j ACCEPT; iptables -t nat -A POSTROUTING -o eth0 -s 10.66.66.0/24 -j MASQUERADE; iptables -I INPUT -p udp -s 10.66.66.0/24 -j ACCEPT
PostDown = iptables -D FORWARD -i eth0 -o wg0 -s 10.66.66.0/24 -j ACCEPT; iptables -D FORWARD -i wg0 -d 10.66.66.0/24 -j ACCEPT; iptables -t nat -D POSTROUTING -o eth0 -s 10.66.66.0/24 -j MASQUERADE; iptables -D INPUT -p udp -s 10.66.66.0/24 -j ACCEPT

### Client MaVM
[Peer]
PublicKey = VApiknwvlZmUewjbwZGFYp/77M3XUOSVde8AGcAdgzg=
PresharedKey = t+rgwqN3j8LccHtgi7GULlwBrf8ghY8HAbZN6cagP8s=
AllowedIPs = 10.66.66.2/32,fd42:42:42::2/128,163.5.121.254/32
```

Une fois le fichier sauvegardé, nous pouvons modifier la configuration côté client :

```bash
nano wg0-client-MaVM.conf
```

Il faut remplacer l'adresse IP `10.66.66.2` par l'adresse ip supplémentaire et également rajouter la ligne ci-dessous en dessous de `DNS` :

```ini
PostUp = iptables -t mangle -A POSTROUTING -p tcp --tcp-flags SYN,RST SYN -o wg0 -j TCPMSS --clamp-mss-to-pmtu
```

Voici à quoi ressemble le fichier modifié :

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

Une fois les modifications apportées, nous pouvons relancer le serveur wireguard pour appliquer la configuration des clients :

```bash
systemctl restart wg-quick@wg0
```

Vous pouvez vérifier l'état du serveur avec les commandes :

```bash
systemctl status wg-quick@wg0
wg show
```

Notre client est maintenant prêt à être déployé !

## Déploiement du profil wireguard

Notre profil est maintenant prêt à être déployé sur n'importe quelle plateforme (Windows, Linux, Android, macOS, iOS et plein d'autres !)

Voici les commandes pour déployer le profil sur un linux en base Debian :

```bash
# Installer wireguard, Resolvconf et IPTables
apt install wireguard-tools resolvconf iptables

# Installer le profil Wireguard :
nano /etc/wireguard/wg0.conf
# (puis coller le profil wireguard (wg0-client-) modifié à l'intérieur)

# Activer et lancer notre profil wireguard au démarrage :
systemctl enable wg-quick@wg0 --now

# Et voilà ! Votre IP est maintenant montée sur cet appareil !
# Vous pouvez vérifier en faisant un
ip a
# ou un
curl ifconfig.me
```

## Diagnostics

Si jamais le profil ne fonctionne pas, vérifiez que vous n'avez pas mélangé les adresses IPs et relisez la documentation. Il peut arriver qu'il y ai des soucis de routage sur le VPS HMS. Dans ce cas voici les commandes à exécuter **sur le VPS HMS** pour résoudre le problème :

### Étape 1 : Créer le fichier ips

Créer le fichier `ips` dans le répertoire `/root` :

```bash
sudo nano /root/ips
```

Ajouter les adresses IP que vous utilisez avec Wireguard, une par ligne. Par exemple :

```
<ip-additionnelle1>
<ip-additionnelle2>
```

Enregistrer et quitter l'éditeur (CTRL + X, puis Y, puis Entrée).

### Étape 2 : Configurer le script

Créer le script `arping-loop.sh` dans `/usr/local/bin` :

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

> N'oubliez pas de remplacer `eth0` par le vrai nom de votre interface (cela peut changer en fonction de l'OS / provider) !
{: .prompt-warning }

Donner la permission au script de s'exécuter :

```bash
chmod +x /usr/local/bin/arping-loop.sh
```

Créer le service systemd `arping-loop.service` dans `/etc/systemd/system/` :

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

Activer le service :

```bash
systemctl daemon-reload
systemctl enable arping-loop
systemctl start arping-loop
```

### Étape 4 : Vérifier la configuration

Vérifier que le service fonctionne correctement :

```bash
systemctl status arping-loop
```

Vérifier que le script fonctionne en l'exécutant manuellement une première fois :

```bash
bash /usr/local/bin/arping-loop.sh
```

Tout devrait être opérationnel si aucune erreur ne survient !

## Conclusion & Remerciements

Et voilà, vous avez maintenant des IP Failovers disponibles chez vous, protégées par Anti-DDoS, sur n'importe quel appareil !

Cette astuce m'a permis de franchir un grand pas dans l'auto-hébergement, que ce soit pour des services pour moi ou pour les autres, car elle m'offre la puissance d'avoir des VPS avec des IP dédiées à prix réduit et avec un service de qualité similaire.

Ce tutoriel existe initialement depuis juillet 2020, mais a été remasterisé récemment en septembre 2024 avec beaucoup d'améliorations et de mises à jour.

Je tiens à remercier :
- [@Aven678](https://github.com/Aven678) : Pour avoir simplifié énormément la gestion des IPs et la création de profils.
- [@DrKnaw](https://github.com/DrKnaw) : Pour avoir patché des bugs liés à mon système qui n'était pas tout à fait fini à l'époque.
- [@MaelMagnien](https://github.com/maelmagnien) : Qui a entièrement testé le tutoriel pour voir que tout fonctionne.
- [@Gogow_](https://github.com/Gogowwww) : Qui m'a également fait débugger plusieurs fois ma doc.
- [@Diggyworld](https://github.com/Diggyworld) : Qui a remarqué et passé toute une soirée à trouver une solution pour ces fichus soucis de MTU.
- [@titin](https://git.feelb.io/Titin) : Pour avoir trouvé la commande arping pour régler certains soucis de routage.
- [@Hecate](https://github.com/TheHecateII) : Pour la commande iptables pour les soucis de MTU.
- [@TheOrion-OVH](https://github.com/TheOrion-OVH) : Pour le correctif ARP qui fonctionnais une fois sur 2 et quelques erreurs de typo dans la documentation.
- Et plein d'autres personnes qui m'ont envoyé un message sur Discord pour m'aider à améliorer cette documentation ou me remercier.

> **Envie d'aller plus loin ?** Il est possible d'implémenter différemment ces tunnels wireguard, avec un routeur centralisé qui distribue ensuite les IPs aux VMs. Un ami a moi a rédigé une super documentation pour monter les adresses sur un routeur VyOS : [Router un subnet IPv4 chez soi avec WireGuard + VyOS](https://blog.azernet.xyz/router-un-subnet-ipv4-chez-soi-avec-wireguard-vyos-2/)
{: .prompt-tip }

---

*[Avoir des adresses IPv4/IPv6 chez soi avec un tunnel Wireguard](https://creeper.fr/wireguard) par [Tristan BRINGUIER](https://creeper.fr/) — [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/)*
