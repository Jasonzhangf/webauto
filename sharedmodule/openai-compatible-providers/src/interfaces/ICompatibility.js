/**
 * Compatibility Interface
 * 兼容性接口
 */

class ICompatibility {
  constructor(config = {}) {
    this.providerName = config.providerName;
    this.fieldMappings = config.fieldMappings || {};
  }
  
  // 抽象方法 - 由具体 Compatibility 实现
  mapRequest(openaiRequest) {
    throw new Error('mapRequest method must be implemented by compatibility');
  }
  
  mapResponse(providerResponse) {
    throw new Error('mapResponse method must be implemented by compatibility');
  }
  
  // 获取兼容性配置
  getConfig() {
    return {
      providerName: this.providerName,
      fieldMappings: this.fieldMappings
    };
  }
}

module.exports = ICompatibility;