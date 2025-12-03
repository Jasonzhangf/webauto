#!/bin/bash
set -euo pipefail
node runtime/browser/scripts/one-click-browser.mjs --profile "$1" --url "$2" --dev --restart --keep-alive &
PID=$!
echo $PID > /tmp/browser-headful.pid
echo "started browser (pid=$PID)"
