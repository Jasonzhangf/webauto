#!/usr/bin/env node
import { ensureUtf8Console } from './lib/cli-encoding.mjs';

ensureUtf8Console();


/**
 * 演示脚本：展示按需拉取 DOM 分支功能
 * 
 * 这个脚本会：
 * 1. 触发容器匹配（模拟 UI 启动时的操作）
 * 2. 显示初始 DOM 树的深度
 * 3. 显示子容器的 dom_path
 * 4. 演示如何按需拉取这些深层路径
 */

const UNIFIED_API = process.env.UNIFIED_API_URL || 'http://127.0.0.1:7701';
const PROFILE = process.env.TEST_PROFILE || 'weibo_fresh';
const URL = process.env.TEST_URL || 'https://weibo.com';

const log = (m) => console.log('[demo]', m);
const info = (m) => console.log('  ℹ️ ', m);
const success = (m) => console.log('  ✅', m);
const step = (m) => console.log('\n' + '='.repeat(60) + '\n' + m + '\n' + '='.repeat(60));

async function invokeAction(action, payload) {
    const resp = await fetch(`${UNIFIED_API}/v1/controller/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, payload }),
    });

    if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}`);
    }

    const json = await resp.json();
    if (!json.success) {
        throw new Error(json.error || 'Action failed');
    }

    return json.data;
}

function getTreeDepth(node, currentDepth = 0) {
    if (!node || !node.children || node.children.length === 0) {
        return currentDepth;
    }

    let maxDepth = currentDepth;
    for (const child of node.children) {
        const childDepth = getTreeDepth(child, currentDepth + 1);
        maxDepth = Math.max(maxDepth, childDepth);
    }

    return maxDepth;
}

function countNodes(node) {
    if (!node) return 0;

    let count = 1;
    if (node.children && Array.isArray(node.children)) {
        for (const child of node.children) {
            count += countNodes(child);
        }
    }

    return count;
}

function findDeepPaths(node, depth = 0, result = []) {
    if (!node) return result;

    if (depth > 4 && node.path) {
        result.push({ path: node.path, depth, tag: node.tag });
    }

    if (node.children && Array.isArray(node.children)) {
        for (const child of node.children) {
            findDeepPaths(child, depth + 1, result);
        }
    }

    return result;
}

async function main() {
    log('🚀 按需拉取 DOM 分支功能演示');
    log(`Profile: ${PROFILE}`);
    log(`URL: ${URL}`);

    // Step 1: 容器匹配
    step('Step 1: 执行容器匹配（模拟 Floating Panel 启动）');

    const matchResult = await invokeAction('containers:match', {
        profile: PROFILE,
        url: URL,
        maxDepth: 4,  // 初始只拉取 4 层
        maxChildren: 6,
    });

    success(`容器匹配成功: ${matchResult.container?.name || matchResult.container?.id}`);

    const snapshot = matchResult.snapshot;
    const domTree = snapshot.dom_tree;
    const containerTree = snapshot.container_tree;
    const matches = snapshot.matches || {};

    // 分析初始 DOM 树
    const initialDepth = getTreeDepth(domTree);
    const initialNodes = countNodes(domTree);

    info(`初始 DOM 树深度: ${initialDepth} 层`);
    info(`初始 DOM 节点数: ${initialNodes} 个`);

    // Step 2: 显示子容器
    step('Step 2: 分析子容器的 DOM 路径');

    log('找到的子容器:');
    let childContainers = [];

    function collectChildren(node, prefix = '') {
        if (!node) return;

        const nodeId = node.id || node.name;
        const match = matches[nodeId];

        if (match && match.nodes && match.nodes.length > 0) {
            for (const matchNode of match.nodes) {
                if (matchNode.dom_path) {
                    const pathDepth = matchNode.dom_path.split('/').length - 1;
                    childContainers.push({
                        name: node.name || nodeId,
                        id: nodeId,
                        path: matchNode.dom_path,
                        depth: pathDepth,
                        selector: matchNode.selector,
                    });
                }
            }
        }

        if (node.children && Array.isArray(node.children)) {
            for (const child of node.children) {
                collectChildren(child, prefix + '  ');
            }
        }
    }

    collectChildren(containerTree);

    // 按深度排序
    childContainers.sort((a, b) => b.depth - a.depth);

    for (const container of childContainers.slice(0, 5)) {
        console.log(`  📦 ${container.name} (${container.id})`);
        console.log(`     Path: ${container.path}`);
        console.log(`     深度: ${container.depth} 层 ${container.depth > 4 ? '⚠️  超出初始加载深度！' : ''}`);
    }

    // Step 3: 演示按需拉取
    step('Step 3: 演示按需拉取深层 DOM 分支');

    // 找一个超过 4 层的子容器
    const deepContainer = childContainers.find(c => c.depth > 4);

    if (deepContainer) {
        log(`选择深层容器: ${deepContainer.name}`);
        info(`路径: ${deepContainer.path}`);
        info(`深度: ${deepContainer.depth} 层`);

        // 这个路径在初始 DOM 树中不存在（因为只加载了 4 层）
        log('');
        log('❌ 这个路径在初始 DOM 树中不存在（maxDepth=4 时被截断）');
        log('');

        // 现在按需拉取这个分支
        log('🔄 正在按需拉取这个 DOM 分支...');

        const branchResult = await invokeAction('dom:branch:2', {
            profile: PROFILE,
            url: URL,
            path: deepContainer.path,
            maxDepth: 5,
            maxChildren: 6,
        });

        if (branchResult.node) {
            success('DOM 分支拉取成功！');
            info(`节点路径: ${branchResult.node.path}`);
            info(`节点标签: ${branchResult.node.tag}`);
            info(`子节点数: ${branchResult.node.children?.length || 0}`);

            log('');
            log('✨ 现在这个 DOM 分支可以：');
            log('   1. 合并到现有 DOM 树中');
            log('   2. 在图形界面中显示');
            log('   3. 画连线到对应的容器');
        }
    } else {
        log('所有子容器都在 4 层以内，无需演示深层拉取');
    }

    // Step 4: 展示优势
    step('Step 4: 按需拉取的优势');

    console.log('  🎯 性能优化:');
    console.log('     - 初始加载只需 4 层，速度快');
    console.log('     - 用户需要时才加载深层节点');
    console.log('     - 减少内存占用');
    console.log('');
    console.log('  🎯 用户体验:');
    console.log('     - 点击"+"展开自动拉取');
    console.log('     - 无需等待完整 DOM 树');
    console.log('     - 支持任意深度的 DOM');
    console.log('');
    console.log('  🎯 功能完整:');
    console.log('     - 子容器可以正确连线');
    console.log('     - 支持深层嵌套结构');
    console.log('     - 动态 profile/URL 支持');

    step('演示完成 🎉');

    log('现在 Floating Panel 中可以：');
    log('  1. 查看容器树和 DOM 树');
    log('  2. 点击 DOM 节点的 "+" 展开');
    log('  3. 自动按需拉取深层分支');
    log('  4. 子容器正确连线到 DOM 元素');
}

main().catch((e) => {
    log(`ERROR: ${e.message}`);
    console.error(e);
    process.exit(1);
});
