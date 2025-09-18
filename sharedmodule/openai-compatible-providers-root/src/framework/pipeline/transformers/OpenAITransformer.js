/**
 * OpenAI Transformer
 * OpenAI转换器
 *
 * 处理OpenAI API格式与统一格式之间的转换
 * 虽然OpenAI格式与统一格式基本一致，但仍有一些细微处理
 */

const Transformer = require('../Transformer');

class OpenAITransformer extends Transformer {
  constructor(options = {}) {
    super({ ...options, name: 'openai' });
  }

  /**
   * 转换请求数据 (OpenAI格式 → 统一格式)
   * @param {Object} request OpenAI格式的请求数据
   * @returns {Object} 统一格式的请求数据
   */
  transformRequestIn(request) {
    // OpenAI格式与统一格式基本一致，但处理一些细微差异
    const unifiedRequest = { ...request };

    // 处理特殊的模型名称映射
    if (unifiedRequest.model) {
      unifiedRequest.model = this.normalizeModelName(unifiedRequest.model);
    }

    // 处理参数默认值和范围检查
    if (unifiedRequest.temperature !== undefined) {
      // OpenAI temperature范围是0-2，确保在范围内
      unifiedRequest.temperature = Math.max(0, Math.min(2, unifiedRequest.temperature));
    }

    if (unifiedRequest.top_p !== undefined) {
      // OpenAI top_p范围是0-1，确保在范围内
      unifiedRequest.top_p = Math.max(0, Math.min(1, unifiedRequest.top_p));
    }

    // 处理工具调用格式的标准化
    if (unifiedRequest.tools) {
      unifiedRequest.tools = this.normalizeTools(unifiedRequest.tools);
    }

    // 处理消息格式的标准化
    if (unifiedRequest.messages) {
      unifiedRequest.messages = this.normalizeMessages(unifiedRequest.messages);
    }

    return unifiedRequest;
  }

  /**
   * 转换响应数据 (统一格式 → OpenAI格式)
   * @param {Object} response 统一格式的响应数据
   * @returns {Object} OpenAI格式的响应数据
   */
  transformResponseOut(response) {
    // OpenAI格式与统一格式基本一致，但可能需要调整一些字段
    const openaiResponse = { ...response };

    // 确保必要的字段存在
    if (!openaiResponse.object) {
      openaiResponse.object = 'chat.completion';
    }

    if (!openaiResponse.created) {
      openaiResponse.created = Math.floor(Date.now() / 1000);
    }

    // 处理使用情况数据格式
    if (openaiResponse.usage) {
      openaiResponse.usage = this.normalizeUsage(openaiResponse.usage);
    }

    // 处理选择项格式
    if (openaiResponse.choices) {
      openaiResponse.choices = this.normalizeChoices(openaiResponse.choices);
    }

    return openaiResponse;
  }

  /**
   * 转换请求数据 (统一格式 → OpenAI格式)
   * @param {Object} request 统一格式的请求数据
   * @returns {Object} OpenAI格式的请求数据
   */
  transformRequestOut(request) {
    // 从统一格式转换回OpenAI格式
    const openaiRequest = { ...request };

    // 处理模型名称反向映射
    if (openaiRequest.model) {
      openaiRequest.model = this.denormalizeModelName(openaiRequest.model);
    }

    return openaiRequest;
  }

  /**
   * 转换响应数据 (OpenAI格式 → 统一格式)
   * @param {Object} response OpenAI格式的响应数据
   * @returns {Object} 统一格式的响应数据
   */
  transformResponseIn(response) {
    // 从OpenAI格式转换为统一格式
    const unifiedResponse = { ...response };

    // 确保必要的字段存在
    if (!unifiedResponse.object) {
      unifiedResponse.object = 'chat.completion';
    }

    if (!unifiedResponse.created) {
      unifiedResponse.created = Math.floor(Date.now() / 1000);
    }

    return unifiedResponse;
  }

  /**
   * 标准化模型名称
   * @param {string} modelName 模型名称
   * @returns {string} 标准化后的模型名称
   */
  normalizeModelName(modelName) {
    // 可以添加模型名称的标准化逻辑
    // 例如: gpt-4-turbo-preview → gpt-4-turbo
    // 或者处理别名映射
    const modelAliases = {
      'gpt-4-turbo-preview': 'gpt-4-turbo',
      'gpt-3.5-turbo-0125': 'gpt-3.5-turbo',
      'gpt-4-0125-preview': 'gpt-4-turbo'
    };

    return modelAliases[modelName] || modelName;
  }

  /**
   * 反向标准化模型名称
   * @param {string} modelName 模型名称
   * @returns {string} 反向标准化后的模型名称
   */
  denormalizeModelName(modelName) {
    // 可以添加模型名称的反向映射逻辑
    const reverseAliases = {
      'gpt-4-turbo': 'gpt-4-turbo-preview',
      'gpt-3.5-turbo': 'gpt-3.5-turbo-0125'
    };

    return reverseAliases[modelName] || modelName;
  }

  /**
   * 标准化工具格式
   * @param {Array} tools 工具数组
   * @returns {Array} 标准化后的工具数组
   */
  normalizeTools(tools) {
    if (!Array.isArray(tools)) return tools;

    return tools.map(tool => {
      // 确保工具格式符合统一标准
      if (tool.function) {
        // 处理函数参数的标准化
        if (tool.function.parameters && typeof tool.function.parameters === 'object') {
          // 确保parameters是一个有效的JSON schema
          // 可以添加验证逻辑
        }
      }
      return tool;
    });
  }

  /**
   * 标准化消息格式
   * @param {Array} messages 消息数组
   * @returns {Array} 标准化后的消息数组
   */
  normalizeMessages(messages) {
    if (!Array.isArray(messages)) return messages;

    return messages.map(message => {
      // 确保消息格式标准
      if (message.role && message.content !== undefined) {
        // 处理内容格式
        if (typeof message.content === 'string') {
          // 字符串内容已符合标准
          return message;
        } else if (Array.isArray(message.content)) {
          // 处理多模态内容
          return {
            ...message,
            content: message.content.map(part => {
              if (typeof part === 'string') {
                return { type: 'text', text: part };
              }
              return part;
            })
          };
        }
      }
      return message;
    });
  }

  /**
   * 标准化使用情况数据
   * @param {Object} usage 使用情况数据
   * @returns {Object} 标准化后的使用情况数据
   */
  normalizeUsage(usage) {
    if (!usage) return usage;

    // 确保所有必要字段都存在
    const normalizedUsage = { ...usage };

    // 如果缺少某些字段，计算默认值
    if (normalizedUsage.prompt_tokens !== undefined &&
        normalizedUsage.completion_tokens !== undefined &&
        normalizedUsage.total_tokens === undefined) {
      normalizedUsage.total_tokens = normalizedUsage.prompt_tokens + normalizedUsage.completion_tokens;
    }

    return normalizedUsage;
  }

  /**
   * 标准化选择项
   * @param {Array} choices 选择项数组
   * @returns {Array} 标准化后的选择项数组
   */
  normalizeChoices(choices) {
    if (!Array.isArray(choices)) return choices;

    return choices.map(choice => {
      // 确保选择项格式标准
      const normalizedChoice = { ...choice };

      // 确保必要的字段存在
      if (normalizedChoice.message && !normalizedChoice.message.role) {
        normalizedChoice.message.role = 'assistant';
      }

      return normalizedChoice;
    });
  }

  /**
   * 获取API端点
   * @returns {string} API端点
   */
  get endPoint() {
    return '/v1/chat/completions';
  }
}

module.exports = OpenAITransformer;