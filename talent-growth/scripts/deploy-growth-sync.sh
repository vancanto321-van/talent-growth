#!/usr/bin/env bash
set -Eeuo pipefail
source_file=${1:?source file required}
unit_file=${2:?systemd unit required}
expected_source_sha=${3:?source SHA required}
expected_unit_sha=${4:?unit SHA required}
[[ "$expected_source_sha" =~ ^[a-f0-9]{64}$ && "$expected_unit_sha" =~ ^[a-f0-9]{64}$ ]] || exit 1
printf '%s  %s\n' "$expected_source_sha" "$source_file" "$expected_unit_sha" "$unit_file" | sha256sum -c -
test -x /usr/bin/node
/usr/bin/node -e 'if(Number(process.versions.node.split(".")[0])<18)process.exit(1)'
/usr/bin/node --check "$source_file"
base=/opt/child-growth-sync
service=child-growth-sync.service
unit=/etc/systemd/system/$service
backup="$base/releases/$(date -u +%Y%m%dT%H%M%SZ)-${expected_source_sha:0:12}"
install -d -m 755 "$base" "$base/server" "$base/releases" "$backup"
exec 8>"$base/deploy.lock"
flock -n 8 || { echo 'Another backup service deployment is running'; exit 1; }
if [[ -f "$base/server/growth-sync.mjs" ]]; then cp -a "$base/server/growth-sync.mjs" "$backup/previous.mjs"; fi
if [[ -f "$unit" ]]; then cp -a "$unit" "$backup/previous.service"; fi
rollback() {
  local result=$?
  trap - ERR
  systemctl stop "$service" || true
  if [[ -f "$backup/previous.mjs" ]]; then cp -a "$backup/previous.mjs" "$base/server/growth-sync.mjs"; fi
  if [[ -f "$backup/previous.service" ]]; then
    cp -a "$backup/previous.service" "$unit"
    systemctl daemon-reload
    systemctl restart "$service" || true
  fi
  echo "SYNC_DEPLOY_FAILED backup=$backup" >&2
  exit "$result"
}
trap rollback ERR
if ! id child-growth >/dev/null 2>&1; then useradd --system --user-group --no-create-home --shell /usr/sbin/nologin child-growth; fi
install -d -m 700 -o child-growth -g "$(id -gn child-growth)" "$base/data"
install -m 644 "$source_file" "$base/server/growth-sync.mjs.next"
mv -f "$base/server/growth-sync.mjs.next" "$base/server/growth-sync.mjs"
install -m 644 "$unit_file" "$unit"
systemctl daemon-reload
systemctl enable "$service"
systemctl restart "$service"
curl -fsS --retry 10 --retry-delay 1 --retry-connrefused --max-time 3 http://127.0.0.1:18129/health
systemctl is-active --quiet "$service"
trap - ERR
printf '\nSYNC_DEPLOY_OK source=%s backup=%s\n' "$expected_source_sha" "$backup"
