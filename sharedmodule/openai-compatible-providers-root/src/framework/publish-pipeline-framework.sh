#!/bin/bash

# WebAuto Pipeline Framework 发布脚本
echo "🚀 开始发布 WebAuto Pipeline Framework"

# 当前已在模块根目录
echo "📂 当前目录: $(pwd)"

# 读取dist目录下的package.json文件
DIST_PACKAGE_JSON="dist/package.json"
if [ ! -f "$DIST_PACKAGE_JSON" ]; then
    echo "❌ 未找到 $DIST_PACKAGE_JSON 文件"
    exit 1
fi

# 验证包名和版本
PACKAGE_NAME=$(grep '"name"' $DIST_PACKAGE_JSON | cut -d '"' -f 4)
PACKAGE_VERSION=$(grep '"version"' $DIST_PACKAGE_JSON | cut -d '"' -f 4)

echo "📦 包名: $PACKAGE_NAME"
echo "🏷️  版本: $PACKAGE_VERSION"

# 检查包是否已存在
echo "🔍 检查包是否存在..."
if npm view $PACKAGE_NAME@$PACKAGE_VERSION > /dev/null 2>&1; then
    echo "❌ 包 $PACKAGE_NAME@$PACKAGE_VERSION 已存在，无法重复发布"
    exit 1
else
    echo "✅ 包 $PACKAGE_NAME@$PACKAGE_VERSION 不存在，可以发布"
fi

# 进入dist目录进行发布
echo "📂 进入dist目录进行发布..."
cd dist

# 直接发布，跳过prepublish钩子
echo "🚀 正在发布到 npm..."
npm publish --access public --ignore-scripts

if [ $? -eq 0 ]; then
    echo "🎉 成功发布 $PACKAGE_NAME@$PACKAGE_VERSION 到 npm!"
else
    echo "❌ 发布失败"
    exit 1
fi