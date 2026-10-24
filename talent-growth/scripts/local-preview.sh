#!/bin/bash
set -euo pipefail

# Keep the local preview alive independently of a Codex terminal session.
project_dir="$(cd "$(dirname "$0")/.." && pwd)"
runtime_dir="$project_dir/outputs/local-preview"
launch_domain="gui/$(id -u)"
preview_label="com.van.talent-growth.preview"
sync_label="com.van.talent-growth.preview-sync"
action="${1:-start}"

case "$action" in
  start)
    node_bin="$(command -v node)"
    mkdir -p "$runtime_dir"
    python3 - "$project_dir" "$runtime_dir" "$node_bin" <<'PY'
import plistlib, sys
from pathlib import Path
project, runtime, node = sys.argv[1:]
for label, entry, env in [
    ('com.van.talent-growth.preview-sync', 'server/growth-sync.mjs', {
        'GROWTH_SYNC_HOST': '127.0.0.1',
        'GROWTH_SYNC_PORT': '18139',
        'GROWTH_SYNC_DIR': '/tmp/growth-journey-preview',
        'GROWTH_SYNC_DEV': '1',
        'COOKIE_SECURE': '0',
        'GROWTH_SYNC_ORIGIN': 'http://127.0.0.1:4184',
        'GROWTH_SYNC_ALLOWED_ORIGIN': 'http://127.0.0.1:4184',
    }),
    ('com.van.talent-growth.preview', 'scripts/preview-journey.mjs', {
        'GROWTH_PREVIEW_PORT': '4184',
        'GROWTH_PREVIEW_API_PORT': '18139',
    }),
]:
    config = {
        'Label': label,
        'ProgramArguments': [node, str(Path(project, entry))],
        'WorkingDirectory': project,
        'EnvironmentVariables': env,
        'RunAtLoad': True,
        'KeepAlive': True,
        'ThrottleInterval': 5,
        'StandardOutPath': str(Path(runtime, label + '.log')),
        'StandardErrorPath': str(Path(runtime, label + '.error.log')),
    }
    with Path(runtime, label + '.plist').open('wb') as out:
        plistlib.dump(config, out)
PY
    for label in "$sync_label" "$preview_label"; do
      if ! launchctl print "$launch_domain/$label" >/dev/null 2>&1; then
        launchctl bootstrap "$launch_domain" "$runtime_dir/$label.plist"
      fi
    done
    echo 'Local preview: http://127.0.0.1:4184/growth/'
    ;;
  stop)
    for label in "$preview_label" "$sync_label"; do
      if launchctl print "$launch_domain/$label" >/dev/null 2>&1; then
        launchctl bootout "$launch_domain/$label"
      fi
    done
    echo 'Local preview stopped.'
    ;;
  status)
    for label in "$preview_label" "$sync_label"; do
      launchctl print "$launch_domain/$label" | sed -n '1,20p'
    done
    ;;
  *) echo 'Usage: bash scripts/local-preview.sh start|stop|status' >&2; exit 2 ;;
esac
