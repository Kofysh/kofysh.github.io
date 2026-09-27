---
title: "Projecteurs Hotack : retirer Silent SDK sur toute la gamme"
layout: post
date: 2026-09-27 19:30:00 +0200
categories: [Tutoriels, Cybersécurité]
tags: [Android, ADB, malware, Hotack, Magcubic, projecteur, debloat]
description: "Détecter et désactiver com.hotack.silentsdk et les services associés sur les projecteurs Hotack et leurs marques blanches, à partir du dépôt hy300pro-debloat."
---

Certains projecteurs Android vendus sous Magcubic, HY300, HY300 Pro et d'autres noms blancs embarquent des paquets signés par l'OEM **Chengdu Hotack**. Le plus connu est `com.hotack.silentsdk`, documenté comme un proxy silencieux préinstallé. Le dépôt [micha102/hy300pro-debloat](https://github.com/micha102/hy300pro-debloat) montre comment le couper sur un HY300 Pro. La même vérification s'applique au reste de la gamme, à condition de contrôler chaque firmware au lieu de supposer que tous les modèles sont identiques.

> Cet article s'appuie sur le dépôt de micha102 (README + capture PCAPdroid) et sur les analyses publiques de la plateforme Hotack. Il ne copie pas le dépôt. Les commandes sont à lancer sur un appareil que tu possèdes, branché d'abord sur un réseau isolé.
{: .prompt-info }

## Ce que documente le dépôt

Le dépôt vise un **Magcubic HY300 Pro**, avec l'interface `ui_Veng.projector`. Il contient :

- un README qui décrit le retrait du proxy Hotack Silent SDK ;
- une capture PCAPdroid, `PCAPdroid_com.hotack.silentsdk.pcap`, pour observer le trafic du paquet.

Les commandes reprises depuis ce travail, et confirmées par les notes matérielles de la communauté, sont :

```bash
adb shell pm disable-user --user 0 com.hotack.silentsdk
adb shell pm disable-user --user 0 com.hotack.writesn
```

`pm disable-user` ne supprime pas l'APK du firmware. Il désactive le paquet pour l'utilisateur 0. C'est réversible, et c'est la méthode à tenter en premier, sans root.

## Pourquoi ça dépasse un seul modèle

Hotack est l'OEM. Magcubic, HY300, HY300 Pro, HY300 Pro+, HY310, HY320, L018 et des références du type X1 / X1BQ sont des habillages commerciaux de plateformes très proches, souvent un Allwinner H713 sous Android 11.

Le fabricant a déclaré plusieurs de ces noms de modèles comme électriquement identiques, y compris au niveau logiciel. Ça ne veut pas dire que chaque unité contient `com.hotack.silentsdk`. Sur des HY310 et L018, d'autres paquets système Hotack sont présents, et Silent SDK n'est pas systématique. Un HY300 Pro+ peut l'avoir, un autre firmware non.

La procédure commune est donc :

1. isoler le projecteur ;
2. lister les paquets ;
3. désactiver ceux qui sont réellement installés ;
4. vérifier qu'ils ne reparlent plus au réseau ;
5. refaire l'audit après une mise à jour ou une réinitialisation.

## Isoler avant d'ouvrir l'ADB

Ne connecte pas le projecteur à ton LAN principal pour « voir ». Branche-le sur un VLAN IoT, un SSID invité sans accès au LAN, ou un point d'accès dédié.

Sur l'appareil :

1. Paramètres, À propos.
2. Appuie plusieurs fois sur le numéro de build, ou sur le nom du modèle selon le firmware.
3. Active **ADB Debugging**. Sur ces projecteurs, le débogage USB peut désactiver les périphériques USB. Préfère l'ADB réseau.

Sur la machine :

```bash
adb connect 192.168.X.X:5555
adb devices
```

Remplace l'adresse par celle du projecteur. Accepte l'empreinte si l'écran le demande.

## Identifier le firmware

```bash
adb shell getprop ro.product.brand
adb shell getprop ro.product.manufacturer
adb shell getprop ro.product.model
adb shell getprop ro.product.board
adb shell getprop ro.build.display.id
adb shell getprop ro.build.version.release
adb shell getprop ro.product.cpu.abi
```

Note le modèle commercial et le build. Deux boîtiers « HY300 Pro » peuvent ne pas avoir le même firmware.

## Auditer les paquets

```bash
adb shell pm list packages -f | grep -Ei 'hotack|silentsdk|writesn|eventupload|expandsdk|storeos|htcota|lumina|htclauncher|hyk_test'
```

Paquets à traiter s'ils existent :

| Paquet | Rôle documenté | Action |
| --- | --- | --- |
| `com.hotack.silentsdk` | Proxy / dropper préinstallé, vu sur une partie des firmwares | Désactiver |
| `com.hotack.writesn` | Composant associé, présent sur certains modèles | Désactiver |
| `com.htc.eventuploadservice` | Télémétrie / administration distante | Désactiver |
| `com.htc.expandsdk` | Persistance et injection publicitaire | Désactiver |
| `com.htc.htcotaupdate` | Mises à jour OTA hors store | Désactiver si tu acceptes de bloquer l'OTA |
| `com.htc.storeos` | Installeur d'applications silencieux | Désactiver |
| `com.htc.luminaos` ou `com.htc.htclauncherhighenglishd08` | Lanceur stock, réglages de projection | Ne pas y toucher tout de suite |

Le préfixe `com.htc.` ne veut pas dire HTC. Sur ces appareils, c'est un namespace utilisé par la pile Hotack.

Les domaines relevés publiquement autour de cette pile, à bloquer et non à contacter, incluent `api.pixelpioneerss.com`, `sta.smartinnovate.net`, `bur.thedynamicleap.com`, `kkoip.com`, `event-api.aodintech.com`, `pb-api.aodintech.com`, `store-api.aodintech.com` et `ota.triplesai.com`.

## Désactiver ce qui est vraiment installé

Le dépôt source ne désactive que Silent SDK et WriteSN. Sur le reste de la gamme, lance d'abord ces deux commandes, puis le complément seulement pour les paquets présents.

```bash
for pkg in \
  com.hotack.silentsdk \
  com.hotack.writesn \
  com.htc.eventuploadservice \
  com.htc.expandsdk \
  com.htc.storeos \
  com.htc.htcotaupdate
do
  if adb shell pm list packages "$pkg" | grep -q "$pkg"; then
    echo "disable $pkg"
    adb shell pm disable-user --user 0 "$pkg"
  else
    echo "absent  $pkg"
  fi
done
```

Pour revenir en arrière :

```bash
adb shell pm enable --user 0 com.hotack.silentsdk
```

`pm uninstall --user 0` retire le paquet pour l'utilisateur, sans effacer l'APK de la partition système. À n'utiliser qu'après avoir vérifié que la désactivation ne casse pas l'image, le Wi-Fi ou la télécommande.

```bash
adb shell pm uninstall --user 0 com.hotack.silentsdk
```

Si la commande échoue, reste sur `disable-user`. La suppression physique de l'APK demande un accès root et une partition remontable. Ce n'est pas nécessaire pour couper le service, et un mauvais flash peut briquer l'appareil. Les procédures de root H713 sont hors de ce guide : garde une image de secours avant d'y toucher.

## Ne pas casser la projection

Le lanceur stock embarque souvent le trapèze, la mise au point et l'entrée HDMI. Installe un autre lanceur, par exemple Projectivy, avant toute désactivation de `com.htc.luminaos` ou `com.htc.htclauncherhighenglishd08`.

L'activité HDMI Allwinner, sur les firmwares qui l'ont, se lance avec :

```bash
adb shell am start -n com.softwinner.awlivetv/.MainActivity
```

Après désactivation du lanceur, le trapèze de base peut encore fonctionner, mais l'interface de correction avancée disparaît. Teste ça avant de considérer l'appareil comme propre.

## Vérifier que c'est coupé

```bash
adb reboot
adb connect 192.168.X.X:5555
adb shell pm list packages -d | grep -Ei 'hotack|silentsdk|writesn|eventupload|expandsdk|storeos|htcota'
adb shell dumpsys package com.hotack.silentsdk | grep -E 'enabled=|User 0'
```

Contrôle ensuite le DNS du VLAN. Tu ne dois plus voir de requêtes vers les domaines cités plus haut une fois les paquets désactivés. La capture du dépôt se lit dans PCAPdroid ou Wireshark si tu veux comparer un avant/après sur ton propre appareil. Ne republie pas une capture qui contient ton IP, ton SSID ou des cookies.

Teste aussi HDMI, Wi-Fi, télécommande, luminosité et trapèze. Un paquet absent de la liste n'est pas un échec : ce firmware ne l'avait simplement pas.

## Bloquer le reste au résolveur

La désactivation ne retire pas le code du firmware. Un reset usine, ou une OTA, peut le réactiver. Bloque les domaines au DNS, et laisse le projecteur dans le VLAN IoT.

Exemple de liste, une entrée par ligne, pour Pi-hole ou un bloc local :

```text
api.pixelpioneerss.com
sta.smartinnovate.net
bur.thedynamicleap.com
kkoip.com
usmyip.kkoip.com
event-api.aodintech.com
pb-api.aodintech.com
store-api.aodintech.com
ota.triplesai.com
otaapi.triplesai.com
shortx.srafx.com
```

`shortx.srafx.com` est associé au lanceur, pas à Silent SDK. Bloque-le seulement si tu acceptes qu'une fonction du lanceur stock cesse de joindre ce domaine.

Ne te connecte pas avec un compte Google principal sur cet Android. N'y saisis aucun mot de passe que tu utilises ailleurs.

## Reset, OTA, revente

Une réinitialisation ne nettoie pas un composant gravé dans le firmware. Elle peut même le réactiver. Après un reset, refais l'audit **avant** de rejoindre le LAN.

Désactiver `com.htc.htcotaupdate` limite une réinstallation silencieuse. Tu perds aussi les mises à jour officielles de ce canal. C'est un choix : sur un firmware déjà compromis à l'usine, une OTA non vérifiée n'est pas un correctif de confiance.

Si tu remets l'appareil en service ou si tu le revends :

- note le modèle et le build ;
- conserve la sortie de `pm list packages` avant et après ;
- ne le présente pas comme « vérifié propre » tant que les paquets ne sont pas absents ou désactivés sur **cette** unité ;
- laisse-le sur un réseau invité chez le prochain utilisateur, ou dis-lui de refaire les commandes après chaque reset.

## Sources

- [micha102/hy300pro-debloat](https://github.com/micha102/hy300pro-debloat), méthode d'origine et capture PCAPdroid.
- [Notes matérielles HY300 Pro+](https://gist.github.com/probonopd/3ad6b7777caea1503f00d5fe7710ad06), ADB réseau, lanceur, similarité des modèles.
- [Analyse Silent SDK](https://zanestjohn.com/blog/reing-with-claude-code), rôle des paquets et indicateurs réseau.
- [magcubic-root](https://github.com/well0nez/magcubic-root), mêmes paquets sur d'autres références H713, Silent SDK non universel.
