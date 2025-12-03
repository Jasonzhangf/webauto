#!/bin/bash
set -euo pipefail

PROFILE=${1:-weibo-fresh}
URL=${2:-https://weibo.com}
EXTRA_ARGS=()
if [ "$#" -ge 3 ]; then
  EXTRA_ARGS=("${@:3}")
fi

mkdir -p "$HOME/.webauto/logs" "$HOME/.webauto/run"
LOG="$HOME/.webauto/logs/headless-$(date +%s).log"

echo "[headless] launching profile=${PROFILE} url=${URL}"
CMD=(node runtime/browser/scripts/one-click-browser.mjs
  --profile "$PROFILE"
  --url "$URL"
  --no-dev
  --headless
  --restart)
if [ "${#EXTRA_ARGS[@]}" -gt 0 ]; then
  CMD+=("${EXTRA_ARGS[@]}")
fi

nohup "${CMD[@]}" > "$LOG" 2>&1 &

PID=$!
echo $PID > "$HOME/.webauto/run/headless.pid"
echo "[headless] started (pid=$PID, log=$LOG)"

sleep 2
for attempt in {1..5}; do
  if node runtime/browser/scripts/ws-health-check.mjs --session "$PROFILE" --url "$URL"; then
    exit 0
  fi
  sleep 2
done
exit 1
