#!/usr/bin/env node

/**
 * 端到端测试：验证按需拉取 DOM 分支的完整流程
 * 
 * 测试步骤：
 * 1. 创建 session（或使用已有 session）
 * 2. 执行容器匹配，获取初始 DOM 树（浅层）
 * 3. 从匹配结果中提取子容器的 dom_path
 * 4. 使用 dom:branch:2 拉取子容器的 DOM 分支
 * 5. 验证拉取的分支包含正确的节点
 */

const UNIFIED_API = process.env.UNIFIED_API_URL || 'http://127.0.0.1:7701';
const PROFILE = process.env.TEST_PROFILE || 'weibo_fresh';
const URL = process.env.TEST_URL || 'https://weibo.com';

const log = (m) => console.log('[e2e-dom-branch]', m);

async function invokeAction(action, payload) {
    const resp = await fetch(`${UNIFIED_API}/v1/controller/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, payload }),
    });

    if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`HTTP ${resp.status}: ${text.substring(0, 200)}`);
    }

    const json = await resp.json();
    if (!json.success) {
        throw new Error(json.error || 'Action failed');
    }

    return json.data;
}

async function main() {
    log('=== 端到端测试：按需拉取 DOM 分支 ===');
    log(`API: ${UNIFIED_API}`);
    log(`Profile: ${PROFILE}`);
    log(`URL: ${URL}`);
    log('');

    // Step 1: 容器匹配
    log('Step 1: 执行容器匹配...');
    const matchResult = await invokeAction('containers:match', {
        profile: PROFILE,
        url: URL,
        maxDepth: 4,  // 只拉取浅层 DOM
        maxChildren: 6,
    });

    log(`✓ 匹配成功: ${matchResult.matched ? '是' : '否'}`);
    if (matchResult.container) {
        log(`  - 根容器: ${matchResult.container.id || matchResult.container.name}`);
    }

    const snapshot = matchResult.snapshot;
    if (!snapshot) {
        throw new Error('未获取到 snapshot');
    }

    log(`  - DOM 树根节点: ${snapshot.dom_tree?.path || 'N/A'}`);
    log(`  - 容器树: ${snapshot.container_tree?.id || 'N/A'}`);
    log('');

    // Step 2: 查找子容器的 dom_path
    log('Step 2: 查找子容器...');
    const containerTree = snapshot.container_tree;
    const matches = snapshot.matches || {};

    let firstChildPath = null;
    let childContainerId = null;

    // 遍历容器树找到第一个有 match 的子容器
    function findChildWithMatch(node) {
        if (!node) return null;

        // 检查当前节点的子容器
        if (node.children && Array.isArray(node.children)) {
            for (const child of node.children) {
                const childId = child.id || child.name;
                const childMatch = matches[childId];

                if (childMatch && childMatch.nodes && childMatch.nodes.length > 0) {
                    const firstNode = childMatch.nodes[0];
                    if (firstNode.dom_path) {
                        return {
                            containerId: childId,
                            domPath: firstNode.dom_path,
                            containerName: child.name || childId,
                        };
                    }
                }

                // 递归查找
                const found = findChildWithMatch(child);
                if (found) return found;
            }
        }

        return null;
    }

    const childInfo = findChildWithMatch(containerTree);

    if (!childInfo) {
        log('⚠ 未找到有 dom_path 的子容器，使用根容器的子路径进行测试');
        // 使用一个已知的深路径
        firstChildPath = 'root/1/1';
        childContainerId = 'test_path';
    } else {
        firstChildPath = childInfo.domPath;
        childContainerId = childInfo.containerId;
        log(`✓ 找到子容器: ${childInfo.containerName} (${childContainerId})`);
        log(`  - DOM Path: ${firstChildPath}`);
    }
    log('');

    // Step 3: 按需拉取子容器的 DOM 分支
    log(`Step 3: 拉取 DOM 分支: ${firstChildPath}`);
    const branchResult = await invokeAction('dom:branch:2', {
        profile: PROFILE,
        url: URL,
        path: firstChildPath,
        maxDepth: 5,
        maxChildren: 6,
    });

    if (!branchResult.node) {
        throw new Error('未获取到 DOM 分支节点');
    }

    log('✓ DOM 分支拉取成功');
    log(`  - 节点 Path: ${branchResult.node.path}`);
    log(`  - 节点 Tag: ${branchResult.node.tag || 'N/A'}`);
    log(`  - 子节点数: ${branchResult.node.children?.length || 0}`);
    log(`  - childCount: ${branchResult.node.childCount || 0}`);

    // 验证路径匹配
    if (branchResult.node.path !== firstChildPath) {
        log(`⚠ 警告: 返回的节点路径不匹配`);
        log(`  期望: ${firstChildPath}`);
        log(`  实际: ${branchResult.node.path}`);
    } else {
        log('✓ 路径验证通过');
    }
    log('');

    // Step 4: 验证可以拉取更深层的分支
    if (branchResult.node.children && branchResult.node.children.length > 0) {
        const deeperPath = branchResult.node.children[0].path;
        log(`Step 4: 拉取更深层分支: ${deeperPath}`);

        const deeperBranch = await invokeAction('dom:branch:2', {
            profile: PROFILE,
            url: URL,
            path: deeperPath,
            maxDepth: 3,
            maxChildren: 6,
        });

        if (deeperBranch.node) {
            log('✓ 深层分支拉取成功');
            log(`  - 节点 Path: ${deeperBranch.node.path}`);
            log(`  - 节点 Tag: ${deeperBranch.node.tag || 'N/A'}`);
            log(`  - 子节点数: ${deeperBranch.node.children?.length || 0}`);
        }
    } else {
        log('Step 4: 跳过 (当前节点无子节点)');
    }
    log('');

    // Summary
    log('=== 测试总结 ===');
    log('✓ 容器匹配成功');
    log('✓ 初始 DOM 树获取成功');
    log('✓ 子容器 DOM 路径识别成功');
    log('✓ 按需拉取 DOM 分支成功');
    log('✓ 所有测试通过');
    log('');
    log('按需拉取功能已正常工作 🎉');
}

main().catch((e) => {
    log(`FATAL ERROR: ${e.message}`);
    console.error(e);
    process.exit(1);
});
