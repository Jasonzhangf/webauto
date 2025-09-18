#!/usr/bin/env node

/**
 * Conditional Router Node
 * Routes data flow based on conditional logic
 */

const { BaseNode } = require('../base-node');

class ConditionalRouterNode extends BaseNode {
    constructor(nodeId, config) {
        super(nodeId, config);
        this.lastCondition = null;
        this.lastRoute = null;
    }

    async execute(context, params) {
        const startTime = Date.now();

        try {
            this.emit('log', { level: 'info', message: `Starting conditional router node: ${this.id}` });

            // Get inputs
            const condition = this.getInput(context, 'condition');
            if (condition === undefined || condition === null) {
                throw new Error('Condition input is required');
            }

            const inputData = this.getInput(context, 'input');

            // Evaluate condition
            const conditionResult = this.evaluateCondition(condition, context, params);
            this.lastCondition = conditionResult;

            // Determine route
            const route = conditionResult ? 'true' : 'false';
            this.lastRoute = route;

            this.emit('log', {
                level: 'info',
                message: `Condition evaluated to: ${conditionResult}, routing to ${route}`
            });

            // Set outputs based on condition
            if (conditionResult) {
                this.setOutput(context, 'true', inputData);
                this.setOutput(context, 'false', null);
            } else {
                this.setOutput(context, 'true', null);
                this.setOutput(context, 'false', inputData);
            }

            const result = {
                success: true,
                message: `Condition evaluated to ${conditionResult}, routed to ${route} output`,
                data: {
                    condition: conditionResult,
                    route: route,
                    inputData: inputData !== undefined ? 'provided' : 'not provided',
                    conditionType: typeof condition
                },
                executionTime: Date.now() - startTime
            };

            this.emit('log', { level: 'info', message: `Conditional router node completed: ${this.id}` });
            return result;

        } catch (error) {
            const errorResult = {
                success: false,
                error: error.message,
                executionTime: Date.now() - startTime
            };

            this.setOutput(context, 'true', null);
            this.setOutput(context, 'false', null);

            this.emit('log', {
                level: 'error',
                message: `Conditional router node failed: ${this.id} - ${error.message}`
            });
            return errorResult;
        }
    }

    evaluateCondition(condition, context, params) {
        // Handle different types of conditions
        if (typeof condition === 'boolean') {
            return condition;
        }

        if (typeof condition === 'number') {
            return condition !== 0;
        }

        if (typeof condition === 'string') {
            // Check if it's a variable reference
            if (condition.startsWith('${') && condition.endsWith('}')) {
                const varName = condition.slice(2, -1);
                return this.evaluateCondition(context.getVariable(varName), context, params);
            }

            // Check if it's a comparison expression
            if (condition.includes('==') || condition.includes('!=') ||
                condition.includes('>') || condition.includes('<') ||
                condition.includes('>=') || condition.includes('<=')) {
                return this.evaluateComparison(condition, context);
            }

            // String truthiness
            return condition.length > 0;
        }

        if (Array.isArray(condition)) {
            return condition.length > 0;
        }

        if (typeof condition === 'object') {
            return Object.keys(condition).length > 0;
        }

        return Boolean(condition);
    }

    evaluateComparison(expression, context) {
        try {
            // Simple comparison evaluator
            // This is a basic implementation - in production you might want to use a proper expression evaluator

            // Replace variables with their values
            let resolvedExpression = expression;
            const variableMatches = expression.match(/\$\{([^}]+)\}/g);

            if (variableMatches) {
                variableMatches.forEach(match => {
                    const varName = match.slice(2, -1);
                    const value = context.getVariable(varName);
                    resolvedExpression = resolvedExpression.replace(match, JSON.stringify(value));
                });
            }

            // Evaluate simple comparisons
            if (resolvedExpression.includes('==')) {
                const [left, right] = resolvedExpression.split('==').map(s => s.trim());
                return this.evaluateValue(left) === this.evaluateValue(right);
            }

            if (resolvedExpression.includes('!=')) {
                const [left, right] = resolvedExpression.split('!=').map(s => s.trim());
                return this.evaluateValue(left) !== this.evaluateValue(right);
            }

            if (resolvedExpression.includes('>=')) {
                const [left, right] = resolvedExpression.split('>=').map(s => s.trim());
                return Number(this.evaluateValue(left)) >= Number(this.evaluateValue(right));
            }

            if (resolvedExpression.includes('<=')) {
                const [left, right] = resolvedExpression.split('<=').map(s => s.trim());
                return Number(this.evaluateValue(left)) <= Number(this.evaluateValue(right));
            }

            if (resolvedExpression.includes('>')) {
                const [left, right] = resolvedExpression.split('>').map(s => s.trim());
                return Number(this.evaluateValue(left)) > Number(this.evaluateValue(right));
            }

            if (resolvedExpression.includes('<')) {
                const [left, right] = resolvedExpression.split('<').map(s => s.trim());
                return Number(this.evaluateValue(left)) < Number(this.evaluateValue(right));
            }

            return false;

        } catch (error) {
            this.emit('log', {
                level: 'warn',
                message: `Failed to evaluate comparison: ${expression} - ${error.message}`
            });
            return false;
        }
    }

    evaluateValue(value) {
        if (typeof value === 'string') {
            // Try to parse as JSON first
            try {
                return JSON.parse(value);
            } catch {
                // Return as string
                return value;
            }
        }
        return value;
    }

    // Method to get the last evaluation result
    getLastEvaluation() {
        return {
            condition: this.lastCondition,
            route: this.lastRoute
        };
    }

    emit(eventName, data) {
        if (this._eventHandlers && this._eventHandlers[eventName]) {
            this._eventHandlers[eventName].forEach(handler => handler(data));
        }
    }

    on(eventName, handler) {
        if (!this._eventHandlers) {
            this._eventHandlers = {};
        }
        if (!this._eventHandlers[eventName]) {
            this._eventHandlers[eventName] = [];
        }
        this._eventHandlers[eventName].push(handler);
    }
}

module.exports = ConditionalRouterNode;