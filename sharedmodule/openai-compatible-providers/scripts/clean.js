#!/usr/bin/env node

/**
 * Framework Clean Script
 * 清理构建产物和临时文件
 */

const fs = require('fs');
const path = require('path');

console.log('🧹 Cleaning OpenAI Compatible Providers Framework...');

const itemsToRemove = [
  'dist',
  'node_modules/.cache',
  'coverage',
  'npm-debug.log',
  'yarn-debug.log',
  'yarn-error.log',
  '*.tgz',
  '*.tar.gz'
];

const directoriesToClean = [
  'node_modules'
];

let removedCount = 0;

// 删除文件或目录
function removeItem(itemPath) {
  try {
    const stats = fs.statSync(itemPath);
    
    if (stats.isDirectory()) {
      // 递归删除目录
      const files = fs.readdirSync(itemPath);
      for (const file of files) {
        const filePath = path.join(itemPath, file);
        removeItem(filePath);
      }
      fs.rmdirSync(itemPath);
      console.log(`📁 Removed directory: ${itemPath}`);
    } else {
      fs.unlinkSync(itemPath);
      console.log(`📄 Removed file: ${itemPath}`);
    }
    removedCount++;
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn(`⚠️  Could not remove ${itemPath}: ${error.message}`);
    }
  }
}

// 清理项目根目录
const projectRoot = path.resolve(__dirname, '..');

// 删除指定的文件和模式
for (const item of itemsToRemove) {
  const itemPath = path.join(projectRoot, item);
  
  if (item.includes('*')) {
    // 处理通配符
    const dir = path.dirname(itemPath);
    const pattern = path.basename(item);
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        if (regex.test(file)) {
          removeItem(path.join(dir, file));
        }
      }
    }
  } else {
    removeItem(itemPath);
  }
}

// 清理指定的目录
for (const dir of directoriesToClean) {
  const dirPath = path.join(projectRoot, dir);
  removeItem(dirPath);
}

// 清理IDE和编辑器文件
const editorFiles = [
  '.vscode',
  '.idea',
  '*.swp',
  '*.swo',
  '.DS_Store',
  'Thumbs.db'
];

for (const pattern of editorFiles) {
  const itemPath = path.join(projectRoot, pattern);
  
  if (pattern.includes('*')) {
    const dir = path.dirname(itemPath);
    const filePattern = path.basename(itemPath);
    const regex = new RegExp('^' + filePattern.replace(/\*/g, '.*') + '$');
    
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        if (regex.test(file)) {
          removeItem(path.join(dir, file));
        }
      }
    }
  } else {
    removeItem(itemPath);
  }
}

console.log(`✅ Clean completed. Removed ${removedCount} item(s).`);