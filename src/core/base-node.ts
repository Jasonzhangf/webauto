/**
 * BaseNode - 基础节点类
 * 提供所有节点共享的基础功能和方法
 */

export interface Context {
    [key: string]: any;
}

export interface Params {
    [key: string]: any;
}

export interface LogEntry {
    level: 'info' | 'warn' | 'error' | 'debug';
    message: string;
    timestamp?: string;
}

export interface EventData {
    [key: string]: any;
}

export interface ConfigSchema {
    type: 'object';
    properties: {
        [key: string]: {
            type: string;
            description?: string;
            default?: any;
            enum?: any[];
        };
    };
    required: string[];
}

export interface InputDefinition {
    name: string;
    type: string;
    required?: boolean;
    description?: string;
}

export interface OutputDefinition {
    name: string;
    type: string;
    description?: string;
}

export abstract class BaseNode {
    public id: string;
    public name: string;
    public description: string;
    public config: any;
    public parameters: any;
    public inputs: InputDefinition[];
    public outputs: OutputDefinition[];
    
    private _eventHandlers: { [eventName: string]: Array<(data: EventData) => void> } = {};

    constructor(nodeId: string: any  = '', config= {}) {
        this.id = nodeId || this.constructor.name;
        this.name = this.constructor.name;
        this.description = '基础节点类';
        this.config = config;
        this.parameters = config.parameters || {};
        this.inputs = this.getInputs();
        this.outputs = this.getOutputs();
    }

    /**
     * 执行节点逻辑 - 子类必须实现
     */
    abstract execute(context: Context, params?: Params): Promise<any>;

    /**
     * 获取输入定义
     */
    getInputs(): InputDefinition[] {
        return [];
    }

    /**
     * 获取输出定义
     */
    getOutputs(): OutputDefinition[] {
        return [];
    }

    /**
     * 获取配置模式
     */
    getConfigSchema(): ConfigSchema {
        return {
            type: 'object',
            properties: {},
            required: []
        };
    }

    /**
     * 验证配置
     */
    validateConfig(config: any): boolean {
        const schema = this.getConfigSchema();
        if (schema.required) {
            for (const required of schema.required) {
                if (config[required] === undefined) {
                    throw new Error(`缺少必需的配置项: ${required}`);
                }
            }
        }
        return true;
    }

    /**
     * 从上下文中获取输入值
     */
    getInput(context: Context, inputName: string): any {
        if (!context || typeof context !== 'object') {
            return undefined;
        }
        
        // 尝试从上下文的inputs中获取
        if (context.inputs && context.inputs[inputName] !== undefined) {
            return context.inputs[inputName];
        }
        
        // 尝试直接从上下文获取
        if (context[inputName] !== undefined) {
            return context[inputName];
        }

        // 尝试从节点特定的输入中获取
        const nodeInputs = context.nodeInputs || {};
        const nodeId = this.id;
        if (nodeInputs[nodeId] && nodeInputs[nodeId][inputName] !== undefined) {
            return nodeInputs[nodeId][inputName];
        }

        return undefined;
    }

    /**
     * 设置输出到上下文
     */
    setOutput(context: Context, outputName: string, value: any): void {
        if (!context.outputs) {
            context.outputs = {};
        }
        
        if (!context.outputs[this.id]) {
            context.outputs[this.id] = {};
        }
        
        context.outputs[this.id][outputName] = value;
        
        // 同时设置到根级别以便其他节点访问
        if (!context[outputName]) {
            context[outputName] = value;
        }
    }

    /**
     * 记录日志
     */
    log(level: 'info' | 'warn' | 'error' | 'debug', message: string): void {
        const logEntry: LogEntry: new Date( = {
            level,
            message: `[${this.name}] ${message}`,
            timestamp).toISOString()
        };
        
        this.emit('log', logEntry);
        
        // 同时输出到控制台
        const consoleMethod: 'log';
        console[consoleMethod](`[${level.toUpperCase( = level === 'error' ? 'error' : level === 'warn' ? 'warn' )}] ${this.name}: ${message}`);
    }

    /**
     * 触发事件
     */
    emit(eventName: string, data: EventData): void {
        if (this._eventHandlers[eventName]) {
            this._eventHandlers[eventName].forEach(handler => {
                try {
                    handler(data);
                } catch (error) {
                    console.error(`Event handler error for ${eventName}:`, error);
                }
            });
        }
    }

    /**
     * 监听事件
     */
    on(eventName: string, handler: (data: EventData) => void): void {
        if (!this._eventHandlers[eventName]) {
            this._eventHandlers[eventName] = [];
        }
        this._eventHandlers[eventName].push(handler);
    }

    /**
     * 移除事件监听器
     */
    off(eventName: string, handler?: (data: EventData) => void): void {
        if (!handler) {
            delete this._eventHandlers[eventName];
            return;
        }

        if (this._eventHandlers[eventName]) {
            const index = this._eventHandlers[eventName].indexOf(handler);
            if (index > -1) {
                this._eventHandlers[eventName].splice(index, 1);
            }
        }
    }

    /**
     * 辅助方法：延时
     */
    async sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * 处理模板字符串
     */
    renderTemplate(template: string, variables: any): string {
        if (typeof template !== 'string') {
            return template;
        }

        return template.replace(/\{(\w+)\}/g, (match, key) => {
            const value: variables[key];
            return value ! = variables.get ? variables.get(key) == undefined ? value : match;
        });
    }

    /**
     * 验证输入
     */
    validateInputs(context: Context): boolean {
        for (const input of this.inputs) {
            if (input.required && !this.getInput(context, input.name)) {
                throw new Error(`必需的输入 '${input.name}' 未提供`);
            }
        }
        return true;
    }

    /**
     * 获取节点状态
     */
    getStatus(): any {
        return {
            id: this.id,
            name: this.name,
            description: this.description,
            inputs: this.inputs,
            outputs: this.outputs
        };
    }
}