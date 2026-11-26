# Contribuer à JARVIS

## Règle n°1 : aucune mention d'IA

Dans les commits et les pull requests, il ne doit **jamais** y avoir de mention d'un outil ou d'un modèle d'intelligence artificielle : ni dans le titre, ni dans la description, ni dans les messages de commit, ni dans les signatures ou les lignes `Co-Authored-By`, ni parmi les contributeurs. Les lignes ajoutées automatiquement par un outil (« Generated with… », « Co-Authored-By… ») sont à supprimer avant d'envoyer.

Cette règle est vérifiée par commitlint (au commit) et par la CI (`no-ai-mentions`, sur les pull requests).

## Branches et environnements

Trois branches permanentes, chacune liée à un environnement. Aucune n'accepte de commit direct ni de force push : tout passe par une pull request avec la CI verte et la revue des propriétaires du code.

| Branche   | Environnement       | Reçoit                                                     | Fusion                     |
| --------- | ------------------- | ---------------------------------------------------------- | -------------------------- |
| `develop` | `develop` (test)    | les branches de travail (`feat/…`, `fix/…`, `chore/…`…)    | _squash_                   |
| `staging` | `staging` (recette) | `develop` quand un lot est prêt à être recetté, `hotfix/…` | commit de fusion (_merge_) |
| `main`    | `production`        | `staging` après recette, `hotfix/…`, la PR de version      | commit de fusion (_merge_) |

- `develop` est la branche par défaut : c'est la cible de toutes les PR de travail.
- Promotion : PR `develop` → `staging`, puis `staging` → `main`, toujours en **commit de fusion** (pas de _squash_, sinon les branches divergent). Titre : `chore(release): promouvoir develop vers staging`.
- Correctif urgent : `hotfix/<sujet>` partant de `main`, PR vers `main`, puis PR de retour `main` → `develop` (commit de fusion).
- Le contrôle `flux-branches` refuse une PR qui ne respecte pas ce sens.
- Branches courtes (2 à 3 jours) : `feat/<ticket>-<sujet>`, `fix/<ticket>-<sujet>`, `chore/<sujet>`, `docs/<sujet>`, `hotfix/<sujet>`.
- Exemple : `feat/G6-4-annulation-vente`. Supprimer la branche après la fusion.

## Commits (Conventional Commits, vérifiés par commitlint)

`type(module): message à l'impératif`

- Types : `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `ci`, `perf`.
- Modules : `auth`, `catalogue`, `stock`, `ventes`, `caisses`, `livraisons`, `services`, `rapports`, `documents`, `notifications`, `audit`, `web`, `api`, `shared`, `db`, `infra`, `deps`.
- Exemples : `feat(ventes): bloquer la vente en cas de rupture` ; `fix(caisses): corriger l'écart du comptage du soir`.

## Pull requests

1. Ouvrir en **brouillon** dès le premier jour, passer en « prête » quand la CI est verte.
2. Titre au format Conventional Commits (il devient le message du commit, fusion en _squash_ vers `develop`).
3. Moins de 400 lignes modifiées quand c'est possible.
4. Une approbation d'un propriétaire du code (`CODEOWNERS`) est obligatoire. L'auteur ne valide jamais sa propre PR.
5. Première revue sous 24 heures ouvrées.
6. Capture d'écran pour tout changement d'écran (téléphone et ordinateur).

## Règles de code

- TypeScript strict, pas de `any`. Biome sans avertissement.
- Les règles d'argent vivent dans l'API et dans `packages/shared`, avec des tests.
- Montants en FCFA : entiers, jamais décimaux.
- Les écritures du journal (`sales`, `cash_entries`, `stock_moves`) ne sont jamais modifiées ni effacées : une correction ajoute une écriture inverse avec justificatif.
- Toute écriture accepte une clé d'idempotence (`Idempotency-Key`).
- Une anomalie corrigée commence par un test qui échoue.

## Définition de « terminé »

Pull request fusionnée, déployée sur l'environnement de test, vérifiée sur un vrai téléphone Android, et validée par le chef de projet contre la maquette. Mettre alors la tâche à « Terminé » dans le plan de travail.

## Versions

SemVer (`MAJOR.MINOR.PATCH`), tags `vX.Y.Z`, notes générées par release-please.
