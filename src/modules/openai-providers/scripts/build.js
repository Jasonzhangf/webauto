#!/usr/bin/env node

/**
 * Providers Collection Build Script
 * Provider集合构建脚本
 */

const fs = require('fs');
const path = require('path');

console.log('🔨 Building OpenAI Providers Collection...');

try {
  // 检查必要目录和文件
  const requiredDirs = ['providers', 'compatibility', 'tests', 'config'];
  const requiredFiles = [
    'providers/LMStudioProvider.js',
    'providers/iFlowProvider.js',
    'compatibility/LMStudioCompatibility.js',
    'compatibility/iFlowCompatibility.js',
    'tests/tool-calling-test.js',
    'config/example.config.js'
  ];

  const missingDirs = [];
  const missingFiles = [];

  for (const dir of requiredDirs) {
    const dirPath = path.resolve(__dirname, '..', dir);
    if (!fs.existsSync(dirPath)) {
      missingDirs.push(dir);
    }
  }

  for (const file of requiredFiles) {
    const filePath = path.resolve(__dirname, '..', file);
    if (!fs.existsSync(filePath)) {
      missingFiles.push(file);
    }
  }

  if (missingDirs.length > 0 || missingFiles.length > 0) {
    console.error('❌ Missing required items:');
    if (missingDirs.length > 0) {
      console.error('  Directories:', missingDirs.join(', '));
    }
    if (missingFiles.length > 0) {
      console.error('  Files:', missingFiles.join(', '));
    }
    process.exit(1);
  }

  // 检查依赖
  const packageJson = require('../package.json');
  const dependencies = Object.keys(packageJson.dependencies || {});
  
  console.log('📦 Checking dependencies...');
  for (const dep of dependencies) {
    try {
      require.resolve(dep);
    } catch (error) {
      console.error(`❌ Missing dependency: ${dep}`);
      console.error('   Run: npm install');
      process.exit(1);
    }
  }

  // 创建dist目录
  const distDir = path.resolve(__dirname, '../dist');
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }

  // 验证Provider实现
  console.log('🔍 Validating provider implementations...');
  
  const providersPath = path.resolve(__dirname, '../providers');
  const providerFiles = fs.readdirSync(providersPath).filter(f => f.endsWith('Provider.js'));
  
  for (const providerFile of providerFiles) {
    const providerPath = path.join(providersPath, providerFile);
    const ProviderClass = require(providerPath);
    
    // 检查必需的方法
    const requiredMethods = ['executeChat', 'executeStreamChat', 'getCapabilities', 'healthCheck'];
    
    for (const method of requiredMethods) {
      if (typeof ProviderClass.prototype[method] !== 'function') {
        console.error(`❌ ${providerFile}: Missing method ${method}`);
        process.exit(1);
      }
    }
    
    console.log(`✅ ${providerFile} validated`);
  }

  // 验证Compatibility实现
  console.log('🔍 Validating compatibility implementations...');
  
  const compatibilityPath = path.resolve(__dirname, '../compatibility');
  const compatibilityFiles = fs.readdirSync(compatibilityPath).filter(f => f.endsWith('Compatibility.js'));
  
  for (const compatFile of compatibilityFiles) {
    const compatPath = path.join(compatibilityPath, compatFile);
    const CompatibilityClass = require(compatPath);
    
    // 检查必需的方法
    const requiredMethods = ['mapRequest', 'mapResponse'];
    
    for (const method of requiredMethods) {
      if (typeof CompatibilityClass.prototype[method] !== 'function') {
        console.error(`❌ ${compatFile}: Missing method ${method}`);
        process.exit(1);
      }
    }
    
    console.log(`✅ ${compatFile} validated`);
  }

  // 创建index.js导出文件
  console.log('📝 Creating index.js...');
  const indexContent = `/**
 * OpenAI Providers Collection
 * OpenAI兼容Provider集合
 */

// 导出Provider实现
const LMStudioProvider = require('../providers/LMStudioProvider.js');
const iFlowProvider = require('../providers/iFlowProvider.js');

// 导出Compatibility实现
const LMStudioCompatibility = require('../compatibility/LMStudioCompatibility.js');
const iFlowCompatibility = require('../compatibility/iFlowCompatibility.js');

// 导出测试工具
const testUtils = require('../tests/tool-calling-test.js');

module.exports = {
  // Providers
  LMStudioProvider,
  iFlowProvider,
  
  // Compatibility layers
  LMStudioCompatibility,
  iFlowCompatibility,
  
  // Test utilities
  testUtils,
  
  // Provider factory function
  createProvider: function(name, config) {
    switch (name.toLowerCase()) {
      case 'lmstudio':
      case 'lm-studio':
        return new LMStudioProvider(config);
      case 'iflow':
        return new iFlowProvider(config);
      default:
        throw new Error(\`Unknown provider: \${name}\`);
    }
  },
  
  // Compatibility factory function
  createCompatibility: function(name, config) {
    switch (name.toLowerCase()) {
      case 'lmstudio':
      case 'lm-studio':
        return new LMStudioCompatibility(config);
      case 'iflow':
        return new iFlowCompatibility(config);
      default:
        throw new Error(\`Unknown compatibility: \${name}\`);
    }
  },
  
  // Helper function to setup framework with all providers
  setupFramework: function(framework, config = {}) {
    // Register providers
    try {
      const lmstudioProvider = new LMStudioProvider(config.lmstudio || {});
      const iflowProvider = new iFlowProvider(config.iflow || {});
      
      framework.registerProvider('LMStudioProvider', lmstudioProvider);
      framework.registerProvider('iFlowProvider', iflowProvider);
      
      // Register compatibility layers
      const lmstudioCompat = new LMStudioCompatibility(config.lmstudio || {});
      const iflowCompat = new iFlowCompatibility(config.iflow || {});
      
      framework.registerCompatibility('LMStudioCompatibility', lmstudioCompat);
      framework.registerCompatibility('iFlowCompatibility', iflowCompat);
      
      console.log('✅ All providers and compatibility layers registered');
    } catch (error) {
      console.error('❌ Failed to setup framework:', error.message);
      throw error;
    }
  }
};
`;

  fs.writeFileSync(path.join(distDir, 'index.js'), indexContent);

  // 创建类型定义文件
  console.log('📝 Creating type definitions...');
  const typesContent = `/**
 * OpenAI Providers Collection Types
 * Provider集合类型定义
 */

export interface ProviderConfig {
  name?: string;
  endpoint?: string;
  apiKey?: string;
  supportedModels?: string[];
  defaultModel?: string;
  timeout?: number;
  [key: string]: any;
}

export interface CompatibilityConfig {
  providerName?: string;
  fieldMappings?: {
    request?: Record<string, any>;
    response?: Record<string, any>;
  };
  [key: string]: any;
}

export class LMStudioProvider {
  constructor(config: ProviderConfig);
  executeChat(request: any): Promise<any>;
  executeStreamChat(request: any): AsyncIterable<any>;
  getCapabilities(): any;
  healthCheck(): Promise<any>;
}

export class iFlowProvider {
  constructor(config: ProviderConfig);
  executeChat(request: any): Promise<any>;
  executeStreamChat(request: any): AsyncIterable<any>;
  getCapabilities(): any;
  healthCheck(): Promise<any>;
}

export class LMStudioCompatibility {
  constructor(config: CompatibilityConfig);
  mapRequest(openaiRequest: any): any;
  mapResponse(providerResponse: any): any;
}

export class iFlowCompatibility {
  constructor(config: CompatibilityConfig);
  mapRequest(openaiRequest: any): any;
  mapResponse(providerResponse: any): any;
}

export interface TestUtils {
  testToolCalling(): Promise<void>;
  listFilesTool: any;
  executeListFiles(directory: string, recursive?: boolean): Promise<any>;
}

// Factory functions
export function createProvider(name: string, config: ProviderConfig): any;
export function createCompatibility(name: string, config: CompatibilityConfig): any;
export function setupFramework(framework: any, config?: {
  lmstudio?: ProviderConfig;
  iflow?: ProviderConfig;
}): void;
`;

  fs.writeFileSync(path.join(distDir, 'index.d.ts'), typesContent);

  // 复制示例配置文件到dist
  fs.copyFileSync(
    path.resolve(__dirname, '../config/example.config.js'),
    path.join(distDir, 'example.config.js')
  );

  // 创建README
  const readmeContent = `# OpenAI Providers Collection

This package provides a collection of OpenAI-compatible providers including LMStudio and iFlow.

## Installation

\`\`\`bash
npm install openai-providers-collection
\`\`\`

## Usage

### Basic Usage

\`\`\`javascript
const { createProvider, createCompatibility } = require('openai-providers-collection');

// Create providers
const lmstudio = createProvider('lmstudio', {
  endpoint: 'http://localhost:1234/v1/chat/completions',
  apiKey: 'your-api-key'
});

const iflow = createProvider('iflow', {
  endpoint: 'https://platform.iflow.cn/api/v1/chat/completions',
  apiKey: 'your-api-key'
});

// Create compatibility layers
const lmstudioCompat = createCompatibility('lmstudio');
const iflowCompat = createCompatibility('iflow');
\`\`\`

### With Framework

\`\`\`javascript
const { ProviderFramework } = require('openai-compatible-providers-framework');
const { setupFramework } = require('openai-providers-collection');

const framework = new ProviderFramework({
  providerScanPaths: ['./providers'],
  compatibilityScanPaths: ['./compatibility']
});

// Setup all providers and compatibility layers
setupFramework(framework, {
  lmstudio: {
    endpoint: 'http://localhost:1234/v1/chat/completions',
    apiKey: 'your-api-key'
  },
  iflow: {
    endpoint: 'https://platform.iflow.cn/api/v1/chat/completions',
    apiKey: 'your-api-key'
  }
});

// Use the framework
const response = await framework.chat('LMStudioProvider', {
  model: 'gpt-oss-20b-mlx',
  messages: [{ role: 'user', content: 'Hello!' }]
});
\`\`\`

## Providers

### LMStudio Provider
- **Endpoint**: \`http://localhost:1234/v1/chat/completions\`
- **Models**: qwen3-30b-a3b-instruct-2507-mlx, gpt-oss-20b-mlx, etc.
- **Features**: Tool calling, streaming, vision support

### iFlow Provider
- **Endpoint**: \`https://platform.iflow.cn/api/v1/chat/completions\`
- **Models**: qwen3-coder, iflow-chat, iflow-chat-pro, etc.
- **Features**: Tool calling, streaming, code generation

## Testing

\`\`\`bash
# Run tool calling tests
npm run test:tool-calling

# Run all tests
npm test
\`\`\`

## Configuration

Copy \`example.config.js\` to \`test.config.js\` and configure your API keys:

\`\`\`javascript
module.exports = {
  iflow: {
    apiKey: 'your-iflow-api-key',
    endpoint: 'https://platform.iflow.cn/api/v1/chat/completions'
  },
  lmstudio: {
    apiKey: 'test-key',
    endpoint: 'http://localhost:1234/v1/chat/completions'
  }
};
\`\`\`

## License

MIT
`;

  fs.writeFileSync(path.join(distDir, 'README.md'), readmeContent);

  // 构建完成
  console.log('✅ Providers collection build completed successfully');
  console.log(`📁 Build artifacts in: ${distDir}`);
  console.log(`📦 Version: ${packageJson.version}`);
  console.log('🔧 Includes: LMStudio Provider, iFlow Provider, Compatibility layers');
  
} catch (error) {
  console.error('❌ Build failed:', error.message);
  process.exit(1);
}