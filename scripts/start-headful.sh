#!/bin/bash

# 一键启动脚本 - 有头模式
# 启动所有必要的服务并打开有头浏览器

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "================================================"
echo "  WebAuto 一键启动 (有头模式)"
echo "================================================"
echo ""

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 检查端口是否被占用
check_port() {
    local port=$1
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1 ; then
        echo -e "${YELLOW}⚠️  端口 $port 已被占用${NC}"
        return 0
    else
        return 1
    fi
}

# 停止函数
cleanup() {
    echo ""
    echo "正在停止所有服务..."
    
    # 停止所有后台任务
    jobs -p | xargs -r kill 2>/dev/null || true
    
    echo "已停止所有服务"
    exit 0
}

# 注册清理函数
trap cleanup INT TERM

cd "$PROJECT_ROOT"

echo "1️⃣  清理旧进程..."
echo ""

# 停止旧的 floating panel（通过 PID 文件精确终止）
FLOATING_PID_FILE="$HOME/.webauto/floating-panel.pid"
if [ -f "$FLOATING_PID_FILE" ]; then
    FLOATING_PID=$(cat "$FLOATING_PID_FILE")
    if [ -n "$FLOATING_PID" ] && kill -0 "$FLOATING_PID" 2>/dev/null; then
        kill "$FLOATING_PID" 2>/dev/null && echo "   已停止旧的 Floating Panel (PID: $FLOATING_PID)" || echo "   无法停止 Floating Panel"
        rm -f "$FLOATING_PID_FILE"
    else
        echo "   Floating Panel PID 文件存在但进程不在运行"
        rm -f "$FLOATING_PID_FILE"
    fi
else
    echo "   没有运行中的 Floating Panel"
fi

echo ""
echo "2️⃣  检查服务状态..."
echo ""

# 检查 Unified API
if check_port 7701; then
    echo "   Unified API 已在运行 ✅"
    UNIFIED_RUNNING=true
else
    echo "   Unified API 未运行，将启动"
    UNIFIED_RUNNING=false
fi

# 检查 Browser Service
if check_port 7704; then
    echo "   Browser Service 已在运行 ✅"
    BROWSER_RUNNING=true
else
    echo "   Browser Service 未运行，将启动"
    BROWSER_RUNNING=false
fi

echo ""
echo "3️⃣  启动服务..."
echo ""

# 启动 Unified API (如果未运行)
if [ "$UNIFIED_RUNNING" = false ]; then
    echo "   启动 Unified API..."
    node services/unified-api/server.mjs > /tmp/webauto-unified-api.log 2>&1 &
    UNIFIED_PID=$!
    sleep 2
    
    if kill -0 $UNIFIED_PID 2>/dev/null; then
        echo -e "   ${GREEN}✅ Unified API 启动成功 (PID: $UNIFIED_PID)${NC}"
    else
        echo "   ❌ Unified API 启动失败"
        cat /tmp/webauto-unified-api.log
        exit 1
    fi
fi

# 启动 Browser Service (如果未运行)
if [ "$BROWSER_RUNNING" = false ]; then
    echo "   启动 Browser Service..."
    cd services/browser-service || exit 1
    python3 main.py > /tmp/webauto-browser-service.log 2>&1 &
    BROWSER_PID=$!
    cd "$PROJECT_ROOT"
    sleep 3
    
    if kill -0 $BROWSER_PID 2>/dev/null; then
        echo -e "   ${GREEN}✅ Browser Service 启动成功 (PID: $BROWSER_PID)${NC}"
    else
        echo "   ❌ Browser Service 启动失败"
        cat /tmp/webauto-browser-service.log
        exit 1
    fi
fi

echo ""
echo "4️⃣  检查并创建浏览器会话..."
echo ""

# 等待服务完全启动
sleep 2

# 创建或恢复 weibo_fresh session (有头模式)
echo "   创建 weibo_fresh session (有头模式)..."

# 删除旧 session（如果存在）
curl -s -X POST http://127.0.0.1:7701/v1/controller/action \
  -H "Content-Type: application/json" \
  -d '{
    "action": "session:delete",
    "payload": {
      "profile": "weibo_fresh"
    }
  }' > /dev/null 2>&1 || true

sleep 1

# 创建新 session (有头模式)
CREATE_RESULT=$(curl -s -X POST http://127.0.0.1:7701/v1/controller/action \
  -H "Content-Type: application/json" \
  -d '{
    "action": "session:create",
    "payload": {
      "profile": "weibo_fresh",
      "url": "https://weibo.com",
      "headless": false,
      "keepOpen": true
    }
  }')

if echo "$CREATE_RESULT" | jq -e '.success' > /dev/null 2>&1; then
    echo -e "   ${GREEN}✅ 浏览器会话创建成功 (有头模式)${NC}"
else
    echo "   ⚠️  会话可能已存在，继续..."
fi

echo ""
echo "4️⃣  启动 Floating Panel..."
echo ""

cd apps/floating-panel

# 设置环境变量
export WEBAUTO_FLOATING_HEADLESS=0
export WEBAUTO_FLOATING_DEVTOOLS=1

echo "   构建并启动 Floating Panel..."
npm run build > /tmp/webauto-floating-build.log 2>&1

if [ $? -eq 0 ]; then
    echo -e "   ${GREEN}✅ Floating Panel 构建成功${NC}"
    echo "   启动 Electron 应用..."
    
    # 启动 Electron
    electron . &
    ELECTRON_PID=$!
    
    echo -e "   ${GREEN}✅ Floating Panel 已启动 (PID: $ELECTRON_PID)${NC}"
else
    echo "   ❌ Floating Panel 构建失败"
    cat /tmp/webauto-floating-build.log
    exit 1
fi

cd "$PROJECT_ROOT"

echo ""
echo "================================================"
echo "  🎉 启动完成！"
echo "================================================"
echo ""
echo "服务状态:"
echo "  ✅ Unified API:      http://127.0.0.1:7701"
echo "  ✅ Browser Service:  http://127.0.0.1:7704"
echo "  ✅ Chromium 浏览器:  有头模式 (可见)"
echo "  ✅ Floating Panel:   已打开"
echo ""
echo "使用说明:"
echo "  1. 浏览器窗口会自动打开 weibo.com"
echo "  2. Floating Panel 会显示容器树和 DOM 树"
echo "  3. 点击容器树的 '+' 展开子容器"
echo "  4. 点击 DOM 树的 '+' 触发按需拉取"
echo "  5. 观察子容器到 DOM 的连线"
echo ""
echo "日志文件:"
echo "  - Unified API:     /tmp/webauto-unified-api.log"
echo "  - Browser Service: /tmp/webauto-browser-service.log"
echo "  - Floating Build:  /tmp/webauto-floating-build.log"
echo ""
echo "按 Ctrl+C 停止所有服务"
echo ""

# 等待用户中断
wait
