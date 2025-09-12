#!/usr/bin/env node

/**
 * Providers Collection Clean Script
 * Provider集合清理脚本
 */

const fs = require('fs');
const path = require('path');

console.log('🧹 Cleaning OpenAI Providers Collection...');

try {
  const baseDir = path.resolve(__dirname, '..');
  
  // 清理dist目录
  const distDir = path.join(baseDir, 'dist');
  if (fs.existsSync(distDir)) {
    console.log('📁 Removing dist directory...');
    fs.rmSync(distDir, { recursive: true, force: true });
    console.log('✅ Dist directory removed');
  }
  
  // 清理node_modules目录（可选）
  const nodeModulesDir = path.join(baseDir, 'node_modules');
  if (fs.existsSync(nodeModulesDir)) {
    console.log('📦 Removing node_modules directory...');
    fs.rmSync(nodeModulesDir, { recursive: true, force: true });
    console.log('✅ Node modules removed');
  }
  
  // 清理package-lock.json
  const packageLockPath = path.join(baseDir, 'package-lock.json');
  if (fs.existsSync(packageLockPath)) {
    console.log('🔒 Removing package-lock.json...');
    fs.unlinkSync(packageLockPath);
    console.log('✅ Package lock removed');
  }
  
  // 清理日志文件
  const logFiles = [
    'npm-debug.log',
    'yarn-debug.log',
    'yarn-error.log',
    '.npm',
    '.cache'
  ];
  
  for (const logFile of logFiles) {
    const logPath = path.join(baseDir, logFile);
    if (fs.existsSync(logPath)) {
      if (fs.statSync(logPath).isDirectory()) {
        fs.rmSync(logPath, { recursive: true, force: true });
      } else {
        fs.unlinkSync(logPath);
      }
      console.log(`✅ Removed ${logFile}`);
    }
  }
  
  // 清理编辑器文件
  const editorFiles = [
    '.vscode',
    '.idea',
    '*.swp',
    '*.swo',
    '.DS_Store'
  ];
  
  for (const pattern of editorFiles) {
    // 简单的模式匹配，实际使用中可能需要glob库
    if (pattern.includes('*')) {
      console.log(`ℹ️  Skipping pattern ${pattern} (would need glob library)`);
      continue;
    }
    
    const editorPath = path.join(baseDir, pattern);
    if (fs.existsSync(editorPath)) {
      if (fs.statSync(editorPath).isDirectory()) {
        fs.rmSync(editorPath, { recursive: true, force: true });
      } else {
        fs.unlinkSync(editorPath);
      }
      console.log(`✅ Removed ${pattern}`);
    }
  }
  
  console.log('🎉 Cleanup completed successfully!');
  console.log('💡 Run "npm install" to reinstall dependencies');
  console.log('💡 Run "npm run build" to rebuild the project');
  
} catch (error) {
  console.error('❌ Cleanup failed:', error.message);
  console.error('Stack:', error.stack);
  process.exit(1);
}