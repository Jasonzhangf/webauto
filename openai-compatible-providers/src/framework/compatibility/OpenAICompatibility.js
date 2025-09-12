/**
 * OpenAI Passthrough Compatibility
 * OpenAI透传兼容性实现
 *
 * 提供完全透传的OpenAI API兼容性，不做任何转换
 * 配置文件: ../config/openai-passthrough.config.json
 */

const GenericCompatibility = require('./GenericCompatibility');

class OpenAICompatibility extends GenericCompatibility {
  constructor(config) {
    super('../config/openai-passthrough.config.json');
    // 可以在这里添加OpenAI特定的配置覆盖
    if (config) {
      Object.assign(this.config, config);
    }
  }
}

module.exports = OpenAICompatibility;
