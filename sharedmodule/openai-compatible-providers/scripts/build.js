#!/usr/bin/env node

/**
 * Framework Build Script
 * 标准构建脚本
 */

const fs = require('fs');
const path = require('path');

console.log('🔨 Building OpenAI Compatible Providers Framework...');

try {
  // 检查必要文件
  const requiredFiles = [
    'src/index.js',
    'src/framework/ProviderFramework.js',
    'src/framework/BaseProvider.js',
    'src/framework/ModuleScanner.js',
    'src/framework/OpenAIInterface.js',
    'src/interfaces/ICompatibility.js',
    'src/interfaces/IAuthManager.js'
  ];

  const missingFiles = [];
  for (const file of requiredFiles) {
    const filePath = path.resolve(__dirname, '..', file);
    if (!fs.existsSync(filePath)) {
      missingFiles.push(file);
    }
  }

  if (missingFiles.length > 0) {
    console.error('❌ Missing required files:', missingFiles.join(', '));
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

  // 创建dist目录（如果需要）
  const distDir = path.resolve(__dirname, '../dist');
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }

  // 验证模块导出
  console.log('🔍 Validating module exports...');
  const indexPath = path.resolve(__dirname, '../src/index.js');
  const frameworkExport = require(indexPath);
  
  if (!frameworkExport.ProviderFramework) {
    console.error('❌ ProviderFramework not exported from index.js');
    process.exit(1);
  }

  if (!frameworkExport.BaseProvider) {
    console.error('❌ BaseProvider not exported from index.js');
    process.exit(1);
  }

  if (!frameworkExport.ModuleScanner) {
    console.error('❌ ModuleScanner not exported from index.js');
    process.exit(1);
  }

  // 生成类型定义文件（如果不存在）
  const typesPath = path.resolve(__dirname, '../src/index.d.ts');
  if (!fs.existsSync(typesPath)) {
    console.log('📝 Generating type definitions...');
    const typeDefinitions = `
/**
 * OpenAI Compatible Providers Framework
 * 自动生成的类型定义文件
 */

export interface ProviderConfig {
  name: string;
  endpoint: string;
  supportedModels: string[];
  defaultModel: string;
  apiKey?: string;
  timeout?: number;
  [key: string]: any;
}

export interface CompatibilityConfig {
  providerName: string;
  fieldMappings: {
    request: Record<string, any>;
    response: Record<string, any>;
  };
  [key: string]: any;
}

export class ProviderFramework {
  constructor(config?: any);
  chat(providerName: string, request: any): Promise<any>;
  streamChat(providerName: string, request: any): AsyncIterable<any>;
  healthCheck(): Promise<any>;
  getAllProviders(): Record<string, any>;
  getProvider(providerName: string): any;
}

export class BaseProvider {
  constructor(config: ProviderConfig);
  chat(request: any, compatibility?: any): Promise<any>;
  streamChat(request: any, compatibility?: any): AsyncIterable<any>;
  executeChat(request: any): Promise<any>;
  executeStreamChat(request: any): AsyncIterable<any>;
  getCapabilities(): any;
  healthCheck(): Promise<any>;
}

export class ModuleScanner {
  scan(scanPaths: string[], moduleType: string): any[];
  scanDirectory(directory: string, moduleType: string): any[];
  loadModule(modulePath: string, moduleType: string, config?: any): any;
}

export class ICompatibility {
  constructor(config: CompatibilityConfig);
  mapRequest(openaiRequest: any): any;
  mapResponse(providerResponse: any): any;
}

export class IAuthManager {
  authenticate(credentials: any): Promise<any>;
  getAuthHeaders(): Promise<Record<string, string>>;
}
`;
    fs.writeFileSync(typesPath, typeDefinitions.trim());
  }

  // 构建完成
  console.log('✅ Framework build completed successfully');
  console.log(`📁 Build artifacts in: ${distDir}`);
  console.log(`📦 Version: ${packageJson.version}`);
  
} catch (error) {
  console.error('❌ Build failed:', error.message);
  process.exit(1);
}