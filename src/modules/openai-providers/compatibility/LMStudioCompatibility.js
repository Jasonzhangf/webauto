/**
 * LMStudio Compatibility
 * LMStudio兼容性实现
 * 
 * 使用通用配置驱动的兼容性实现
 * 配置文件: ../config/lmstudio-compatibility.config.json
 */

const GenericCompatibility = require('./GenericCompatibility');

class LMStudioCompatibility extends GenericCompatibility {
  constructor(config) {
    super('../config/lmstudio-compatibility.config.json');
    // 可以在这里添加LMStudio特定的配置覆盖
    if (config) {
      Object.assign(this.config, config);
    }
  }
}

module.exports = LMStudioCompatibility;