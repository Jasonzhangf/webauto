#!/usr/bin/env node

/**
 * ComfyUI-Inspired Workflow Execution Engine
 * Handles node execution, dependency resolution, and state management
 */

const { BaseNode, NodeConnection, ExecutionContext, NodeTypes } = require('./base-node');

class WorkflowEngine {
    constructor(options = {}) {
        this.options = {
            maxExecutionTime: options.maxExecutionTime || 300000, // 5 minutes
            retryAttempts: options.retryAttempts || 3,
            retryDelay: options.retryDelay || 1000,
            enableLogging: options.enableLogging !== false,
            ...options
        };
        this.context = new ExecutionContext();
        this.executionPromises = new Map();
        this.eventHandlers = new Map();
    }

    // 事件处理
    on(event, handler) {
        if (!this.eventHandlers.has(event)) {
            this.eventHandlers.set(event, []);
        }
        this.eventHandlers.get(event).push(handler);
    }

    emit(event, data) {
        const handlers = this.eventHandlers.get(event);
        if (handlers) {
            handlers.forEach(handler => {
                try {
                    handler(data);
                } catch (error) {
                    console.error(`Event handler error for ${event}:`, error);
                }
            });
        }
    }

    // 从JSON配置加载工作流
    async loadWorkflow(workflowConfig) {
        try {
            this.emit('workflowLoading', workflowConfig);

            // 验证工作流配置
            this.validateWorkflowConfig(workflowConfig);

            // 清空当前上下文
            this.context = new ExecutionContext();

            // 创建节点
            for (const nodeConfig of workflowConfig.nodes) {
                const node = this.createNode(nodeConfig);
                this.context.addNode(node);
            }

            // 创建连接
            for (const connectionConfig of workflowConfig.connections) {
                const connection = new NodeConnection(
                    connectionConfig.from,
                    connectionConfig.fromOutput,
                    connectionConfig.to,
                    connectionConfig.toInput
                );

                const fromNode = this.context.getNode(connectionConfig.from);
                const toNode = this.context.getNode(connectionConfig.to);

                if (fromNode && toNode) {
                    connection.validate(fromNode, toNode);
                    if (!connection.valid) {
                        throw new Error(`Connection validation failed: ${connection.error}`);
                    }
                }

                this.context.addConnection(connection);
            }

            // 设置全局变量
            if (workflowConfig.variables) {
                for (const [key, value] of Object.entries(workflowConfig.variables)) {
                    this.context.setVariable(key, value);
                }
            }

            this.emit('workflowLoaded', {
                nodes: this.context.nodes.size,
                connections: this.context.connections.size,
                variables: workflowConfig.variables
            });

            return true;

        } catch (error) {
            this.emit('workflowError', { type: 'loading', error: error.message });
            throw error;
        }
    }

    // 创建节点实例
    createNode(nodeConfig) {
        const nodeType = NodeTypes[nodeConfig.type];
        if (!nodeType) {
            throw new Error(`Unknown node type: ${nodeConfig.type}`);
        }

        // 动态加载节点类
        const NodeClass = require(`./nodes/${nodeType.class}.js`);

        const node = new NodeClass(nodeConfig.id, {
            type: nodeConfig.type,
            title: nodeConfig.title,
            inputs: nodeType.inputs,
            outputs: nodeType.outputs,
            parameters: nodeConfig.parameters || {},
            position: nodeConfig.position || { x: 0, y: 0 },
            metadata: nodeConfig.metadata || {}
        });

        return node;
    }

    // 验证工作流配置
    validateWorkflowConfig(workflowConfig) {
        if (!workflowConfig.nodes || !Array.isArray(workflowConfig.nodes)) {
            throw new Error('Workflow must contain a nodes array');
        }

        if (!workflowConfig.connections || !Array.isArray(workflowConfig.connections)) {
            throw new Error('Workflow must contain a connections array');
        }

        // 验证节点ID唯一性
        const nodeIds = new Set();
        for (const nodeConfig of workflowConfig.nodes) {
            if (!nodeConfig.id) {
                throw new Error('Node ID is required');
            }
            if (nodeIds.has(nodeConfig.id)) {
                throw new Error(`Duplicate node ID: ${nodeConfig.id}`);
            }
            nodeIds.add(nodeConfig.id);
        }

        // 验证连接有效性
        for (const connectionConfig of workflowConfig.connections) {
            if (!nodeIds.has(connectionConfig.from)) {
                throw new Error(`Connection source node not found: ${connectionConfig.from}`);
            }
            if (!nodeIds.has(connectionConfig.to)) {
                throw new Error(`Connection target node not found: ${connectionConfig.to}`);
            }
        }
    }

    // 执行工作流
    async execute() {
        const startTime = Date.now();
        this.context.startTime = startTime;

        try {
            this.emit('workflowStarted', { startTime });

            let completedNodes = 0;
            let failedNodes = 0;

            // 主执行循环
            while (true) {
                // 检查执行时间限制
                if (Date.now() - startTime > this.options.maxExecutionTime) {
                    throw new Error('Workflow execution timeout');
                }

                // 获取可执行的节点
                const executableNodes = this.context.getExecutableNodes();

                if (executableNodes.length === 0) {
                    // 检查是否所有节点都已完成
                    const totalNodes = this.context.nodes.size;
                    const completed = Array.from(this.context.nodes.values()).filter(n => n.state === 'completed').length;

                    if (completed === totalNodes) {
                        break; // 所有节点完成
                    } else {
                        // 可能存在循环依赖或其他问题
                        throw new Error(`Workflow execution stuck: ${completed}/${totalNodes} nodes completed`);
                    }
                }

                // 并行执行可执行的节点
                const executionPromises = executableNodes.map(node => this.executeNode(node));
                await Promise.all(executionPromises);

                // 更新统计
                completedNodes = Array.from(this.context.nodes.values()).filter(n => n.state === 'completed').length;
                failedNodes = Array.from(this.context.nodes.values()).filter(n => n.state === 'error').length;

                this.emit('executionProgress', {
                    completedNodes,
                    failedNodes,
                    totalNodes: this.context.nodes.size
                });

                if (failedNodes > 0 && !this.options.continueOnFailure) {
                    throw new Error(`${failedNodes} nodes failed during execution`);
                }
            }

            this.context.endTime = Date.now();
            const executionTime = this.context.endTime - this.context.startTime;

            this.emit('workflowCompleted', {
                executionTime,
                stats: this.context.getExecutionStats()
            });

            return {
                success: true,
                executionTime,
                stats: this.context.getExecutionStats()
            };

        } catch (error) {
            this.context.endTime = Date.now();
            const executionTime = this.context.endTime - this.context.startTime;

            this.emit('workflowFailed', {
                error: error.message,
                executionTime,
                stats: this.context.getExecutionStats()
            });

            throw error;
        }
    }

    // 执行单个节点
    async executeNode(node) {
        if (node.state !== 'idle') {
            return;
        }

        const nodeStartTime = Date.now();
        node.state = 'running';

        this.emit('nodeStarted', { nodeId: node.id, startTime: nodeStartTime });

        try {
            // 验证输入
            node.validateInputs(this.context);

            // 解析参数
            const resolvedParams = node.resolveParameters(this.context);

            // 执行节点
            const result = await node.execute(this.context, resolvedParams);

            // 记录执行结果
            node.lastExecutionResult = result;
            node.state = 'completed';
            node.executionTime = Date.now() - nodeStartTime;

            // 添加到执行历史
            this.context.addExecutionHistory(node.id, result);

            this.emit('nodeCompleted', {
                nodeId: node.id,
                executionTime: node.executionTime,
                result
            });

            return result;

        } catch (error) {
            node.state = 'error';
            node.lastExecutionResult = { error: error.message };
            node.executionTime = Date.now() - nodeStartTime;

            this.context.addExecutionHistory(node.id, { error: error.message });

            this.emit('nodeFailed', {
                nodeId: node.id,
                error: error.message,
                executionTime: node.executionTime
            });

            throw error;
        }
    }

    // 获取工作流状态
    getWorkflowStatus() {
        return {
            nodes: Array.from(this.context.nodes.values()).map(node => node.getState()),
            connections: Array.from(this.context.connections.values()).map(conn => ({
                from: `${conn.fromNodeId}.${conn.fromOutput}`,
                to: `${conn.toNodeId}.${conn.toInput}`,
                valid: conn.valid,
                error: conn.error
            })),
            variables: Object.fromEntries(this.context.variables),
            globalState: Object.fromEntries(this.context.globalState),
            stats: this.context.getExecutionStats()
        };
    }

    // 导出工作流配置
    exportWorkflow() {
        const nodes = Array.from(this.context.nodes.values()).map(node => ({
            id: node.id,
            type: node.type,
            title: node.title,
            parameters: node.parameters,
            position: node.position,
            metadata: node.metadata
        }));

        const connections = Array.from(this.context.connections.values()).map(conn => ({
            from: conn.fromNodeId,
            fromOutput: conn.fromOutput,
            to: conn.toNodeId,
            toInput: conn.toInput
        }));

        return {
            nodes,
            connections,
            variables: Object.fromEntries(
                Array.from(this.context.variables).filter(([key]) => !key.includes('.'))
            ),
            version: '1.0'
        };
    }

    // 重置工作流状态
    reset() {
        this.context.reset();
        this.emit('workflowReset');
    }

    // 调试方法：获取执行路径
    getExecutionPath(targetNodeId) {
        const path = [];
        const visited = new Set();

        const findPath = (nodeId) => {
            if (visited.has(nodeId)) return false;
            visited.add(nodeId);

            const node = this.context.getNode(nodeId);
            if (!node) return false;

            if (nodeId === targetNodeId) {
                path.unshift(nodeId);
                return true;
            }

            for (const depId of node.dependencies) {
                if (findPath(depId)) {
                    path.unshift(nodeId);
                    return true;
                }
            }

            return false;
        };

        // 从所有没有依赖的节点开始搜索
        const startNodes = Array.from(this.context.nodes.values())
            .filter(node => node.dependencies.size === 0)
            .map(node => node.id);

        for (const startNodeId of startNodes) {
            if (findPath(startNodeId)) {
                break;
            }
        }

        return path;
    }

    // 验证工作流完整性
    validateWorkflow() {
        const errors = [];

        // 检查所有连接是否有效
        for (const connection of this.context.connections.values()) {
            const fromNode = this.context.getNode(connection.fromNodeId);
            const toNode = this.context.getNode(connection.toNodeId);

            if (!fromNode || !toNode) {
                errors.push(`Invalid connection: missing nodes`);
                continue;
            }

            if (!connection.validate(fromNode, toNode)) {
                errors.push(connection.error);
            }
        }

        // 检查是否有循环依赖
        const visited = new Set();
        const recursionStack = new Set();

        const hasCycle = (nodeId) => {
            if (recursionStack.has(nodeId)) return true;
            if (visited.has(nodeId)) return false;

            visited.add(nodeId);
            recursionStack.add(nodeId);

            const node = this.context.getNode(nodeId);
            if (node) {
                for (const depId of node.dependencies) {
                    if (hasCycle(depId)) return true;
                }
            }

            recursionStack.delete(nodeId);
            return false;
        };

        for (const nodeId of this.context.nodes.keys()) {
            if (hasCycle(nodeId)) {
                errors.push(`Circular dependency detected involving node ${nodeId}`);
                break;
            }
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }
}

module.exports = WorkflowEngine;