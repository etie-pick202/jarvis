# CI/CD de JARVIS

Tout est dans `.github/workflows/`. Une pull request ne peut être fusionnée que si **tous** les contrôles obligatoires sont verts (ruleset `protection-main`, fichier `.github/rulesets/main.json`).

## Contrôles d'une pull request

| Contrôle (nom exact) | Fichier        | Ce qu'il vérifie                                                                         | Obligatoire           |
| -------------------- | -------------- | ---------------------------------------------------------------------------------------- | --------------------- |
| `verify`             | `ci.yml`       | Biome (lint et format), TypeScript, tests unitaires avec **seuils de couverture**, build | oui                   |
| `integration`        | `ci.yml`       | Tests `*.int.test.ts` de l'API contre un vrai PostgreSQL (`DATABASE_URL`)                | oui                   |
| `e2e`                | `ci.yml`       | Playwright (Chromium) sur la PWA construite, profils bureau et Android                   | oui                   |
| `pr-title`           | `ci.yml`       | Titre au format Conventional Commits (devient le commit en squash)                       | oui                   |
| `no-ai-mentions`     | `ci.yml`       | Règle n°1 : aucune mention d'IA dans le titre, la description, les commits               | oui                   |
| `audit-dependances`  | `security.yml` | `pnpm audit` : aucune vulnérabilité haute ou critique                                    | oui                   |
| `dependency-review`  | `security.yml` | Nouvelles dépendances d'une PR : licences et vulnérabilités                              | oui                   |
| `trivy-fichiers`     | `security.yml` | Vulnérabilités, secrets et mauvaise configuration (Dockerfile, workflows)                | oui                   |
| `gitleaks`           | `security.yml` | Secrets dans tout l'historique                                                           | oui                   |
| `codeql`             | `codeql.yml`   | Analyse statique de sécurité                                                             | oui                   |
| `docker-build`       | `docker.yml`   | Construit les images API et web, les scanne (Trivy) et démarre l'API (`/health`)         | oui                   |
| `lighthouse`         | `ci.yml`       | Performance, accessibilité, bonnes pratiques de la PWA (accessibilité bloquante)         | non                   |
| `sonar`              | `ci.yml`       | SonarCloud : qualité, duplication, couverture, porte qualité                             | non (voir ci-dessous) |

Les tâches du plan de travail ajoutent leurs tests dans les paquets : `pnpm test` (rapide), `pnpm test:coverage`, `pnpm test:integration` (nom de fichier `*.int.test.ts`, dossier `apps/api`), `pnpm test:e2e` (dossier `apps/web/e2e`).

## Après la fusion sur `main`

1. `docker.yml` publie les images `ghcr.io/<propriétaire>/jarvis-api` et `jarvis-web` (tags `sha-<commit>` et `latest`).
2. `release.yml` (release-please) ouvre une PR « release » ; la fusionner crée le tag `vX.Y.Z` et le journal des changements.
3. `deploy.yml` (si `DEPLOY_ENABLED=true`) déploie le commit sur **test** (`staging`). Un tag `vX.Y.Z` déploie en **production** après approbation des relecteurs obligatoires.
4. Le serveur exécute `infra/scripts/deploy.sh` : récupération des images, **sauvegarde de la base**, migration, bascule, contrôle de santé, **retour arrière automatique** si `/health` ne répond pas.

## Activer SonarCloud (gratuit pour un dépôt public)

À faire par le propriétaire, une seule fois :

1. Se connecter sur sonarcloud.io avec GitHub, créer ou choisir l'organisation, puis _Analyze new project_ et choisir `jarvis`. Choisir « With GitHub Actions » et **désactiver** l'analyse automatique.
2. Vérifier que `sonar.organization` et `sonar.projectKey` de `sonar-project.properties` correspondent à ce que SonarCloud affiche.
3. Ajouter le secret de dépôt `SONAR_TOKEN` (Settings > Secrets and variables > Actions).
4. Une fois le premier passage vert, ajouter `sonar` à la liste des contrôles obligatoires de `.github/rulesets/main.json`, puis relancer `infra/scripts/setup-github.sh`.

Sans `SONAR_TOKEN`, le job `sonar` s'affiche en vert avec un message d'information et ne fait rien.

## Activer le déploiement

Prérequis : un serveur Linux avec Docker et le plugin Compose.

1. Créer le dossier de déploiement sur le serveur (par exemple `/opt/jarvis`) et y créer le fichier `.env` (jamais versionné) : `POSTGRES_PASSWORD`, `DATABASE_URL`, `SESSION_SECRET`, `DOMAIN`.
2. Rendre les paquets GHCR `jarvis-api` et `jarvis-web` publics (Packages > Package settings > Change visibility), sinon le serveur doit s'authentifier à GHCR.
3. Créer un utilisateur de déploiement avec une clé SSH dédiée, limitée à ce dossier et au groupe Docker.
4. Dans Settings > Environments, pour `staging` et `production` :
   - secrets : `SSH_HOST`, `SSH_USER`, `SSH_KEY` (clé privée), `SSH_KNOWN_HOSTS` (résultat de `ssh-keyscan -H <hôte>`) ;
   - variables : `DEPLOY_PATH` (dossier du serveur), `BASE_URL` (adresse publique, sans `/` final) ;
   - `production` : relecteurs obligatoires (chef de projet et DevOps), auto-validation interdite, étiquettes `v*.*.*` seulement.
5. Programmer `backup.sh` chaque nuit (cron du serveur) et récupérer régulièrement une copie hors du serveur.
6. Passer la variable de dépôt `DEPLOY_ENABLED` à `true`.

## Règle n°1

Aucune mention d'IA dans un commit ou une pull request (voir `CONTRIBUTING.md`). Elle est vérifiée par commitlint en local et par `no-ai-mentions` sur GitHub.
