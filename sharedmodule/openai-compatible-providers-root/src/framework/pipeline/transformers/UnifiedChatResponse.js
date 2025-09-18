/**
 * Unified Chat Response
 * 统一聊天响应格式
 *
 * 定义统一的聊天响应格式，用于不同LLM提供商之间的数据交换
 */

class UnifiedChatResponse {
  constructor(data = {}) {
    this.id = data.id || this.generateId();
    this.object = data.object || 'chat.completion';
    this.created = data.created || Math.floor(Date.now() / 1000);
    this.model = data.model;
    this.system_fingerprint = data.system_fingerprint;
    this.choices = data.choices || [];
    this.usage = data.usage;
  }

  /**
   * 生成ID
   * @returns {string} 生成的ID
   */
  generateId() {
    return `chatcmpl-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 验证响应数据
   * @returns {boolean} 验证是否通过
   */
  validate() {
    if (!this.id) {
      throw new Error('Response ID is required');
    }

    if (!this.object || !['chat.completion', 'chat.completion.chunk'].includes(this.object)) {
      throw new Error('Invalid response object type');
    }

    if (!this.created || typeof this.created !== 'number') {
      throw new Error('Invalid created timestamp');
    }

    if (!this.model) {
      throw new Error('Model is required');
    }

    if (!Array.isArray(this.choices)) {
      throw new Error('Choices must be an array');
    }

    // 验证选择项格式
    for (const choice of this.choices) {
      if (typeof choice !== 'object' || choice === null) {
        throw new Error('Invalid choice format');
      }

      if (choice.index === undefined || typeof choice.index !== 'number') {
        throw new Error('Choice index is required and must be a number');
      }

      if (!choice.message && !choice.delta) {
        throw new Error('Choice must have either message or delta');
      }

      if (choice.message) {
        if (!choice.message.role || !['system', 'user', 'assistant', 'tool'].includes(choice.message.role)) {
          throw new Error('Invalid message role');
        }

        if (choice.message.tool_calls) {
          if (!Array.isArray(choice.message.tool_calls)) {
            throw new Error('Tool calls must be an array');
          }

          for (const toolCall of choice.message.tool_calls) {
            if (!toolCall.id || !toolCall.type || toolCall.type !== 'function') {
              throw new Error('Invalid tool call format');
            }

            if (!toolCall.function || !toolCall.function.name) {
              throw new Error('Tool call function name is required');
            }
          }
        }
      }
    }

    // 验证使用情况格式
    if (this.usage) {
      if (typeof this.usage !== 'object' || this.usage === null) {
        throw new Error('Usage must be an object');
      }

      const requiredFields = ['prompt_tokens', 'completion_tokens', 'total_tokens'];
      for (const field of requiredFields) {
        if (this.usage[field] === undefined || typeof this.usage[field] !== 'number') {
          throw new Error(`Usage field ${field} is required and must be a number`);
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
   * @returns {UnifiedChatResponse} UnifiedChatResponse实例
   */
  static fromJSON(json) {
    return new UnifiedChatResponse(json);
  }

  /**
   * 克隆实例
   * @returns {UnifiedChatResponse} 克隆的实例
   */
  clone() {
    return new UnifiedChatResponse(this.toJSON());
  }

  /**
   * 合并另一个响应对象
   * @param {UnifiedChatResponse|Object} other 另一个响应对象
   * @returns {UnifiedChatResponse} 合并后的实例
   */
  merge(other) {
    const merged = this.clone();
    const otherObj = other instanceof UnifiedChatResponse ? other.toJSON() : other;

    for (const [key, value] of Object.entries(otherObj)) {
      if (value !== undefined) {
        merged[key] = value;
      }
    }

    return merged;
  }

  /**
   * 添加选择项
   * @param {Object} choice 选择项
   * @returns {UnifiedChatResponse} 当前实例
   */
  addChoice(choice) {
    if (!Array.isArray(this.choices)) {
      this.choices = [];
    }
    this.choices.push(choice);
    return this;
  }

  /**
   * 设置使用情况
   * @param {Object} usage 使用情况
   * @returns {UnifiedChatResponse} 当前实例
   */
  setUsage(usage) {
    this.usage = usage;
    return this;
  }

  /**
   * 更新时间戳
   * @returns {UnifiedChatResponse} 当前实例
   */
  updateTimestamp() {
    this.created = Math.floor(Date.now() / 1000);
    return this;
  }
}

module.exports = UnifiedChatResponse;