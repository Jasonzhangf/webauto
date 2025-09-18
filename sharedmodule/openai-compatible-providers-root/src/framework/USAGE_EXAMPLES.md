# 使用示例

## 动态注册外部JSON配置

```javascript
const CompatibilityManager = require('./CompatibilityManager');

// 1. 创建管理器实例
const manager = new CompatibilityManager();

// 2. 扫描并注册内置配置
manager.scanAndRegister('./config');

// 3. 注册外部配置文件
manager.registerExternalConfig('/path/to/my-provider.config.json');

// 4. 批量注册多个外部配置
const externalConfigs = [
  '/path/to/provider1.config.json',
  '/path/to/provider2.config.json',
  '/path/to/provider3.config.json'
];
manager.registerConfigs(externalConfigs);

// 5. 扫描外部目录
manager.scanAndRegister('/external/configs');

// 6. 列出所有可用的兼容性模块
manager.listAvailableModules();

// 7. 获取特定兼容性模块
const compatibility = manager.getCompatibility('my-provider');
if (compatibility) {
  console.log('Provider info:', compatibility.getProviderInfo());
}
```

## 创建自定义配置

```javascript
const CompatibilityManager = require('./CompatibilityManager');

const manager = new CompatibilityManager();

// 创建配置模板
const template = manager.createConfigTemplate({
  name: 'my-custom-provider',
  description: 'My custom AI provider',
  apiEndpoint: 'https://api.myprovider.com/v1/chat/completions'
});

// 保存到文件
const fs = require('fs');
fs.writeFileSync('my-provider.config.json', template);

// 注册新的配置
manager.registerExternalConfig('./my-provider.config.json');
```

## 验证配置文件

```javascript
const CompatibilityManager = require('./CompatibilityManager');

const manager = new CompatibilityManager();

// 验证配置文件
const validation = manager.validateConfig('./my-provider.config.json');
if (validation.valid) {
  console.log('Configuration is valid');
  // 注册配置
  manager.registerExternalConfig('./my-provider.config.json');
} else {
  console.error('Configuration validation failed:');
  validation.errors.forEach(error => console.error(`- ${error}`));
}
```

## 热重载配置

```javascript
const CompatibilityManager = require('./CompatibilityManager');

const manager = new CompatibilityManager();

// 注册配置
manager.registerExternalConfig('./my-provider.config.json');

// 修改配置文件后重新加载
if (manager.reloadModule('my-provider')) {
  console.log('Configuration reloaded successfully');
}
```

## 导出配置

```javascript
const CompatibilityManager = require('./CompatibilityManager');

const manager = new CompatibilityManager();

// 先注册一些配置
manager.scanAndRegister('./config');

// 导出所有配置到指定目录
manager.exportConfigs('./exported-configs');
```