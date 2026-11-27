#!/usr/bin/env bash
# Configure le dépôt GitHub : visibilité, options de fusion, règles de branche, étiquettes, sécurité.
# À lancer UNE FOIS par le propriétaire du dépôt, connecté avec : gh auth login
# Usage : infra/scripts/setup-github.sh <organisation-ou-compte>/<depot>
set -euo pipefail
REPO="${1:?Usage: $0 <owner>/<repo>}"
cd "$(dirname "$0")/../.."

echo "→ Vérification de la connexion GitHub"
gh auth status >/dev/null

if ! gh repo view "$REPO" >/dev/null 2>&1; then
  echo "→ Création du dépôt PUBLIC $REPO"
  gh repo create "$REPO" --public --description "JARVIS · application de gestion COCOSAB" --source . --remote origin
fi

echo "→ Options du dépôt (squash uniquement, suppression auto des branches)"
gh api -X PATCH "repos/$REPO" \
  -F allow_squash_merge=true -F allow_merge_commit=true -f merge_commit_title=PR_TITLE -f merge_commit_message=PR_BODY -F allow_rebase_merge=false \
  -F delete_branch_on_merge=true -F has_wiki=false -F has_projects=false \
  -f squash_merge_commit_title=PR_TITLE -f squash_merge_commit_message=PR_BODY >/dev/null

echo "→ Sécurité : alertes Dependabot, analyse de secrets, protection push"
gh api -X PUT "repos/$REPO/vulnerability-alerts" >/dev/null || true
gh api -X PUT "repos/$REPO/automated-security-fixes" >/dev/null || true
gh api -X PATCH "repos/$REPO" --input - >/dev/null <<'JSON' || true
{"security_and_analysis":{"secret_scanning":{"status":"enabled"},"secret_scanning_push_protection":{"status":"enabled"}}}
JSON

echo "→ Workflows des forks : approbation obligatoire pour tous les contributeurs externes"
gh api -X PUT "repos/$REPO/actions/permissions/fork-pr-contributor-approval" -f approval_policy=all_external_contributors >/dev/null || true
echo "→ Jeton des workflows en lecture seule par défaut"
gh api -X PUT "repos/$REPO/actions/permissions/workflow" -f default_workflow_permissions=read -F can_approve_pull_request_reviews=false >/dev/null

echo "→ Règles (rulesets)"
echo "→ Branches develop et staging (créées depuis main si absentes)"
main_sha=$(gh api "repos/$REPO/git/ref/heads/main" --jq .object.sha)
for b in staging develop; do
  gh api "repos/$REPO/git/ref/heads/$b" >/dev/null 2>&1 || gh api -X POST "repos/$REPO/git/refs" -f ref="refs/heads/$b" -f sha="$main_sha" >/dev/null
done
gh api -X PATCH "repos/$REPO" -f default_branch=develop >/dev/null

for f in .github/rulesets/main.json .github/rulesets/staging.json .github/rulesets/develop.json .github/rulesets/tags.json; do
  name=$(python3 -c "import json,sys;print(json.load(open('$f'))['name'])")
  id=$(gh api "repos/$REPO/rulesets" --jq ".[] | select(.name==\"$name\") | .id" || true)
  if [ -n "$id" ]; then gh api -X PUT "repos/$REPO/rulesets/$id" --input "$f" >/dev/null; else gh api -X POST "repos/$REPO/rulesets" --input "$f" >/dev/null; fi
  echo "   ok : $name"
done

echo "→ Environnements develop, staging et production (une branche chacun)"
for env in develop:develop staging:staging production:main; do
  name=${env%%:*}; branch=${env##*:}
  gh api -X PUT "repos/$REPO/environments/$name" --input - >/dev/null <<JSON
{"deployment_branch_policy":{"protected_branches":false,"custom_branch_policies":true}}
JSON
  gh api "repos/$REPO/environments/$name/deployment-branch-policies" --jq '.branch_policies[].name' | grep -qx "$branch"     || gh api -X POST "repos/$REPO/environments/$name/deployment-branch-policies" -f name="$branch" -f type=branch >/dev/null
done
echo "   production : ajoutez les relecteurs obligatoires (chef de projet + DevOps) dans"
echo "   Settings > Environments > production (ou voir docs/GITHUB-SETUP.md)."

echo "→ Étiquettes"
PYTHONUTF8=1 python3 - "$REPO" <<'PY'
import json, subprocess, sys
repo = sys.argv[1]
for l in json.load(open(".github/labels.json", encoding="utf-8")):
    subprocess.run(["gh","label","create",l["name"],"--color",l["color"],"--repo",repo,"--force"],check=False)
PY

echo "✔ Terminé. Étapes manuelles restantes : voir docs/GITHUB-SETUP.md"
