#!/bin/bash

# WebAuto 目录重构前检查脚本

echo "🔍 WebAuto 目录重构前安全检查"
echo "=================================="

# 检查是否有未提交的更改
echo "📋 检查Git状态..."
if git status --porcelain | grep -q .; then
    echo "⚠️  警告：存在未提交的更改"
    echo "以下文件有更改："
    git status --porcelain
    echo ""
    echo "建议先提交更改再执行重构"
    read -p "是否继续？(y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "❌ 取消重构"
        exit 1
    fi
else
    echo "✅ Git状态干净"
fi

# 检查磁盘空间
echo ""
echo "💾 检查磁盘空间..."
available_space=$(df -h . | awk 'NR==2 {print $4}')
echo "可用空间: $available_space"

# 统计当前目录大小
current_size=$(du -sh . | cut -f1)
echo "当前项目大小: $current_size"

# 检查关键目录
echo ""
echo "📁 检查关键目录..."

if [ -d "workflows/records" ]; then
    records_size=$(du -sh workflows/records | cut -f1)
    records_count=$(find workflows/records -name "*.json" | wc -l)
    echo "  workflows/records: $records_size ($records_count 个文件)"
fi

if [ -d "workflows" ]; then
    workflows_count=$(find workflows -name "*.json" | wc -l)
    echo "  workflows总文件数: $workflows_count"
fi

# 检查重复的weibo目录
weibo_dirs=$(find workflows -name "weibo-complete*" -type d | wc -l)
if [ $weibo_dirs -gt 0 ]; then
    echo "  发现 $weibo_dirs 个weibo相关目录"
fi

# 创建备份建议
echo ""
echo "💡 建议的备份策略："
echo "1. 创建Git标签: git tag -a pre-restructure-$(date +%Y%m%d) -m '重构前备份'"
echo "2. 创建完整项目备份: cp -r . ../webauto-backup-$(date +%Y%m%d)"
echo ""

# 确认执行
echo "🚀 准备执行目录重构"
echo "这将："
echo "  • 归档126MB的测试记录"
echo "  • 重组目录结构"
echo "  • 合并重复模块"
echo ""

read -p "确认执行重构？(y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "✅ 开始执行重构..."
    echo ""
    echo "执行命令："
    echo "chmod +x scripts/directory-restructure.sh"
    echo "./scripts/directory-restructure.sh"
    echo ""
    echo "或者在当前目录执行："
    echo "./scripts/directory-restructure.sh"
else
    echo "❌ 取消重构"
    exit 1
fi