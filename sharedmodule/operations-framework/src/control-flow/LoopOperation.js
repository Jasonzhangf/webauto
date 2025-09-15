/**
 * 循环控制操作
 * 支持基于数组、计数器和条件的循环操作
 */

import BaseOperation from "../BaseOperation.js";

export class LoopOperation extends BaseOperation {
  constructor(config = {}) {
    super(config);
    this.name = 'LoopOperation';
    this.description = '循环控制操作，支持多种循环模式';
    this.version = '1.0.0';
  }

  /**
   * 执行循环操作
   */
  async execute(context, params = {}) {
    const { 
      operation = 'forEach', 
      loopType = 'array', // 'array', 'counter', 'conditional', 'while'
      ...loopParams 
    } = params;

    try {
      this.logger.info('Starting loop operation', { 
        operation, 
        loopType,
        loopParams 
      });

      switch (operation) {
        case 'forEach':
          return await this.executeForEach(context, loopParams);
        case 'forRange':
          return await this.executeForRange(context, loopParams);
        case 'while':
          return await this.executeWhile(context, loopParams);
        case 'doWhile':
          return await this.executeDoWhile(context, loopParams);
        case 'repeatUntil':
          return await this.executeRepeatUntil(context, loopParams);
        default:
          throw new Error(`Unknown loop operation: ${operation}`);
      }
    } catch (error) {
      this.logger.error('Loop operation failed', { 
        operation, 
        loopType, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * 数组遍历循环
   */
  async executeForEach(context, params = {}) {
    const {
      items,
      itemName = 'item',
      indexName = 'index',
      steps = [],
      maxIterations = 1000,
      breakCondition = null,
      continueCondition = null
    } = params;

    if (!Array.isArray(items)) {
      throw new Error('Items must be an array for forEach loop');
    }

    if (!steps || steps.length === 0) {
      throw new Error('Steps are required for forEach loop');
    }

    const results = [];
    const errors = [];
    let breakLoop = false;

    this.logger.info('Starting forEach loop', { 
      itemCount: items.length, 
      maxIterations,
      itemName,
      indexName 
    });

    for (let i = 0; i < items.length && !breakLoop && i < maxIterations; i++) {
      const item = items[i];
      const index = i;

      try {
        // 检查是否应该跳过本次循环
        if (continueCondition) {
          const shouldContinue = await this.evaluateCondition(
            context, 
            continueCondition, 
            { [itemName]: item, [indexName]: index }
          );
          if (shouldContinue) {
            this.logger.debug('Skipping iteration', { index, itemName });
            continue;
          }
        }

        // 检查是否应该退出循环
        if (breakCondition) {
          const shouldBreak = await this.evaluateCondition(
            context, 
            breakCondition, 
            { [itemName]: item, [indexName]: index }
          );
          if (shouldBreak) {
            this.logger.info('Breaking loop', { index, itemName });
            breakLoop = true;
            break;
          }
        }

        // 设置循环变量到上下文
        context.setVariable(itemName, item);
        context.setVariable(indexName, index);

        // 执行循环步骤
        const iterationResult = {
          index,
          [itemName]: item,
          stepResults: [],
          startTime: Date.now()
        };

        for (const step of steps) {
          const stepResult = await this.executeStep(context, step, {
            [itemName]: item,
            [indexName]: index
          });
          iterationResult.stepResults.push(stepResult);
        }

        iterationResult.endTime = Date.now();
        iterationResult.duration = iterationResult.endTime - iterationResult.startTime;
        results.push(iterationResult);

        this.logger.debug('Iteration completed', { 
          index, 
          duration: iterationResult.duration 
        });

      } catch (error) {
        this.logger.error('Iteration failed', { 
          index, 
          error: error.message 
        });
        errors.push({
          index,
          [itemName]: item,
          error: error.message
        });
      }
    }

    // 清理循环变量
    context.deleteVariable(itemName);
    context.deleteVariable(indexName);

    return {
      success: true,
      loopType: 'forEach',
      totalIterations: results.length + errors.length,
      successfulIterations: results.length,
      failedIterations: errors.length,
      results,
      errors,
      breakReason: breakLoop ? 'condition_met' : null
    };
  }

  /**
   * 计数器循环
   */
  async executeForRange(context, params = {}) {
    const {
      start = 0,
      end,
      step = 1,
      indexName = 'index',
      steps = [],
      breakCondition = null,
      continueCondition = null
    } = params;

    if (end === undefined || end === null) {
      throw new Error('End value is required for forRange loop');
    }

    if (!steps || steps.length === 0) {
      throw new Error('Steps are required for forRange loop');
    }

    const items = [];
    for (let i = start; i < end; i += step) {
      items.push(i);
    }

    // 复用forEach的逻辑
    return await this.executeForEach(context, {
      items,
      itemName: indexName,
      indexName: 'originalIndex',
      steps,
      breakCondition,
      continueCondition
    });
  }

  /**
   * While循环
   */
  async executeWhile(context, params = {}) {
    const {
      condition,
      steps = [],
      maxIterations = 1000,
      checkInterval = 1000 // 毫秒
    } = params;

    if (!condition) {
      throw new Error('Condition is required for while loop');
    }

    if (!steps || steps.length === 0) {
      throw new Error('Steps are required for while loop');
    }

    const results = [];
    const errors = [];
    let iteration = 0;
    let conditionMet = true;

    this.logger.info('Starting while loop', { 
      maxIterations,
      checkInterval 
    });

    while (conditionMet && iteration < maxIterations) {
      try {
        // 检查条件
        conditionMet = await this.evaluateCondition(context, condition, {
          iteration,
          results,
          errors
        });

        if (!conditionMet) {
          this.logger.info('Loop condition no longer met', { iteration });
          break;
        }

        // 设置循环变量
        context.setVariable('iteration', iteration);
        context.setVariable('results', results);
        context.setVariable('errors', errors);

        // 执行循环步骤
        const iterationResult = {
          iteration,
          stepResults: [],
          startTime: Date.now()
        };

        for (const step of steps) {
          const stepResult = await this.executeStep(context, step, {
            iteration,
            results,
            errors
          });
          iterationResult.stepResults.push(stepResult);
        }

        iterationResult.endTime = Date.now();
        iterationResult.duration = iterationResult.endTime - iterationResult.startTime;
        results.push(iterationResult);

        this.logger.debug('While iteration completed', { 
          iteration, 
          duration: iterationResult.duration 
        });

        iteration++;

        // 如果需要，等待间隔
        if (checkInterval > 0 && iteration < maxIterations) {
          await this.sleep(checkInterval);
        }

      } catch (error) {
        this.logger.error('While iteration failed', { 
          iteration, 
          error: error.message 
        });
        errors.push({
          iteration,
          error: error.message
        });
        iteration++;
      }
    }

    // 清理循环变量
    context.deleteVariable('iteration');
    context.deleteVariable('results');
    context.deleteVariable('errors');

    return {
      success: true,
      loopType: 'while',
      totalIterations: iteration,
      successfulIterations: results.length,
      failedIterations: errors.length,
      results,
      errors,
      breakReason: iteration >= maxIterations ? 'max_iterations_reached' : 'condition_not_met'
    };
  }

  /**
   * Do-While循环
   */
  async executeDoWhile(context, params = {}) {
    const {
      condition,
      steps = [],
      maxIterations = 1000,
      checkInterval = 1000
    } = params;

    if (!condition) {
      throw new Error('Condition is required for doWhile loop');
    }

    if (!steps || steps.length === 0) {
      throw new Error('Steps are required for doWhile loop');
    }

    const results = [];
    const errors = [];
    let iteration = 0;
    let conditionMet = true;

    this.logger.info('Starting do-while loop', { 
      maxIterations,
      checkInterval 
    });

    do {
      try {
        // 设置循环变量
        context.setVariable('iteration', iteration);
        context.setVariable('results', results);
        context.setVariable('errors', errors);

        // 执行循环步骤
        const iterationResult = {
          iteration,
          stepResults: [],
          startTime: Date.now()
        };

        for (const step of steps) {
          const stepResult = await this.executeStep(context, step, {
            iteration,
            results,
            errors
          });
          iterationResult.stepResults.push(stepResult);
        }

        iterationResult.endTime = Date.now();
        iterationResult.duration = iterationResult.endTime - iterationResult.startTime;
        results.push(iterationResult);

        this.logger.debug('Do-while iteration completed', { 
          iteration, 
          duration: iterationResult.duration 
        });

        iteration++;

        // 检查条件
        conditionMet = await this.evaluateCondition(context, condition, {
          iteration,
          results,
          errors
        });

        // 如果需要，等待间隔
        if (checkInterval > 0 && conditionMet && iteration < maxIterations) {
          await this.sleep(checkInterval);
        }

      } catch (error) {
        this.logger.error('Do-while iteration failed', { 
          iteration, 
          error: error.message 
        });
        errors.push({
          iteration,
          error: error.message
        });
        iteration++;
      }
    } while (conditionMet && iteration < maxIterations);

    // 清理循环变量
    context.deleteVariable('iteration');
    context.deleteVariable('results');
    context.deleteVariable('errors');

    return {
      success: true,
      loopType: 'doWhile',
      totalIterations: iteration,
      successfulIterations: results.length,
      failedIterations: errors.length,
      results,
      errors,
      breakReason: !conditionMet ? 'condition_not_met' : 'max_iterations_reached'
    };
  }

  /**
   * Repeat-Until循环
   */
  async executeRepeatUntil(context, params = {}) {
    const {
      condition,
      steps = [],
      maxIterations = 1000,
      checkInterval = 1000
    } = params;

    if (!condition) {
      throw new Error('Condition is required for repeatUntil loop');
    }

    if (!steps || steps.length === 0) {
      throw new Error('Steps are required for repeatUntil loop');
    }

    const results = [];
    const errors = [];
    let iteration = 0;
    let conditionMet = false;

    this.logger.info('Starting repeat-until loop', { 
      maxIterations,
      checkInterval 
    });

    do {
      try {
        // 设置循环变量
        context.setVariable('iteration', iteration);
        context.setVariable('results', results);
        context.setVariable('errors', errors);

        // 执行循环步骤
        const iterationResult = {
          iteration,
          stepResults: [],
          startTime: Date.now()
        };

        for (const step of steps) {
          const stepResult = await this.executeStep(context, step, {
            iteration,
            results,
            errors
          });
          iterationResult.stepResults.push(stepResult);
        }

        iterationResult.endTime = Date.now();
        iterationResult.duration = iterationResult.endTime - iterationResult.startTime;
        results.push(iterationResult);

        this.logger.debug('Repeat-until iteration completed', { 
          iteration, 
          duration: iterationResult.duration 
        });

        iteration++;

        // 检查条件（直到条件满足才退出）
        conditionMet = await this.evaluateCondition(context, condition, {
          iteration,
          results,
          errors
        });

        // 如果需要，等待间隔
        if (checkInterval > 0 && !conditionMet && iteration < maxIterations) {
          await this.sleep(checkInterval);
        }

      } catch (error) {
        this.logger.error('Repeat-until iteration failed', { 
          iteration, 
          error: error.message 
        });
        errors.push({
          iteration,
          error: error.message
        });
        iteration++;
      }
    } while (!conditionMet && iteration < maxIterations);

    // 清理循环变量
    context.deleteVariable('iteration');
    context.deleteVariable('results');
    context.deleteVariable('errors');

    return {
      success: true,
      loopType: 'repeatUntil',
      totalIterations: iteration,
      successfulIterations: results.length,
      failedIterations: errors.length,
      results,
      errors,
      breakReason: conditionMet ? 'condition_met' : 'max_iterations_reached'
    };
  }

  /**
   * 执行单个步骤
   */
  async executeStep(context, step, loopVariables = {}) {
    const { operation, params = step.params || {} } = step;
    
    // 合并循环变量到参数中
    const mergedParams = {
      ...params,
      ...loopVariables
    };

    // 获取操作实例
    const operationInstance = await context.getOperation(operation);
    if (!operationInstance) {
      throw new Error(`Operation not found: ${operation}`);
    }

    // 执行操作
    return await operationInstance.execute(context, mergedParams);
  }

  /**
   * 评估条件
   */
  async evaluateCondition(context, condition, variables = {}) {
    if (typeof condition === 'boolean') {
      return condition;
    }

    if (typeof condition === 'string') {
      // 简单的条件表达式评估
      try {
        // 安全的表达式评估
        const safeEval = new Function('context', 'variables', `
          "use strict";
          const { ${Object.keys(variables).join(', ')} } = variables;
          return ${condition};
        `);
        return await safeEval(context, variables);
      } catch (error) {
        this.logger.error('Condition evaluation failed', { 
          condition, 
          error: error.message 
        });
        throw error;
      }
    }

    if (typeof condition === 'function') {
      return await condition(context, variables);
    }

    throw new Error(`Unsupported condition type: ${typeof condition}`);
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
      name: this.name,
      description: this.description,
      version: this.version,
      supportedLoopTypes: ['forEach', 'forRange', 'while', 'doWhile', 'repeatUntil'],
      supportedConditionTypes: ['boolean', 'string', 'function']
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

export default LoopOperation;