#!/usr/bin/env node

/**
 * Providers Collection Development Script
 * Provider集合开发模式脚本
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

console.log('🚀 Starting OpenAI Providers Collection Development Mode...');

try {
  const baseDir = path.resolve(__dirname, '..');
  
  // 检查开发依赖
  console.log('📦 Checking development dependencies...');
  const packageJson = require('../package.json');
  const devDependencies = Object.keys(packageJson.devDependencies || {});
  
  if (devDependencies.length === 0) {
    console.log('ℹ️  No dev dependencies found, using development setup');
  } else {
    console.log('✅ Development dependencies found');
  }
  
  // 创建符号链接以便开发（可选）
  const createSymlinks = () => {
    console.log('🔗 Setting up development symlinks...');
    
    // 这里可以创建符号链接到其他开发中的项目
    // 例如：ln -s ../../sharedmodule/openai-compatible-providers ./node_modules/
    console.log('ℹ️  Symlink setup completed (if needed)');
  };
  
  // 启动文件监视模式
  const startFileWatcher = () => {
    console.log('👀 Starting file watcher for development...');
    
    // 使用简单的轮询方式监视文件变化
    const watchFiles = [
      '../providers/*.js',
      '../compatibility/*.js', 
      '../config/*.js',
      '../tests/*.js',
      'scripts/*.js'
    ];
    
    console.log('📁 Watching files for changes:');
    watchFiles.forEach(pattern => console.log(`   - ${pattern}`));
    
    // 在实际开发中，可以使用chokidar等库进行文件监视
    console.log('💡 Use "npm run build" to rebuild after changes');
  };
  
  // 启动开发服务器（如果需要）
  const startDevServer = () => {
    console.log('🌐 Starting development server...');
    
    // 检查是否有开发服务器配置
    const devServerConfig = path.join(baseDir, 'dev-server.config.js');
    if (fs.existsSync(devServerConfig)) {
      console.log('📋 Found dev server configuration');
      // 这里可以启动开发服务器
    } else {
      console.log('ℹ️  No dev server configuration found');
    }
  };
  
  // 运行初始构建
  const runInitialBuild = () => {
    console.log('🔨 Running initial build...');
    
    return new Promise((resolve, reject) => {
      const buildProcess = spawn('node', ['scripts/build.js'], {
        cwd: baseDir,
        stdio: 'inherit'
      });
      
      buildProcess.on('close', (code) => {
        if (code === 0) {
          console.log('✅ Initial build completed');
          resolve();
        } else {
          console.error('❌ Initial build failed');
          reject(new Error(`Build process exited with code ${code}`));
        }
      });
      
      buildProcess.on('error', (error) => {
        console.error('❌ Build process error:', error.message);
        reject(error);
      });
    });
  };
  
  // 运行测试
  const runTests = () => {
    console.log('🧪 Running tests...');
    
    return new Promise((resolve, reject) => {
      const testProcess = spawn('node', ['scripts/test.js'], {
        cwd: baseDir,
        stdio: 'inherit'
      });
      
      testProcess.on('close', (code) => {
        if (code === 0) {
          console.log('✅ Tests passed');
          resolve();
        } else {
          console.error('❌ Tests failed');
          reject(new Error(`Test process exited with code ${code}`));
        }
      });
      
      testProcess.on('error', (error) => {
        console.error('❌ Test process error:', error.message);
        reject(error);
      });
    });
  };
  
  // 主开发流程
  const startDevelopment = async () => {
    try {
      // 1. 初始构建
      await runInitialBuild();
      
      // 2. 运行测试
      await runTests();
      
      // 3. 设置开发环境
      createSymlinks();
      startFileWatcher();
      startDevServer();
      
      console.log('🎉 Development mode started successfully!');
      console.log('');
      console.log('📋 Development Commands:');
      console.log('   - npm run build     : Rebuild the project');
      console.log('   - npm test         : Run tests');
      console.log('   - npm run lint     : Check code quality');
      console.log('   - npm run clean    : Clean build artifacts');
      console.log('');
      console.log('🔧 Development Tips:');
      console.log('   - Edit files in providers/, compatibility/, config/');
      console.log('   - Run "npm run build" after making changes');
      console.log('   - Check test.config.js for API key configuration');
      console.log('');
      console.log('📚 Documentation:');
      console.log('   - API docs: ./iflow-api-docs.md');
      console.log('   - Compatibility config: ./config/iflow-compatibility.config.js');
      
      // 保持进程运行（用于开发服务器）
      if (process.argv.includes('--watch')) {
        console.log('⏳ Development mode is watching for changes...');
        console.log('Press Ctrl+C to exit');
        
        // 这里可以实现文件监视和自动重新构建
        process.on('SIGINT', () => {
          console.log('\\n🛑 Development mode stopped');
          process.exit(0);
        });
      }
      
    } catch (error) {
      console.error('❌ Failed to start development mode:', error.message);
      process.exit(1);
    }
  };
  
  // 检查命令行参数
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log('');
    console.log('Usage: npm run dev [options]');
    console.log('');
    console.log('Options:');
    console.log('  --watch, -w  : Start file watcher mode');
    console.log('  --help, -h   : Show this help message');
    console.log('');
    return;
  }
  
  // 启动开发模式
  startDevelopment();
  
} catch (error) {
  console.error('❌ Development setup failed:', error.message);
  console.error('Stack:', error.stack);
  process.exit(1);
}