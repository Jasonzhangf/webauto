#!/bin/bash

# WebAuto 新版启动脚本（兼容旧参数）
# 默认调用 scripts/start-headful.mjs（所有逻辑在 launcher 内）

set -e

PROFILE="default"
URL="https://weibo.com"
HEADLESS=""

show_help() {
  echo "用法: $0 [options]"
  echo "  -p, --profile <name>    使用 profile (默认: default)"
  echo "  -u, --url <url>         目标 URL (默认: https://weibo.com)"
  echo "  -h, --headless          无头模式"
  echo "  --help                  显示帮助"
}

while [[ $# -gt 0 ]]; do
  case $1 in
    -p|--profile)
      PROFILE="$2"; shift 2;;
    -u|--url)
      URL="$2"; shift 2;;
    -h|--headless)
      HEADLESS="--headless"; shift;;
    --help)
      show_help; exit 0;;
    *)
      echo "未知参数: $1"; show_help; exit 1;;
  esac
done

echo "[WebAuto] 使用 scripts/start-headful.mjs 启动"
node scripts/start-headful.mjs --profile "$PROFILE" --url "$URL" $HEADLESS
