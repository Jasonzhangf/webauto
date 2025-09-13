#!/usr/bin/env node

/**
 * 后构建脚本
 * 处理编译后的文件，生成独立的模块包
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');

console.log('🔧 Running post-build tasks...');

/**
 * 创建 package.json for dist
 */
function createDistPackageJson() {
  const packageJson = require(path.join(rootDir, 'package.json'));
  
  // 创建精简的 package.json 用于发布
  const distPackageJson = {
    name: packageJson.name,
    version: packageJson.version,
    description: packageJson.description,
    main: packageJson.main,
    types: packageJson.types,
    keywords: packageJson.keywords,
    author: packageJson.author,
    license: packageJson.license,
    dependencies: packageJson.dependencies,
    peerDependencies: {
      '@webauto/rcc-core': '^1.0.0'
    },
    engines: packageJson.engines,
    files: packageJson.files,
    publishConfig: {
      access: 'public'
    }
  };

  fs.writeFileSync(
    path.join(distDir, 'package.json'),
    JSON.stringify(distPackageJson, null, 2)
  );
  
  console.log('✅ Created dist/package.json');
}

/**
 * 复制必要的文件
 */
function copyEssentialFiles() {
  const filesToCopy = [
    'README.md',
    'LICENSE',
    'CHANGELOG.md'
  ];

  filesToCopy.forEach(file => {
    const srcPath = path.join(rootDir, file);
    const destPath = path.join(distDir, file);
    
    if (fs.existsSync(srcPath)) {
      fs.copyFileSync(srcPath, destPath);
      console.log(`✅ Copied ${file}`);
    }
  });
}

/**
 * 生成类型定义文件
 */
function generateTypeDefinitions() {
  // 确保类型文件存在
  const typeFiles = [
    'types/index.d.ts',
    'types/page-analysis.d.ts',
    'interfaces/index.d.ts',
    'interfaces/core.d.ts',
    'interfaces/analysis.d.ts',
    'interfaces/operations.d.ts'
  ];

  typeFiles.forEach(file => {
    const filePath = path.join(distDir, file);
    if (fs.existsSync(filePath)) {
      console.log(`✅ Type definitions exist: ${file}`);
    } else {
      console.warn(`⚠️  Missing type definition: ${file}`);
    }
  });
}

/**
 * 验证构建
 */
function validateBuild() {
  const mainFile = path.join(distDir, 'index.js');
  const typesFile = path.join(distDir, 'index.d.ts');
  
  if (!fs.existsSync(mainFile)) {
    throw new Error(`Main file not found: ${mainFile}`);
  }
  
  if (!fs.existsSync(typesFile)) {
    throw new Error(`Type definitions not found: ${typesFile}`);
  }

  // 检查必要的文件
  const requiredFiles = [
    'core/index.js',
    'core/BrowserAssistant.js',
    'core/BaseModule.js',
    'observers/PageObserver.js',
    'operations/OperationEngine.js',
    'core/PageAnalyzer.js',
    'core/ContentExtractor.js',
    'core/ListAnalyzer.js'
  ];

  requiredFiles.forEach(file => {
    const filePath = path.join(distDir, file);
    if (!fs.existsSync(filePath)) {
      console.warn(`⚠️  Missing compiled file: ${file}`);
    }
  });

  console.log('✅ Build validation completed');
}

/**
 * 清理不必要的文件
 */
function cleanupUnnecessaryFiles() {
  const patternsToRemove = [
    '**/*.test.js',
    '**/*.spec.js',
    '**/__tests__/**',
    '**/test/**',
    '**/tests/**',
    '**/*.map'
  ];

  patternsToRemove.forEach(pattern => {
    const glob = require('glob');
    const files = glob.sync(path.join(distDir, pattern));
    
    files.forEach(file => {
      if (fs.existsSync(file)) {
        if (fs.statSync(file).isDirectory()) {
          fs.rmSync(file, { recursive: true });
        } else {
          fs.unlinkSync(file);
        }
        console.log(`🗑️  Removed: ${file}`);
      }
    });
  });
}

/**
 * 生成模块清单
 */
function generateModuleManifest() {
  const manifest = {
    name: '@webauto/browser-assistant',
    version: require(path.join(rootDir, 'package.json')).version,
    buildTime: new Date().toISOString(),
    nodeVersion: process.version,
    capabilities: [
      'browser-automation',
      'page-analysis',
      'content-extraction',
      'ai-assisted-analysis',
      'cookie-management',
      'websocket-control'
    ],
    dependencies: Object.keys(require(path.join(rootDir, 'package.json')).dependencies),
    exports: {
      main: './index.js',
      types: './index.d.ts'
    },
    size: calculateDirectorySize(distDir)
  };

  fs.writeFileSync(
    path.join(distDir, 'module-manifest.json'),
    JSON.stringify(manifest, null, 2)
  );
  
  console.log('✅ Generated module manifest');
}

/**
 * 计算目录大小
 */
function calculateDirectorySize(dirPath) {
  let size = 0;
  const files = fs.readdirSync(dirPath, { recursive: true });
  
  files.forEach(file => {
    const filePath = path.join(dirPath, file);
    if (fs.statSync(filePath).isFile()) {
      size += fs.statSync(filePath).size;
    }
  });
  
  return size;
}

/**
 * 主函数
 */
function main() {
  try {
    console.log('🚀 Starting post-build tasks...');
    
    // 1. 创建 dist package.json
    createDistPackageJson();
    
    // 2. 复制必要文件
    copyEssentialFiles();
    
    // 3. 生成类型定义
    generateTypeDefinitions();
    
    // 4. 验证构建
    validateBuild();
    
    // 5. 清理不必要文件
    cleanupUnnecessaryFiles();
    
    // 6. 生成模块清单
    generateModuleManifest();
    
    console.log('✅ Post-build tasks completed successfully!');
    console.log('📦 Module is ready for publishing');
    
  } catch (error) {
    console.error('❌ Post-build tasks failed:', error);
    process.exit(1);
  }
}

// 运行主函数
if (require.main === module) {
  main();
}

module.exports = {
  createDistPackageJson,
  copyEssentialFiles,
  generateTypeDefinitions,
  validateBuild,
  cleanupUnnecessaryFiles,
  generateModuleManifest
};