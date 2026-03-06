---
title: "Monitorer son Homelab avec Grafana et Prometheus"
date: 2025-02-20 10:00:00 +0100
categories: [Selfhost, Monitoring]
tags: [grafana, prometheus, monitoring, homelab, docker]
---

## Pourquoi monitorer ?

Sans monitoring, vous découvrez les problèmes quand vos services tombent. Avec Grafana + Prometheus, vous les anticipez.

## Architecture

```
Serveurs → Node Exporter (métriques) → Prometheus (stockage) → Grafana (visualisation)
Docker   → cAdvisor (métriques)      ↗
```

## Stack complète

```bash
mkdir -p ~/docker/monitoring/prometheus
cd ~/docker/monitoring
```

```yaml
# prometheus/prometheus.yml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']

  - job_name: 'node-exporter'
    static_configs:
      - targets: ['node-exporter:9100']

  - job_name: 'cadvisor'
    static_configs:
      - targets: ['cadvisor:8080']
```

```yaml
# docker-compose.yml
services:
  prometheus:
    image: prom/prometheus:latest
    container_name: prometheus
    volumes:
      - ./prometheus/prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - prometheus_data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.retention.time=30d'
    networks:
      - proxy
      - monitoring
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.prometheus.rule=Host(`prometheus.mondomaine.fr`)"
      - "traefik.http.services.prometheus.loadbalancer.server.port=9090"
    restart: unless-stopped

  grafana:
    image: grafana/grafana:latest
    container_name: grafana
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=GrafanaAdmin123!
      - GF_USERS_ALLOW_SIGN_UP=false
      - GF_SERVER_ROOT_URL=https://grafana.mondomaine.fr
    volumes:
      - grafana_data:/var/lib/grafana
    networks:
      - proxy
      - monitoring
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.grafana.rule=Host(`grafana.mondomaine.fr`)"
      - "traefik.http.services.grafana.loadbalancer.server.port=3000"
    restart: unless-stopped

  node-exporter:
    image: prom/node-exporter:latest
    container_name: node-exporter
    volumes:
      - /proc:/host/proc:ro
      - /sys:/host/sys:ro
      - /:/rootfs:ro
    command:
      - '--path.procfs=/host/proc'
      - '--path.rootfs=/rootfs'
      - '--path.sysfs=/host/sys'
    networks:
      - monitoring
    restart: unless-stopped

  cadvisor:
    image: gcr.io/cadvisor/cadvisor:latest
    container_name: cadvisor
    volumes:
      - /:/rootfs:ro
      - /var/run:/var/run:ro
      - /sys:/sys:ro
      - /var/lib/docker/:/var/lib/docker:ro
    networks:
      - monitoring
    restart: unless-stopped

volumes:
  prometheus_data:
  grafana_data:

networks:
  proxy:
    external: true
  monitoring:
    driver: bridge
```

## Configuration de Grafana

1. Connectez-vous sur `https://grafana.mondomaine.fr`
2. **Datasource** → Add → Prometheus → URL : `http://prometheus:9090`
3. **Dashboards** → Import → ID `1860` (Node Exporter Full)
4. **Dashboards** → Import → ID `893` (Docker cAdvisor)

## Alertes

Dans Grafana, créez une alerte basique :

```
Condition : avg(node_filesystem_avail_bytes) < 10GB
→ Envoyer un email / notification Telegram
```

## Alertmanager (optionnel)

```yaml
  alertmanager:
    image: prom/alertmanager:latest
    container_name: alertmanager
    volumes:
      - ./alertmanager.yml:/etc/alertmanager/alertmanager.yml:ro
    networks:
      - monitoring
    restart: unless-stopped
```

> Gardez au moins **30 jours de rétention** dans Prometheus pour détecter les tendances.
{: .prompt-tip }
