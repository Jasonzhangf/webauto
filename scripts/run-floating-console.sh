#!/usr/bin/env bash

# Helper script to boot the Python WebSocket server and Electron floating console together.

set -euo pipefail

HOST="127.0.0.1"
PORT="8765"

usage() {
  cat <<EOF
Usage: $0 [--host 127.0.0.1] [--port 8765]

Starts the Python WebSocket server and the floating Electron console.
Press Ctrl+C or close the Electron window to stop both processes.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --host)
      HOST="${2:-}"
      shift 2
      ;;
    --port)
      PORT="${2:-}"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage
      exit 1
      ;;
  esac
done

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="${ROOT_DIR}/apps/floating-panel"

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 not found in PATH" >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm not found in PATH" >&2
  exit 1
fi

echo "🌐 Starting WebSocket server on ${HOST}:${PORT}..."
python3 "${ROOT_DIR}/scripts/start_websocket_server.py" --host "${HOST}" --port "${PORT}" &
SERVER_PID=$!

cleanup() {
  if ps -p "${SERVER_PID}" >/dev/null 2>&1; then
    echo "🛑 Stopping WebSocket server (pid=${SERVER_PID})"
    kill "${SERVER_PID}" >/dev/null 2>&1 || true
    wait "${SERVER_PID}" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

echo "⏳ Waiting for server to become ready..."
for _ in {1..30}; do
  if python3 - <<PY >/dev/null 2>&1
import socket
s = socket.socket()
try:
    s.settimeout(0.5)
    s.connect(("${HOST}", int("${PORT}")))
except OSError:
    raise SystemExit(1)
finally:
    s.close()
PY
  then
    break
  fi
  sleep 0.5
done

if [[ ! -d "${APP_DIR}/node_modules" ]]; then
  echo "📦 Installing floating console dependencies..."
  (cd "${APP_DIR}" && npm install)
fi

echo "🖥  Launching floating console UI..."
(cd "${APP_DIR}" && npm run dev)
