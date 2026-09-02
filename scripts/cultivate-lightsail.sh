#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "$0")/lightsail-common.sh"
rl_lock
cd "$ROOT_LOGOS_ROOT"
rl_git_identity

node scripts/sources.mjs refresh-material-lineage \
  https://sovereignstandard.co/root-logos-witness-export.json
node scripts/sources.mjs validate
node scripts/cultivate.mjs cycle
node scripts/cultivate.mjs validate
node scripts/attractors.mjs validate

if rl_commit_if_changed "Cultivate Root Logos from Lightsail" \
  cultivation/state.json cultivation/memory.json cultivation/cycles \
  content/constitutional-graph.json sources/sovereign-standard.snapshot.json \
  sources/foldportrait.snapshot.json self-authorship/current.json self-authorship/lineage; then
  rl_publish_site
  rl_push_backup
else
  rl_publish_site
fi
