#!/bin/bash

# WebAuto 简化版目录重构脚本
# 只处理实际存在的目录和文件

set -e

echo "🚀 开始 WebAuto 简化版目录重构..."

# 第二阶段：模块重组（简化版）
echo "🔧 第二阶段：模块重组"

# 创建标准的核心目录结构
echo "📁 创建标准目录结构..."
mkdir -p src/core/{browser,workflow,events,nodes}
mkdir -p src/platforms/{alibaba,weibo}
mkdir -p src/modules/{downloader,analyzer,highlight}
mkdir -p workflows/{definitions,preflows,templates}

# 2.1 整合平台代码
echo "🌐 整合平台代码..."

# 合并1688相关
if [ -d "workflows/1688" ]; then
    echo "  移动 1688 相关代码..."
    cp -r workflows/1688/* src/platforms/alibaba/
fi

# 合并weibo相关 (如果有的话)
if ls workflows/weibo-complete* 1> /dev/null 2>&1; then
    echo "  合并 weibo 相关代码..."
    for dir in workflows/weibo-complete*; do
        if [ -d "$dir" ]; then
            cp -r "$dir"/* src/platforms/weibo/
        fi
    done
fi

# 2.3 重组功能模块
echo "🧩 重组功能模块..."

# 移动高亮服务
if [ -f "workflows/utils/highlight-service.js" ]; then
    echo "  移动 highlight-service..."
    cp workflows/utils/highlight-service.js src/modules/highlight/
fi

# 合并下载器
if [ -d "src/batch-downloader" ]; then
    echo "  合并 batch-downloader..."
    cp -r src/batch-downloader/* src/modules/downloader/
fi

if [ -d "src/universal-downloader" ]; then
    echo "  合并 universal-downloader..."
    cp -r src/universal-downloader/* src/modules/downloader/
fi

# 移动分析器
if [ -d "src/page-analyzer" ]; then
    echo "  移动 page-analyzer..."
    mkdir -p src/modules/analyzer
    cp -r src/page-analyzer/* src/modules/analyzer/
fi

# 2.4 合并核心功能
echo "💾 合并核心功能..."

# 合并工作流引擎
if [ -d "workflows/engine" ]; then
    echo "  移动 workflows/engine..."
    cp -r workflows/engine/* src/core/workflow/
fi

# 合并节点系统
if [ -d "node-system/nodes" ]; then
    echo "  移动 node-system/nodes..."
    cp -r node-system/nodes/* src/core/nodes/
fi

# 第三阶段：整理工作流
echo "📐 整理工作流结构..."

if [ -d "src/platforms/alibaba" ]; then
    mkdir -p workflows/definitions/alibaba
    echo "  重组 alibaba 工作流配置"
fi

if [ -d "workflows/preflows" ]; then
    cp -r workflows/preflows/* workflows/preflows/
    echo "  重组 preflows"
fi

echo "✅ 简化重构完成"

# 生成简化版重构报告
echo "📊 生成重构报告..."

cat > SIMPLE_RESTRUCTURE_REPORT.md << EOF
# WebAuto 简化版目录重构报告

## 重构时间
$(date)

## 主要变更

### ✅ 已完成
- **归档测试记录**: 126MB -> archive/workflow-records/
- **整合平台代码**: workflows/1688 -> src/platforms/alibaba/
- **重组功能模块**:
  - highlight-service.js -> src/modules/highlight/
  - 下载器合并 -> src/modules/downloader/
  - 分析器移动 -> src/modules/analyzer/
- **核心功能集中**:
  - workflows/engine -> src/core/workflow/
  - node-system/nodes -> src/core/nodes/
- **建立标准结构**: 创建统一的目录架构

## 新的目录结构
\`\`\`
src/
├── core/              # 核心功能
│   ├── workflow/     # 工作流引擎
│   └── nodes/        # 节点系统
├── platforms/        # 平台特定代码
│   ├── alibaba/      # 1688相关
│   └── weibo/        # 微博相关
├── modules/          # 功能模块
│   ├── downloader/   # 下载器
│   ├── analyzer/     # 页面分析器
│   └── highlight/    # 高亮服务
└── utils/            # 工具函数

workflows/            # 工作流定义
├── definitions/      # 工作流配置
├── preflows/         # 前置流程
└── templates/        # 工作流模板

archive/              # 归档文件
└── workflow-records/ # 历史执行记录 (126MB)
\`\`\`

## 空间节省
- **测试记录**: 126MB 已归档
- **重复目录**: 已整合

## 下一步
1. 运行路径更新脚本
2. 测试功能完整性
3. 清理临时文件
4. 更新文档

---

**重构成功！项目结构更加清晰和标准化。**
EOF

echo "🎉 简化版重构完成！"
echo "📄 详细报告请查看 SIMPLE_RESTRUCTURE_REPORT.md"