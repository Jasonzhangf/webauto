/**
 * Module Scanner
 * 模块扫描器 - 用于动态扫描和加载Provider、Compatibility、Auth模块
 */

const fs = require('fs');
const path = require('path');
const { BaseModule } = require('rcc-basemodule');

class ModuleScanner extends BaseModule {
  constructor() {
    super({
      id: 'module-scanner',
      name: 'Module Scanner',
      version: '1.0.0',
      type: 'scanner'
    });
  }
  
  scan(scanPaths, moduleType) {
    const modules = [];
    
    for (const scanPath of scanPaths) {
      const foundModules = this.scanDirectory(scanPath, moduleType);
      modules.push(...foundModules);
    }
    
    this.log('info', `Scanned ${modules.length} ${moduleType} modules from paths: ${scanPaths.join(', ')}`);
    return modules;
  }
  
  scanDirectory(directory, moduleType) {
    const modules = [];
    
    if (!fs.existsSync(directory)) {
      this.debug(`Scan directory not found: ${directory}`);
      return modules;
    }
    
    const files = fs.readdirSync(directory);
    
    for (const file of files) {
      if (file.endsWith('.js')) {
        const modulePath = path.join(directory, file);
        const module = this.loadModule(modulePath, moduleType);
        if (module) {
          modules.push(module);
        }
      }
    }
    
    return modules;
  }
  
  loadModule(modulePath, moduleType, config = {}) {
    try {
      const absolutePath = path.resolve(modulePath);
      
      // 清除缓存以确保重新加载
      delete require.cache[require.resolve(absolutePath)];
      
      const Module = require(absolutePath);
      
      // 检查模块类型
      if (this.isModuleOfType(Module, moduleType)) {
        let instance;
        
        // 为不同类型的模块提供默认配置
        if (moduleType === 'provider') {
          // 让Provider自己处理默认配置，只提供基本的fallback配置
          const fallbackConfig = {
            apiKey: 'test-key',
            timeout: 60000,
            ...config
          };
          instance = new Module(fallbackConfig);
        } else {
          instance = new Module(config);
        }
        
        return {
          name: this.getModuleName(Module, modulePath),
          instance: instance,
          path: modulePath
        };
      }
    } catch (error) {
      this.error(`Failed to load module ${modulePath}: ${error.message}`);
    }
    
    return null;
  }
  
  isModuleOfType(Module, moduleType) {
    try {
      switch (moduleType) {
        case 'provider':
          // 检查是否有executeChat方法
          return typeof Module.prototype.executeChat === 'function';
        case 'compatibility':
          // 检查是否有mapRequest和mapResponse方法
          return typeof Module.prototype.mapRequest === 'function' && 
                 typeof Module.prototype.mapResponse === 'function';
        case 'auth':
          // 检查是否有authenticate和getAuthHeaders方法
          return typeof Module.prototype.authenticate === 'function' && 
                 typeof Module.prototype.getAuthHeaders === 'function';
        default:
          return false;
      }
    } catch (error) {
      return false;
    }
  }
  
  getCompatibilityInterface() {
    // 动态导入兼容性接口
    try {
      const { ICompatibility } = require('../../interfaces/ICompatibility');
      return ICompatibility;
    } catch (error) {
      // 如果接口不存在，返回一个基础接口
      class BaseCompatibility {
        constructor() {}
        mapRequest() { throw new Error('mapRequest not implemented'); }
        mapResponse() { throw new Error('mapResponse not implemented'); }
      }
      return BaseCompatibility;
    }
  }
  
  getAuthInterface() {
    // 动态导入认证接口
    try {
      const { IAuthManager } = require('../../interfaces/IAuthManager');
      return IAuthManager;
    } catch (error) {
      // 如果接口不存在，返回一个基础接口
      class BaseAuth {
        constructor() {}
        authenticate() { throw new Error('authenticate not implemented'); }
        getAuthHeaders() { throw new Error('getAuthHeaders not implemented'); }
      }
      return BaseAuth;
    }
  }
  
  getModuleName(Module, modulePath) {
    // 从文件名或类名获取模块名
    const fileName = path.basename(modulePath, '.js');
    return fileName;
  }
}

module.exports = ModuleScanner;