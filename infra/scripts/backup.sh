#!/usr/bin/env bash
# Sauvegarde PostgreSQL compressée dans ./backups (conserve les 14 dernières). À planifier chaque nuit (cron).
# Usage (sur le serveur, dans le dossier de déploiement) : ./backup.sh
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p backups
file="backups/jarvis-$(date +%Y%m%d-%H%M%S).sql.gz"
docker compose -f docker-compose.prod.yml exec -T db \
  pg_dump -U "${POSTGRES_USER:-jarvis}" "${POSTGRES_DB:-jarvis}" | gzip > "$file"
test -s "$file" || { echo "Sauvegarde vide : $file" >&2; rm -f "$file"; exit 1; }
ls -1t backups/jarvis-*.sql.gz | tail -n +15 | xargs -r rm --
echo "Sauvegarde écrite : $file"
