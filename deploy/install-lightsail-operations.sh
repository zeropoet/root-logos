#!/usr/bin/env bash
set -euo pipefail

root="${1:-/opt/root-logos}"
install -d -o rootlogos -g rootlogos -m 0755 /var/www/root-logos
install -d -o rootlogos -g rootlogos -m 0750 /var/lib/root-logos
chmod 0755 \
  "$root/scripts/lightsail-common.sh" \
  "$root/scripts/publish-site-lightsail.sh" \
  "$root/scripts/release-attractor-lightsail.sh" \
  "$root/scripts/cultivate-lightsail.sh" \
  "$root/scripts/sync-sources-lightsail.sh"

for unit in \
  root-logos-runtime.service \
  root-logos-attractor.service root-logos-attractor.timer \
  root-logos-cultivation.service root-logos-cultivation.timer \
  root-logos-source-sync.service root-logos-source-sync.timer; do
  install -m 0644 "$root/deploy/$unit" "/etc/systemd/system/$unit"
done

sudo -u rootlogos ROOT_LOGOS_ROOT="$root" \
  ROOT_LOGOS_PUBLIC_ROOT=/var/www/root-logos \
  bash -lc "source '$root/scripts/lightsail-common.sh'; rl_publish_site"

systemctl daemon-reload
systemctl enable --now \
  root-logos-attractor.timer \
  root-logos-cultivation.timer \
  root-logos-source-sync.timer
