#!/bin/bash
set -euo pipefail
PROFILE=${1:-weibo-fresh}
URL=${2:-https://weibo.com}

nohup node runtime/browser/scripts/one-click-browser.dev.mjs \
  --profile "$PROFILE" \
  --url "$URL" \
  --restart \
  > ~/.webauto/logs/headful-$(date +%s).log 2>&1 &

echo $! > ~/.webauto/run/headful.pid
echo "[headful] started (pid=$(cat ~/.webauto/run/headful.pid))"
