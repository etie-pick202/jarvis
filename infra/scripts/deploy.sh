#!/usr/bin/env bash
# Déploiement sur le serveur : sauvegarde, migration, bascule, contrôle de santé, retour arrière automatique.
# Usage : TAG=<version-ou-sha> REGISTRY_OWNER=<proprietaire> ./deploy.sh
# Le dossier doit contenir docker-compose.prod.yml, ce script, backup.sh et un fichier .env (jamais versionné).
set -euo pipefail
cd "$(dirname "$0")"
: "${TAG:?TAG requis}" "${REGISTRY_OWNER:?REGISTRY_OWNER requis}"
export TAG REGISTRY_OWNER
COMPOSE="docker compose -f docker-compose.prod.yml"
PREVIOUS_FILE=".previous-tag"

healthy() {
  for _ in $(seq 1 30); do
    if $COMPOSE exec -T web wget -qO- http://api:3000/health >/dev/null 2>&1; then return 0; fi
    sleep 5
  done
  return 1
}

if [[ -f .current-tag ]]; then cp .current-tag "$PREVIOUS_FILE"; fi

echo "→ Récupération des images ($TAG)"
$COMPOSE pull api web

if $COMPOSE ps --status running db 2>/dev/null | grep -q db; then
  echo "→ Sauvegarde avant migration"
  ./backup.sh
fi

echo "→ Base de données"
$COMPOSE up -d db

echo "→ Migration (si l'image en contient une)"
$COMPOSE run --rm --no-deps api sh -c '[ -f dist/migrate.js ] && node dist/migrate.js || echo "Aucune migration"'

echo "→ Bascule"
$COMPOSE up -d --remove-orphans api web

if healthy; then
  echo "$TAG" > .current-tag
  docker image prune -f >/dev/null
  echo "✔ Version $TAG en service"
  exit 0
fi

echo "✘ Contrôle de santé en échec" >&2
if [[ -f "$PREVIOUS_FILE" ]]; then
  PREV="$(cat "$PREVIOUS_FILE")"
  echo "→ Retour arrière vers $PREV" >&2
  TAG="$PREV" $COMPOSE up -d api web
  echo "Retour arrière effectué. Les sauvegardes sont dans ./backups ; restaurer la base à la main si la migration était destructive." >&2
else
  echo "Aucune version précédente connue : intervention manuelle nécessaire." >&2
fi
exit 1
