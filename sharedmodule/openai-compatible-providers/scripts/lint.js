#!/usr/bin/env node

/**
 * Framework Lint Script
 * 代码质量检查脚本
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Linting OpenAI Compatible Providers Framework...');

const issues = [];

// 检查文件编码和行尾符
function checkFileEncoding(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  
  // 检查BOM
  if (content.charCodeAt(0) === 0xFEFF) {
    issues.push(`❌ ${filePath}: Contains BOM`);
  }
  
  // 检查行尾符
  const crlfCount = (content.match(/\r\n/g) || []).length;
  const lfCount = (content.match(/\n(?!\r)/g) || []).length;
  
  if (crlfCount > 0) {
    issues.push(`⚠️  ${filePath}: Contains ${crlfCount} CRLF line endings`);
  }
}

// 检查代码风格
function checkCodeStyle(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  
  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    
    // 检查尾随空格
    if (line.endsWith(' ') || line.endsWith('\t')) {
      issues.push(`⚠️  ${filePath}:${lineNumber}: Trailing whitespace`);
    }
    
    // 检查制表符（应该用空格）
    if (line.includes('\t')) {
      issues.push(`⚠️  ${filePath}:${lineNumber}: Contains tabs (use spaces)`);
    }
    
    // 检查行长度（超过120字符）
    if (line.length > 120 && !line.includes('http') && !line.includes('https')) {
      issues.push(`⚠️  ${filePath}:${lineNumber}: Line too long (${line.length} chars)`);
    }
  });
}

// 检查JavaScript语法
function checkJavaScriptSyntax(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    
    // 基本语法检查
    new Function(content);
    
    // 检查常见的JavaScript问题
    const issues_found = [];
    
    // 检查var使用（推荐let/const）
    const varMatches = content.match(/\bvar\s+/g);
    if (varMatches) {
      issues_found.push(`Uses 'var' ${varMatches.length} times (prefer let/const)`);
    }
    
    // 检查console.log（生产代码中应该移除）
    const consoleMatches = content.match(/console\.(log|error|warn|info|debug)/g);
    if (consoleMatches && !filePath.includes('test') && !filePath.includes('script')) {
      issues_found.push(`Contains console statements (${consoleMatches.length})`);
    }
    
    // 检查debugger语句
    if (content.includes('debugger;')) {
      issues_found.push('Contains debugger statement');
    }
    
    if (issues_found.length > 0) {
      issues.push(`⚠️  ${filePath}: ${issues_found.join(', ')}`);
    }
    
  } catch (error) {
    issues.push(`❌ ${filePath}: Syntax error - ${error.message}`);
  }
}

// 检查必需的文件和结构
function checkProjectStructure() {
  const requiredFiles = [
    'src/index.js',
    'src/framework/ProviderFramework.js',
    'src/framework/BaseProvider.js',
    'src/framework/ModuleScanner.js',
    'src/framework/OpenAIInterface.js',
    'src/interfaces/ICompatibility.js',
    'src/interfaces/IAuthManager.js',
    'package.json',
    'README.md'
  ];
  
  for (const file of requiredFiles) {
    const filePath = path.resolve(__dirname, '..', file);
    if (!fs.existsSync(filePath)) {
      issues.push(`❌ Missing required file: ${file}`);
    }
  }
  
  // 检查package.json配置
  const packagePath = path.resolve(__dirname, '../package.json');
  if (fs.existsSync(packagePath)) {
    const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    
    if (!packageJson.name) {
      issues.push('❌ package.json missing name field');
    }
    
    if (!packageJson.version) {
      issues.push('❌ package.json missing version field');
    }
    
    if (!packageJson.main) {
      issues.push('❌ package.json missing main field');
    }
  }
}

// 检查脚本文件权限
function checkScriptPermissions() {
  const scriptDir = path.resolve(__dirname, '..');
  const scripts = ['scripts/build.js', 'scripts/test.js', 'scripts/lint.js'];
  
  for (const script of scripts) {
    const scriptPath = path.resolve(scriptDir, script);
    if (fs.existsSync(scriptPath)) {
      const stats = fs.statSync(scriptPath);
      // 检查是否可执行
      if (!(stats.mode & parseInt('111', 8))) {
        issues.push(`⚠️  ${script}: Not executable (chmod +x ${script})`);
      }
    }
  }
}

// 执行所有检查
try {
  console.log('📁 Checking project structure...');
  checkProjectStructure();
  
  console.log('🔐 Checking script permissions...');
  checkScriptPermissions();
  
  console.log('📄 Checking source files...');
  const srcDir = path.resolve(__dirname, '../src');
  
  function checkDirectory(dir) {
    const files = fs.readdirSync(dir);
    
    for (const file of files) {
      const filePath = path.join(dir, file);
      const stats = fs.statSync(filePath);
      
      if (stats.isDirectory()) {
        checkDirectory(filePath);
      } else if (file.endsWith('.js')) {
        checkFileEncoding(filePath);
        checkCodeStyle(filePath);
        checkJavaScriptSyntax(filePath);
      }
    }
  }
  
  if (fs.existsSync(srcDir)) {
    checkDirectory(srcDir);
  }
  
  // 输出结果
  if (issues.length === 0) {
    console.log('✅ All lint checks passed!');
  } else {
    console.log(`❌ Found ${issues.length} issue(s):`);
    issues.forEach(issue => console.log(`  ${issue}`));
    
    // 分类问题
    const errors = issues.filter(i => i.startsWith('❌'));
    const warnings = issues.filter(i => i.startsWith('⚠️'));
    
    console.log(`\n📊 Summary:`);
    console.log(`  Errors: ${errors.length}`);
    console.log(`  Warnings: ${warnings.length}`);
    
    // 如果有错误，退出码为1
    if (errors.length > 0) {
      process.exit(1);
    }
  }
  
} catch (error) {
  console.error('❌ Linting failed:', error.message);
  process.exit(1);
}