#!/usr/bin/env node

/**
 * 重构后功能测试脚本
 * 测试核心模块是否正确导入和运行
 */

console.log('🔧 开始测试重构后的项目...');

// 测试核心模块导入
async function testCoreModules() {
    console.log('\n📦 测试核心模块导入...');

    try {
        // 测试工作流引擎
        const WorkflowEngineModule = await import('./src/core/workflow/WorkflowEngine.js');
        const WorkflowEngine = WorkflowEngineModule.default;
        console.log('✅ WorkflowEngine 导入成功');

        const engine = new WorkflowEngine();
        console.log('✅ WorkflowEngine 实例化成功');

        // 测试节点注册
        const NodeRegistryModule = await import('./src/core/workflow/NodeRegistry.js');
        const NodeRegistry = NodeRegistryModule.default;
        console.log('✅ NodeRegistry 导入成功');

        // 测试高亮服务（仅导入，不实例化，因为需要浏览器环境）
        const HighlightServiceModule = await import('./src/modules/highlight/highlight-service.js');
        console.log('✅ HighlightService 模块导入成功');

        return true;
    } catch (error) {
        console.error('❌ 核心模块测试失败:', error.message);
        return false;
    }
}

// 测试目录结构
async function testDirectoryStructure() {
    console.log('\n📁 测试目录结构...');

    const fs = await import('fs');

    const expectedPaths = [
        'src/core/workflow/WorkflowEngine.js',
        'src/core/workflow/NodeRegistry.js',
        'src/modules/highlight/highlight-service.js',
        'src/platforms/alibaba',
        'workflows/1688'
    ];

    let allExists = true;

    for (const path of expectedPaths) {
        if (fs.existsSync(path)) {
            console.log(`✅ ${path} 存在`);
        } else {
            console.log(`❌ ${path} 缺失`);
            allExists = false;
        }
    }

    return allExists;
}

// 测试节点系统
async function testNodeSystem() {
    console.log('\n🔗 测试节点系统...');

    try {
        const NodeRegistryModule = await import('./src/core/workflow/NodeRegistry.js');
        const NodeRegistry = NodeRegistryModule.default;

        // 测试关键节点是否注册
        const expectedNodes = [
            'AnchorPointNode',
            'BrowserInitNode',
            'NavigationNode',
            'ClickNode'
        ];

        let allRegistered = true;

        for (const nodeName of expectedNodes) {
            const NodeHandler = NodeRegistry.getNodeHandler(nodeName);
            if (NodeHandler) {
                console.log(`✅ ${nodeName} 已注册`);
            } else {
                console.log(`❌ ${nodeName} 未注册`);
                allRegistered = false;
            }
        }

        return allRegistered;
    } catch (error) {
        console.error('❌ 节点系统测试失败:', error.message);
        return false;
    }
}

// 主测试函数
async function runTests() {
    console.log('🚀 WebAuto 重构后功能测试开始\n');

    const results = [];

    results.push(await testDirectoryStructure());
    results.push(await testCoreModules());
    results.push(await testNodeSystem());

    console.log('\n📊 测试结果汇总:');
    console.log(`总测试数: ${results.length}`);
    console.log(`通过数: ${results.filter(r => r).length}`);
    console.log(`失败数: ${results.filter(r => !r).length}`);

    if (results.every(r => r)) {
        console.log('\n🎉 所有测试通过！重构成功！');
        process.exit(0);
    } else {
        console.log('\n❌ 部分测试失败，需要检查重构');
        process.exit(1);
    }
}

runTests().catch(error => {
    console.error('💥 测试运行失败:', error);
    process.exit(1);
});