#!/bin/bash

echo "🚀 安装UI Recognition Service依赖..."

# 安装JavaScript依赖
echo "📦 安装JavaScript依赖..."
npm install

# 检查Python环境
echo "🐍 检查Python环境..."
python3 --version || python --version

# 安装Python依赖
echo "📦 安装Python依赖..."
if [ -f "python-service/requirements.txt" ]; then
    pip3 install -r python-service/requirements.txt || pip install -r python-service/requirements.txt
else
    echo "⚠️  requirements.txt不存在，安装基础依赖..."
    pip3 install fastapi uvicorn pydantic || pip install fastapi uvicorn pydantic
fi

echo "✅ 依赖安装完成！"
echo ""
echo "🔧 运行测试："
echo "   npm run quick-test"
echo ""
echo "🚀 启动服务："
echo "   npm run dev"