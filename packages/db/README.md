# @jarvis/db

Schéma Drizzle, migrations versionnées (`migrations/`) et données de départ **fictives** (jamais de donnée réelle COCOSAB).

- `pnpm --filter @jarvis/db generate` : génère une migration à partir de `src/schema.ts` (`drizzle-kit generate --custom` pour du SQL à la main).
- `DATABASE_URL=… SEED_PASSWORD=… pnpm --filter @jarvis/db seed` : comptes et catalogue d'essai (développement uniquement).
- Tests d'intégration : `DATABASE_URL=… pnpm --filter @jarvis/db test:integration`.
- En production, `node dist/migrate.js` (paquet `@jarvis/api`) applique les migrations ; le dossier `migrations/` est copié dans l'image.

## Journal en ajout seul

`sales`, `sale_lines`, `cash_entries`, `stock_moves`, `cash_closures`, `audit_log` et `gas_prices` ne se modifient ni ne s'effacent (déclencheurs SQL). Une correction ajoute une écriture inverse (`reversal_of`) avec justificatif ; une vente ne peut être inversée qu'une fois. Le paiement à crédit est refusé par une contrainte de la base.

## Base vide (production ou démonstration)

`pnpm --filter @jarvis/db initialiser` (avec `DATABASE_URL`, `PDG_USERNAME`, `PDG_PASSWORD`, `PDG_NAME` facultatif), après les migrations :
crée seulement les six caisses et un premier compte PDG (si aucun utilisateur n'existe). Aucune marque, aucun format,
aucun prix, aucun stock : le PDG saisit tout dans l'application et crée les autres comptes. `seed` reste réservé
aux données d'essai fictives du développement et des tests.
