#!/usr/bin/env node

/**
 * ComfyUI-Inspired Node System for WebAuto
 * Core Node Base Classes and Connection Management
 */

class BaseNode {
    constructor(nodeId, config = {}) {
        this.id = nodeId;
        this.type = config.type || 'base';
        this.title = config.title || `${this.type}_${nodeId}`;
        this.inputs = config.inputs || [];
        this.outputs = config.outputs || [];
        this.parameters = config.parameters || {};
        this.position = config.position || { x: 0, y: 0 };
        this.state = 'idle'; // idle, running, completed, error
        this.executionTime = 0;
        this.dependencies = new Set();
        this.dependents = new Set();
        this.lastExecutionResult = null;
        this.metadata = config.metadata || {};
    }

    // 核心方法 - 子类必须实现
    async execute(context) {
        throw new Error('execute method must be implemented by subclass');
    }

    // 输入验证
    validateInputs(context) {
        for (const input of this.inputs) {
            if (input.required && !context.hasInput(this.id, input.name)) {
                throw new Error(`Required input '${input.name}' not provided`);
            }
        }
        return true;
    }

    // 参数解析
    resolveParameters(context) {
        const resolved = {};
        for (const [key, value] of Object.entries(this.parameters)) {
            if (typeof value === 'string' && value.includes('${')) {
                resolved[key] = this.resolveVariable(value, context);
            } else {
                resolved[key] = value;
            }
        }
        return resolved;
    }

    // 变量解析
    resolveVariable(expression, context) {
        return expression.replace(/\$\{([^}]+)\}/g, (match, varKey) => {
            if (context.hasVariable(varKey)) {
                return context.getVariable(varKey);
            }
            return match; // 未找到变量时返回原字符串
        });
    }

    // 获取输入值
    getInput(context, inputName) {
        return context.getInput(this.id, inputName);
    }

    // 设置输出值
    setOutput(context, outputName, value) {
        context.setOutput(this.id, outputName, value);
    }

    // 获取节点状态
    getState() {
        return {
            id: this.id,
            type: this.type,
            title: this.title,
            state: this.state,
            executionTime: this.executionTime,
            parameters: this.parameters,
            inputs: this.inputs,
            outputs: this.outputs,
            position: this.position,
            metadata: this.metadata,
            lastExecutionResult: this.lastExecutionResult
        };
    }

    // 添加依赖节点
    addDependency(nodeId) {
        this.dependencies.add(nodeId);
    }

    // 添加依赖此节点的节点
    addDependent(nodeId) {
        this.dependents.add(nodeId);
    }

    // 检查是否可以执行（所有依赖已完成）
    canExecute(context) {
        for (const depId of this.dependencies) {
            const depNode = context.getNode(depId);
            if (!depNode || depNode.state !== 'completed') {
                return false;
            }
        }
        return true;
    }
}

class NodeConnection {
    constructor(fromNodeId, fromOutput, toNodeId, toInput) {
        this.fromNodeId = fromNodeId;
        this.fromOutput = fromOutput;
        this.toNodeId = toNodeId;
        this.toInput = toInput;
        this.valid = false;
        this.error = null;
    }

    validate(fromNode, toNode) {
        // 验证输出端口存在
        const fromOutputExists = fromNode.outputs.some(output => output.name === this.fromOutput);
        if (!fromOutputExists) {
            this.valid = false;
            this.error = `Output '${this.fromOutput}' not found in node '${fromNode.id}'`;
            return false;
        }

        // 验证输入端口存在
        const toInputExists = toNode.inputs.some(input => input.name === this.toInput);
        if (!toInputExists) {
            this.valid = false;
            this.error = `Input '${this.toInput}' not found in node '${toNode.id}'`;
            return false;
        }

        // 验证数据类型兼容性（简化版本，实际可能需要更复杂的类型检查）
        const fromOutputInfo = fromNode.outputs.find(output => output.name === this.fromOutput);
        const toInputInfo = toNode.inputs.find(input => input.name === this.toInput);

        if (fromOutputInfo.type && toInputInfo.type &&
            fromOutputInfo.type !== toInputInfo.type &&
            toInputInfo.type !== 'any' &&
            fromOutputInfo.type !== 'any') {
            this.valid = false;
            this.error = `Type mismatch: ${fromOutputInfo.type} != ${toInputInfo.type}`;
            return false;
        }

        this.valid = true;
        this.error = null;
        return true;
    }
}

class ExecutionContext {
    constructor() {
        this.nodes = new Map();
        this.connections = new Map();
        this.variables = new Map();
        this.executionHistory = [];
        this.currentExecutionId = null;
        this.globalState = new Map();
        this.startTime = null;
        this.endTime = null;
    }

    // 节点管理
    addNode(node) {
        if (this.nodes.has(node.id)) {
            throw new Error(`Node ${node.id} already exists`);
        }
        this.nodes.set(node.id, node);
    }

    getNode(nodeId) {
        return this.nodes.get(nodeId);
    }

    // 连接管理
    addConnection(connection) {
        const connectionId = `${connection.fromNodeId}.${connection.fromOutput} -> ${connection.toNodeId}.${connection.toInput}`;
        this.connections.set(connectionId, connection);

        // 更新节点依赖关系
        const fromNode = this.getNode(connection.fromNodeId);
        const toNode = this.getNode(connection.toNodeId);

        if (fromNode && toNode) {
            toNode.addDependency(connection.fromNodeId);
            fromNode.addDependent(connection.toNodeId);
        }
    }

    // 输入输出管理
    setOutput(nodeId, outputName, value) {
        const key = `${nodeId}.${outputName}`;
        this.variables.set(key, value);
    }

    hasInput(nodeId, inputName) {
        // 查找连接到此输入的输出
        for (const connection of this.connections.values()) {
            if (connection.toNodeId === nodeId && connection.toInput === inputName) {
                return this.variables.has(`${connection.fromNodeId}.${connection.fromOutput}`);
            }
        }
        return false;
    }

    getInput(nodeId, inputName) {
        // 查找连接到此输入的输出
        for (const connection of this.connections.values()) {
            if (connection.toNodeId === nodeId && connection.toInput === inputName) {
                return this.variables.get(`${connection.fromNodeId}.${connection.fromOutput}`);
            }
        }
        return null;
    }

    // 变量管理
    setVariable(name, value) {
        this.variables.set(name, value);
    }

    hasVariable(name) {
        return this.variables.has(name);
    }

    getVariable(name) {
        return this.variables.get(name);
    }

    // 全局状态管理
    setGlobalState(key, value) {
        this.globalState.set(key, value);
    }

    getGlobalState(key) {
        return this.globalState.get(key);
    }

    // 执行历史
    addExecutionHistory(nodeId, result) {
        this.executionHistory.push({
            nodeId,
            timestamp: Date.now(),
            result
        });
    }

    // 获取执行统计
    getExecutionStats() {
        const completedNodes = Array.from(this.nodes.values()).filter(node => node.state === 'completed');
        const failedNodes = Array.from(this.nodes.values()).filter(node => node.state === 'error');

        return {
            totalNodes: this.nodes.size,
            completedNodes: completedNodes.length,
            failedNodes: failedNodes.length,
            totalConnections: this.connections.size,
            executionTime: this.endTime ? this.endTime - this.startTime : 0,
            executionHistory: this.executionHistory
        };
    }

    // 获取可执行的节点
    getExecutableNodes() {
        return Array.from(this.nodes.values()).filter(node =>
            node.state === 'idle' && node.canExecute(this)
        );
    }

    // 重置执行状态
    reset() {
        for (const node of this.nodes.values()) {
            node.state = 'idle';
            node.executionTime = 0;
            node.lastExecutionResult = null;
        }
        this.executionHistory = [];
        this.startTime = null;
        this.endTime = null;
    }
}

// 节点类型定义
const NodeTypes = {
    BROWSER_OPERATOR: {
        class: 'BrowserOperatorNode',
        inputs: [
            { name: 'config', type: 'object', required: false },
            { name: 'cookies', type: 'array', required: false }
        ],
        outputs: [
            { name: 'page', type: 'object' },
            { name: 'browser', type: 'object' }
        ]
    },
    COOKIE_MANAGER: {
        class: 'CookieManagerNode',
        inputs: [
            { name: 'cookiePath', type: 'string', required: true },
            { name: 'domain', type: 'string', required: false }
        ],
        outputs: [
            { name: 'cookies', type: 'array' },
            { name: 'success', type: 'boolean' }
        ]
    },
    NAVIGATION_OPERATOR: {
        class: 'NavigationOperatorNode',
        inputs: [
            { name: 'page', type: 'object', required: true },
            { name: 'url', type: 'string', required: false },
            { name: 'trigger', type: 'any', required: false }
        ],
        outputs: [
            { name: 'page', type: 'object' },
            { name: 'navigationResult', type: 'object' }
        ]
    },
    RECURSIVE_TREE_EXTRACTOR: {
        class: 'RecursiveTreeExtractorNode',
        inputs: [
            { name: 'page', type: 'object', required: true },
            { name: 'traversalRules', type: 'object', required: false },
            { name: 'maxResults', type: 'number', required: false },
            { name: 'scrollConfig', type: 'object', required: false }
        ],
        outputs: [
            { name: 'containers', type: 'array' },
            { name: 'elements', type: 'array' },
            { name: 'links', type: 'array' },
            { name: 'traversalResult', type: 'object' }
        ]
    },
    LINK_FILTER: {
        class: 'LinkFilterNode',
        inputs: [
            { name: 'links', type: 'array', required: true },
            { name: 'filterPatterns', type: 'array', required: false }
        ],
        outputs: [
            { name: 'filteredLinks', type: 'array' },
            { name: 'filterStats', type: 'object' }
        ]
    },
    FILE_SAVER: {
        class: 'FileSaverNode',
        inputs: [
            { name: 'data', type: 'any', required: true },
            { name: 'filePath', type: 'string', required: false },
            { name: 'format', type: 'string', required: false }
        ],
        outputs: [
            { name: 'savedPath', type: 'string' },
            { name: 'success', type: 'boolean' }
        ]
    },
    CONDITIONAL_ROUTER: {
        class: 'ConditionalRouterNode',
        inputs: [
            { name: 'condition', type: 'boolean', required: true },
            { name: 'input', type: 'any', required: false }
        ],
        outputs: [
            { name: 'true', type: 'any' },
            { name: 'false', type: 'any' }
        ]
    },
    LOOP_CONTROLLER: {
        class: 'LoopControllerNode',
        inputs: [
            { name: 'items', type: 'array', required: true },
            { name: 'currentItem', type: 'any', required: false }
        ],
        outputs: [
            { name: 'current', type: 'any' },
            { name: 'completed', type: 'boolean' }
        ]
    },
    STATE_MANAGER: {
        class: 'StateManagerNode',
        inputs: [
            { name: 'stateKey', type: 'string', required: true },
            { name: 'stateValue', type: 'any', required: false }
        ],
        outputs: [
            { name: 'previousValue', type: 'any' },
            { name: 'currentState', type: 'any' }
        ]
    }
};

export { BaseNode, NodeConnection, ExecutionContext, NodeTypes };