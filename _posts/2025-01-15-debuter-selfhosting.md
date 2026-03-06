---
title: "Débuter le Self-Hosting : Le Guide Complet pour se Lancer"
date: 2025-01-15 10:00:00 +0100
categories: [Selfhost, Guide]
tags: [selfhost, débutant, homelab, linux]
---

## Pourquoi self-hoster ?

Le self-hosting, c'est héberger soi-même ses services au lieu de dépendre de Google, Microsoft ou autres. Les raisons sont nombreuses :

- **Vie privée** : vos données restent chez vous
- **Apprentissage** : vous comprenez comment fonctionne Internet
- **Économies** : sur le long terme, c'est souvent moins cher
- **Liberté** : pas de conditions d'utilisation abusives

## De quoi avez-vous besoin ?

### Le matériel minimum

| Option | Coût | Performance | Conso |
|--------|------|-------------|-------|
| Raspberry Pi 4/5 | 50-80€ | Suffisante pour débuter | ~5W |
| Mini PC (N100) | 100-150€ | Très bonne | ~15W |
| Vieux PC recyclé | 0€ | Variable | 30-80W |
| VPS (Hetzner, OVH) | 4-8€/mois | Bonne | 0W chez vous |

### Le logiciel

Installez une distribution Linux serveur :

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl wget git htop nano ufw
```

## Sécurisation de base

### 1. Créer un utilisateur non-root

```bash
adduser monuser
usermod -aG sudo monuser
```

### 2. Configurer SSH

```bash
sudo nano /etc/ssh/sshd_config
```

Modifiez ces lignes :

```
PermitRootLogin no
PasswordAuthentication no
Port 2222
```

Ajoutez votre clé SSH **avant** de désactiver le mot de passe :

```bash
ssh-keygen -t ed25519 -C "mon-pc"
ssh-copy-id -p 22 monuser@IP_DU_SERVEUR
sudo systemctl restart sshd
```

### 3. Pare-feu avec UFW

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 2222/tcp comment 'SSH'
sudo ufw allow 80/tcp comment 'HTTP'
sudo ufw allow 443/tcp comment 'HTTPS'
sudo ufw enable
```

### 4. Fail2ban

```bash
sudo apt install fail2ban
sudo cp /etc/fail2ban/jail.conf /etc/fail2ban/jail.local
```

```ini
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 3

[sshd]
enabled = true
port = 2222
```

```bash
sudo systemctl enable --now fail2ban
```

### 5. Mises à jour automatiques

```bash
sudo apt install unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades
```

## Installer Docker

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker
docker --version
docker compose version
```

## Votre premier service : Uptime Kuma

```yaml
services:
  uptime-kuma:
    image: louislam/uptime-kuma:1
    container_name: uptime-kuma
    volumes:
      - ./data:/app/data
    ports:
      - "3001:3001"
    restart: unless-stopped
```

```bash
docker compose up -d
```

Accédez à `http://IP_DU_SERVEUR:3001` et configurez votre premier moniteur !

## Arborescence recommandée

```
~/docker/
├── traefik/
├── uptime-kuma/
├── nextcloud/
└── scripts/
    ├── backup.sh
    └── update-all.sh
```

> Le self-hosting est un voyage, pas une destination. Commencez petit, apprenez, et ajoutez des services progressivement.
{: .prompt-tip }
