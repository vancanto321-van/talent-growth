#!/bin/bash
cd -- "$(dirname -- "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo 'Please install Node.js 22 or newer, then reopen this window.'
  read -r -p 'Press Enter to close...'
  exit 1
fi
node scripts/start.mjs
result=$?
if [ "$result" -ne 0 ]; then
  read -r -p 'Press Enter to close...'
fi
exit "$result"
