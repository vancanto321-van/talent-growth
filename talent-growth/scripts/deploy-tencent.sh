#!/usr/bin/env bash
# Execute on the existing Tencent Lighthouse host after uploading the static archive.
set -Eeuo pipefail
archive=${1:?archive path required}
expected_sha=${2:?SHA-256 required}
release_id=${3:?release ID required}
[[ "$expected_sha" =~ ^[a-f0-9]{64}$ ]] || { echo 'Invalid SHA-256'; exit 1; }
[[ "$release_id" =~ ^[a-f0-9]{16}$ ]] || { echo 'Invalid release ID'; exit 1; }
printf '%s  %s\n' "$expected_sha" "$archive" | sha256sum -c -

base=/opt/child-growth
site=/etc/caddy/pje-cloud-demo-https.caddy
routes=/etc/caddy/child-growth.routes.caddy
install -d -m 755 "$base/releases" "$base/backups"
exec 9>"$base/deploy.lock"
flock -n 9 || { echo 'Another child-growth deployment is running'; exit 1; }
test -f "$site"
release="$base/releases/$release_id"
[[ ! -e "$release" ]] || { echo "Immutable release already exists: $release"; exit 1; }
backup="$base/backups/$(date -u +%Y%m%dT%H%M%SZ)-$release_id"
install -d -m 755 "$backup"
cp -a "$site" "$backup/site.caddy"
cp -a /etc/caddy/Caddyfile "$backup/Caddyfile"
if [[ -f "$routes" ]]; then cp -a "$routes" "$backup/routes.caddy"; fi
previous=$(readlink "$base/current" || true)
printf '%s\n' "$previous" > "$backup/previous-release.txt"

rollback() {
  local status=$?
  trap - ERR
  local failed=0
  cp -a "$backup/site.caddy" "$site" || failed=1
  if [[ -f "$backup/routes.caddy" ]]; then cp -a "$backup/routes.caddy" "$routes" || failed=1; else rm -f "$routes" || failed=1; fi
  if [[ -n "$previous" ]]; then
    ln -sfn "$previous" "$base/current.rollback" && mv -Tf "$base/current.rollback" "$base/current" || failed=1
  else
    rm -f "$base/current" || failed=1
  fi
  if [[ "$failed" == 0 ]] && caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile && systemctl reload caddy; then
    echo "DEPLOY_FAILED_ROLLED_BACK backup=$backup" >&2
  else
    echo "DEPLOY_FAILED_ROLLBACK_INCOMPLETE backup=$backup" >&2
  fi
  exit "$status"
}
trap rollback ERR

# Restrict uploads to the reviewed static bundle, with no links or unexpected files.
python3 - "$archive" <<'PY'
import sys, tarfile
required = {'index.html', 'main.js', 'style.css', 'data.json', 'growth-progress.js', 'app-icon.png', 'talent-mark.svg', 'release.json', 'talent-ui.js', 'talent-store.js', 'talent-insights.js', 'talent-journey.js', 'talent-cloud.js', 'talent.css', 'talent-data.js', 'learning-data.js', 'learning-ui.js', 'cultivation-data.js', 'cultivation-ui.js', 'talent-planets.js', 'talent-planets-ui.js'}
allowed = required
with tarfile.open(sys.argv[1], 'r:gz') as bundle:
    names = []
    for member in bundle.getmembers():
        if member.name not in allowed or not member.isfile():
            raise SystemExit('Unexpected archive member: ' + member.name)
        names.append(member.name)
    if not required.issubset(set(names)) or len(names) != len(set(names)):
        raise SystemExit('Incomplete or duplicate static files')
PY
install -d -m 755 "$release"
tar -xzf "$archive" -C "$release" --no-same-owner
find "$release" -type f -exec chmod 644 {} +
python3 - "$release/release.json" "$release_id" <<'PY'
import json, sys
if json.load(open(sys.argv[1]))['releaseId'] != sys.argv[2]:
    raise SystemExit('Release metadata mismatch')
PY
ln -sfn "$release" "$base/current.next"
mv -Tf "$base/current.next" "$base/current"
cat > "$routes" <<'CADDY'
# Child Growth: static application sharing the existing trusted HTTPS endpoint.
redir /growth /growth/ 308
handle_path /growth/api/* {
    reverse_proxy 127.0.0.1:18129 {
        header_up X-Forwarded-For {remote_host}
    }
}
handle_path /growth/* {
    root * /opt/child-growth/current
    header Cache-Control "no-cache"
    header X-Content-Type-Options "nosniff"
    file_server
}
CADDY
chmod 644 "$routes"
python3 - "$site" <<'PY'
from pathlib import Path
import sys
path = Path(sys.argv[1])
text = path.read_text()
include = 'import /etc/caddy/child-growth.routes.caddy'
if include not in text:
    anchor = 'reverse_proxy 127.0.0.1:18128'
    if text.count(anchor) != 1:
        raise SystemExit('Existing site layout changed; aborting')
    path.write_text(text.replace(anchor, include + '\n\t' + anchor))
PY
caddy fmt --overwrite "$routes"
caddy fmt --overwrite "$site"
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
systemctl reload caddy

curl -fsS --max-time 20 https://43.159.60.166/growth/release.json > "$backup/online-release.json"
python3 - "$backup/online-release.json" "$release_id" <<'PY'
import json, sys
if json.load(open(sys.argv[1]))['releaseId'] != sys.argv[2]:
    raise SystemExit('Online release ID mismatch')
PY
curl -fsS --max-time 20 https://43.159.60.166/growth/ > "$backup/online-index.html"
cmp "$release/index.html" "$backup/online-index.html"
for asset in main.js style.css growth-progress.js data.json app-icon.png talent-mark.svg talent-ui.js talent-store.js talent-insights.js talent-journey.js talent-cloud.js talent.css talent-data.js learning-data.js learning-ui.js cultivation-data.js cultivation-ui.js talent-planets.js talent-planets-ui.js; do
    curl -fsS --max-time 20 "https://43.159.60.166/growth/$asset" > "$backup/verify-$asset"
    cmp "$release/$asset" "$backup/verify-$asset"
done
curl -fsS --max-time 20 https://43.159.60.166/growth/api/health
curl -fsS --max-time 20 http://127.0.0.1:18128/api/health
curl -fsS --max-time 20 https://43.159.60.166/api/health
curl -fsS --max-time 20 https://43.159.60.166/knowledge/ > "$backup/knowledge-index.html"
trap - ERR
printf '\nDEPLOY_OK release=%s backup=%s\n' "$release_id" "$backup"
