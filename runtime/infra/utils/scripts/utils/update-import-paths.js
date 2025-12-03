#!/usr/bin/env node

/**
 * WebAuto 目录重构后路径更新脚本
 * 自动更新文件中的导入路径以匹配新的目录结构
 */

const fs = require('fs');
const path = require('path');
const glob = require('glob');

console.log('🔧 开始更新导入路径...');

// 路径映射表
const pathMappings = [
    // 工作流引擎路径更新
    {
        from: /require\(['"]\.\.\/\.\.\/engine\/\.\//g,
        to: 'require(\'../../../../core/workflow/'
    },
    {
        from: /from ['"]\.\.\/\.\.\/engine\/\.\//g,
        to: 'from \'../../../../core/workflow/'
    },

    // 节点系统路径更新
    {
        from: /require\(['"]\.\.\/\.\.\/engine\/nodes\//g,
        to: 'require(\'../../../../core/nodes/'
    },
    {
        from: /from ['"]\.\.\/\.\.\/engine\/nodes\//g,
        to: 'from \'../../../../core/nodes/'
    },

    // 高亮服务路径更新
    {
        from: /require\(['"]\.\.\/\.\.\/utils\/highlight-service['"]/g,
        to: 'require(\'../../../../modules/highlight/highlight-service\')'
    },
    {
        from: /from ['"]\.\.\/\.\.\/utils\/highlight-service['"]/g,
        to: 'from \'../../../../modules/highlight/highlight-service\''
    },

    // 1688相关路径更新
    {
        from: /require\(['"]\.\.\/\.\.\/1688\//g,
        to: 'require(\'../../../../platforms/alibaba/'
    },
    {
        from: /from ['"]\.\.\/\.\.\/1688\//g,
        to: 'from \'../../../../platforms/alibaba/'
    },

    // 配置文件路径更新
    {
        from: /config\/anchors\//g,
        to: 'config/platforms/'
    }
];

// 需要更新的文件模式
const filePatterns = [
    'src/**/*.js',
    'workflows/**/*.js',
    'workflows/**/*.json',
    'scripts/**/*.js',
    'tests/**/*.js'
];

// 备份原文件
function backupFile(filePath) {
    const backupPath = filePath + '.backup';
    fs.copyFileSync(filePath, backupPath);
}

// 更新单个文件
function updateFile(filePath) {
    try {
        let content = fs.readFileSync(filePath, 'utf8');
        let updated = false;

        for (const mapping of pathMappings) {
            if (mapping.from.test(content)) {
                content = content.replace(mapping.from, mapping.to);
                updated = true;
                console.log(`  ✅ 更新 ${filePath}`);
            }
        }

        if (updated) {
            backupFile(filePath);
            fs.writeFileSync(filePath, content);
            return true;
        }

        return false;
    } catch (error) {
        console.warn(`  ⚠️  跳过文件 ${filePath}: ${error.message}`);
        return false;
    }
}

// 主函数
async function main() {
    let totalFiles = 0;
    let updatedFiles = 0;

    console.log('📁 搜索需要更新的文件...');

    for (const pattern of filePatterns) {
        const files = glob.sync(pattern);

        for (const file of files) {
            if (file.includes('.backup')) continue;
            if (file.includes('node_modules')) continue;

            totalFiles++;
            if (updateFile(file)) {
                updatedFiles++;
            }
        }
    }

    console.log('\n📊 更新统计:');
    console.log(`  总文件数: ${totalFiles}`);
    console.log(`  已更新: ${updatedFiles}`);
    console.log(`  备份文件: ${updatedFiles} 个 .backup 文件`);

    if (updatedFiles > 0) {
        console.log('\n🔄 生成恢复脚本...');

        const restoreScript = `#!/bin/bash
# WebAuto 路径更新恢复脚本
# 恢复所有 .backup 文件

echo "🔄 恢复原始文件..."
find . -name "*.backup" | while read backup_file; do
    original_file="\${backup_file%.backup}"
    mv "\$backup_file" "\$original_file"
    echo "  恢复: \$original_file"
done

echo "✅ 恢复完成"
`;

        fs.writeFileSync('scripts/restore-paths.sh', restoreScript);
        fs.chmodSync('scripts/restore-paths.sh', '755');

        console.log('  恢复脚本已创建: scripts/restore-paths.sh');
    }

    console.log('\n🎉 路径更新完成！');

    if (updatedFiles > 0) {
        console.log('\n⚠️  注意事项:');
        console.log('1. 原文件已备份为 .backup 文件');
        console.log('2. 可以运行 scripts/restore-paths.sh 恢复原始文件');
        console.log('3. 建议运行测试确保功能正常');
        console.log('4. 确认无误后可删除 .backup 文件');
    }
}

// 检查glob模块
try {
    require('glob');
} catch (error) {
    console.error('❌ 缺少 glob 模块，请安装：npm install glob');
    process.exit(1);
}

main().catch(error => {
    console.error('❌ 路径更新失败:', error);
    process.exit(1);
});