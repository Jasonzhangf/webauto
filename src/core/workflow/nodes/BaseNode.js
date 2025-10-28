// 基础节点类
class BaseNode {
    constructor() {
        this.name = 'BaseNode';
        this.description = '基础节点类';
    }

    async execute(context) {
        throw new Error('子类必须实现execute方法');
    }

    getConfigSchema() {
        return {
            type: 'object',
            properties: {},
            required: []
        };
    }

    getInputs() {
        return [];
    }

    getOutputs() {
        return [];
    }

    validateConfig(config) {
        const schema = this.getConfigSchema();
        // 简单的配置验证
        if (schema.required) {
            for (const required of schema.required) {
                if (config[required] === undefined) {
                    throw new Error(`缺少必需的配置项: ${required}`);
                }
            }
        }
        return true;
    }

    // 辅助方法
    async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // 处理模板字符串
    renderTemplate(template, variables) {
        if (typeof template !== 'string') {
            return template;
        }

        return template.replace(/\{(\w+)\}/g, (match, key) => {
            return variables.get(key, match);
        });
    }
}

export default BaseNode;