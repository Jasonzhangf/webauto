// 工作流执行器
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import WorkflowEngine from './WorkflowEngine.js';
import Logger from './Logger.js';

class WorkflowRunner {
  constructor() {
        this.engine = new WorkflowEngine();
        this.recordsDir = join(process.cwd(), 'archive', 'workflow-records');
        this.preflowsConfigPath = join(process.cwd(), 'workflows', 'preflows', 'enabled.json');
        // Basic logger for runner-level retries/errors
        this.logger = new Logger();
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

            // 统一会话ID（前置与主流程同一会话，便于 AttachSessionNode 接力）
            const workingSessionId = parameters.sessionId || `sess-${Date.now()}-${Math.floor(Math.random()*1e6)}`;

            // 执行前置流程（若存在配置）
            const preflowRecords = parameters.skipPreflows ? [] : await this.runPreflows({ ...parameters, sessionId: workingSessionId });

            // Anchor 入站检查（如果 workflow 声明了 anchor，则先执行锚点检查工作流）
            if (workflowConfig.anchor && typeof workflowConfig.anchor === 'object') {
                const anchorFlow = {
                    name: `${workflowConfig.name || 'Workflow'} Anchor Check`,
                    nodes: [
                        { id: 'start', type: 'StartNode', name: '开始', next: ['attach'] },
                        { id: 'attach', type: 'AttachSessionNode', name: '会话接力', config: {}, next: ['anchor'] },
                        { id: 'anchor', type: 'AnchorPointNode', name: '锚点确认', config: workflowConfig.anchor, next: ['end'] },
                        { id: 'end', type: 'EndNode', name: '结束', config: { cleanup: false } }
                    ],
                    globalConfig: { logLevel: 'info', timeout: Math.max(600000, Number(workflowConfig?.globalConfig?.timeout || 0)) }
                };
                const anchorResult = await this.engine.executeWorkflow(anchorFlow, { ...parameters, sessionId: workingSessionId });
                const rec = this.writeRecord({
                    workflowPath: workflowPath + '#anchor',
                    workflowName: anchorFlow.name,
                    parameters: { ...parameters, sessionId: workingSessionId },
                    result: anchorResult,
                    isPreflow: true
                });
                if (!anchorResult?.success) {
                    return { success: false, error: 'anchor check failed', anchorRecord: rec };
                }
            }

            // 执行工作流
            const result = await this.engine.executeWorkflow(workflowConfig, { ...parameters, sessionId: workingSessionId });

            // 结束锚点检查（如果 workflow 声明了 endAnchor）
            let endAnchorResult = null;
            if (result.success && workflowConfig.endAnchor && typeof workflowConfig.endAnchor === 'object') {
                const endAnchorFlow = {
                    name: `${workflowConfig.name || 'Workflow'} End Anchor Check`,
                    nodes: [
                        { id: 'start', type: 'StartNode', name: '开始', next: ['attach'] },
                        { id: 'attach', type: 'AttachSessionNode', name: '会话接力', config: {}, next: ['endAnchor'] },
                        { id: 'endAnchor', type: 'AnchorPointNode', name: '结束锚点确认', config: workflowConfig.endAnchor, next: ['end'] },
                        { id: 'end', type: 'EndNode', name: '结束', config: { cleanup: false } }
                    ],
                    globalConfig: { logLevel: 'info', timeout: 60000 }
                };
                endAnchorResult = await this.engine.executeWorkflow(endAnchorFlow, { ...parameters, sessionId: workingSessionId });
                
                if (!endAnchorResult?.success) {
                    return { 
                        success: false, 
                        error: 'end anchor check failed', 
                        result,
                        endAnchorRecord: endAnchorResult 
                    };
                }
            }

            // 记录结果
            const record = this.writeRecord({
                workflowPath,
                workflowName: workflowConfig.name,
                parameters,
                result: { ...result, endAnchorResult },
                preflowRecords
            });

            return { ...result, record, endAnchorResult };

        } catch (error) {
            console.error('❌ 工作流执行失败:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async runPreflows(parameters = {}) {
        if (!existsSync(this.preflowsConfigPath)) return [];
        try {
            const raw = readFileSync(this.preflowsConfigPath, 'utf8');
            const list = JSON.parse(raw);
            if (!Array.isArray(list) || list.length === 0) return [];

            const records = [];
            for (const p of list) {
                const abs = p.startsWith('.') || p.startsWith('/')
                    ? join(process.cwd(), p)
                    : join(process.cwd(), p);
                if (!existsSync(abs)) {
                    throw new Error(`前置流程不存在: ${abs}`);
                }
                const cfg = JSON.parse(readFileSync(abs, 'utf8'));
                this.validateWorkflow(cfg);
                // 最多重试三次
                const preResult = await this.executeWithRetries(() => this.engine.executeWorkflow(cfg, parameters), 3, cfg.name);
                const rec = this.writeRecord({
                    workflowPath: abs,
                    workflowName: cfg.name,
                    parameters,
                    result: preResult,
                    isPreflow: true
                });
                records.push(rec);
                if (!preResult.success) {
                    throw new Error(`前置流程失败: ${cfg.name}`);
                }
            }
            return records;
        } catch (e) {
            throw new Error(`前置流程执行错误: ${e.message}`);
        }
    }

    async executeWithRetries(fn, maxAttempts = 3, label = 'task') {
        let attempt = 0;
        let last = null;
        while (attempt < maxAttempts) {
            attempt++;
            try {
                const res = await fn();
                if (res && res.success) return res;
                last = res || { error: 'unknown failure' };
            } catch (e) {
                last = { success: false, error: e?.message || String(e) };
            }
            this.logger.warn(`⚠️ ${label} 第 ${attempt}/${maxAttempts} 次失败`);
        }
        this.logger.error(`❌ ${label} 已达到最大重试次数(${maxAttempts})，停止`);
        return last || { success: false, error: `${label} failed after ${maxAttempts} attempts` };
    }

    writeRecord({ workflowPath, workflowName, parameters, result, preflowRecords = [], isPreflow = false }) {
        try {
            mkdirSync(this.recordsDir, { recursive: true });
            const ts = new Date().toISOString().replace(/[:.]/g, '-');
            const base = `${isPreflow ? 'preflow' : 'workflow'}-${ts}.json`;
            const file = join(this.recordsDir, base);
            const data = {
                type: isPreflow ? 'preflow' : 'workflow',
                path: workflowPath,
                name: workflowName,
                startedAt: result?.startedAt || Date.now(),
                finishedAt: Date.now(),
                success: !!result?.success,
                error: result?.error || null,
                variables: result?.variables || {},
                outputs: result?.results || {},
                parameters,
                preflows: preflowRecords
            };
            writeFileSync(file, JSON.stringify(data, null, 2));
            return { file, ...data };
        } catch (e) {
            console.warn('⚠️ 写入工作流记录失败:', e.message);
            return null;
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
