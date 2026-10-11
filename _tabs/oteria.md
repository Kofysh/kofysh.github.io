---
title: OTERIA
icon: fas fa-graduation-cap
order: 0
---

<section class="project-hub">
  <div class="project-hub__hero">
    <p class="project-hub__eyebrow">Portfolio scolaire</p>
    <h1>Projets OTERIA</h1>
    <p class="project-hub__intro">
      Une sélection de travaux réalisés pendant mon Bachelor cybersécurité à
      OTERIA. Architecture, administration système et sécurité : chaque projet
      est documenté avec ses choix techniques, ses procédures et ses preuves.
    </p>
    <div class="project-hub__meta">
      <span><i class="fas fa-shield-halved"></i> Cybersécurité</span>
      <span><i class="fas fa-server"></i> Infrastructure</span>
      <span><i class="fas fa-book-open"></i> Documentation</span>
    </div>
  </div>

  <div class="project-hub__section">
    <div class="project-hub__heading">
      <p class="project-hub__eyebrow">Projets documentés</p>
      <h2>Du besoin à la recette</h2>
    </div>

    {% assign oteria_posts = site.data.oteria_posts %}
    {% for post in oteria_posts %}
    <a class="project-card{% if forloop.first %} project-card--featured{% endif %}" href="{{ post.url | relative_url }}" style="margin-bottom: 0.9rem;">
      <div class="project-card__number">{{ forloop.index | prepend: '00' | slice: -2, 2 }}</div>
      <div class="project-card__body">
        <p class="project-card__status">Projet OTERIA</p>
        <h3>{{ post.title }}</h3>
        <p>{{ post.description }}</p>
        <span class="project-card__link">Lire le dossier <i class="fas fa-arrow-right"></i></span>
      </div>
      {% if post.oteria_tags.size > 0 %}
      <div class="project-card__stack">
        {% for tag in post.oteria_tags limit: 4 %}
        <span>{{ tag }}</span>
        {% endfor %}
      </div>
      {% endif %}
    </a>
    {% endfor %}
  </div>

  <div class="project-hub__section project-hub__section--next">
    <div class="project-hub__heading">
      <p class="project-hub__eyebrow">À venir</p>
      <h2>Le laboratoire s'agrandit</h2>
    </div>
    <div class="project-hub__grid">
      <article class="project-note">
        <i class="fas fa-network-wired"></i>
        <h3>Architecture réseau</h3>
        <p>VLAN, filtrage inter-zones et exposition minimale des services.</p>
      </article>
      <article class="project-note">
        <i class="fas fa-lock"></i>
        <h3>Audit et durcissement</h3>
        <p>Menaces, mesures de réduction du risque et preuves de contrôle.</p>
      </article>
      <article class="project-note">
        <i class="fas fa-terminal"></i>
        <h3>Automatisation</h3>
        <p>Scripts reproductibles, observabilité et procédures de reprise.</p>
      </article>
    </div>
  </div>

  <aside class="project-hub__callout">
    <i class="fas fa-circle-info"></i>
    <p>
      Les résultats sont distingués des intentions : une procédure explique
      quoi faire, une preuve jointe démontre ce qui a réellement été vérifié.
    </p>
  </aside>
</section>
