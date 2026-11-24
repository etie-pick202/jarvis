# ADR 0001 : architecture et stack

- Date : 2026-11-24
- Statut : acceptée (sauf point ouvert ci-dessous)

## Contexte

COCOSAB a besoin d'une application web utilisable au comptoir malgré les coupures de réseau, gratuite ou presque, maintenue par une équipe de quatre personnes.

## Décision

- Front et API **séparés**, dans un seul dépôt (monorepo pnpm + Turborepo).
- Front : React, Vite, TypeScript, PWA hors ligne (Dexie, file d'envoi).
- API : Node.js, **Hono**, Zod, PostgreSQL, Drizzle, pg-boss.
- Hébergement : un VPS, Docker Compose, Caddy.
- CI/CD : GitHub Actions.

## Point ouvert

Hono ou Fastify : Hono par défaut, à confirmer par le chef de projet.

## Conséquences

Un seul langage (TypeScript) pour toute l'équipe, un client d'API typé partagé, un déploiement simple.
