---
layout: post
title: Installer un serveur Minecraft sur un VPS (Debian/Ubuntu)
description: Installation d'un serveur Minecraft sur un VPS Debian ou Ubuntu
tags: [vps]
---

---
#### Pré-requis :
- Un VPS tournant sous Debian ou Ubuntu.
- Accès root ou un utilisateur avec droits sudo.
---

## 1. **Mise à jour du système et installation des dépendances**

Tout d'abord, nous devons nous assurer que notre VPS est à jour. Exécutez les commandes suivantes :

```bash
sudo apt-get update && sudo apt-get full-upgrade -y
```

Cette commande mettra à jour tous les paquets de votre système. Une fois terminée, nous installerons Java, nécessaire au fonctionnement de Minecraft.

> **Remarque :** La commande ci-dessous peut varier selon votre distribution (ex : Debian 10). Si elle ne fonctionne pas, consultez la documentation officielle ou cherchez une alternative spécifique à votre système. Dans cet exemple, nous utilisons Ubuntu 24.04.

Pour installer Java 8 JDK, exécutez :

```bash
sudo apt-get install openjdk-8-jdk wget screen -y
```

Si vous rencontrez des problèmes, essayez cette méthode alternative :

```bash
sudo apt install -y wget gnupg software-properties-common
wget -qO - https://adoptopenjdk.jfrog.io/adoptopenjdk/api/gpg/key/public | sudo apt-key add -
sudo add-apt-repository --yes https://adoptopenjdk.jfrog.io/adoptopenjdk/deb/
sudo apt update
sudo apt install adoptopenjdk-8-hotspot wget screen -y
```

Une fois l'installation de Java terminée, nous pouvons passer à l'étape suivante.

---

## 2. **Choisir et télécharger la version de serveur Minecraft**

Le choix de la version du serveur dépend de vos besoins (mods, plugins, performances, etc.). Voici un tableau comparatif pour vous guider :

| Version de Serveur                                        | Performances | Compatibilité | Mods | Plugins | Versions supportées |
| --------------------------------------------------------- | ------------ | ------------- | ---- | ------- | ------------------- |
| [**PaperSpigot**](https://papermc.io/)                     | ✅            | ✳️             | ❌    | ✅       | 1.15.x - 1.7.10     |
| [**Spigot**](https://getbukkit.org/download/spigot)        | ⚠️            | ✅             | ❌    | ✅       | 1.15.x - 1.4.x      |
| [**CraftBukkit**](https://getbukkit.org/download/craftbukkit) | ⚠️            | ⚠️             | ❌    | ⚠️       | 1.15.x - 1.0.0      |
| [**CatServer**](https://github.com/Luohuayu/CatServer/releases) | ✅            | ✳️             | ✅    | ✳️       | 1.12.2              |
| [**Thermos**](https://github.com/CyberdyneCC/Thermos/releases) | ✅            | ✳️             | ✅    | ✅       | 1.7.10              |
| [**SpongeForge**](https://spongepowered.org/downloads/spongeforge/stable/) | ✅            | ❌             | ✅    | ⚠️       | 1.12.2 - 1.10.2     |
| [**Forge**](https://files.minecraftforge.net/net/minecraftforge/forge/) | ⚠️            | ✅             | ✅    | ❌       | 1.15.2 - 1.1        |
| [**Cuberite**](https://cuberite.org/)                     | ✅            | ❌             | ❌    | ❌       | 1.12.2 - 1.8        |
| [**Glowstone**](https://glowstone.net/)                   | ✅            | ✅             | ❌    | ✅       | 1.12.2              |

### **Télécharger la version choisie**

Vous avez deux options :

**Option 1 : Utiliser un client SFTP (Recommandé)**
- Téléchargez [WinSCP](https://winscp.net/eng/download.php) (recommandé à la place de FileZilla).
- Connectez-vous à votre VPS avec les informations de connexion.
- Créez un dossier pour le serveur, déplacez-y le fichier du serveur téléchargé et renommez-le `server.jar`.

**Option 2 : Télécharger directement via la ligne de commande**

```bash
# Créez un dossier pour le serveur
mkdir NomDeMonServeurMinecraft

# Allez dans le dossier créé
cd NomDeMonServeurMinecraft

# Téléchargez le fichier du serveur
wget <lien_vers_le_fichier_du_serveur>
```

Renommez le fichier téléchargé en `server.jar` pour plus de simplicité.

---

## 3. **Lancer le serveur Minecraft**

Afin de démarrer le serveur de manière autonome, nous allons utiliser `screen`. Créez un screen avec la commande suivante :

```bash
screen -d -m -S NomDeMonScreen
```

Accédez ensuite à votre screen :

```bash
screen -x NomDeMonScreen
```

### Créer un script de démarrage

Créez un fichier `start.sh` avec le contenu suivant pour lancer le serveur avec des arguments optimisés :

```bash
nano start.sh
```

Collez le script ci-dessous dans le fichier :

```bash
#!/bin/bash
java -Xms512M -Xmx10G -XX:+UseG1GC -XX:+ParallelRefProcEnabled -XX:MaxGCPauseMillis=200 \
    -XX:+UnlockExperimentalVMOptions -XX:+DisableExplicitGC -XX:-OmitStackTraceInFastThrow \
    -XX:+AlwaysPreTouch -XX:G1NewSizePercent=30 -XX:G1MaxNewSizePercent=40 \
    -XX:G1HeapRegionSize=8M -XX:G1ReservePercent=20 -XX:G1HeapWastePercent=5 \
    -XX:G1MixedGCCountTarget=8 -XX:InitiatingHeapOccupancyPercent=15 \
    -XX:G1MixedGCLiveThresholdPercent=90 -XX:G1RSetUpdatingPauseTimePercent=5 \
    -XX:SurvivorRatio=32 -XX:MaxTenuringThreshold=1 -Dusing.aikars.flags=true \
    -Daikars.new.flags=true -jar server.jar nogui
```

Modifiez le paramètre `-Xmx10G` en fonction de la RAM de votre serveur (ex : `-Xmx4G` pour 4 Go de RAM).

Enregistrez et donnez les permissions d'exécution au script :

```bash
chmod +x start.sh
```

Démarrez votre serveur avec :

```bash
./start.sh
```

Lors du premier démarrage, acceptez l'EULA de Minecraft en éditant `eula.txt` :

```bash
nano eula.txt
# Remplacez `eula=false` par `eula=true`
```

Enregistrez et relancez le script `start.sh`. Votre serveur est maintenant opérationnel !

---

## 4. **Gérer le serveur avec `screen`**

Pour quitter le screen sans arrêter le serveur, utilisez :

- **CTRL + A**, puis **D**.

Pour revenir au screen :

```bash
screen -x NomDeMonScreen
```

> **Astuce :** Si le serveur plante, utilisez **CTRL + C** dans le screen pour arrêter le processus.

---

Crédits :
- **[@MichelBaie](https://github.com/MichelBaie)** pour la rédaction originale du tutoriel.
