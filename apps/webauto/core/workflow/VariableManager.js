// 变量管理器 - 管理工作流执行过程中的变量
class VariableManager {
    constructor() {
        this.variables = new Map();
        this.history = [];
    }

    initialize(defaultVariables = {}) {
        this.variables.clear();
        this.history = [];

        // 初始化默认变量
        if (defaultVariables) {
            Object.keys(defaultVariables).forEach(key => {
                this.set(key, defaultVariables[key]);
            });
        }
    }

    set(key, value) {
        const oldValue = this.variables.get(key);
        this.variables.set(key, value);

        // 记录历史
        this.history.push({
            timestamp: new Date().toISOString(),
            action: 'set',
            key: key,
            oldValue: oldValue,
            newValue: value
        });
    }

    get(key, defaultValue = null) {
        return this.variables.has(key) ? this.variables.get(key) : defaultValue;
    }

    has(key) {
        return this.variables.has(key);
    }

    delete(key) {
        const value = this.variables.get(key);
        this.variables.delete(key);

        // 记录历史
        this.history.push({
            timestamp: new Date().toISOString(),
            action: 'delete',
            key: key,
            value: value
        });
    }

    getAll() {
        return Object.fromEntries(this.variables);
    }

    clear() {
        this.variables.clear();
        this.history.push({
            timestamp: new Date().toISOString(),
            action: 'clear',
            message: 'All variables cleared'
        });
    }

    getHistory() {
        return this.history;
    }

    // 模板字符串替换
    renderTemplate(template) {
        if (typeof template !== 'string') {
            return template;
        }

        return template.replace(/\{(\w+)\}/g, (match, key) => {
            return this.get(key, match);
        });
    }

    // 批量设置变量
    setMultiple(variables) {
        Object.keys(variables).forEach(key => {
            this.set(key, variables[key]);
        });
    }

    // 获取变量统计信息
    getStats() {
        return {
            totalVariables: this.variables.size,
            totalOperations: this.history.length,
            lastUpdated: this.history.length > 0 ? this.history[this.history.length - 1].timestamp : null
        };
    }
}

export default VariableManager;