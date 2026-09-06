#!/usr/bin/env bash
set -euo pipefail
BASE="https://raw.githubusercontent.com/zeropoet/root-logos/main/deploy/visual-surface-payload"
OVEL_RELEASE="/var/www/ovel/releases/edf7aff"
install -d "$OVEL_RELEASE"
cp -aL /var/www/ovel/current/. "$OVEL_RELEASE/"
for file in interface.js settings.js velas.js; do curl -fsSL "$BASE/ovel/$file" -o "$OVEL_RELEASE/$file"; done
printf '{"schema":"telos-static-release/v1","site":"ovel","source_commit":"edf7aff","release_id":"edf7aff"}\n' > "$OVEL_RELEASE/.telos-release.json"
ln -sfn "$OVEL_RELEASE" /var/www/ovel/current
for file in index.html living-object.js field-navigation.js; do curl -fsSL "$BASE/telos/$file" -o "/opt/telos/public/$file"; done
for file in interface.js settings.js velas.js source.json; do curl -fsSL "$BASE/telos/ovel-substrate/$file" -o "/opt/telos/public/ovel-substrate/$file"; done
printf '{"schema":"telos-manual-overlay-release/v1","source_commit":"f46a094"}\n' > /opt/telos/.telos-release.json
systemctl restart caddy.service telos-living-object.service
printf '__TELOS_OVEL_VISUALS_DEPLOYED__\n'
