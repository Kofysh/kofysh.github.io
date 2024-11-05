---
layout: post
title: "Netdata : Une Solution de Monitoring Complète et Open-Source"
description: "Une exploration approfondie de Netdata, un outil de monitoring convivial et open-source"
tags: vps
---


## Qu'est-ce que Netdata ?

Netdata est un puissant outil de monitoring open-source qui simplifie le processus de surveillance de votre serveur. Il offre des informations en temps réel sur les performances de votre système, vous permettant de gérer et d'optimiser proactivement vos ressources.

## Images & Démo

![Netdata]({{ site.baseurl }}/images/netdata1.webp){:width="80%"}

Pour une expérience pratique, consultez la démonstration à l'adresse suivante : https://london.my-netdata.io

## Installation

L'installation de Netdata est un jeu d'enfant. Il suffit d'exécuter la commande suivante :

```bash
bash <(curl -Ss https://my-netdata.io/kickstart.sh)
```

Lorsque vous êtes invité à appuyer sur ENTRÉE pour construire et installer Netdata sur votre système, appuyez sur entrée.

Une fois l'installation terminée, vous verrez un message similaire à celui-ci :

![Netdata2]({{ site.baseurl }}/images/netdata2.webp)

Vous pouvez maintenant accéder à Netdata via votre navigateur en vous rendant sur l'adresse IP de votre VPS sur le port 19999.

Par exemple : http://123.256.789.012:19999

## Désinstallation

Pour désinstaller Netdata, suivez ces étapes :

1. Téléchargez le script de désinstallation avec la commande suivante et accordez-lui les permissions d'exécution :

```
wget https://raw.githubusercontent.com/netdata/netdata/master/packaging/installer/netdata-uninstaller.sh
chmod +x ./netdata-uninstaller.sh
```

2. Exécutez le script de désinstallation :

```
./netdata-uninstaller.sh --yes
```

3. Appuyez sur entrée lorsque vous êtes invité à appuyer sur ENTRÉE pour supprimer récursivement le répertoire jusqu'à ce que vous voyiez le message "Netdata files were successfully removed from your system."

4. Supprimez le script de désinstallation avec la commande suivante :

```
rm netdata-uninstaller.sh
```

Et voilà ! Votre installation de Netdata est maintenant supprimée.
