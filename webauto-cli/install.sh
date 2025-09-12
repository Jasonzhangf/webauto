#!/bin/bash

# 标准编译构建和全局安装脚本
# 用法: ./install.sh

set -e  # 遇到错误立即退出

echo "🔧 WebAuto CLI 标准安装流程"
echo "================================"

# 1. 检查环境
echo "📋 检查安装环境..."
if ! command -v node &> /dev/null; then
    echo "❌ 错误: Node.js 未安装"
    exit 1
fi

if ! command -v npm &> /dev/null; then
    echo "❌ 错误: npm 未安装"
    exit 1
fi

echo "✅ Node.js 版本: $(node --version)"
echo "✅ npm 版本: $(npm --version)"

# 2. 进入项目目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [ ! -f "package.json" ]; then
    echo "❌ 错误: 未找到 package.json"
    exit 1
fi

echo "📍 项目目录: $(pwd)"

# 3. 语法检查
echo "🔍 检查 JavaScript 语法..."
if ! node -c src/mcp/stdio-transport.js; then
    echo "❌ 错误: MCP 服务器语法错误"
    exit 1
fi
echo "✅ 语法检查通过"

# 4. 安装依赖
echo "📦 安装项目依赖..."
npm install

# 5. 运行测试
echo "🧪 运行测试套件..."
if ! npm test; then
    echo "❌ 错误: 测试失败"
    exit 1
fi
echo "✅ 测试通过"

# 6. 卸载旧版本
echo "🗑️  卸载旧版本..."
npm uninstall -g webauto-cli 2>/dev/null || true

# 7. 全局安装（使用纯npm标准命令）
echo "🚀 全局安装..."
npm install -g .

# 8. 验证安装
echo "✅ 验证安装..."
if command -v webauto-mcp &> /dev/null; then
    echo "✅ webauto-mcp 命令已安装: $(which webauto-mcp)"
else
    echo "❌ 警告: webauto-mcp 命令未找到"
fi

# 9. 显示安装信息
echo ""
echo "🎉 安装完成!"
echo "================================"
echo "📝 安装信息:"
echo "   - 包名: webauto-cli"
echo "   - 版本: $(node -p "require('./package.json').version")"
echo "   - MCP 命令: webauto-mcp"
echo "   - 配置文件: ~/.iflow/settings.json"
echo ""
echo "🔄 请重启 iflow 以加载新的 MCP 服务器"
echo "🔍 查看日志: tail -f ~/.webauto/stdio-transport.log"