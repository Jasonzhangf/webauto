/**
 * 简单的模块扫描测试
 * 用于验证ModuleScanner是否能正确检测到Provider模块
 */

const path = require('path');

// 使用本地framework路径
const frameworkPath = path.resolve(__dirname, '../../../sharedmodule/openai-compatible-providers/src');
console.log('Framework path:', frameworkPath);

// 尝试直接导入ModuleScanner
try {
  const ModuleScanner = require(path.join(frameworkPath, 'framework/ModuleScanner.js'));
  console.log('✅ ModuleScanner loaded successfully');
  
  // 创建scanner实例
  const scanner = new ModuleScanner();
  console.log('✅ ModuleScanner instance created');
  
  // 测试模块类型检测
  const testProviderPath = path.resolve(__dirname, './providers/LMStudioProvider.js');
  console.log('Testing provider path:', testProviderPath);
  
  // 动态导入LMStudioProvider
  delete require.cache[require.resolve(testProviderPath)];
  const LMStudioProvider = require(testProviderPath);
  console.log('✅ LMStudioProvider loaded');
  
  // 测试模块类型检测
  const isProvider = scanner.isModuleOfType(LMStudioProvider, 'provider');
  console.log('Is LMStudioProvider a provider?', isProvider);
  
  // 检查方法存在性
  console.log('executeChat method exists:', typeof LMStudioProvider.prototype.executeChat === 'function');
  console.log('executeStreamChat method exists:', typeof LMStudioProvider.prototype.executeStreamChat === 'function');
  
  // 测试扫描目录
  const providerDir = path.resolve(__dirname, './providers');
  console.log('Scanning directory:', providerDir);
  
  // 修复ModuleScanner的loadModule方法，传入配置
  const originalLoadModule = scanner.loadModule.bind(scanner);
  scanner.loadModule = function(modulePath, moduleType) {
    try {
      const absolutePath = path.resolve(modulePath);
      delete require.cache[require.resolve(absolutePath)];
      const Module = require(absolutePath);
      
      if (this.isModuleOfType(Module, moduleType)) {
        let instance;
        if (moduleType === 'provider') {
          // 为Provider传入配置
          instance = new Module({
            endpoint: 'http://localhost:1234/v1/chat/completions',
            apiKey: 'test-key',
            timeout: 60000
          });
        } else {
          instance = new Module();
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
  };
  
  const foundModules = scanner.scanDirectory(providerDir, 'provider');
  console.log('Found modules:', foundModules.length);
  foundModules.forEach(mod => {
    console.log(`  - ${mod.name}: ${mod.path}`);
    console.log(`    Endpoint: ${mod.instance.endpoint}`);
    console.log(`    Default model: ${mod.instance.defaultModel}`);
  });
  
} catch (error) {
  console.error('❌ Error:', error.message);
  console.error('Stack:', error.stack);
}