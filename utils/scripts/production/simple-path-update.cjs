#!/usr/bin/env node

/**
 * WebAuto 简化版路径更新脚本
 * 针对目录重构后的关键路径进行修复
 */

const fs = require('fs');
const path = require('path');

console.log('🔧 开始简化版路径更新...');

// 关键路径映射
const criticalPathMappings = [
    // 工作流引擎路径更新
    {
        from: /require\(['"]\.\.\/\.\.\/engine\//g,
        to: 'require(\'../../../core/workflow/'
    },
    {
        from: /from ['"]\.\.\/\.\.\/engine\//g,
        to: 'from \'../../../core/workflow/'
    },

    // 节点系统路径更新
    {
        from: /require\(['"]\.\.\/\.\.\/engine\/nodes\//g,
        to: 'require(\'../../../core/nodes/'
    },
    {
        from: /from ['"]\.\.\/\.\.\/engine\/nodes\//g,
        to: 'from \'../../../core/nodes/'
    },

    // 高亮服务路径更新
    {
        from: /require\(['"]\.\.\/\.\.\/utils\/highlight-service['"]/g,
        to: 'require(\'../../../modules/highlight/highlight-service\')'
    },
    {
        from: /from ['"]\.\.\/\.\.\/utils\/highlight-service['"]/g,
        to: 'from \'../../../modules/highlight/highlight-service\''
    },

    // 1688相关路径更新
    {
        from: /require\(['"]\.\.\/\.\.\/1688\//g,
        to: 'require(\'../../../platforms/alibaba/'
    },
    {
        from: /from ['"]\.\.\/\.\.\/1688\//g,
        to: 'from \'../../../platforms/alibaba/'
    },

    // SafePageAccessManager路径修复
    {
        from: /from ['"]\.\.\/\.\.\/\.\.\/dist\/src\/core\/SafePageAccessManager\.js['"]/g,
        to: 'from \'../../../core/SafePageAccessManager.js\''
    }
];

// 手动查找需要更新的文件
function findTargetFiles(dir) {
    const files = [];

    function walkDir(currentDir) {
        try {
            const items = fs.readdirSync(currentDir);

            for (const item of items) {
                const fullPath = path.join(currentDir, item);
                const stat = fs.statSync(fullPath);

                if (stat.isDirectory() && !item.includes('node_modules') && !item.includes('.git')) {
                    walkDir(fullPath);
                } else if (stat.isFile() && (item.endsWith('.js') || item.endsWith('.json'))) {
                    if (!item.includes('.backup') && !fullPath.includes('node_modules')) {
                        files.push(fullPath);
                    }
                }
            }
        } catch (error) {
            // 忽略无法读取的目录
        }
    }

    walkDir(dir);
    return files;
}

// 备份原文件
function backupFile(filePath) {
    try {
        const backupPath = filePath + '.backup';
        fs.copyFileSync(filePath, backupPath);
        return true;
    } catch (error) {
        console.warn(`  ⚠️  备份失败 ${filePath}: ${error.message}`);
        return false;
    }
}

// 更新单个文件
function updateFile(filePath) {
    try {
        let content = fs.readFileSync(filePath, 'utf8');
        let updated = false;

        for (const mapping of criticalPathMappings) {
            if (mapping.from.test(content)) {
                content = content.replace(mapping.from, mapping.to);
                updated = true;
                console.log(`  ✅ 更新 ${filePath}`);
            }
        }

        if (updated) {
            if (backupFile(filePath)) {
                fs.writeFileSync(filePath, content);
                return true;
            }
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

    // 搜索关键目录
    const searchDirs = ['src', 'workflows', 'scripts', 'tests'];

    for (const dir of searchDirs) {
        if (fs.existsSync(dir)) {
            const files = findTargetFiles(dir);
            console.log(`  在 ${dir}/ 中找到 ${files.length} 个文件`);

            for (const file of files) {
                totalFiles++;
                if (updateFile(file)) {
                    updatedFiles++;
                }
            }
        }
    }

    console.log('\n📊 更新统计:');
    console.log(`  总文件数: ${totalFiles}`);
    console.log(`  已更新: ${updatedFiles}`);
    console.log(`  备份文件: ${updatedFiles} 个 .backup 文件`);

    // 验证关键文件
    console.log('\n🔍 验证关键文件...');

    const criticalFiles = [
        'src/platforms/alibaba/1688-glass-film-click-first.js',
        'src/core/workflow/WorkflowEngine.js',
        'src/modules/highlight/highlight-service.js'
    ];

    for (const file of criticalFiles) {
        if (fs.existsSync(file)) {
            console.log(`  ✅ ${file} 存在`);
        } else {
            console.log(`  ❌ ${file} 缺失`);
        }
    }

    console.log('\n🎉 简化版路径更新完成！');

    if (updatedFiles > 0) {
        console.log('\n⚠️  注意事项:');
        console.log('1. 原文件已备份为 .backup 文件');
        console.log('2. 建议运行测试确保功能正常');
        console.log('3. 确认无误后可删除 .backup 文件');
        console.log('4. 如果有问题，可以手动恢复备份文件');
    }
}

main().catch(error => {
    console.error('❌ 路径更新失败:', error);
    process.exit(1);
});