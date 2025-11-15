#!/usr/bin/env node

/**
 * WebAuto 完整路径更新脚本
 * 覆盖所有旧路径引用，完成重构闭环
 */

const fs = require('fs');
const path = require('path');

console.log('🔧 开始完整路径更新...');

// 完整的路径映射表
const completePathMappings = [
    // 工作流引擎路径更新
    {
        from: /require\(['"]\.\.\/workflows\/engine\//g,
        to: 'require(\'../src/core/workflow/'
    },
    {
        from: /from ['"]\.\.\/workflows\/engine\//g,
        to: 'from \'../src/core/workflow/'
    },
    {
        from: /require\(['"]\.\.\/workflows\/WorkflowRunner\.js['"]/g,
        to: 'require(\'../src/core/workflow/WorkflowRunner.js\')'
    },
    {
        from: /from ['"]\.\.\/workflows\/WorkflowRunner\.js['"]/g,
        to: 'from \'../src/core/workflow/WorkflowRunner.js\''
    },

    // 节点系统路径更新
    {
        from: /require\(['"]\.\.\/\.\.\/engine\/nodes\//g,
        to: 'require(\'../../../src/core/nodes/'
    },
    {
        from: /from ['"]\.\.\/\.\.\/engine\/nodes\//g,
        to: 'from \'../../../src/core/nodes/'
    },
    {
        from: /require\(['"]\.\.\/\.\.\/node-system\/nodes\//g,
        to: 'require(\'../../../src/core/nodes/'
    },
    {
        from: /from ['"]\.\.\/\.\.\/node-system\/nodes\//g,
        to: 'from \'../../../src/core/nodes/'
    },

    // 高亮服务路径更新
    {
        from: /require\(['"]\.\.\/\.\.\/utils\/highlight-service['"]/g,
        to: 'require(\'../../../src/modules/highlight/highlight-service\')'
    },
    {
        from: /from ['"]\.\.\/\.\.\/utils\/highlight-service['"]/g,
        to: 'from \'../../../src/modules/highlight/highlight-service\''
    },
    {
        from: /require\(['"]\.\.\/workflows\/utils\/highlight-service['"]/g,
        to: 'require(\'../src/modules/highlight/highlight-service\')'
    },
    {
        from: /from ['"]\.\.\/workflows\/utils\/highlight-service['"]/g,
        to: 'from \'../src/modules/highlight/highlight-service\''
    },

    // 分析器路径更新
    {
        from: /require\(['"]\.\.\/\.\.\/page-analyzer\//g,
        to: 'require(\'../../../src/modules/analyzer/'
    },
    {
        from: /from ['"]\.\.\/\.\.\/page-analyzer\//g,
        to: 'from \'../../../src/modules/analyzer/'
    },

    // 下载器路径更新
    {
        from: /require\(['"]\.\.\/\.\.\/batch-downloader\//g,
        to: 'require(\'../../../src/modules/downloader/'
    },
    {
        from: /from ['"]\.\.\/\.\.\/batch-downloader\//g,
        to: 'from \'../../../src/modules/downloader/'
    },
    {
        from: /require\(['"]\.\.\/\.\.\/universal-downloader\//g,
        to: 'require(\'../../../src/modules/downloader/'
    },
    {
        from: /from ['"]\.\.\/\.\.\/universal-downloader\//g,
        to: 'from \'../../../src/modules/downloader/'
    },

    // 1688相关路径更新
    {
        from: /require\(['"]\.\.\/\.\.\/1688\//g,
        to: 'require(\'../../../src/platforms/alibaba/'
    },
    {
        from: /from ['"]\.\.\/\.\.\/1688\//g,
        to: 'from \'../../../src/platforms/alibaba/'
    },

    // SafePageAccessManager路径修复
    {
        from: /from ['"]\.\.\/\.\.\/\.\.\/dist\/src\/core\/SafePageAccessManager\.js['"]/g,
        to: 'from \'../../../src/core/SafePageAccessManager.js\''
    },

    // 记录目录路径更新
    {
        from: /workflows\/records/g,
        to: 'archive/workflow-records'
    }
];

// 需要清理的旧目录
const oldDirectories = [
    'workflows/engine',
    'workflows/utils/highlight-service.js',
    'src/page-analyzer',
    'src/batch-downloader',
    'src/universal-downloader',
    'node-system/nodes'
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

                if (stat.isDirectory() && !item.includes('node_modules') && !item.includes('.git') && !item.includes('archive')) {
                    walkDir(fullPath);
                } else if (stat.isFile() && (item.endsWith('.js') || item.endsWith('.json') || item.endsWith('.ts') || item.endsWith('.md'))) {
                    if (!item.includes('.backup') && !fullPath.includes('node_modules') && !fullPath.includes('archive')) {
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

        for (const mapping of completePathMappings) {
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

// 清理旧目录
function cleanupOldDirectories() {
    console.log('\n🗑️  清理旧目录...');

    for (const dir of oldDirectories) {
        if (fs.existsSync(dir)) {
            try {
                if (fs.statSync(dir).isDirectory()) {
                    fs.rmSync(dir, { recursive: true, force: true });
                    console.log(`  ✅ 删除目录: ${dir}`);
                } else {
                    fs.unlinkSync(dir);
                    console.log(`  ✅ 删除文件: ${dir}`);
                }
            } catch (error) {
                console.warn(`  ⚠️  删除失败 ${dir}: ${error.message}`);
            }
        }
    }
}

// 主函数
async function main() {
    let totalFiles = 0;
    let updatedFiles = 0;

    console.log('📁 搜索需要更新的文件...');

    // 搜索关键目录
    const searchDirs = ['src', 'workflows', 'scripts', 'tests', 'docs'];

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
        'src/core/workflow/WorkflowEngine.js',
        'src/core/workflow/WorkflowRunner.js',
        'src/modules/highlight/highlight-service.js',
        'scripts/run-workflow.js',
        'scripts/run-with-preflows.js'
    ];

    for (const file of criticalFiles) {
        if (fs.existsSync(file)) {
            console.log(`  ✅ ${file} 存在`);
        } else {
            console.log(`  ❌ ${file} 缺失`);
        }
    }

    // 清理旧目录
    cleanupOldDirectories();

    console.log('\n🎉 完整路径更新完成！');

    if (updatedFiles > 0) {
        console.log('\n⚠️  注意事项:');
        console.log('1. 原文件已备份为 .backup 文件');
        console.log('2. 建议运行测试确保功能正常');
        console.log('3. 确认无误后可删除 .backup 文件');
        console.log('4. 如果有问题，可以手动恢复备份文件');
    }

    // 检查是否还有旧引用残留
    console.log('\n🔍 检查残留的旧引用...');
    const oldPatterns = [
        'workflows/engine',
        'workflows/utils/highlight-service',
        'node-system/nodes',
        'src/page-analyzer',
        'src/batch-downloader',
        'src/universal-downloader'
    ];

    for (const pattern of oldPatterns) {
        try {
            const { execSync } = require('child_process');
            const result = execSync(`grep -r "${pattern}" --include="*.js" --include="*.json" --include="*.md" src/ scripts/ 2>/dev/null | head -5`, { encoding: 'utf8' });
            if (result.trim()) {
                console.log(`  ⚠️  发现残留引用 "${pattern}":`);
                console.log(result.split('\n').slice(0, 3).map(line => `    ${line}`).join('\n'));
            }
        } catch (error) {
            // 没有找到匹配项，这是好事
        }
    }
}

main().catch(error => {
    console.error('❌ 路径更新失败:', error);
    process.exit(1);
});