#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "$0")/lightsail-common.sh"
rl_lock

source_root="${ROOT_LOGOS_SOURCE_ROOT:-/var/lib/root-logos/connected-sources}"
foldforge_root="$source_root/FoldForge"
foldportrait_root="$source_root/FoldPortrait"
install -d -m 0750 "$source_root"

sync_public_repo() {
  local url="$1"
  local destination="$2"
  if [[ ! -d "$destination/.git" ]]; then
    git clone --filter=blob:none --no-checkout "$url" "$destination"
  fi
  git -C "$destination" fetch --depth=1 origin main
  git -C "$destination" checkout --detach --force FETCH_HEAD
}

sync_public_repo https://github.com/zeropoet/FoldForge.git "$foldforge_root"
sync_public_repo https://github.com/zeropoet/FoldPortrait.git "$foldportrait_root"

cd "$ROOT_LOGOS_ROOT"
rl_git_identity
node scripts/sources.mjs sync "$foldforge_root" \
  https://foldforge.zeropoet.xyz/root-logos-language-composition.json
node scripts/sources.mjs sync-sovereign-standard \
  https://sovereignstandard.co/root-logos-witness-export.json
FOLDPORTRAIT_PATH="$foldportrait_root" node scripts/foldportrait-source.mjs
node scripts/sources.mjs validate
node scripts/weave.test.mjs

if git diff --quiet -- \
  sources/foldforge.snapshot.json \
  sources/foldportrait.snapshot.json \
  sources/sovereign-standard.snapshot.json; then
  echo "Connected source evidence is current."
  rl_publish_site
  exit 0
fi

npm run works:check-foldforge
node scripts/cultivate.mjs cycle
node scripts/cultivate.mjs validate
node scripts/attractors.mjs validate

if rl_commit_if_changed "Witness connected sources from Lightsail" \
  sources/foldforge.snapshot.json sources/foldportrait.snapshot.json \
  sources/sovereign-standard.snapshot.json cultivation/state.json \
  cultivation/memory.json cultivation/cycles content/constitutional-graph.json \
  works/index.json works/structural-depth-migration.json works/corpora \
  self-authorship/current.json self-authorship/lineage; then
  rl_publish_site
  rl_push_backup
fi
