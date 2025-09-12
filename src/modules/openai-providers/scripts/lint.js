#!/usr/bin/env node

/**
 * Providers Collection Lint Script
 * Provider集合代码检查脚本
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Linting OpenAI Providers Collection...');

try {
  // 检查代码风格
  console.log('📝 Checking code style...');
  
  const sourceFiles = [
    '../providers/LMStudioProvider.js',
    '../providers/iFlowProvider.js',
    '../compatibility/LMStudioCompatibility.js',
    '../compatibility/iFlowCompatibility.js',
    '../tests/tool-calling-test.js',
    '../config/example.config.js'
  ];
  
  let lintErrors = 0;
  
  for (const file of sourceFiles) {
    const filePath = path.resolve(__dirname, file);
    if (!fs.existsSync(filePath)) {
      console.error(`❌ Missing file: ${file}`);
      lintErrors++;
      continue;
    }
    
    const content = fs.readFileSync(filePath, 'utf8');
    
    // 检查基本代码风格
    const lines = content.split('\n');
    let inCommentBlock = false;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNumber = i + 1;
      
      // 跳过注释块
      if (line.includes('/*')) {
        inCommentBlock = true;
      }
      if (line.includes('*/')) {
        inCommentBlock = false;
        continue;
      }
      if (inCommentBlock || line.trim().startsWith('//')) {
        continue;
      }
      
      // 检查缩进（应该是2个空格）
      if (line.length > 0 && !line.startsWith(' ') && !line.startsWith('\t') && !line.startsWith('}') && !line.startsWith('{')) {
        // 顶行代码，检查是否应该是类或函数声明
        if (line.includes('class ') || line.includes('function ') || line.includes('const ') || line.includes('let ') || line.includes('var ')) {
          // 这些可以在顶行
        } else if (line.trim().length > 0) {
          console.warn(`⚠️  ${file}:${lineNumber} 可能缺少缩进: ${line.trim()}`);
        }
      }
      
      // 检查行长度
      if (line.length > 120) {
        console.warn(`⚠️  ${file}:${lineNumber} 行过长 (${line.length}字符): ${line.substring(0, 50)}...`);
      }
      
      // 检查分号使用（应该在行尾）
      const trimmedLine = line.trim();
      if (trimmedLine.length > 0 && 
          !trimmedLine.endsWith('{') && 
          !trimmedLine.endsWith('}') && 
          !trimmedLine.endsWith(';') &&
          !trimmedLine.startsWith('if ') &&
          !trimmedLine.startsWith('for ') &&
          !trimmedLine.startsWith('while ') &&
          !trimmedLine.startsWith('switch ') &&
          !trimmedLine.startsWith('else ')) {
        // 检查是否是表达式语句
        if (trimmedLine.includes('=') || 
            trimmedLine.includes('require(') ||
            trimmedLine.includes('return ') ||
            trimmedLine.includes('throw ') ||
            trimmedLine.includes('break') ||
            trimmedLine.includes('continue')) {
          console.warn(`⚠️  ${file}:${lineNumber} 可能缺少分号: ${trimmedLine}`);
        }
      }
    }
  }
  
  // 检查package.json中的必需脚本
  console.log('📦 Checking package.json scripts...');
  const packageJson = require('../package.json');
  const requiredScripts = ['build', 'test', 'lint', 'clean'];
  
  for (const script of requiredScripts) {
    if (!packageJson.scripts || !packageJson.scripts[script]) {
      console.error(`❌ Missing script: ${script}`);
      lintErrors++;
    }
  }
  
  // 检查必需的文件
  console.log('📁 Checking required files...');
  const requiredFiles = [
    '../providers/LMStudioProvider.js',
    '../providers/iFlowProvider.js',
    '../compatibility/LMStudioCompatibility.js',
    '../compatibility/iFlowCompatibility.js',
    '../tests/tool-calling-test.js',
    '../config/example.config.js',
    'build.js',
    'test.js',
    'lint.js',
    'clean.js'
  ];
  
  for (const file of requiredFiles) {
    const filePath = path.resolve(__dirname, file);
    if (!fs.existsSync(filePath)) {
      console.error(`❌ Missing required file: ${file}`);
      lintErrors++;
    }
  }
  
  // 检查导出一致性
  console.log('🔗 Checking export consistency...');
  const indexPath = path.resolve(__dirname, '../dist/index.js');
  if (fs.existsSync(indexPath)) {
    const indexContent = fs.readFileSync(indexPath, 'utf8');
    const expectedExports = [
      'LMStudioProvider',
      'iFlowProvider',
      'LMStudioCompatibility', 
      'iFlowCompatibility',
      'testUtils',
      'createProvider',
      'createCompatibility',
      'setupFramework'
    ];
    
    for (const exportName of expectedExports) {
      if (!indexContent.includes(exportName)) {
        console.error(`❌ Missing export: ${exportName}`);
        lintErrors++;
      }
    }
  }
  
  // 检查依赖版本
  console.log('📋 Checking dependency versions...');
  const frameworkVersion = packageJson.dependencies['openai-compatible-providers-framework'];
  if (!frameworkVersion) {
    console.error('❌ Missing framework dependency');
    lintErrors++;
  } else {
    console.log(`✅ Framework version: ${frameworkVersion}`);
  }
  
  if (lintErrors === 0) {
    console.log('✅ All lint checks passed!');
    console.log('🎉 Code quality is excellent!');
  } else {
    console.error(`❌ Found ${lintErrors} lint errors`);
    process.exit(1);
  }
  
} catch (error) {
  console.error('❌ Lint failed:', error.message);
  console.error('Stack:', error.stack);
  process.exit(1);
}