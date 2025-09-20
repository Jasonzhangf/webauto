// 工作流执行器
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import WorkflowEngine from './engine/WorkflowEngine.js';

class WorkflowRunner {
    constructor() {
        this.engine = new WorkflowEngine();
    }

    async runWorkflow(workflowPath, parameters = {}) {
        try {
            // 读取工作流配置文件
            if (!existsSync(workflowPath)) {
                throw new Error(`工作流文件不存在: ${workflowPath}`);
            }

            const workflowConfig = JSON.parse(readFileSync(workflowPath, 'utf8'));

            // 验证工作流配置
            this.validateWorkflow(workflowConfig);

            // 执行工作流
            const result = await this.engine.executeWorkflow(workflowConfig, parameters);

            return result;

        } catch (error) {
            console.error('❌ 工作流执行失败:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    validateWorkflow(workflowConfig) {
        if (!workflowConfig.name) {
            throw new Error('工作流必须包含名称');
        }

        if (!workflowConfig.nodes || !Array.isArray(workflowConfig.nodes)) {
            throw new Error('工作流必须包含节点数组');
        }

        // 检查是否有开始节点
        const startNodes = workflowConfig.nodes.filter(node => node.type === 'StartNode');
        if (startNodes.length !== 1) {
            throw new Error('工作流必须包含且仅包含一个StartNode');
        }

        // 检查节点ID唯一性
        const nodeIds = workflowConfig.nodes.map(node => node.id);
        const uniqueIds = new Set(nodeIds);
        if (nodeIds.length !== uniqueIds.size) {
            throw new Error('工作流节点ID必须唯一');
        }

        // 验证节点连接
        this.validateNodeConnections(workflowConfig.nodes);
    }

    validateNodeConnections(nodes) {
        const nodeMap = new Map(nodes.map(node => [node.id, node]));

        nodes.forEach(node => {
            // 验证next连接
            if (node.next) {
                node.next.forEach(nextId => {
                    if (!nodeMap.has(nextId)) {
                        throw new Error(`节点 ${node.id} 的next连接指向不存在的节点 ${nextId}`);
                    }
                });
            }

            // 验证error连接
            if (node.error) {
                node.error.forEach(errorId => {
                    if (!nodeMap.has(errorId)) {
                        throw new Error(`节点 ${node.id} 的error连接指向不存在的节点 ${errorId}`);
                    }
                });
            }
        });
    }

    // 预设的工作流执行方法
    async runHomepageWorkflow() {
        return await this.runWorkflow('./workflows/weibo-homepage-workflow.json');
    }

    async runSearchWorkflow(searchTerm) {
        return await this.runWorkflow('./workflows/weibo-search-workflow.json', { searchTerm });
    }

    async runProfileWorkflow(profileId) {
        return await this.runWorkflow('./workflows/weibo-profile-workflow.json', { profileId });
    }
}

// 如果直接运行此脚本
if (import.meta.url === `file://${process.argv[1]}`) {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.log('用法:');
        console.log('  node WorkflowRunner.js homepage');
        console.log('  node WorkflowRunner.js search <搜索关键词>');
        console.log('  node WorkflowRunner.js profile <用户ID>');
        process.exit(1);
    }

    const runner = new WorkflowRunner();
    const workflowType = args[0];

    let result;
    switch (workflowType) {
        case 'homepage':
            result = await runner.runHomepageWorkflow();
            break;
        case 'search':
            if (!args[1]) {
                console.error('❌ 请提供搜索关键词');
                process.exit(1);
            }
            result = await runner.runSearchWorkflow(args[1]);
            break;
        case 'profile':
            if (!args[1]) {
                console.error('❌ 请提供用户ID');
                process.exit(1);
            }
            result = await runner.runProfileWorkflow(args[1]);
            break;
        default:
            console.error('❌ 未知的工作流类型:', workflowType);
            process.exit(1);
    }

    console.log('\n🎉 工作流执行完成!');
    console.log(`📊 结果: ${result.success ? '✅ 成功' : '❌ 失败'}`);

    if (result.results && result.results.links) {
        console.log(`📈 捕获链接数: ${result.results.actual || result.results.links.length}`);
    }

    if (result.variables) {
        if (result.variables.searchTerm) {
            console.log(`🔍 搜索关键词: ${result.variables.searchTerm}`);
        }
        if (result.variables.profileId) {
            console.log(`👤 用户ID: ${result.variables.profileId}`);
        }
    }

    if (!result.success) {
        console.error(`💥 错误信息: ${result.error}`);
        process.exit(1);
    }
}

export default WorkflowRunner;