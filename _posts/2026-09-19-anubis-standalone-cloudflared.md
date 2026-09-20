---
title: "Anubis en standalone derrière Cloudflared, sans Docker"
layout: post
date: 2026-09-19 21:00:00 +0200
last_modified_at: 2026-09-20 09:45:00 +0200
categories: [Tutoriels, Cybersécurité, Self-hosting]
tags: [Anubis, Cloudflare Tunnel, cloudflared, anti-bot, Debian 13, systemd, self-hosting]
image: /assets/img/covers/anubis-cloudflared.svg
description: "Déployer Anubis en standalone (binaire natif, sans Docker) derrière un cloudflared centralisé, avec une instance par application dans le même LXC, pour filtrer les crawlers IA et bots devant tout votre homelab."
permalink: /posts/anubis-standalone-cloudflared/
---

## Le principe

**Anubis** est un pare-feu applicatif anti-bot qui « pèse » les requêtes HTTP entrantes (via une preuve de travail côté navigateur) avant de les laisser passer vers votre application — pensé à l'origine pour bloquer les crawlers IA agressifs qui ignorent `robots.txt`. C'est un simple binaire Go qui écoute et proxifie vers une cible : il n'a donc pas besoin d'un reverse proxy supplémentaire devant lui, ni de Docker.

Dans une architecture où **cloudflared** gère déjà la terminaison TLS côté Cloudflare et le routage vers vos services, Anubis vient se glisser **entre cloudflared et chaque application** : une seule instance `cloudflared` centralisée, et une instance Anubis par application, chacune sur son propre port local, dans un unique LXC dédié.

## Architecture cible

```text
Internet → Cloudflare Edge → cloudflared (1 instance, plusieurs ingress)
                                   │
                     ┌─────────────┼─────────────┐
                     │             │             │
              Anubis :8081   Anubis :8082   Anubis :8083
                     │             │             │
                App1:3000    App2:8096     App3:5000
              (autre LXC)   (autre LXC)   (autre LXC)
```

Chaque instance Anubis écoute en local sur un port dédié, vérifie la requête, puis la transmet à l'IP:port réel de l'application (potentiellement dans un autre conteneur/LXC de votre homelab). `cloudflared` ne pointe plus directement vers vos apps, mais vers le port local d'Anubis correspondant.

## Prérequis

- Un LXC (ou VM) dédié sous **Debian 13**, avec accès root, qui hébergera `cloudflared` et toutes les instances Anubis.
- Un tunnel Cloudflare déjà créé et fonctionnel (`cloudflared tunnel create`), avec son fichier de credentials.
- Vos applications déjà accessibles en interne (IP:port) depuis ce LXC.

## Étape 1 — Installer cloudflared (si pas déjà fait)

```bash
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared
chmod +x /usr/local/bin/cloudflared
cloudflared tunnel login
cloudflared tunnel create homelab-tunnel
```

Notez le fichier de credentials généré (`~/.cloudflared/<UUID>.json`), il sera référencé dans la config.

## Étape 2 — Installer Anubis en standalone (binaire natif)

Téléchargez la dernière release depuis GitHub (adaptez la version) :

```bash
cd /tmp
wget https://github.com/TecharoHQ/anubis/releases/latest/download/anubis-linux-amd64.tar.gz
tar xzf anubis-linux-amd64.tar.gz
install -D ./anubis /usr/local/bin/anubis
```

Créez un utilisateur système dédié, pour ne pas exposer un service réseau en root :

```bash
useradd --system --no-create-home --shell /usr/sbin/nologin anubis
```

## Étape 3 — Créer un service systemd « template » réutilisable

L'astuce pour gérer plusieurs instances proprement est d'utiliser un **service template** (`anubis@.service`) : le `%i` après le `@` devient le nom de l'instance, ce qui permet de démarrer `anubis@app1`, `anubis@app2`, etc. depuis un seul fichier.

```bash
nano /etc/systemd/system/anubis@.service
```

```ini
[Unit]
Description=Anubis anti-bot - instance %i
After=network.target

[Service]
Type=simple
User=anubis
Group=anubis
EnvironmentFile=/etc/anubis/%i.env
ExecStart=/usr/local/bin/anubis
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

## Étape 4 — Créer un fichier d'environnement par application

Chaque instance a son propre port d'écoute local et sa propre cible :

```bash
mkdir -p /etc/anubis
nano /etc/anubis/app1.env
```

```ini
BIND=127.0.0.1:8081
TARGET=http://192.168.0.50:3000
POLICY_FNAME=/etc/anubis/botPolicy.yaml
DIFFICULTY=4
```

Dupliquez pour chaque application (`app2.env` avec `BIND=127.0.0.1:8082` et `TARGET=http://192.168.0.51:8096`, etc.). `TARGET` pointe vers l'IP:port réel de l'application, potentiellement dans un LXC différent de celui où tourne Anubis.

## Étape 5 — Démarrer les instances

```bash
systemctl daemon-reload
systemctl enable --now anubis@app1
systemctl enable --now anubis@app2
systemctl enable --now anubis@app3
```

Vérifiez qu'elles écoutent bien sur leurs ports respectifs :

```bash
ss -ltnp | grep anubis
journalctl -u anubis@app1 -f
```

## Étape 6 — Faire pointer cloudflared vers Anubis (pas vers les apps)

Éditez la config de votre tunnel :

```bash
nano /etc/cloudflared/config.yml
```

```yaml
tunnel: <UUID_DU_TUNNEL>
credentials-file: /etc/cloudflared/<UUID_DU_TUNNEL>.json

ingress:
  - hostname: app1.exemple.fr
    service: http://127.0.0.1:8081
  - hostname: app2.exemple.fr
    service: http://127.0.0.1:8082
  - hostname: app3.exemple.fr
    service: http://127.0.0.1:8083
  - service: http_status:404
```

C'est le point clé de l'architecture : **chaque hostname pointe vers le port local d'Anubis**, jamais directement vers l'IP de l'application. Anubis fait ensuite le relais vers la vraie cible définie dans son fichier `.env`.

Installez et démarrez le service cloudflared s'il ne l'est pas déjà :

```bash
cloudflared service install
systemctl enable --now cloudflared
```

## Étape 7 — Router le DNS pour chaque hostname

Pour chaque application :

```bash
cloudflared tunnel route dns homelab-tunnel app1.exemple.fr
cloudflared tunnel route dns homelab-tunnel app2.exemple.fr
cloudflared tunnel route dns homelab-tunnel app3.exemple.fr
```

## Étape 8 — Ajuster la politique Anubis

Le fichier `botPolicy.yaml` référencé dans chaque `.env` définit les règles de challenge (quels user-agents bypassent, quelle difficulté de preuve de travail, quelles routes sont exemptées). Un point de départ minimal :

```yaml
bots:
  - name: allow-search-engines
    user_agent_regex: "(Googlebot|Bingbot)"
    action: ALLOW
  - name: challenge-everyone-else
    action: CHALLENGE
```

Rechargez l'instance concernée après modification :

```bash
systemctl restart anubis@app1
```

## Vérification

Depuis un navigateur classique, la première requête vers `app1.exemple.fr` doit afficher la page de vérification Anubis (le fameux mascot), puis rediriger automatiquement vers l'application une fois le challenge résolu. Un `curl` brut sans exécution JavaScript reste bloqué par le challenge :

```bash
curl -I https://app1.exemple.fr
```

## Dépannage

1. Erreur 502 côté cloudflared → l'instance Anubis correspondante n'écoute pas (`ss -ltnp`), vérifiez `journalctl -u anubis@appX`.
2. Anubis répond mais l'application ne charge jamais → vérifiez que `TARGET` dans le `.env` est bien joignable depuis ce LXC (`curl` direct vers l'IP:port de l'app).
3. Toutes les requêtes sont bloquées y compris les vôtres → la `DIFFICULTY` est trop élevée ou la politique bloque un user-agent légitime ; ajustez `botPolicy.yaml`.

## Conclusion

Cette architecture centralise tout le filtrage anti-bot dans un seul LXC, sans Docker : un `cloudflared` avec plusieurs règles d'ingress, et une instance Anubis par application via un service systemd template, chacune isolée sur son propre port et sa propre politique. C'est simple à superviser (`systemctl status anubis@*`), simple à étendre (un nouveau `.env` + une ligne d'ingress par nouvelle appli), et ça reste cohérent avec une infra homelab qui tourne déjà sans Docker.

Bon filtrage anti-bot ! 🐺
