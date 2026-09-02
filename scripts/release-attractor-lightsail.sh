#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "$0")/lightsail-common.sh"
rl_lock

credential_file="${ROOT_LOGOS_X_CREDENTIAL_FILE:-/var/lib/root-logos/x-publication.env}"
if [[ ! -r "$credential_file" ]]; then
  echo "Root Logos X publication credentials are not installed." >&2
  exit 1
fi

set -a
source "$credential_file"
set +a
export X_API_KEY="$(printf '%s' "$X_API_KEY_B64" | base64 --decode)"
export X_API_SECRET="$(printf '%s' "$X_API_SECRET_B64" | base64 --decode)"
export X_ACCESS_TOKEN="$(printf '%s' "$X_ACCESS_TOKEN_B64" | base64 --decode)"
export X_ACCESS_TOKEN_SECRET="$(printf '%s' "$X_ACCESS_TOKEN_SECRET_B64" | base64 --decode)"
unset X_API_KEY_B64 X_API_SECRET_B64 X_ACCESS_TOKEN_B64 X_ACCESS_TOKEN_SECRET_B64

cd "$ROOT_LOGOS_ROOT"
rl_git_identity
node scripts/attractors.mjs validate
node scripts/attractors.mjs release-x

if git diff --quiet -- content/attractor-packets.json; then
  echo "No constitutionally eligible fragment is due."
  exit 0
fi

node scripts/cultivate.mjs cycle
node scripts/cultivate.mjs validate
node scripts/attractors.mjs validate

if rl_commit_if_changed "Archive attractor emission" \
  content/attractor-packets.json \
  cultivation/state.json cultivation/memory.json cultivation/cycles \
  content/constitutional-graph.json self-authorship/current.json self-authorship/lineage; then
  rl_publish_site
  rl_push_backup
fi
