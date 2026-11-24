# JARVIS

Application web de gestion de COCOSAB SARL : gaz, Canal+, Orange Money et MoMo, livraisons, caisses et rapports du PDG.
Slogan : _Votre assistant, partout où vous allez._

C'est une PWA (React) qui fonctionne sans réseau, avec une API TypeScript (Hono) et une base PostgreSQL.

## Mise en route (moins de 10 minutes)

Prérequis : Node.js 22 (`.nvmrc`), pnpm, Docker.

```bash
pnpm install
cp .env.example .env
docker compose -f docker-compose.dev.yml up -d   # base de développement
pnpm dev                                          # API (3000) et web (5173)
pnpm test                                         # tests
pnpm lint && pnpm typecheck                       # contrôles
```

## Structure

| Dossier           | Contenu                                                |
| ----------------- | ------------------------------------------------------ |
| `apps/web`        | PWA React (Vite)                                       |
| `apps/api`        | API Hono, tâches planifiées                            |
| `packages/shared` | Schémas Zod, types, règles de prix et de montants      |
| `packages/db`     | Schéma Drizzle, migrations, données de départ          |
| `packages/config` | Réglages communs                                       |
| `infra/`          | Docker, Caddy, scripts de sauvegarde et de déploiement |
| `docs/adr/`       | Décisions d'architecture                               |

## Règles

Lire [CONTRIBUTING.md](CONTRIBUTING.md) avant la première pull request. Sécurité : [SECURITY.md](SECURITY.md).

## Dépôt public, projet fermé

Le code est visible, mais **aucune donnée de COCOSAB, aucun secret et aucune donnée client ne doit jamais entrer dans le dépôt**. Le code n'est pas sous licence libre : voir [LICENSE](LICENSE).
