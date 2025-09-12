#!/usr/bin/env node

/**
 * Framework Development Script
 * 开发模式脚本 - 监听文件变化并重新构建
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🚀 Starting OpenAI Compatible Providers Framework development mode...');

const projectRoot = path.resolve(__dirname, '..');
const srcDir = path.join(projectRoot, 'src');

// 监听的文件扩展名
const watchExtensions = ['.js'];
let isBuilding = false;

// 构建函数
function build() {
  if (isBuilding) return;
  
  isBuilding = true;
  console.log('\n🔨 Building...');
  
  try {
    // 运行构建脚本
    execSync('node scripts/build.js', { 
      cwd: projectRoot,
      stdio: 'inherit'
    });
    
    // 运行测试脚本
    console.log('\n🧪 Running tests...');
    execSync('node scripts/test.js', { 
      cwd: projectRoot,
      stdio: 'inherit'
    });
    
    console.log('\n✅ Build and tests completed successfully');
  } catch (error) {
    console.error('\n❌ Build or tests failed:', error.message);
  } finally {
    isBuilding = false;
  }
}

// 防抖函数
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// 监听文件变化
function watchFiles() {
  console.log(`👀 Watching for changes in: ${srcDir}`);
  
  // 首次构建
  build();
  
  // 递归监听目录
  function watchDirectory(dir) {
    const files = fs.readdirSync(dir);
    
    for (const file of files) {
      const filePath = path.join(dir, file);
      const stats = fs.statSync(filePath);
      
      if (stats.isDirectory()) {
        // 递归监听子目录
        watchDirectory(filePath);
      } else if (watchExtensions.includes(path.extname(file))) {
        // 监听文件变化
        console.log(`📄 Watching: ${filePath}`);
        
        fs.watchFile(filePath, { interval: 1000 }, (curr, prev) => {
          if (curr.mtime > prev.mtime) {
            console.log(`\n📝 File changed: ${filePath}`);
            debouncedBuild();
          }
        });
      }
    }
  }
  
  // 监听package.json变化
  const packagePath = path.join(projectRoot, 'package.json');
  if (fs.existsSync(packagePath)) {
    fs.watchFile(packagePath, { interval: 1000 }, (curr, prev) => {
      if (curr.mtime > prev.mtime) {
        console.log('\n📦 package.json changed');
        debouncedBuild();
      }
    });
  }
  
  watchDirectory(srcDir);
}

// 防抖的构建函数
const debouncedBuild = debounce(build, 1000);

// 信号处理
process.on('SIGINT', () => {
  console.log('\n🛑 Stopping development mode...');
  
  // 清理所有文件监听器
  fs.unwatchFile('*', () => {});
  
  console.log('👋 Goodbye!');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Stopping development mode...');
  process.exit(0);
});

// 错误处理
process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// 启动监听
try {
  watchFiles();
  console.log('\n✅ Development mode started. Press Ctrl+C to stop.');
} catch (error) {
  console.error('❌ Failed to start development mode:', error.message);
  process.exit(1);
}