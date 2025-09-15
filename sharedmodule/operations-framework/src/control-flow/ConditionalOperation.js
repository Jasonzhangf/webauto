/**
 * 条件控制操作
 * 支持基于各种条件的分支控制和状态检查
 */

import BaseOperation from "../BaseOperation.js";

export class ConditionalOperation extends BaseOperation {
  constructor(config = {}) {
    super(config);
    this.name = 'ConditionalOperation';
    this.description = '条件控制操作，支持多种条件判断和分支控制';
    this.version = '1.0.0';
  }

  /**
   * 执行条件操作
   */
  async execute(context, params = {}) {
    const { 
      operation = 'if', 
      conditionType = 'expression', // 'expression', 'comparison', 'exists', 'contains', 'pattern'
      ...conditionParams 
    } = params;

    try {
      this.logger.info('Starting conditional operation', { 
        operation, 
        conditionType,
        conditionParams 
      });

      switch (operation) {
        case 'if':
          return await this.executeIf(context, conditionParams);
        case 'ifElse':
          return await this.executeIfElse(context, conditionParams);
        case 'switch':
          return await this.executeSwitch(context, conditionParams);
        case 'tryCatch':
          return await this.executeTryCatch(context, conditionParams);
        case 'waitFor':
          return await this.executeWaitFor(context, conditionParams);
        case 'validate':
          return await this.executeValidate(context, conditionParams);
        default:
          throw new Error(`Unknown conditional operation: ${operation}`);
      }
    } catch (error) {
      this.logger.error('Conditional operation failed', { 
        operation, 
        conditionType, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * If条件分支
   */
  async executeIf(context, params = {}) {
    const {
      condition,
      thenSteps = [],
      elseSteps = [],
      conditionType = 'expression',
      conditionConfig = {}
    } = params;

    if (!condition) {
      throw new Error('Condition is required for if operation');
    }

    this.logger.info('Evaluating if condition', { 
      condition, 
      conditionType 
    });

    // 评估条件
    const conditionResult = await this.evaluateCondition(
      context, 
      condition, 
      conditionType, 
      conditionConfig
    );

    this.logger.info('Condition evaluation result', { 
      conditionResult,
      thenSteps: thenSteps.length,
      elseSteps: elseSteps.length
    });

    if (conditionResult) {
      // 执行then分支
      return await this.executeBranch(context, thenSteps, 'then');
    } else if (elseSteps.length > 0) {
      // 执行else分支
      return await this.executeBranch(context, elseSteps, 'else');
    }

    return {
      success: true,
      operation: 'if',
      conditionResult,
      branchExecuted: conditionResult ? 'then' : 'none',
      stepsExecuted: 0
    };
  }

  /**
   * If-Else条件分支
   */
  async executeIfElse(context, params = {}) {
    const {
      conditions = [], // 数组形式的多个条件
      defaultSteps = []
    } = params;

    if (!conditions || conditions.length === 0) {
      throw new Error('Conditions are required for ifElse operation');
    }

    this.logger.info('Evaluating if-else conditions', { 
      conditionCount: conditions.length 
    });

    for (let i = 0; i < conditions.length; i++) {
      const { condition, thenSteps = [], conditionType = 'expression', conditionConfig = {} } = conditions[i];

      const conditionResult = await this.evaluateCondition(
        context, 
        condition, 
        conditionType, 
        conditionConfig
      );

      if (conditionResult) {
        this.logger.info('Condition met', { conditionIndex: i });
        return await this.executeBranch(context, thenSteps, `condition_${i}`);
      }
    }

    // 执行默认分支
    if (defaultSteps.length > 0) {
      this.logger.info('Executing default branch');
      return await this.executeBranch(context, defaultSteps, 'default');
    }

    return {
      success: true,
      operation: 'ifElse',
      conditionsEvaluated: conditions.length,
      branchExecuted: 'none',
      stepsExecuted: 0
    };
  }

  /**
   * Switch条件分支
   */
  async executeSwitch(context, params = {}) {
    const {
      value,
      cases = [],
      defaultSteps = []
    } = params;

    if (value === undefined || value === null) {
      throw new Error('Value is required for switch operation');
    }

    if (!cases || cases.length === 0) {
      throw new Error('Cases are required for switch operation');
    }

    // 解析值
    const evaluatedValue = await this.resolveValue(context, value);
    this.logger.info('Evaluating switch', { 
      value: evaluatedValue,
      caseCount: cases.length 
    });

    // 查找匹配的case
    for (let i = 0; i < cases.length; i++) {
      const { case: caseValue, steps = [] } = cases[i];
      const caseValueResolved = await this.resolveValue(context, caseValue);

      if (this.isEqual(evaluatedValue, caseValueResolved)) {
        this.logger.info('Case matched', { 
          caseValue: caseValueResolved,
          caseIndex: i 
        });
        return await this.executeBranch(context, steps, `case_${i}`);
      }
    }

    // 执行默认分支
    if (defaultSteps.length > 0) {
      this.logger.info('Executing default case');
      return await this.executeBranch(context, defaultSteps, 'default');
    }

    return {
      success: true,
      operation: 'switch',
      value: evaluatedValue,
      casesEvaluated: cases.length,
      branchExecuted: 'none',
      stepsExecuted: 0
    };
  }

  /**
   * Try-Catch异常处理
   */
  async executeTryCatch(context, params = {}) {
    const {
      trySteps = [],
      catchSteps = [],
      finallySteps = [],
      maxRetries = 0,
      retryDelay = 1000
    } = params;

    if (!trySteps || trySteps.length === 0) {
      throw new Error('Try steps are required for tryCatch operation');
    }

    let retryCount = 0;
    let lastError = null;

    while (retryCount <= maxRetries) {
      try {
        this.logger.info('Executing try block', { 
          retryCount,
          maxRetries 
        });

        const tryResult = await this.executeBranch(context, trySteps, 'try');

        // 执行finally块
        if (finallySteps.length > 0) {
          this.logger.info('Executing finally block');
          await this.executeBranch(context, finallySteps, 'finally');
        }

        return {
          success: true,
          operation: 'tryCatch',
          retryCount,
          branchExecuted: 'try',
          tryResult,
          finallyResult: finallySteps.length > 0 ? 'executed' : 'skipped'
        };

      } catch (error) {
        lastError = error;
        this.logger.warn('Try block failed', { 
          error: error.message,
          retryCount,
          maxRetries 
        });

        // 设置错误信息到上下文
        context.setVariable('error', error);
        context.setVariable('errorMessage', error.message);
        context.setVariable('errorStack', error.stack);

        // 执行catch块
        if (catchSteps.length > 0) {
          try {
            this.logger.info('Executing catch block');
            const catchResult = await this.executeBranch(context, catchSteps, 'catch');

            // 执行finally块
            if (finallySteps.length > 0) {
              this.logger.info('Executing finally block');
              await this.executeBranch(context, finallySteps, 'finally');
            }

            return {
              success: true,
              operation: 'tryCatch',
              retryCount,
              branchExecuted: 'catch',
              error: error.message,
              catchResult,
              finallyResult: finallySteps.length > 0 ? 'executed' : 'skipped'
            };

          } catch (catchError) {
            this.logger.error('Catch block failed', { 
              error: catchError.message 
            });
            lastError = catchError;
          }
        }

        // 重试逻辑
        if (retryCount < maxRetries) {
          this.logger.info('Retrying after delay', { 
            retryCount,
            maxRetries,
            delay: retryDelay 
          });
          await this.sleep(retryDelay);
        }

        retryCount++;
      }
    }

    // 所有重试都失败，执行finally块
    if (finallySteps.length > 0) {
      try {
        this.logger.info('Executing finally block after all retries failed');
        await this.executeBranch(context, finallySteps, 'finally');
      } catch (finallyError) {
        this.logger.error('Finally block failed', { 
          error: finallyError.message 
        });
      }
    }

    throw lastError || new Error('Try-Catch operation failed');
  }

  /**
   * WaitFor等待条件
   */
  async executeWaitFor(context, params = {}) {
    const {
      condition,
      timeout = 30000, // 30秒
      interval = 1000, // 1秒
      conditionType = 'expression',
      conditionConfig = {},
      onTimeoutSteps = [],
      onSuccessSteps = []
    } = params;

    if (!condition) {
      throw new Error('Condition is required for waitFor operation');
    }

    this.logger.info('Waiting for condition', { 
      condition,
      timeout,
      interval 
    });

    const startTime = Date.now();
    let conditionMet = false;

    while (Date.now() - startTime < timeout) {
      try {
        conditionMet = await this.evaluateCondition(
          context, 
          condition, 
          conditionType, 
          conditionConfig
        );

        if (conditionMet) {
          this.logger.info('Condition met', { 
            elapsedTime: Date.now() - startTime 
          });

          // 执行成功步骤
          if (onSuccessSteps.length > 0) {
            return await this.executeBranch(context, onSuccessSteps, 'onSuccess');
          }

          return {
            success: true,
            operation: 'waitFor',
            conditionMet: true,
            elapsedTime: Date.now() - startTime,
            checksPerformed: Math.ceil((Date.now() - startTime) / interval)
          };
        }

      } catch (error) {
        this.logger.warn('Condition evaluation failed', { 
          error: error.message 
        });
      }

      // 等待间隔
      await this.sleep(interval);
    }

    // 超时处理
    this.logger.warn('WaitFor timeout', { 
      timeout,
      elapsedTime: Date.now() - startTime 
    });

    // 执行超时步骤
    if (onTimeoutSteps.length > 0) {
      return await this.executeBranch(context, onTimeoutSteps, 'onTimeout');
    }

    throw new Error(`WaitFor operation timed out after ${timeout}ms`);
  }

  /**
   * 验证操作
   */
  async executeValidate(context, params = {}) {
    const {
      validations = [],
      failFast = true,
      onValidationSuccess = [],
      onValidationFailure = []
    } = params;

    if (!validations || validations.length === 0) {
      throw new Error('Validations are required for validate operation');
    }

    this.logger.info('Executing validations', { 
      validationCount: validations.length,
      failFast 
    });

    const results = [];
    const errors = [];

    for (let i = 0; i < validations.length; i++) {
      const validation = validations[i];
      const { 
        name, 
        condition, 
        conditionType = 'expression', 
        conditionConfig = {},
        message 
      } = validation;

      try {
        const result = await this.evaluateCondition(
          context, 
          condition, 
          conditionType, 
          conditionConfig
        );

        results.push({
          name,
          result,
          message: message || (result ? 'Validation passed' : 'Validation failed')
        });

        if (!result) {
          const error = new Error(message || `Validation failed: ${name}`);
          errors.push(error);

          if (failFast) {
            this.logger.error('Validation failed (fail fast)', { 
              name, 
              error: error.message 
            });
            throw error;
          }
        }

      } catch (error) {
        results.push({
          name,
          result: false,
          error: error.message
        });
        errors.push(error);

        if (failFast) {
          this.logger.error('Validation error (fail fast)', { 
            name, 
            error: error.message 
          });
          throw error;
        }
      }
    }

    const allPassed = errors.length === 0;

    if (allPassed) {
      // 所有验证通过
      if (onValidationSuccess.length > 0) {
        return await this.executeBranch(context, onValidationSuccess, 'onValidationSuccess');
      }

      return {
        success: true,
        operation: 'validate',
        allPassed: true,
        validations: results,
        validationCount: validations.length
      };
    } else {
      // 验证失败
      if (onValidationFailure.length > 0) {
        return await this.executeBranch(context, onValidationFailure, 'onValidationFailure');
      }

      throw new Error(`Validation failed: ${errors.map(e => e.message).join(', ')}`);
    }
  }

  /**
   * 执行分支步骤
   */
  async executeBranch(context, steps, branchName) {
    if (!steps || steps.length === 0) {
      return {
        success: true,
        branch: branchName,
        stepsExecuted: 0,
        message: 'No steps to execute'
      };
    }

    this.logger.info('Executing branch', { 
      branchName,
      stepCount: steps.length 
    });

    const results = [];
    const errors = [];

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      try {
        const result = await this.executeStep(context, step);
        results.push({
          stepIndex: i,
          step: step.operation,
          result
        });
      } catch (error) {
        this.logger.error('Step failed', { 
          stepIndex: i,
          step: step.operation,
          error: error.message 
        });
        errors.push({
          stepIndex: i,
          step: step.operation,
          error: error.message
        });
        throw error; // 重新抛出错误以中断分支执行
      }
    }

    return {
      success: true,
      branch: branchName,
      stepsExecuted: results.length,
      results,
      errors
    };
  }

  /**
   * 执行单个步骤
   */
  async executeStep(context, step) {
    const { operation, params = step.params || {} } = step;
    
    // 获取操作实例
    const operationInstance = await context.getOperation(operation);
    if (!operationInstance) {
      throw new Error(`Operation not found: ${operation}`);
    }

    // 执行操作
    return await operationInstance.execute(context, params);
  }

  /**
   * 评估条件
   */
  async evaluateCondition(context, condition, type, config = {}) {
    switch (type) {
      case 'expression':
        return await this.evaluateExpression(context, condition);
      case 'comparison':
        return await this.evaluateComparison(context, condition, config);
      case 'exists':
        return await this.evaluateExists(context, condition, config);
      case 'contains':
        return await this.evaluateContains(context, condition, config);
      case 'pattern':
        return await this.evaluatePattern(context, condition, config);
      default:
        throw new Error(`Unknown condition type: ${type}`);
    }
  }

  /**
   * 评估表达式
   */
  async evaluateExpression(context, expression) {
    if (typeof expression === 'boolean') {
      return expression;
    }

    if (typeof expression === 'string') {
      try {
        const safeEval = new Function('context', `
          "use strict";
          try {
            return ${expression};
          } catch (e) {
            return false;
          }
        `);
        return await safeEval(context);
      } catch (error) {
        this.logger.error('Expression evaluation failed', { 
          expression, 
          error: error.message 
        });
        return false;
      }
    }

    if (typeof expression === 'function') {
      return await expression(context);
    }

    return !!expression;
  }

  /**
   * 评估比较条件
   */
  async evaluateComparison(context, comparison, config = {}) {
    const { left, right, operator = '===' } = config;
    
    const leftValue = await this.resolveValue(context, left);
    const rightValue = await this.resolveValue(context, right);

    switch (operator) {
      case '===':
        return leftValue === rightValue;
      case '==':
        return leftValue == rightValue;
      case '!==':
        return leftValue !== rightValue;
      case '!=':
        return leftValue != rightValue;
      case '>':
        return leftValue > rightValue;
      case '>=':
        return leftValue >= rightValue;
      case '<':
        return leftValue < rightValue;
      case '<=':
        return leftValue <= rightValue;
      default:
        throw new Error(`Unknown comparison operator: ${operator}`);
    }
  }

  /**
   * 评估存在性条件
   */
  async evaluateExists(context, path, config = {}) {
    const { checkNull = true, checkUndefined = true, checkEmpty = false } = config;
    
    const value = await this.resolveValue(context, path);
    
    if (checkUndefined && value === undefined) return false;
    if (checkNull && value === null) return false;
    if (checkEmpty && (value === '' || value === [] || value === {})) return false;
    
    return true;
  }

  /**
   * 评估包含条件
   */
  async evaluateContains(context, container, config = {}) {
    const { value, caseSensitive = false } = config;
    
    const containerValue = await this.resolveValue(context, container);
    const searchValue = await this.resolveValue(context, value);
    
    if (typeof containerValue === 'string') {
      const text1 = caseSensitive ? containerValue : containerValue.toLowerCase();
      const text2 = caseSensitive ? searchValue : searchValue.toLowerCase();
      return text1.includes(text2);
    }
    
    if (Array.isArray(containerValue)) {
      return containerValue.includes(searchValue);
    }
    
    if (typeof containerValue === 'object' && containerValue !== null) {
      return Object.values(containerValue).includes(searchValue);
    }
    
    return false;
  }

  /**
   * 评估模式匹配
   */
  async evaluatePattern(context, text, config = {}) {
    const { pattern, flags = 'i' } = config;
    
    const textValue = await this.resolveValue(context, text);
    const regex = new RegExp(pattern, flags);
    
    return regex.test(textValue);
  }

  /**
   * 解析值
   */
  async resolveValue(context, value) {
    if (typeof value === 'string' && value.startsWith('${') && value.endsWith('}')) {
      // 变量引用
      const variableName = value.slice(2, -1);
      return context.getVariable(variableName);
    }

    if (typeof value === 'function') {
      return await value(context);
    }

    return value;
  }

  /**
   * 比较两个值是否相等
   */
  isEqual(value1, value2) {
    if (value1 === value2) return true;
    if (value1 == null || value2 == null) return false;
    if (typeof value1 === 'object' && typeof value2 === 'object') {
      return JSON.stringify(value1) === JSON.stringify(value2);
    }
    return false;
  }

  /**
   * 睡眠函数
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 获取操作状态
   */
  getStatus() {
    return {
      ...this.getProcessingStats(),
      name: this.name,
      description: this.description,
      version: this.version,
      supportedOperations: ['if', 'ifElse', 'switch', 'tryCatch', 'waitFor', 'validate'],
      supportedConditionTypes: ['expression', 'comparison', 'exists', 'contains', 'pattern']
    };
  }

  /**
   * 获取处理统计信息
   */
  getProcessingStats() {
    return {
      category: 'control-flow',
      executionCount: 0,
      lastExecutionTime: null
    };
  }
}

export default ConditionalOperation;