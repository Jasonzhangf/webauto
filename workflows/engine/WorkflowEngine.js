// 工作流引擎核心类
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import NodeRegistry from './NodeRegistry.js';
import VariableManager from './VariableManager.js';
import Logger from './Logger.js';
import SessionRegistry from './SessionRegistry.js';
import SessionFS from './SessionFS.js';
import BehaviorRecorder from './BehaviorRecorder.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class WorkflowEngine {
  constructor() {
    this.nodeRegistry = new NodeRegistry();
    this.variableManager = new VariableManager();
    this.logger = new Logger();
    this.browser = null;
    this.context = null;
    this.page = null;
    this.currentState = 'idle';
    this.executionStack = [];
    this.results = {};
    this.behaviorLog = [];
    this.recorder = null;
  }

    async executeWorkflow(workflowConfig, parameters = {}) {
        try {
            this.logger.info(`🚀 开始执行工作流: ${workflowConfig.name}`);
            this.currentState = 'running';
            this.variableManager.initialize(workflowConfig.variables);
            // 记录工作流名称，便于外部节点输出
            this.variableManager.set('workflowName', workflowConfig.name || 'workflow');

            // 设置参数
            if (workflowConfig.parameters) {
                Object.keys(workflowConfig.parameters).forEach(key => {
                    if (parameters[key] !== undefined) {
                        this.variableManager.set(key, parameters[key]);
                    }
                });
            }

            // 准备会话ID（用于跨工作流共享浏览器上下文）
            const providedSessionId = parameters.sessionId || workflowConfig.sessionId;
            const sessionId = providedSessionId || `sess-${Date.now()}-${Math.floor(Math.random()*1e6)}`;
            this.variableManager.set('sessionId', sessionId);
            // 会话目录
            const sessionDir = SessionFS.ensureSessionDir(sessionId);
            this.variableManager.set('sessionDir', sessionDir);

            // 传入参数（全部写入为变量，便于节点读取，如 debug）
            for (const k of Object.keys(parameters || {})) {
                this.variableManager.set(k, parameters[k]);
            }

            // 行为记录器
            this.recorder = new BehaviorRecorder({ workflow: workflowConfig.name || 'workflow', sessionId, sessionDir });

            // 开始时间
            this.variableManager.set('startTime', new Date().toISOString());

            // 查找开始节点
            const startNode = workflowConfig.nodes.find(node => node.type === 'StartNode');
            if (!startNode) {
                throw new Error('工作流必须包含一个StartNode');
            }

            // 执行工作流
            await this.executeNode(workflowConfig, startNode, workflowConfig.nodes);

            // 结束时间
            this.variableManager.set('endTime', new Date().toISOString());

            this.logger.info('✅ 工作流执行完成');
            this.currentState = 'completed';

            return {
                success: true,
                results: this.results,
                variables: this.variableManager.getAll(),
                executionTime: this.calculateExecutionTime()
            };

        } catch (error) {
            this.logger.error(`❌ 工作流执行失败: ${error.message}`);
            this.currentState = 'failed';

            return {
                success: false,
                error: error.message,
                results: this.results,
                variables: this.variableManager.getAll()
            };
        }
    }

    async executeNode(workflowConfig, node, allNodes) {
        this.logger.info(`🔧 执行节点: ${node.name} (${node.type})`);

        try {
            // 获取节点处理器
            const nodeHandler = this.nodeRegistry.getNodeHandler(node.type);
            if (!nodeHandler) {
                throw new Error(`未找到节点类型 ${node.type} 的处理器`);
            }

            // 准备节点上下文
            const nodeContext = {
                workflow: workflowConfig,
                node: node,
                config: node.config,
                variables: this.variableManager,
                logger: this.logger,
                browser: this.browser,
                context: this.context,
                page: this.page,
                results: this.results,
                engine: this
            };

            // 执行节点
            const nodeResult = await nodeHandler.execute(nodeContext);

            // 处理节点结果
            if (nodeResult.success) {
                this.logger.info(`✅ 节点 ${node.name} 执行成功`);

                // 更新变量
                if (nodeResult.variables) {
                    Object.keys(nodeResult.variables).forEach(key => {
                        this.variableManager.set(key, nodeResult.variables[key]);
                    });
                }

                // 更新结果
                if (nodeResult.results) {
                    Object.assign(this.results, nodeResult.results);
                }

                // 更新浏览器实例
                if (nodeResult.browser) {
                    this.browser = nodeResult.browser;
                }
                if (nodeResult.context) {
                    this.context = nodeResult.context;
                }
                if (nodeResult.page) {
                    this.page = nodeResult.page;
                }

                // 执行下一个节点
                if (node.next && node.next.length > 0) {
                    const nextNodeId = node.next[0];
                    const nextNode = allNodes.find(n => n.id === nextNodeId);
                    if (nextNode) {
                        await this.executeNode(workflowConfig, nextNode, allNodes);
                    }
                }

            } else {
                this.logger.error(`❌ 节点 ${node.name} 执行失败: ${nodeResult.error}`);

                // 处理错误分支
                if (node.error && node.error.length > 0) {
                    const errorNodeId = node.error[0];
                    const errorNode = allNodes.find(n => n.id === errorNodeId);
                    if (errorNode) {
                        await this.executeNode(workflowConfig, errorNode, allNodes);
                    }
                } else {
                    throw new Error(nodeResult.error);
                }
            }

        } catch (error) {
            this.logger.error(`💥 节点 ${node.name} 执行异常: ${error.message}`);
            throw error;
        }
    }

    // 保存会话到注册表（供后续工作流接力）
  saveSession() {
    const sessionId = this.variableManager.get('sessionId');
    if (!sessionId) return false;
    return SessionRegistry.save(sessionId, {
      browser: this.browser,
      context: this.context,
      page: this.page
    });
  }

    // 附着已有会话（可供 AttachSessionNode 调用）
  attachSession(sessionId) {
    const s = SessionRegistry.get(sessionId);
    if (!s) return false;
    this.browser = s.browser;
    this.context = s.context;
    this.page = s.page;
    return true;
  }

  // 行为记录（供节点调用）
  recordBehavior(type, data = {}) {
    try {
      if (this.recorder) this.recorder.record(type, data);
      this.behaviorLog.push({ ts: Date.now(), type, data });
    } catch {}
  }

  getBehaviorLog() { return this.behaviorLog.slice(); }

    calculateExecutionTime() {
        const startTime = this.variableManager.get('startTime');
        const endTime = this.variableManager.get('endTime');

        if (startTime && endTime) {
            return new Date(endTime) - new Date(startTime);
        }
        return 0;
    }

    getStatus() {
        return {
            state: this.currentState,
            variables: this.variableManager.getAll(),
            results: this.results,
            executionTime: this.calculateExecutionTime()
        };
    }
}

export default WorkflowEngine;
