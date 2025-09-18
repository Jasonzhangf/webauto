/**
 * Anthropic Transformer
 * Anthropic转换器
 *
 * 处理Anthropic API格式与统一格式之间的转换
 */

const Transformer = require('../Transformer');

class AnthropicTransformer extends Transformer {
  constructor(options = {}) {
    super({ ...options, name: 'anthropic' });
  }

  /**
   * 转换请求数据 (Anthropic格式 → 统一格式)
   * @param {Object} request Anthropic格式的请求数据
   * @returns {Object} 统一格式的请求数据
   */
  transformRequestIn(request) {
    const unifiedRequest = {
      model: request.model,
      messages: this.convertMessagesToUnified(request.messages),
      system: request.system,
      max_tokens: request.max_tokens,
      temperature: request.temperature,
      top_p: request.top_p,
      top_k: request.top_k,
      stop_sequences: request.stop_sequences,
      stream: request.stream,
      tools: request.tools ? this.convertToolsToUnified(request.tools) : undefined,
      tool_choice: request.tool_choice
    };

    // 移除undefined字段
    Object.keys(unifiedRequest).forEach(key => {
      if (unifiedRequest[key] === undefined) {
        delete unifiedRequest[key];
      }
    });

    return unifiedRequest;
  }

  /**
   * 转换响应数据 (统一格式 → Anthropic格式)
   * @param {Object} response 统一格式的响应数据
   * @returns {Object} Anthropic格式的响应数据
   */
  transformResponseOut(response) {
    const anthropicResponse = {
      id: response.id,
      type: response.object || 'message',
      role: response.choices?.[0]?.message?.role,
      content: response.choices?.[0]?.message?.content ?
        [{ type: 'text', text: response.choices[0].message.content }] : [],
      stop_reason: response.choices?.[0]?.finish_reason,
      stop_sequence: response.choices?.[0]?.stop_sequence,
      usage: response.usage ? {
        input_tokens: response.usage.prompt_tokens,
        output_tokens: response.usage.completion_tokens
      } : undefined
    };

    // 移除undefined字段
    Object.keys(anthropicResponse).forEach(key => {
      if (anthropicResponse[key] === undefined) {
        delete anthropicResponse[key];
      }
    });

    return anthropicResponse;
  }

  /**
   * 转换请求数据 (统一格式 → Anthropic格式)
   * @param {Object} request 统一格式的请求数据
   * @returns {Object} Anthropic格式的请求数据
   */
  transformRequestOut(request) {
    const anthropicRequest = {
      model: request.model,
      messages: this.convertMessagesToAnthropic(request.messages),
      system: request.system,
      max_tokens: request.max_tokens,
      temperature: request.temperature,
      top_p: request.top_p,
      top_k: request.top_k,
      stop_sequences: request.stop,
      stream: request.stream,
      tools: request.tools ? this.convertToolsToAnthropic(request.tools) : undefined,
      tool_choice: request.tool_choice
    };

    // 移除undefined字段
    Object.keys(anthropicRequest).forEach(key => {
      if (anthropicRequest[key] === undefined) {
        delete anthropicRequest[key];
      }
    });

    return anthropicRequest;
  }

  /**
   * 转换响应数据 (Anthropic格式 → 统一格式)
   * @param {Object} response Anthropic格式的响应数据
   * @returns {Object} 统一格式的响应数据
   */
  transformResponseIn(response) {
    const unifiedResponse = {
      id: response.id,
      object: response.type || 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: response.model,
      choices: [{
        index: 0,
        message: {
          role: response.role,
          content: response.content?.[0]?.text || ''
        },
        finish_reason: response.stop_reason
      }],
      usage: response.usage ? {
        prompt_tokens: response.usage.input_tokens,
        completion_tokens: response.usage.output_tokens,
        total_tokens: (response.usage.input_tokens || 0) + (response.usage.output_tokens || 0)
      } : undefined
    };

    // 移除undefined字段
    Object.keys(unifiedResponse).forEach(key => {
      if (unifiedResponse[key] === undefined) {
        delete unifiedResponse[key];
      }
    });

    return unifiedResponse;
  }

  /**
   * 转换消息格式 (Anthropic → 统一)
   * @param {Array} messages Anthropic格式的消息数组
   * @returns {Array} 统一格式的消息数组
   */
  convertMessagesToUnified(messages) {
    if (!messages || !Array.isArray(messages)) return messages;

    return messages.map(message => {
      if (message.role === 'assistant' && message.content) {
        // 处理Anthropic助手消息中的工具调用
        if (Array.isArray(message.content)) {
          const textContent = message.content.find(c => c.type === 'text');
          const toolContent = message.content.find(c => c.type === 'tool_use');

          if (toolContent) {
            return {
              role: 'assistant',
              content: textContent ? textContent.text : '',
              tool_calls: [{
                id: toolContent.id,
                type: 'function',
                function: {
                  name: toolContent.name,
                  arguments: JSON.stringify(toolContent.input)
                }
              }]
            };
          } else if (textContent) {
            return {
              role: 'assistant',
              content: textContent.text
            };
          }
        }
      }

      return message;
    });
  }

  /**
   * 转换消息格式 (统一 → Anthropic)
   * @param {Array} messages 统一格式的消息数组
   * @returns {Array} Anthropic格式的消息数组
   */
  convertMessagesToAnthropic(messages) {
    if (!messages || !Array.isArray(messages)) return messages;

    return messages.map(message => {
      if (message.role === 'assistant' && message.tool_calls) {
        // 处理统一格式中的工具调用
        const content = [];

        if (message.content) {
          content.push({
            type: 'text',
            text: message.content
          });
        }

        message.tool_calls.forEach(toolCall => {
          content.push({
            type: 'tool_use',
            id: toolCall.id,
            name: toolCall.function.name,
            input: JSON.parse(toolCall.function.arguments || '{}')
          });
        });

        return {
          role: 'assistant',
          content
        };
      }

      return message;
    });
  }

  /**
   * 转换工具格式 (Anthropic → 统一)
   * @param {Array} tools Anthropic格式的工具数组
   * @returns {Array} 统一格式的工具数组
   */
  convertToolsToUnified(tools) {
    if (!tools || !Array.isArray(tools)) return tools;

    return tools.map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.input_schema
      }
    }));
  }

  /**
   * 转换工具格式 (统一 → Anthropic)
   * @param {Array} tools 统一格式的工具数组
   * @returns {Array} Anthropic格式的工具数组
   */
  convertToolsToAnthropic(tools) {
    if (!tools || !Array.isArray(tools)) return tools;

    return tools.map(tool => ({
      name: tool.function?.name,
      description: tool.function?.description,
      input_schema: tool.function?.parameters
    })).filter(tool => tool.name); // 过滤掉无效工具
  }

  /**
   * 获取API端点
   * @returns {string} API端点
   */
  get endPoint() {
    return '/v1/messages';
  }
}

module.exports = AnthropicTransformer;