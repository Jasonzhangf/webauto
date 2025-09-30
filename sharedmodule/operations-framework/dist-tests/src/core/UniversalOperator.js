"use strict";
/**
 * WebAuto Operator Framework - 通用操作子基类
 * @package @webauto/operator-framework
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.UniversalOperator = void 0;
const rcc_basemodule_1 = require("rcc-basemodule");
const OperatorTypes_1 = require("./types/OperatorTypes");
const events_1 = require("events");
class UniversalOperator extends rcc_basemodule_1.RCCBaseModule {
    constructor(config) {
        super();
        this._config = config;
        this._state = OperatorTypes_1.OperatorState.IDLE;
        this._capabilities = this.initializeCapabilities();
        this._eventEmitter = new events_1.EventEmitter();
        this._childOperators = new Map();
        this._connections = new Map();
        this._executionHistory = [];
        this._context = {
            sessionId: this.generateSessionId(),
            timestamp: Date.now(),
            parameters: {},
            sharedData: new Map()
        };
        this.emitEvent('operator_created', {
            operatorId: this._config.id,
            config: this._config
        });
    }
    // 核心操作方法 - 根据用户需求的核心操作
    async observe(params) {
        if (!this._capabilities.observe) {
            return this.createErrorResult('Observe capability not supported');
        }
        return this.handleCapabilityNotImplemented('observe');
    }
    async list(params) {
        if (!this._capabilities.list) {
            return this.createErrorResult('List capability not supported');
        }
        return this.handleCapabilityNotImplemented('list');
    }
    async capabilities() {
        return this.createSuccessResult(this._capabilities);
    }
    async status() {
        return this.createSuccessResult({
            state: this._state,
            config: this._config,
            context: this._context,
            executionHistory: this._executionHistory.slice(-10), // 最近10次执行记录
            childOperators: Array.from(this._childOperators.keys())
        });
    }
    async context(params) {
        if (!this._capabilities.context) {
            return this.createErrorResult('Context capability not supported');
        }
        if (params.action === 'get') {
            return this.createSuccessResult(this._context);
        }
        else if (params.action === 'update') {
            this.updateContext(params.data);
            return this.createSuccessResult(this._context);
        }
        return this.createErrorResult('Unknown context action');
    }
    async connect(config) {
        if (!this._capabilities.connect) {
            return this.createErrorResult('Connect capability not supported');
        }
        try {
            this._connections.set(config.targetOperator, config);
            await this.establishConnection(config);
            return this.createSuccessResult({ connected: true, target: config.targetOperator });
        }
        catch (error) {
            return this.createErrorResult(`Connection failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    // 生命周期管理
    async start() {
        if (this._state !== OperatorTypes_1.OperatorState.IDLE) {
            throw new Error(`Operator cannot start from state: ${this._state}`);
        }
        try {
            this._state = OperatorTypes_1.OperatorState.RUNNING;
            this.emitEvent('operator_started', {
                operatorId: this._config.id,
                state: this._state
            });
            await this.initialize();
        }
        catch (error) {
            this._state = OperatorTypes_1.OperatorState.ERROR;
            this.emitEvent('operator_error', {
                operatorId: this._config.id,
                error: error.message
            });
            throw error instanceof Error ? error : new Error(String(error));
        }
    }
    async stop() {
        if (this._state === OperatorTypes_1.OperatorState.RUNNING) {
            this._state = OperatorTypes_1.OperatorState.IDLE;
            await this.cleanup();
        }
    }
    async destroy() {
        await this.stop();
        await this.cleanup();
        this._eventEmitter.removeAllListeners();
        this.emitEvent('operator_destroyed', {
            operatorId: this._config.id
        });
    }
    // 状态管理
    getState() {
        return this._state;
    }
    getConfig() {
        return { ...this._config };
    }
    getContext() {
        return { ...this._context };
    }
    // 子操作子管理
    addChildOperator(operator) {
        this._childOperators.set(operator._config.id, operator);
        if (!this._context.childOperators) {
            this._context.childOperators = [];
        }
        this._context.childOperators.push(operator._config.id);
        operator._context.parentOperator = this._config.id;
    }
    removeChildOperator(operatorId) {
        this._childOperators.delete(operatorId);
        if (this._context.childOperators) {
            this._context.childOperators = this._context.childOperators.filter(id => id !== operatorId);
        }
    }
    getChildOperator(operatorId) {
        return this._childOperators.get(operatorId);
    }
    // 事件系统
    on(event, listener) {
        this._eventEmitter.on(event, listener);
    }
    off(event, listener) {
        this._eventEmitter.off(event, listener);
    }
    once(event, listener) {
        this._eventEmitter.once(event, listener);
    }
    // 受保护的方法
    emitEvent(type, data) {
        const eventData = {
            type,
            timestamp: Date.now(),
            operatorId: this._config.id,
            data,
            source: this._config.name
        };
        this._eventEmitter.emit(type, eventData);
    }
    createSuccessResult(data) {
        return {
            success: true,
            data,
            executionTime: 0,
            state: this._state,
            metadata: {
                operatorId: this._config.id,
                timestamp: Date.now()
            }
        };
    }
    createErrorResult(error) {
        return {
            success: false,
            error,
            executionTime: 0,
            state: this._state,
            metadata: {
                operatorId: this._config.id,
                timestamp: Date.now()
            }
        };
    }
    updateContext(data) {
        this._context.timestamp = Date.now();
        Object.assign(this._context.parameters, data);
        this.emitEvent('context_updated', {
            operatorId: this._config.id,
            context: this._context
        });
    }
    addToExecutionHistory(result) {
        this._executionHistory.push(result);
        if (this._executionHistory.length > 100) {
            this._executionHistory = this._executionHistory.slice(-100);
        }
    }
    async executeWithRetry(operation, maxRetries = 3, retryDelay = 1000) {
        let lastError;
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                return await operation();
            }
            catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));
                if (attempt < maxRetries) {
                    await this.sleep(retryDelay * Math.pow(2, attempt));
                }
            }
        }
        if (lastError) {
            throw lastError;
        }
        throw new Error('Operation failed after retries');
    }
    async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    // 私有方法
    generateSessionId() {
        return `${this._config.id}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
    initializeCapabilities() {
        return {
            observe: true,
            list: true,
            operate: true,
            status: true,
            context: true,
            connect: true,
            capabilities: []
        };
    }
    async establishConnection(config) {
        // 默认连接建立逻辑，子类可以重写
        this.emitEvent('connection_established', {
            operatorId: this._config.id,
            target: config.targetOperator
        });
    }
    async handleCapabilityNotImplemented(capability) {
        return this.createErrorResult(`Capability ${capability} not implemented`);
    }
}
exports.UniversalOperator = UniversalOperator;
