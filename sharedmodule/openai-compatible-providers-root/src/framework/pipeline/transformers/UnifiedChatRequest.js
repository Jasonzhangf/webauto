/**
 * Unified Chat Request
 * 统一聊天请求格式
 *
 * 定义统一的聊天请求格式，用于不同LLM提供商之间的数据交换
 */

class UnifiedChatRequest {
  constructor(data = {}) {
    this.model = data.model;
    this.messages = data.messages || [];
    this.system = data.system;
    this.max_tokens = data.max_tokens;
    this.temperature = data.temperature;
    this.top_p = data.top_p;
    this.top_k = data.top_k;
    this.frequency_penalty = data.frequency_penalty;
    this.presence_penalty = data.presence_penalty;
    this.stop = data.stop;
    this.stream = data.stream;
    this.tools = data.tools;
    this.tool_choice = data.tool_choice;
    this.response_format = data.response_format;
    this.seed = data.seed;
  }

  /**
   * 验证请求数据
   * @returns {boolean} 验证是否通过
   */
  validate() {
    if (!this.model) {
      throw new Error('Model is required');
    }

    if (!Array.isArray(this.messages)) {
      throw new Error('Messages must be an array');
    }

    // 验证消息格式
    for (const message of this.messages) {
      if (!message.role || !['system', 'user', 'assistant', 'tool'].includes(message.role)) {
        throw new Error('Invalid message role');
      }

      if (message.role === 'assistant' && message.tool_calls) {
        if (!Array.isArray(message.tool_calls)) {
          throw new Error('Tool calls must be an array');
        }

        for (const toolCall of message.tool_calls) {
          if (!toolCall.id || !toolCall.type || toolCall.type !== 'function') {
            throw new Error('Invalid tool call format');
          }

          if (!toolCall.function || !toolCall.function.name) {
            throw new Error('Tool call function name is required');
          }
        }
      }
    }

    // 验证工具格式
    if (this.tools) {
      if (!Array.isArray(this.tools)) {
        throw new Error('Tools must be an array');
      }

      for (const tool of this.tools) {
        if (!tool.type || tool.type !== 'function') {
          throw new Error('Tool type must be function');
        }

        if (!tool.function || !tool.function.name) {
          throw new Error('Tool function name is required');
        }
      }
    }

    return true;
  }

  /**
   * 转换为JSON对象
   * @returns {Object} JSON对象
   */
  toJSON() {
    const obj = {};

    // 只包含已定义的字段
    for (const [key, value] of Object.entries(this)) {
      if (value !== undefined) {
        obj[key] = value;
      }
    }

    return obj;
  }

  /**
   * 从JSON对象创建实例
   * @param {Object} json JSON对象
   * @returns {UnifiedChatRequest} UnifiedChatRequest实例
   */
  static fromJSON(json) {
    return new UnifiedChatRequest(json);
  }

  /**
   * 克隆实例
   * @returns {UnifiedChatRequest} 克隆的实例
   */
  clone() {
    return new UnifiedChatRequest(this.toJSON());
  }

  /**
   * 合并另一个请求对象
   * @param {UnifiedChatRequest|Object} other 另一个请求对象
   * @returns {UnifiedChatRequest} 合并后的实例
   */
  merge(other) {
    const merged = this.clone();
    const otherObj = other instanceof UnifiedChatRequest ? other.toJSON() : other;

    for (const [key, value] of Object.entries(otherObj)) {
      if (value !== undefined) {
        merged[key] = value;
      }
    }

    return merged;
  }
}

module.exports = UnifiedChatRequest;