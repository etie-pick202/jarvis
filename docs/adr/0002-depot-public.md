# ADR 0002 : dépôt public au départ

- Date : 2026-11-24
- Statut : acceptée, à revoir avant la mise en production

## Contexte

Sur le plan gratuit de GitHub, les minutes de GitHub Actions sont limitées pour les dépôts privés (2 000 par mois), et les règles de protection de branche ne sont pas disponibles sur les dépôts privés.

## Décision

Le dépôt est **public** au départ : minutes Actions gratuites avec les exécuteurs standard, protection de branche, CodeQL et détection de secrets gratuits.

## Règles associées

Aucun secret, aucune donnée réelle (voir `SECURITY.md`). Code sous licence « tous droits réservés » (`LICENSE`). Aucun workflow de déploiement sur les pull requests de forks.

## Conséquences

Le code et les règles de gestion sont lisibles par tous. À revoir avant la mise en production : passer en privé (avec une offre payante de GitHub) ou rester public.
