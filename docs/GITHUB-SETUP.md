# Mise en place GitHub (propriétaire du dépôt)

## 0. Avant de commencer

- Créer ou choisir le compte ou l'organisation GitHub (de préférence une **organisation** `cocosab`, gratuite, pour ne pas lier le projet à un compte personnel).
- Activer la **double authentification** pour toute l'équipe (obligatoire).
- Deux propriétaires (« Owner ») au minimum : chef de projet et DevOps, pour ne jamais perdre l'accès.

## 1. Premier envoi du code

```bash
cd jarvis
git init -b main
git add . && git commit -m "chore: initialiser le dépôt"
gh auth login
infra/scripts/setup-github.sh cocosab/jarvis
git push -u origin main
```
> Le script crée le dépôt **public**. Ne rien committer d'autre que ce scaffold avant d'avoir relu la liste des fichiers.

## 2. Droits de l'équipe

| Personne       | Rôle sur le dépôt   | Pourquoi                             |
| -------------- | ------------------- | ------------------------------------ |
| Chef de projet | Admin               | Réglages, relecture                  |
| DevOps         | Admin               | Déploiement, secrets, environnements |
| Data           | Write               | Base de données, rapports            |
| Automatisation | Write               | Documents, notifications             |
| Gérant / PDG   | aucun accès au code | Ils utilisent l'application          |

Équipe actuelle (droit Write, relecteurs dans `.github/CODEOWNERS`) : chef de projet `@ATOUGAIIEmmanuelDesire`, Data `@kerry-kate`, automatisation `@JOJO20001`. Le propriétaire `@etie-pick202` tient le rôle DevOps.

Tant que le dépôt est personnel, les rulesets `protection-develop`, `protection-staging` et `protection-main` laissent le rôle **Admin** contourner les règles, uniquement au moment de fusionner une pull request (`bypass_mode: pull_request`, pas de push direct). Sur un dépôt personnel, seul le propriétaire a ce rôle. À retirer des fichiers `.github/rulesets/*.json` dès que l'équipe relit.

Créer une équipe par métier (`@cocosab/chefs`, `@cocosab/devops`, `@cocosab/data`, `@cocosab/auto`) puis remplacer les `@...` du fichier `.github/CODEOWNERS`.

## 3. Branches et environnements

`setup-github.sh` crée `develop` et `staging` depuis `main`, fait de `develop` la branche par défaut et limite chaque environnement à sa branche (`develop` → `develop`, `staging` → `staging`, `production` → `main`). Flux : voir `CONTRIBUTING.md`.

À faire à la main : Settings > Environments > production : **Required reviewers** = chef de projet + DevOps, _Prevent self-review_ coché. Les secrets de production se mettent ici, pas au niveau du dépôt.

## 4. Variables et secrets

Variable de dépôt `DEPLOY_ENABLED=false` (passer à `true` quand le DevOps a fini G1-4).
Secrets et variables par environnement, SonarCloud et déploiement : voir [docs/CI-CD.md](CI-CD.md). Jamais de secret dans le code.

## 5. Vérifier que tout est bien actif

- Pousser une branche, ouvrir une PR : la CI `verify`, `pr-title`, `gitleaks`, `codeql` doivent apparaître et bloquer la fusion si elles échouent.
- Essayer de pousser directement sur `main`, `staging` ou `develop` : doit être refusé.
- Settings > Code security : _Secret scanning_ et _Push protection_ activés.

## 6. Passage en privé plus tard

Settings > General > Danger zone > Change visibility. Attention : sur l'offre gratuite, les minutes Actions retombent à 2 000 par mois et les règles de protection de branche ne sont plus disponibles sur un dépôt privé. Prévoir l'offre Team avant de changer.
