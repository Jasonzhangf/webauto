#!/bin/bash

# 1688聊天界面全流程测试执行脚本

echo "🚀 1688聊天界面全流程测试"
echo "=================================="

# 检查工作流文件
WORKFLOW_FILE="workflows/1688/analysis/1688-chat-full-flow-test.json"
if [ ! -f "$WORKFLOW_FILE" ]; then
    echo "❌ 工作流文件不存在: $WORKFLOW_FILE"
    exit 1
fi

echo "✅ 找到工作流文件: $WORKFLOW_FILE"
echo ""

# 显示测试流程
echo "📋 测试流程概览:"
echo "• 🔐 登录验证"
echo "• 🎯 锚点定位 (对话伙伴、输入框、发送按钮)"
echo "• ⌨️  消息输入"
echo "• 🖱️  发送操作"
echo "• ✅ 结果验证"
echo ""

# 显示注意事项
echo "⚠️  重要注意事项:"
echo "• 请确保已登录1688账号"
echo "• 请打开一个具体的聊天对话"
echo "• 测试会发送一条消息到当前对话"
echo "• 请不要干扰脚本执行过程"
echo ""

# 询问用户确认
if [ -t 0 ]; then
    read -p "🤔 确认执行全流程测试？这将发送一条测试消息 (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "❌ 测试已取消"
        exit 0
    fi
fi

echo "✅ 开始执行全流程测试..."
echo ""

# 执行工作流
echo "🔧 执行工作流..."
node scripts/run-workflow.js "$WORKFLOW_FILE"

# 检查执行结果
if [ $? -eq 0 ]; then
    echo ""
    echo "🎉 全流程测试完成！"
    echo ""
    echo "📊 测试结果:"
    echo "• ✅ 锚点定位成功"
    echo "• ✅ 消息输入成功"
    echo "• ✅ 发送操作成功"
    echo "• ✅ 结果验证成功"
    echo ""
    echo "📁 结果文件位置:"
    echo "• 工作流记录: workflows/records/"
    echo "• 截图文件: workflows/records/screenshots/"
    echo "• 详细日志: workflows/records/logs/"
    echo ""
    echo "🎯 验证建议:"
    echo "• 检查聊天界面是否收到测试消息"
    echo "• 查看截图文件确认高亮效果"
    echo "• 检查日志文件了解详细执行过程"
else
    echo ""
    echo "❌ 工作流执行失败"
    echo ""
    echo "🔍 故障排查:"
    echo "• 检查是否已登录1688账号"
    echo "• 确认是否打开了聊天对话"
    echo "• 查看错误日志了解具体问题"
    exit 1
fi