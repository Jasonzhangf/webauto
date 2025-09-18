/**
 * Gemini Transformer
 * Gemini转换器
 *
 * 处理Gemini API格式与统一格式之间的转换
 */

const Transformer = require('../Transformer');

class GeminiTransformer extends Transformer {
  constructor(options = {}) {
    super({ ...options, name: 'gemini' });
  }

  /**
   * 转换请求数据 (Gemini格式 → 统一格式)
   * @param {Object} request Gemini格式的请求数据
   * @returns {Object} 统一格式的请求数据
   */
  transformRequestIn(request) {
    const unifiedRequest = {
      model: this.extractModelName(request.model),
      messages: this.convertMessagesToUnified(request.contents),
      system: this.extractSystemInstruction(request.systemInstruction),
      max_tokens: request.generationConfig?.maxOutputTokens,
      temperature: request.generationConfig?.temperature,
      top_p: request.generationConfig?.topP,
      top_k: request.generationConfig?.topK,
      stop: request.generationConfig?.stopSequences,
      stream: request.stream,
      tools: request.tools ? this.convertToolsToUnified(request.tools) : undefined,
      tool_choice: request.toolConfig ? this.convertToolChoiceToUnified(request.toolConfig) : undefined
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
   * 转换响应数据 (统一格式 → Gemini格式)
   * @param {Object} response 统一格式的响应数据
   * @returns {Object} Gemini格式的响应数据
   */
  transformResponseOut(response) {
    const geminiResponse = {
      candidates: [{
        content: {
          role: response.choices?.[0]?.message?.role,
          parts: response.choices?.[0]?.message?.content ?
            [{ text: response.choices[0].message.content }] : []
        },
        finishReason: response.choices?.[0]?.finish_reason
      }],
      usageMetadata: response.usage ? {
        promptTokenCount: response.usage.prompt_tokens,
        candidatesTokenCount: response.usage.completion_tokens,
        totalTokenCount: response.usage.total_tokens
      } : undefined
    };

    // 移除undefined字段
    Object.keys(geminiResponse).forEach(key => {
      if (geminiResponse[key] === undefined) {
        delete geminiResponse[key];
      }
    });

    return geminiResponse;
  }

  /**
   * 转换请求数据 (统一格式 → Gemini格式)
   * @param {Object} request 统一格式的请求数据
   * @returns {Object} Gemini格式的请求数据
   */
  transformRequestOut(request) {
    const geminiRequest = {
      contents: this.convertMessagesToGemini(request.messages),
      systemInstruction: this.convertSystemInstructionToGemini(request.system),
      generationConfig: {
        maxOutputTokens: request.max_tokens,
        temperature: request.temperature,
        topP: request.top_p,
        topK: request.top_k,
        stopSequences: request.stop
      },
      tools: request.tools ? this.convertToolsToGemini(request.tools) : undefined,
      toolConfig: request.tool_choice ? this.convertToolChoiceToGemini(request.tool_choice) : undefined,
      stream: request.stream
    };

    // 清理generationConfig中的undefined字段
    Object.keys(geminiRequest.generationConfig).forEach(key => {
      if (geminiRequest.generationConfig[key] === undefined) {
        delete geminiRequest.generationConfig[key];
      }
    });

    // 如果generationConfig为空，删除整个对象
    if (Object.keys(geminiRequest.generationConfig).length === 0) {
      delete geminiRequest.generationConfig;
    }

    // 移除undefined字段
    Object.keys(geminiRequest).forEach(key => {
      if (geminiRequest[key] === undefined) {
        delete geminiRequest[key];
      }
    });

    return geminiRequest;
  }

  /**
   * 转换响应数据 (Gemini格式 → 统一格式)
   * @param {Object} response Gemini格式的响应数据
   * @returns {Object} 统一格式的响应数据
   */
  transformResponseIn(response) {
    const unifiedResponse = {
      id: response.id || `gemini-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: response.model,
      choices: response.candidates?.map((candidate, index) => ({
        index,
        message: {
          role: candidate.content?.role,
          content: candidate.content?.parts?.map(part => part.text).join('') || ''
        },
        finish_reason: this.convertFinishReason(candidate.finishReason)
      })) || [],
      usage: response.usageMetadata ? {
        prompt_tokens: response.usageMetadata.promptTokenCount,
        completion_tokens: response.usageMetadata.candidatesTokenCount,
        total_tokens: response.usageMetadata.totalTokenCount
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
   * 提取模型名称
   * @param {string} model 完整的模型路径
   * @returns {string} 模型名称
   */
  extractModelName(model) {
    if (!model) return model;
    // 从 models/gemini-1.5-pro-001 或类似的路径中提取模型名称
    const parts = model.split('/');
    return parts[parts.length - 1] || model;
  }

  /**
   * 转换消息格式 (Gemini → 统一)
   * @param {Array} contents Gemini格式的内容数组
   * @returns {Array} 统一格式的消息数组
   */
  convertMessagesToUnified(contents) {
    if (!contents || !Array.isArray(contents)) return contents;

    return contents.map(content => ({
      role: content.role,
      content: content.parts?.map(part => part.text).join('') || ''
    }));
  }

  /**
   * 转换消息格式 (统一 → Gemini)
   * @param {Array} messages 统一格式的消息数组
   * @returns {Array} Gemini格式的内容数组
   */
  convertMessagesToGemini(messages) {
    if (!messages || !Array.isArray(messages)) return messages;

    return messages.map(message => ({
      role: message.role,
      parts: [{ text: message.content }]
    }));
  }

  /**
   * 提取系统指令
   * @param {Object} systemInstruction Gemini格式的系统指令
   * @returns {string} 系统指令文本
   */
  extractSystemInstruction(systemInstruction) {
    if (!systemInstruction) return undefined;
    return systemInstruction.parts?.map(part => part.text).join('') || '';
  }

  /**
   * 转换系统指令 (统一 → Gemini)
   * @param {string} system 统一格式的系统指令
   * @returns {Object} Gemini格式的系统指令
   */
  convertSystemInstructionToGemini(system) {
    if (!system) return undefined;
    return {
      role: 'system',
      parts: [{ text: system }]
    };
  }

  /**
   * 转换工具格式 (Gemini → 统一)
   * @param {Array} tools Gemini格式的工具数组
   * @returns {Array} 统一格式的工具数组
   */
  convertToolsToUnified(tools) {
    if (!tools || !Array.isArray(tools)) return tools;

    return tools.map(tool => ({
      type: 'function',
      function: {
        name: tool.functionDeclarations?.[0]?.name,
        description: tool.functionDeclarations?.[0]?.description,
        parameters: tool.functionDeclarations?.[0]?.parameters
      }
    })).filter(tool => tool.function?.name);
  }

  /**
   * 转换工具格式 (统一 → Gemini)
   * @param {Array} tools 统一格式的工具数组
   * @returns {Array} Gemini格式的工具数组
   */
  convertToolsToGemini(tools) {
    if (!tools || !Array.isArray(tools)) return tools;

    return tools.map(tool => ({
      functionDeclarations: [{
        name: tool.function?.name,
        description: tool.function?.description,
        parameters: tool.function?.parameters
      }]
    }));
  }

  /**
   * 转换工具选择 (Gemini → 统一)
   * @param {Object} toolConfig Gemini格式的工具配置
   * @returns {string|Object} 统一格式的工具选择
   */
  convertToolChoiceToUnified(toolConfig) {
    if (!toolConfig || !toolConfig.functionCallingConfig) return undefined;

    const config = toolConfig.functionCallingConfig;
    if (config.mode === 'ANY') return 'auto';
    if (config.mode === 'NONE') return 'none';
    if (config.mode === 'AUTO') return 'auto';

    return 'auto';
  }

  /**
   * 转换工具选择 (统一 → Gemini)
   * @param {string|Object} toolChoice 统一格式的工具选择
   * @returns {Object} Gemini格式的工具配置
   */
  convertToolChoiceToGemini(toolChoice) {
    if (!toolChoice) return undefined;

    if (toolChoice === 'auto') {
      return { functionCallingConfig: { mode: 'AUTO' } };
    }

    if (toolChoice === 'none') {
      return { functionCallingConfig: { mode: 'NONE' } };
    }

    return { functionCallingConfig: { mode: 'ANY' } };
  }

  /**
   * 转换结束原因
   * @param {string} finishReason Gemini格式的结束原因
   * @returns {string} 统一格式的结束原因
   */
  convertFinishReason(finishReason) {
    const reasonMap = {
      'STOP': 'stop',
      'MAX_TOKENS': 'length',
      'SAFETY': 'content_filter',
      'RECITATION': 'content_filter',
      'FINISH_REASON_UNSPECIFIED': 'unknown'
    };

    return reasonMap[finishReason] || finishReason || 'unknown';
  }

  /**
   * 获取API端点
   * @returns {string} API端点
   */
  get endPoint() {
    return '/v1beta/models/';
  }
}

module.exports = GeminiTransformer;