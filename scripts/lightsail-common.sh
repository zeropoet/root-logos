#!/usr/bin/env bash
set -euo pipefail

ROOT_LOGOS_ROOT="${ROOT_LOGOS_ROOT:-/opt/root-logos}"
ROOT_LOGOS_PUBLIC_ROOT="${ROOT_LOGOS_PUBLIC_ROOT:-/var/www/root-logos}"
ROOT_LOGOS_LOCK="${ROOT_LOGOS_LOCK:-/var/lib/root-logos/operations.lock}"

rl_lock() {
  mkdir -p "$(dirname "$ROOT_LOGOS_LOCK")"
  exec 9>"$ROOT_LOGOS_LOCK"
  flock -n 9 || exit 0
}

rl_git_identity() {
  git -C "$ROOT_LOGOS_ROOT" config user.name "root-logos-runtime[bot]"
  git -C "$ROOT_LOGOS_ROOT" config user.email "root-logos-runtime[bot]@users.noreply.github.com"
}

rl_publish_site() {
  install -d -m 0755 "$ROOT_LOGOS_PUBLIC_ROOT"
  rsync -a --delete \
    --exclude='.git/' \
    --exclude='.github/' \
    --exclude='.runtime-data/' \
    --exclude='deploy/' \
    --exclude='node_modules/' \
    --exclude='runtime/' \
    --exclude='scripts/' \
    --exclude='.env' \
    --exclude='.env.*' \
    "$ROOT_LOGOS_ROOT/" "$ROOT_LOGOS_PUBLIC_ROOT/"
}

rl_push_backup() {
  local attempt
  for attempt in 1 2 3 4; do
    if git -C "$ROOT_LOGOS_ROOT" push origin HEAD:main; then
      return 0
    fi
    git -C "$ROOT_LOGOS_ROOT" fetch origin main
    git -C "$ROOT_LOGOS_ROOT" rebase origin/main
  done
  echo "Unable to preserve the Root Logos backup after four attempts." >&2
  return 1
}

rl_commit_if_changed() {
  local message="$1"
  shift
  git -C "$ROOT_LOGOS_ROOT" add "$@" || {
    echo "Unable to stage the bounded Root Logos operation state." >&2
    exit 1
  }
  if git -C "$ROOT_LOGOS_ROOT" diff --cached --quiet; then
    return 1
  fi
  git -C "$ROOT_LOGOS_ROOT" commit -m "$message"
  return 0
}
