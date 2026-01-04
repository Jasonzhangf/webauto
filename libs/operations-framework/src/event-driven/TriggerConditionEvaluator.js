/**
 * 触发条件评估器
 * 负责评估各种触发条件是否满足
 */
export class TriggerConditionEvaluator {
    variableManager;
    constructor(variableManager) {
        this.variableManager = variableManager;
    }
    /**
     * 评估条件是否满足
     * @param condition 触发条件
     * @param context 评估上下文
     */
    evaluate(condition, context) {
        switch (condition.type) {
            case 'variable':
                return this.evaluateVariableCondition(condition, context);
            case 'expression':
                return this.evaluateExpressionCondition(condition, context);
            case 'message':
                return this.evaluateMessageCondition(condition, context);
            case 'composite':
                return this.evaluateCompositeCondition(condition, context);
            default:
                console.warn(`[TriggerConditionEvaluator] Unknown condition type: ${condition.type}`);
                return false;
        }
    }
    /**
     * 评估变量条件
     */
    evaluateVariableCondition(condition, context) {
        const scope = condition.scope || 'local';
        let targetContainerId = context.containerId;
        if (scope === 'root') {
            if (!context.rootContainerId) {
                console.warn('[TriggerConditionEvaluator] Root container ID missing for root variable condition');
                return false;
            }
            targetContainerId = context.rootContainerId;
        }
        const actualValue = this.variableManager.getVariable(targetContainerId, condition.variableName);
        return this.compareValues(actualValue, condition.operator, condition.value);
    }
    /**
     * 评估表达式条件
     */
    evaluateExpressionCondition(condition, context) {
        try {
            // 准备表达式执行上下文
            const localVars = this.variableManager.getAllVariables(context.containerId);
            const rootVars = context.rootContainerId ?
                this.variableManager.getAllVariables(context.rootContainerId) : {};
            const message = context.message || null;
            // 创建安全的执行函数
            // 注意：这里使用 Function 构造函数有潜在安全风险，但在受控环境（如 Sandbox）中可控
            // 实际生产中可能需要更安全的表达式解析器
            const executor = new Function('vars', 'root', 'msg', `return ${condition.expression}`);
            return !!executor(localVars, rootVars, message);
        }
        catch (error) {
            console.error('[TriggerConditionEvaluator] Expression evaluation error:', error);
            return false;
        }
    }
    /**
     * 评估消息条件
     */
    evaluateMessageCondition(condition, context) {
        // 如果上下文中没有消息，则消息条件不满足
        if (!context.message) {
            return false;
        }
        // 检查消息名称匹配（支持简单通配符 *）
        if (!this.matchMessageName(condition.messageName, context.message.name)) {
            return false;
        }
        // 检查载荷过滤条件
        if (condition.payloadFilter) {
            return this.matchPayload(condition.payloadFilter, context.message.payload);
        }
        return true;
    }
    /**
     * 评估组合条件
     */
    evaluateCompositeCondition(condition, context) {
        if (!condition.conditions || condition.conditions.length === 0) {
            return true; // 空组合条件默认为真？或者视具体业务逻辑而定
        }
        switch (condition.operator) {
            case 'and':
                return condition.conditions.every(c => this.evaluate(c, context));
            case 'or':
                return condition.conditions.some(c => this.evaluate(c, context));
            case 'not':
                // not 操作符通常只带一个子条件
                return !this.evaluate(condition.conditions[0], context);
            default:
                return false;
        }
    }
    /**
     * 比较值
     */
    compareValues(actual, operator, expected) {
        switch (operator) {
            case 'eq':
                return actual == expected; // 宽松相等
            case 'neq':
                return actual != expected;
            case 'gt':
                return Number(actual) > Number(expected);
            case 'gte':
                return Number(actual) >= Number(expected);
            case 'lt':
                return Number(actual) < Number(expected);
            case 'lte':
                return Number(actual) <= Number(expected);
            case 'contains':
                return String(actual).includes(String(expected));
            case 'notContains':
                return !String(actual).includes(String(expected));
            case 'startsWith':
                return String(actual).startsWith(String(expected));
            case 'endsWith':
                return String(actual).endsWith(String(expected));
            case 'matches':
                return new RegExp(String(expected)).test(String(actual));
            case 'in':
                return Array.isArray(expected) && expected.includes(actual);
            case 'notIn':
                return Array.isArray(expected) && !expected.includes(actual);
            case 'isNull':
                return actual === null || actual === undefined;
            case 'isNotNull':
                return actual !== null && actual !== undefined;
            default:
                return false;
        }
    }
    /**
     * 匹配消息名称（支持通配符）
     */
    matchMessageName(pattern, actual) {
        if (pattern === actual)
            return true;
        if (pattern === '*')
            return true;
        // 简单的通配符支持：MSG_CONTAINER_*
        if (pattern.endsWith('*')) {
            const prefix = pattern.slice(0, -1);
            return actual.startsWith(prefix);
        }
        return false;
    }
    /**
     * 匹配消息载荷
     */
    matchPayload(filter, payload) {
        if (!payload)
            return false;
        for (const [key, expectedValue] of Object.entries(filter)) {
            if (payload[key] != expectedValue) { // 宽松相等
                return false;
            }
        }
        return true;
    }
}
