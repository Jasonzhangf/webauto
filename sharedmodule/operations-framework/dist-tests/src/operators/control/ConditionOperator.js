/**
 * WebAuto Operator Framework - 条件操作子
 * @package @webauto/operator-framework
 */
import { NonPageOperator } from '../../core/NonPageOperator';
import { OperatorCategory, OperatorType } from '../../core/types/OperatorTypes';
export class ConditionOperator extends NonPageOperator {
    constructor(config = {}) {
        super({
            id: 'condition-operator',
            name: '条件操作子',
            type: OperatorType.NON_PAGE,
            category: OperatorCategory.CONTROL,
            description: '执行条件判断和逻辑比较操作',
            requireInitialization: false,
            asyncSupported: true,
            maxConcurrency: 10,
            ...config
        });
        this._evaluationHistory = [];
    }
    async executeNonPageOperation(params) {
        try {
            const result = await this.evaluateCondition(params);
            this._evaluationHistory.push(result);
            return this.createSuccessResult({
                condition: result,
                passed: result.result,
                expression: params.expression
            });
        }
        catch (error) {
            return this.createErrorResult(`条件评估失败: ${error.message}`);
        }
    }
    validateParams(params) {
        if (!params.expression) {
            return false;
        }
        if (params.operator && !this.isValidOperator(params.operator)) {
            return false;
        }
        return true;
    }
    // 核心条件评估方法
    async evaluateCondition(params) {
        const { expression, data = {}, operator = 'equals', expectedValue, path } = params;
        // 获取实际值
        let actualValue;
        if (path) {
            actualValue = this.getValueByPath(data, path);
        }
        else {
            actualValue = data[expression] ?? expression;
        }
        // 执行比较
        const result = this.compareValues(actualValue, expectedValue, operator);
        const conditionResult = {
            expression,
            result: result.passed,
            details: {
                actualValue,
                expectedValue,
                operator,
                comparison: result.comparison
            }
        };
        return conditionResult;
    }
    // 比较操作
    compareValues(actual, expected, operator) {
        switch (operator) {
            case 'equals':
                return {
                    passed: actual === expected,
                    comparison: `${actual} === ${expected}`
                };
            case 'not_equals':
                return {
                    passed: actual !== expected,
                    comparison: `${actual} !== ${expected}`
                };
            case 'greater_than':
                return {
                    passed: Number(actual) > Number(expected),
                    comparison: `${actual} > ${expected}`
                };
            case 'less_than':
                return {
                    passed: Number(actual) < Number(expected),
                    comparison: `${actual} < ${expected}`
                };
            case 'contains':
                return {
                    passed: String(actual).includes(String(expected)),
                    comparison: `"${actual}" includes "${expected}"`
                };
            case 'not_contains':
                return {
                    passed: !String(actual).includes(String(expected)),
                    comparison: `"${actual}" not includes "${expected}"`
                };
            case 'exists':
                return {
                    passed: actual !== undefined && actual !== null,
                    comparison: `${actual} exists`
                };
            case 'not_exists':
                return {
                    passed: actual === undefined || actual === null,
                    comparison: `${actual} not exists`
                };
            default:
                return {
                    passed: false,
                    comparison: `Unknown operator: ${operator}`
                };
        }
    }
    // 路径解析
    getValueByPath(obj, path) {
        const keys = path.split('.');
        let current = obj;
        for (const key of keys) {
            if (current === null || current === undefined) {
                return undefined;
            }
            current = current[key];
        }
        return current;
    }
    // 验证操作符
    isValidOperator(operator) {
        const validOperators = ['equals', 'not_equals', 'greater_than', 'less_than', 'contains', 'not_contains', 'exists', 'not_exists'];
        return validOperators.includes(operator);
    }
    // 扩展方法
    async evaluateMultipleConditions(params) {
        try {
            const { conditions, logic = 'AND' } = params;
            const results = [];
            for (const condition of conditions) {
                const result = await this.evaluateCondition(condition);
                results.push(result);
                // 优化：如果是AND逻辑，一旦遇到失败就可以提前返回
                if (logic === 'AND' && !result.result) {
                    return this.createSuccessResult({
                        logic,
                        passed: false,
                        results,
                        failedAt: conditions.indexOf(condition)
                    });
                }
                // 优化：如果是OR逻辑，一旦遇到成功就可以提前返回
                if (logic === 'OR' && result.result) {
                    return this.createSuccessResult({
                        logic,
                        passed: true,
                        results,
                        succeededAt: conditions.indexOf(condition)
                    });
                }
            }
            // 全部评估完成
            const passed = logic === 'AND' ? results.every(r => r.result) : results.some(r => r.result);
            return this.createSuccessResult({
                logic,
                passed,
                results
            });
        }
        catch (error) {
            return this.createErrorResult(`批量条件评估失败: ${error.message}`);
        }
    }
    async evaluateComplexCondition(params) {
        try {
            const { expression, data } = params;
            // 简单的表达式求值（注意：实际生产环境需要更安全的表达式求值器）
            const result = this.evaluateExpression(expression, data);
            return this.createSuccessResult({
                expression,
                result,
                passed: result
            });
        }
        catch (error) {
            return this.createErrorResult(`复杂条件评估失败: ${error.message}`);
        }
    }
    async checkRange(params) {
        try {
            const { value, min, max, inclusive = true } = params;
            if (min !== undefined && max !== undefined) {
                const passed = inclusive ? value >= min && value <= max : value > min && value < max;
                return this.createSuccessResult({
                    value,
                    range: { min, max, inclusive },
                    passed,
                    comparison: `${value} ${inclusive ? 'in' : 'in'} [${min}, ${max}]`
                });
            }
            else if (min !== undefined) {
                const passed = inclusive ? value >= min : value > min;
                return this.createSuccessResult({
                    value,
                    min,
                    passed,
                    comparison: `${value} ${inclusive ? '>=' : '>'} ${min}`
                });
            }
            else if (max !== undefined) {
                const passed = inclusive ? value <= max : value < max;
                return this.createSuccessResult({
                    value,
                    max,
                    passed,
                    comparison: `${value} ${inclusive ? '<=' : '<'} ${max}`
                });
            }
            else {
                return this.createErrorResult('范围检查必须指定min或max');
            }
        }
        catch (error) {
            return this.createErrorResult(`范围检查失败: ${error.message}`);
        }
    }
    async checkPattern(params) {
        try {
            const { value, pattern, flags } = params;
            const regex = new RegExp(pattern, flags);
            const passed = regex.test(value);
            return this.createSuccessResult({
                value,
                pattern,
                flags,
                passed,
                comparison: `"${value}" matches ${pattern}`
            });
        }
        catch (error) {
            return this.createErrorResult(`模式匹配失败: ${error.message}`);
        }
    }
    async checkType(params) {
        try {
            const { value, expectedType } = params;
            const actualType = this.getValueType(value);
            const passed = actualType === expectedType;
            return this.createSuccessResult({
                value,
                expectedType,
                actualType,
                passed,
                comparison: `typeof ${value} is ${actualType}`
            });
        }
        catch (error) {
            return this.createErrorResult(`类型检查失败: ${error.message}`);
        }
    }
    async evaluateWithTimeout(params) {
        try {
            const { timeout, ...conditionParams } = params;
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('条件评估超时')), timeout);
            });
            const conditionPromise = this.evaluateCondition(conditionParams);
            const result = await Promise.race([conditionPromise, timeoutPromise]);
            return this.createSuccessResult({
                condition: result,
                passed: result.result,
                timeout: false
            });
        }
        catch (error) {
            if (error.message === '条件评估超时') {
                return this.createSuccessResult({
                    timeout: true,
                    passed: false,
                    error: error.message
                });
            }
            return this.createErrorResult(`超时条件评估失败: ${error.message}`);
        }
    }
    // 工具方法
    evaluateExpression(expression, data) {
        // 安全的表达式求值（简化版本）
        // 注意：生产环境应该使用更安全的表达式求值器
        try {
            // 替换数据占位符
            let evalExpression = expression;
            Object.entries(data).forEach(([key, value]) => {
                evalExpression = evalExpression.replace(new RegExp(`\\${key}`, 'g'), JSON.stringify(value));
            });
            // 简单的逻辑表达式支持
            if (evalExpression.includes('&&')) {
                const parts = evalExpression.split('&&').map(p => p.trim());
                return parts.every(part => this.evaluateSimpleExpression(part, data));
            }
            if (evalExpression.includes('||')) {
                const parts = evalExpression.split('||').map(p => p.trim());
                return parts.some(part => this.evaluateSimpleExpression(part, data));
            }
            return this.evaluateSimpleExpression(evalExpression, data);
        }
        catch (error) {
            throw new Error(`表达式求值失败: ${error.message}`);
        }
    }
    evaluateSimpleExpression(expression, data) {
        // 简单比较表达式
        const operators = ['===', '==', '!==', '!=', '>=', '<=', '>', '<'];
        for (const op of operators) {
            if (expression.includes(op)) {
                const [left, right] = expression.split(op).map(s => s.trim());
                const leftValue = this.parseValue(left, data);
                const rightValue = this.parseValue(right, data);
                switch (op) {
                    case '===': return leftValue === rightValue;
                    case '==': return leftValue == rightValue;
                    case '!==': return leftValue !== rightValue;
                    case '!=': return leftValue != rightValue;
                    case '>=': return Number(leftValue) >= Number(rightValue);
                    case '<=': return Number(leftValue) <= Number(rightValue);
                    case '>': return Number(leftValue) > Number(rightValue);
                    case '<': return Number(leftValue) < Number(rightValue);
                }
            }
        }
        // 布尔值表达式
        if (expression === 'true')
            return true;
        if (expression === 'false')
            return false;
        // 变量存在性检查
        return expression in data;
    }
    parseValue(value, data) {
        // 去除引号
        if (value.startsWith('"') && value.endsWith('"')) {
            return value.slice(1, -1);
        }
        if (value.startsWith("'") && value.endsWith("'")) {
            return value.slice(1, -1);
        }
        // 数字
        if (!isNaN(Number(value))) {
            return Number(value);
        }
        // 布尔值
        if (value === 'true')
            return true;
        if (value === 'false')
            return false;
        // 变量引用
        if (data.hasOwnProperty(value)) {
            return data[value];
        }
        return value;
    }
    getValueType(value) {
        if (value === null)
            return 'null';
        if (value === undefined)
            return 'undefined';
        return typeof value;
    }
    // 查询方法
    async getEvaluationHistory(limit) {
        try {
            const history = limit ? this._evaluationHistory.slice(-limit) : [...this._evaluationHistory];
            return this.createSuccessResult({
                history,
                total: this._evaluationHistory.length,
                limit
            });
        }
        catch (error) {
            return this.createErrorResult(`获取评估历史失败: ${error.message}`);
        }
    }
    async clearHistory() {
        try {
            const count = this._evaluationHistory.length;
            this._evaluationHistory = [];
            return this.createSuccessResult({
                cleared: true,
                count
            });
        }
        catch (error) {
            return this.createErrorResult(`清除历史失败: ${error.message}`);
        }
    }
    async getStats() {
        try {
            const total = this._evaluationHistory.length;
            const passed = this._evaluationHistory.filter(r => r.result).length;
            const failed = total - passed;
            return this.createSuccessResult({
                total,
                passed,
                failed,
                successRate: total > 0 ? (passed / total) * 100 : 0
            });
        }
        catch (error) {
            return this.createErrorResult(`获取统计信息失败: ${error.message}`);
        }
    }
}
//# sourceMappingURL=ConditionOperator.js.map