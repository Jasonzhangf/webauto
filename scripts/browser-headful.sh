#!/bin/bash
set -euo pipefail
node utils/scripts/browser/one-click-browser.mjs --profile "$1" --url "$2" --dev --restart --keep-alive &
PID=$!
echo $PID > /tmp/browser-headful.pid
echo "started browser (pid=$PID)"
