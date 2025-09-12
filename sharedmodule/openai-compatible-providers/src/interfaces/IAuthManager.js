/**
 * Auth Manager Interface
 * 认证管理器接口
 */

class IAuthManager {
  constructor(config = {}) {
    this.authType = config.authType;
    this.config = config;
  }
  
  // 抽象方法 - 由具体 Auth Manager 实现
  async authenticate() {
    throw new Error('authenticate method must be implemented by auth manager');
  }
  
  async getAuthHeaders() {
    throw new Error('getAuthHeaders method must be implemented by auth manager');
  }
  
  async refreshToken() {
    throw new Error('refreshToken method must be implemented by auth manager');
  }
}

module.exports = IAuthManager;