---
title: "BadBox sur les projecteurs Hotack : retrait et root"
layout: post
date: 2026-09-27 19:30:00 +0200
last_modified_at: 2026-09-27 19:45:00 +0200
categories: [Tutoriels, Cybersécurité]
tags: [Android, ADB, Magisk, BadBox, Hotack, Magcubic, root, debloat]
image: /assets/img/covers/badbox-hotack.svg
description: "Retirer BadBox d'un projecteur Hotack ou Magcubic, puis le rooter avec Magisk : audit ADB, désactivation sans root, et flash séparé pour Allwinner H713 et H726."
---

BadBox n'est pas une application que tu as installée. C'est une porte dérobée mise dans le firmware d'appareils Android hors marque, en usine, puis utilisée comme proxy résidentiel et comme support de fraude publicitaire. Sur les projecteurs Hotack vendus sous Magcubic, HY300, HY310, L018 ou HY350, la chaîne locale observée tourne autour de `com.htc.storeos` et de `com.hotack.silentsdk`.

Ce guide fait deux choses, dans cet ordre. D'abord couper BadBox sans root, parce que c'est réversible et que ça suffit souvent. Ensuite rooter l'appareil avec une image officielle patchée par Magisk, uniquement si tu as besoin que les paquets ne reviennent pas après un reset, ou si tu veux un shell root. Le dépôt [micha102/hy300pro-debloat](https://github.com/micha102/hy300pro-debloat) documente le cas HY300 Pro et la capture PCAPdroid du paquet Silent SDK. La méthode ci-dessous généralise cet audit à la gamme, sans mélanger les firmwares H713 et H726.

> Une image flashée sur le mauvais SoC brique le projecteur. Identifie la carte avant toute écriture. Ne télécharge pas une ROM « déjà rootée » : tu repars de l'image constructeur de **ton** build, et tu patches le boot toi-même.
{: .prompt-danger }

## Ce que BadBox fait sur ces projecteurs

HUMAN Security a documenté BADBOX, puis BADBOX 2.0 : des téléviseurs, box et projecteurs Android bas de gamme sortent d'usine avec un backdoor. L'appareil ouvre un proxy, clique des publicités que personne ne voit, et peut servir de relais. Ce n'est pas un virus attrapé en naviguant.

Sur la plateforme OEM Chengdu Hotack, les analyses publiques et les dépôts matériels retrouvent la même pile, pas forcément au complet sur chaque boîtier :

| Paquet | Rôle | Présent partout ? |
| --- | --- | --- |
| `com.htc.storeos` | Installeur silencieux. Sur plusieurs firmwares, c'est lui qui télécharge la suite | Très fréquent |
| `com.hotack.silentsdk` | Agent proxy. Parfois préinstallé, parfois chargé ensuite par StoreOS | Non |
| `com.hotack.writesn` | Composant associé au proxy | Non |
| `com.htc.expandsdk` | Persistance et injection publicitaire | Selon le build |
| `com.htc.eventuploadservice` | Télémétrie, permissions très larges | Fréquent |
| `com.htc.htcotaupdate` | OTA hors Play Store, capable de réinstaller la pile | Fréquent |
| `com.htc.htclauncherhighenglishd08` | Lanceur. Sur certains builds il fait partie de la pile à retirer | Non |

Le dépôt d'origine vise un Magcubic HY300 Pro, interface `ui_Veng.projector`, et fournit `PCAPdroid_com.hotack.silentsdk.pcap`. Les deux commandes qu'il a fait connaître sont :

```bash
adb shell pm disable-user --user 0 com.hotack.silentsdk
adb shell pm disable-user --user 0 com.hotack.writesn
```

Elles restent le premier geste. Elles ne décrivent pas toute la gamme. Un HY310 peut avoir EventUploadService sans Silent SDK. Un HY350 Max peut ne pas avoir Silent SDK préinstallé, et le recevoir via StoreOS. Tu listes, puis tu coupes ce qui est là.

Les rapports BADBOX 2.0 citent aussi `com.debby.devour` et `com.mz.sdk`. Cherche-les. S'ils sont absents, ce n'est pas un échec.

## Deux cartes, deux procédures

Magcubic et les marques blanches Hotack ne partagent pas un seul firmware.

| | H713 | H726 |
| --- | --- | --- |
| Modèles souvent concernés | HY310, L018, une partie des HY300 | Certains HY300 Pro, HY350 Max |
| Android documenté | 11 | 14 |
| ABI à vérifier | `armeabi-v7a`, même si le Cortex-A53 sait faire du 64 bits | souvent `arm64-v8a` |
| Carte | `sun50iw12p1` | `h726-p1` |
| Root décrit ici | Repack du `boot.fex` avec Magisk, clé USB | Même idée, image et méthode de flash **de ce build** |

Des fiches AliExpress marquent un L018 « H726 » alors que la carte est un H713. Le texte de la boîte ne compte pas. Seul `getprop` compte.

## Isoler avant d'allumer le Wi-Fi

Branche le projecteur sur un VLAN IoT ou un SSID invité sans route vers ton LAN. Ces firmwares écoutent aussi des services de cast sur `0.0.0.0`, notamment des ports AirPlay. Un appareil que tu es en train de nettoyer n'a rien à faire sur le même réseau que tes sessions.

Ne crée pas de compte Google dessus. N'y saisis aucun mot de passe que tu utilises ailleurs.

## Ouvrir l'ADB

Sur le projecteur : Paramètres, À propos, appuie plusieurs fois sur le numéro de build jusqu'au message développeur. Active **ADB Debugging**. Sur cette gamme, le débogage USB peut couper les périphériques USB. Utilise l'ADB réseau.

```bash
adb connect 192.168.X.X:5555
adb devices
```

Accepte l'empreinte sur l'écran. Si `adb` répond `unauthorized`, révoque les autorisations de débogage dans les options développeur et recommence.

Le lanceur stock n'expose pas toujours Réglages. Dans ce cas :

```bash
adb shell am start -n com.android.settings/.Settings
```

## Identifier le firmware

Copie cette sortie dans un fichier avant de modifier quoi que ce soit. C'est elle qui choisit la suite du guide.

```bash
adb shell getprop ro.product.brand
adb shell getprop ro.product.manufacturer
adb shell getprop ro.product.model
adb shell getprop ro.product.board
adb shell getprop ro.product.cpu.abi
adb shell getprop ro.build.display.id
adb shell getprop ro.build.version.release
adb shell uname -m
```

Un modèle qui s'annonce `ADT-3` est un indice déjà relevé sur des appareils BADBOX 2.0. Note-le, puis continue l'audit des paquets : le nom seul ne prouve pas l'infection, et un autre nom ne la dément pas.

Arrête-toi ici si `ro.product.board` n'est ni un H713 ni un H726. Ne transpose pas la procédure.

## Auditer les paquets

```bash
adb shell pm list packages -f | grep -Ei 'hotack|silentsdk|writesn|eventupload|expandsdk|storeos|htcota|htclauncher|lumina|magcubicos|hyk_test|toofifi|debby|mz\.sdk'
```

Pour chaque paquet que tu comptes désactiver, garde le chemin :

```bash
adb shell pm path com.htc.storeos
adb shell pm path com.hotack.silentsdk
adb shell dumpsys package com.htc.storeos | grep -E 'versionName|enabled=|pkgFlags|codePath'
```

Le chemin change d'un firmware à l'autre. Tu n'effaces jamais un dossier deviné.

Paquets à couper s'ils existent :

- `com.htc.storeos`
- `com.hotack.silentsdk`
- `com.hotack.writesn`
- `com.htc.expandsdk`
- `com.htc.eventuploadservice`
- `com.htc.htcotaupdate`
- `com.htc.hyk_test`
- `com.android.toofifi` et `com.toofifi.lineserver`, si tu n'utilises pas leur cast
- `android.rockchip.update.service`, parfois présent sur une carte Allwinner
- `com.debby.devour` et `com.mz.sdk`, s'ils apparaissent

À laisser tant que la projection n'est pas reprise par un autre lanceur :

- `com.htc.luminaos`
- `com.htc.magcubicos`
- `com.htc.htclauncherhighenglishd08`, sauf si ton audit le classe dans la pile à retirer **et** qu'un autre lanceur est déjà installé
- `com.hysd.vafocus`, c'est le moteur de mise au point

Le préfixe `com.htc.` ne veut pas dire HTC. C'est le namespace de la pile Hotack.

## Couper BadBox sans root

C'est l'étape à faire dans tous les cas, y compris si tu rootes ensuite. `pm disable-user` désactive le paquet pour l'utilisateur 0. L'APK reste dans le firmware. C'est voulu : tu peux revenir en arrière.

```bash
for pkg in \
  com.htc.storeos \
  com.hotack.silentsdk \
  com.hotack.writesn \
  com.htc.expandsdk \
  com.htc.eventuploadservice \
  com.htc.htcotaupdate \
  com.htc.hyk_test \
  com.android.toofifi \
  com.toofifi.lineserver \
  android.rockchip.update.service \
  com.debby.devour \
  com.mz.sdk
do
  if adb shell pm list packages "$pkg" | grep -q "$pkg"; then
    echo "disable $pkg"
    adb shell pm disable-user --user 0 "$pkg"
  else
    echo "absent  $pkg"
  fi
done
```

Sur les firmwares où Silent SDK n'est pas préinstallé, désactiver StoreOS casse la chaîne de téléchargement. Désactiver l'OTA évite qu'une mise à jour non signée par toi remette la pile. Tu perds aussi les mises à jour de ce canal. Sur un firmware infecté en usine, ce canal n'est pas un correctif de confiance.

Réactiver un paquet :

```bash
adb shell pm enable --user 0 com.htc.storeos
```

`pm uninstall --user 0` retire le paquet pour l'utilisateur sans effacer l'APK système. Utile si `disable-user` est refusé. Un reset usine peut le réinstaller.

```bash
adb shell pm uninstall --user 0 com.htc.storeos
```

Redémarre, reconnecte l'ADB, et vérifie :

```bash
adb reboot
adb connect 192.168.X.X:5555
adb shell pm list packages -d | grep -Ei 'hotack|storeos|writesn|expandsdk|eventupload|htcota'
```

Teste HDMI, Wi-Fi, télécommande, luminosité et trapèze avant d'aller plus loin. L'entrée HDMI Allwinner, sur les firmwares qui l'ont :

```bash
adb shell am start -n com.softwinner.awlivetv/.MainActivity
```

Installe un autre lanceur, Projectivy par exemple, avant de toucher au lanceur stock. Le trapèze et la mise au point vivent souvent dedans.

## Bloquer ce qui reste au DNS

La désactivation ne retire pas le code. Un reset ou une OTA peut le réveiller. Le projecteur reste dans le VLAN, et ces domaines ne résolvent plus. Ce sont des indicateurs publiés, à bloquer, pas à contacter.

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
```

Sous dnsmasq :

```text
address=/api.pixelpioneerss.com/0.0.0.0
address=/sta.smartinnovate.net/0.0.0.0
address=/bur.thedynamicleap.com/0.0.0.0
address=/kkoip.com/0.0.0.0
address=/usmyip.kkoip.com/0.0.0.0
address=/event-api.aodintech.com/0.0.0.0
address=/pb-api.aodintech.com/0.0.0.0
address=/store-api.aodintech.com/0.0.0.0
address=/ota.triplesai.com/0.0.0.0
address=/otaapi.triplesai.com/0.0.0.0
```

`shortx.srafx.com` est lié au lanceur, pas à Silent SDK. Ne le bloque que si tu acceptes qu'une fonction du lanceur stock cesse de joindre ce domaine.

Après reboot, le résolveur du VLAN ne doit plus voir ces noms. La capture PCAPdroid du dépôt d'origine sert de référence pour comparer un avant/après sur **ton** appareil. Ne republie pas une capture qui contient ton IP, ton SSID ou des cookies.

Si cette vérification est propre et que la projection fonctionne, tu peux t'arrêter. Le root n'enlève pas BadBox mieux que ces commandes. Il sert à rendre le retrait plus durable, et à avoir `su`.

## Rooter : règles communes

Tu patches le boot de l'image officielle de ton build. Tu ne flashes pas le boot d'un autre modèle.

1. Demande l'image IMAGEWTY complète au support du vendeur, ou prends celle publiée pour **ce** build sur le site support Magcubic. Vérifie que le nom de build colle à `ro.build.display.id`.
2. Installe Magisk depuis [les releases officielles](https://github.com/topjohnwu/Magisk/releases). Pas un APK repackagé.
3. Patche `boot.img` **sur le projecteur**, pour que Magisk choisisse le bon ABI. Un patch fait sur un téléphone 64 bits peut produire une image qui ne démarre pas sur un H713 32 bits.
4. Dans Magisk, avant le patch, active **Patch vbmeta in boot image**. Ne coche pas le mode recovery.
5. Garde l'image d'origine. C'est ton seul retour arrière propre.

Sur certains firmwares Hotack, le périphérique eMMC est lisible et inscriptible par l'utilisateur `shell`, sans root. C'est une faille, pas une méthode. N'écris pas `mmcblk0` à la main. Un mauvais secteur, et le retour se fait au câble USB-A vers USB-A, si tu as encore l'image stock.

Outils :

```bash
sudo apt install adb python3 e2fsprogs android-sdk-libsparse-utils
```

`awimg.py` vient du dépôt [well0nez/magcubic-root](https://github.com/well0nez/magcubic-root). Il recalcule le checksum Allwinner de la partition. Sans ça, PhoenixUSBPro s'arrête avec une erreur de vérification. Ne le réécris pas de mémoire.

```bash
python3 awimg.py list update.img
```

Tu dois voir `boot.fex` avant de continuer.

## Root H713

Cette section vaut pour un board H713, ABI `armeabi-v7a`, builds du type de ceux testés sur HY310 et L018. Si `uname -m` ou `ro.product.cpu.abi` dit autre chose, passe à la section H726. Ne force pas.

Extrais le boot :

```bash
python3 awimg.py extract update.img extracted/
cp extracted/boot.fex boot.img
sha256sum boot.img update.img | tee sommes-avant.txt
```

Installe Magisk sur le projecteur et pousse l'image :

```bash
adb install Magisk-vXX.Y.apk
adb push boot.img /sdcard/Download/boot.img
```

Sur le projecteur : ouvre Magisk, Install, **Select and Patch a File**, choisis `boot.img`. Magisk écrit un fichier `magisk_patched-*.img` dans Download.

```bash
adb pull /sdcard/Download/magisk_patched-XXXX.img magisk_patched.img
python3 awimg.py replace update.img boot.fex magisk_patched.img update_rooted.img
```

`replace` ne reconstruit pas l'image au hasard. Il copie l'originale et ne remplace que le boot, checksum compris.

### Flash USB, H713 seulement

1. Formate une clé en FAT32.
2. Crée le dossier `update`, en minuscules.
3. Crée `update/auto_update.txt` avec exactement cette ligne :

```text
sunxi_flash write update/update.img firmware
```

4. Copie `update_rooted.img` vers `update/update.img`. Tout en minuscules. Le projecteur est sensible à la casse.
5. Débranche l'alimentation.
6. Insère la clé.
7. Rebranche l'alimentation **sans appuyer sur le bouton power**. La barre verte démarre seule.
8. Attends la fin. Ne débranche pas au milieu.
9. Coupe l'alimentation, retire la clé, puis allume normalement. Si la clé reste en place, il reflashe au boot suivant.

Au premier démarrage, ouvre Magisk. S'il demande une réinstallation, choisis **Direct Install**, puis redémarre.

```bash
adb connect 192.168.X.X:5555
adb shell su -c id
```

Tu dois voir `uid=0`. Si le projecteur ne démarre plus, passe à la section de secours. Ne tente pas un deuxième patch par-dessus une image déjà modifiée : repars de l'image stock.

## Root H726

Un HY300 Pro H726 sous Android 14, et un HY350 Max `h726_p1`, ne prennent pas l'image H713 ni le fichier `auto_update.txt` de la section précédente. Le geste Magisk est le même : extraire `boot.fex`, le patcher sur l'appareil, le remettre dans **l'image de ce build**. La façon d'entrer en flash change.

Pour le HY350 Max, le build documenté publiquement est `Projector_20260113.175241`, carte `h726-p1`. Le dépôt [maximilian-sh/hy350max-badbox-removal](https://github.com/maximilian-sh/hy350max-badbox-removal) décrit le nettoyage de **cette** image : retrait des APK dans `product`, flags vbmeta de ce fichier, et date de version parce que le bootloader refuse une image de date égale ou plus ancienne. Ces offsets ne se recopient pas sur un autre `.img`. Si ton `ro.build.display.id` n'est pas celui-là, tu ne les appliques pas.

Le flash documenté pour ce HY350 Max : clé FAT32, image dans `/update/`, maintenir Power jusqu'au passage de la LED du rouge au bleu. Ce n'est pas la procédure H713.

Pour un HY300 Pro explicitement H726, suis le guide XDA de cette carte, [Rooting Tutorial for a MAGCUBIC HY300 PRO, Allwinner H726, Android 14](https://xdaforums.com/t/guide-rooting-tutorial-for-a-magcubic-hy300-pro-with-an-allwinner-h726-and-android-14.4776519/), avec l'image de ton build. Le dépôt [gniax/magcubic-hy300-root](https://github.com/gniax/magcubic-hy300-root) décrit le même enchaînement : firmware constructeur, `boot.fex`, Magisk.

Si tu modifies `super` pour effacer les APK, tu dois aussi désactiver la vérification AVB **de cette image**, pas d'une image téléchargée « vbmeta disabled » sur un forum. Un vbmeta d'un autre modèle ne démarre pas, ou démarre sans les partitions que tu crois.

## Après le root, retirer ce qui reste

Le root seul ne désinstalle rien. Relance l'audit, puis retire pour l'utilisateur 0 ce que la désactivation n'a pas tenu.

```bash
for pkg in com.htc.storeos com.hotack.silentsdk com.hotack.writesn \
  com.htc.expandsdk com.htc.eventuploadservice com.htc.htcotaupdate
do
  adb shell su -c "pm uninstall --user 0 $pkg"
done
```

Certains firmwares embarquent `/system/bin/appsdisable`, exécuté au boot, qui coupe les receivers Google dont Play Protect. La partition est souvent pleine. On tronque le script au lieu de le remplacer :

```bash
adb shell su -c 'mount -o remount,rw /'
adb shell su -c 'cp /dev/null /system/bin/appsdisable'
adb shell su -c 'settings put global start_disable 0'
```

Vérifie aussi qu'aucun APK ne traîne dans un dossier de préinstallation :

```bash
adb shell su -c 'find / -path "*/preinstall/*.apk" -print 2>/dev/null'
```

S'il y en a, note les chemins et supprime ces APK-là, pas le dossier parent au hasard. `preinstall` peut rester s'il est vide.

Les applications sous `/system` sont souvent protégées par dm-verity. `pm uninstall --user 0` suffit à les rendre absentes pour l'utilisateur. Un `rm -rf` sur un chemin deviné casse le démarrage sans mieux couper BadBox.

SELinux est permissif sur les firmwares H713 testés publiquement. Root ou pas, l'appareil reste dans le VLAN.

## Vérifier que c'est fini

```bash
adb shell pm list packages | grep -Ei 'hotack|silentsdk|writesn|storeos|expandsdk|eventupload|htcota|debby|mz\.sdk'
adb shell dumpsys package com.hotack.silentsdk | grep -E 'enabled=|unable to find'
adb shell su -c id
```

Contrôle ensuite, dans l'ordre :

1. Aucune requête DNS vers la liste ci-dessus, projecteur allumé dix minutes au repos.
2. HDMI, trapèze, focus, télécommande, Wi-Fi.
3. Un second reboot. Certains scripts ne se montrent qu'au boot suivant.
4. Magisk toujours présent après ce reboot.

Un paquet absent de la liste n'est pas un oubli. Ce firmware ne l'avait pas.

## Si ça ne démarre plus

Ne continue pas à patcher. Reprends l'image stock, pas `update_rooted.img`.

Sur H713, le secours documenté est PhoenixUSBPro, pas PhoenixSuit 1.19, avec un câble USB-A vers USB-A et les pilotes Allwinner du paquet firmware.

1. Projecteur débranché.
2. Charge l'image **stock** dans PhoenixUSBPro.
3. Maintiens le trou reset à côté du HDMI avec un trombone, branche le câble USB vers le PC, branche l'alimentation, relâche le reset après environ trois secondes.
4. Le PC doit voir `VID_1F3A` `PID_EFE8`.
5. Laisse finir. Le pourcentage peut sembler bloqué entre 33 et 40 %. C'est normal sur cet outil.
6. À 100 %, il ne redémarre pas seul. Coupe l'alimentation, débranche, puis allume.

Sans l'image stock et sans ce câble, un bootloop H713 ne se rattrape pas depuis l'ADB.

## Reset, OTA, revente

Un reset usine ne nettoie pas un APK gravé dans `product` ou `system`. Il peut réactiver ce que `pm disable-user` avait coupé. Après un reset, refais l'audit avant de rejoindre le LAN.

Une image dont tu as retiré les APK survit au reset. C'est le seul retrait durable, et c'est aussi le seul qui brique si l'image n'est pas la bonne. Tant que tu n'as pas fait ce repack, le retrait valable est : paquets désactivés, DNS bloqué, VLAN, script relancé après chaque reset.

Si tu remets l'appareil en service ou si tu le revends :

- joins le modèle, le board et le build ;
- joins la sortie de `pm list packages` avant et après ;
- ne le marque pas « vérifié propre » pour toute la marque : seulement pour cette unité, à cette date ;
- dis à la personne suivante de le laisser sur un réseau invité, et de refaire les commandes si elle reset.

## Sources

- [micha102/hy300pro-debloat](https://github.com/micha102/hy300pro-debloat), cas HY300 Pro et capture PCAPdroid.
- [well0nez/magcubic-root](https://github.com/well0nez/magcubic-root), repack H713, flash USB, paquets Hotack.
- [maximilian-sh/hy350max-badbox-removal](https://github.com/maximilian-sh/hy350max-badbox-removal), chaîne StoreOS sur HY350 Max H726.
- [gniax/magcubic-hy300-root](https://github.com/gniax/magcubic-hy300-root) et le [guide XDA H726](https://xdaforums.com/t/guide-rooting-tutorial-for-a-magcubic-hy300-pro-with-an-allwinner-h726-and-android-14.4776519/), root HY300 Pro.
- [BADBOX 2.0, HUMAN Security](https://www.humansecurity.com/learn/blog/badbox-2-0-the-sequel-no-one-wanted/), description de l'opération.
- [Magisk](https://github.com/topjohnwu/Magisk/releases), seules releases à installer.
