/**
 * Provider Framework
 * Provider框架主类
 */

const { BaseModule } = require('rcc-basemodule');
const { ErrorHandlingCenter } = require('rcc-errorhandling');
const ModuleScanner = require('./ModuleScanner');

class ProviderFramework extends BaseModule {
  constructor(config = {}) {
    super({
      id: 'provider-framework',
      name: 'OpenAI Compatible Providers Framework',
      version: '1.0.0',
      type: 'provider-framework',
      ...config
    });
    
    this.errorHandler = new ErrorHandlingCenter({
      id: 'provider-framework',
      name: 'Provider Framework Error Handler'
    });
    
    this.providers = new Map();
    this.compatibilities = new Map();
    this.authManagers = new Map();
    
    // 配置模块扫描路径
    this.config = {
      providerScanPaths: ['./providers', './src/providers', '../src/modules/openai-providers/providers'],
      compatibilityScanPaths: ['./compatibility', './src/compatibility', '../src/modules/openai-providers/compatibility'],
      authScanPaths: ['./auth', './src/auth', '../src/modules/openai-providers/auth'],
      autoScan: true,
      ...config
    };
    
    // 模块扫描器
    this.moduleScanner = new ModuleScanner();
    
    if (this.config.autoScan) {
      this.scanModules();
    }
  }
  
  // 标准 OpenAI 聊天接口
  async chat(providerName, openaiRequest) {
    try {
      this.debug(`Framework processing chat request for provider: ${providerName}`);
      
      const provider = this.getProvider(providerName);
      const compatibility = this.getCompatibility(providerName);
      
      if (!provider) {
        throw new Error(`Provider not found: ${providerName}`);
      }
      
      return await provider.chat(openaiRequest, compatibility);
      
    } catch (error) {
      this.errorHandler.handleError({
        error: error,
        source: `ProviderFramework.chat`,
        severity: 'error'
      });
      throw error;
    }
  }
  
  // 标准 OpenAI 流式聊天接口
  async *streamChat(providerName, openaiRequest) {
    try {
      this.debug(`Framework processing stream chat request for provider: ${providerName}`);
      
      const provider = this.getProvider(providerName);
      const compatibility = this.getCompatibility(providerName);
      
      if (!provider) {
        throw new Error(`Provider not found: ${providerName}`);
      }
      
      for await (const response of provider.streamChat(openaiRequest, compatibility)) {
        yield response;
      }
      
    } catch (error) {
      this.errorHandler.handleError({
        error: error,
        source: `ProviderFramework.streamChat`,
        severity: 'error'
      });
      throw error;
    }
  }
  
  // 扫描模块
  scanModules() {
    this.debug('Scanning modules...');
    
    try {
      // 扫描 Provider
      if (this.config.providerScanPaths) {
        this.scanModulesByType('provider', this.config.providerScanPaths);
      }
      
      // 扫描 Compatibility
      if (this.config.compatibilityScanPaths) {
        this.scanModulesByType('compatibility', this.config.compatibilityScanPaths);
      }
      
      // 扫描 Auth
      if (this.config.authScanPaths) {
        this.scanModulesByType('auth', this.config.authScanPaths);
      }
      
      this.log('info', `Module scanning completed. Found ${this.providers.size} providers, ${this.compatibilities.size} compatibilities, ${this.authManagers.size} auth managers.`);
      
    } catch (error) {
      this.errorHandler.handleError({
        error: error,
        source: 'ProviderFramework.scanModules',
        severity: 'error'
      });
    }
  }
  
  // 按类型扫描模块
  scanModulesByType(type, scanPaths) {
    const modules = this.moduleScanner.scan(scanPaths, type);
    
    modules.forEach(module => {
      this.registerModule(type, module.name, module.instance);
    });
  }
  
  // 注册模块
  registerModule(type, name, instance) {
    switch (type) {
      case 'provider':
        this.providers.set(name, instance);
        this.log('info', `Registered provider: ${name}`);
        break;
      case 'compatibility':
        this.compatibilities.set(name, instance);
        this.log('info', `Registered compatibility: ${name}`);
        break;
      case 'auth':
        this.authManagers.set(name, instance);
        this.log('info', `Registered auth manager: ${name}`);
        break;
    }
  }
  
  // 获取 Provider
  getProvider(name) {
    return this.providers.get(name);
  }
  
  // 获取 Compatibility
  getCompatibility(name) {
    return this.compatibilities.get(name);
  }
  
  // 获取 Auth Manager
  getAuthManager(name) {
    return this.authManagers.get(name);
  }
  
  // 获取所有 Provider 信息
  getAllProviders() {
    const providerInfos = {};
    
    this.providers.forEach((provider, name) => {
      providerInfos[name] = provider.getInfo();
    });
    
    return providerInfos;
  }
  
  // 添加扫描路径
  addScanPath(type, path) {
    const configKey = `${type}ScanPaths`;
    if (this.config[configKey]) {
      this.config[configKey].push(path);
    }
    this.rescanModules();
  }
  
  // 重新扫描模块
  rescanModules() {
    this.debug('Rescanning modules...');
    this.providers.clear();
    this.compatibilities.clear();
    this.authManagers.clear();
    this.scanModules();
  }
  
  // 框架健康检查
  async healthCheck() {
    const results = {
      framework: {
        status: 'healthy',
        timestamp: new Date().toISOString()
      },
      providers: {}
    };
    
    // 检查所有 Provider
    for (const [name, provider] of this.providers) {
      try {
        results.providers[name] = await provider.healthCheck();
      } catch (error) {
        results.providers[name] = {
          status: 'unhealthy',
          error: error.message,
          timestamp: new Date().toISOString()
        };
      }
    }
    
    return results;
  }
}

module.exports = ProviderFramework;