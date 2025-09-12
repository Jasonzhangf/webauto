#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * Standard Build Script for OpenAI Compatible Providers Framework
 * 标准构建脚本
 */

class BuildManager {
  constructor() {
    this.rootDir = process.cwd();
    this.distDir = path.join(this.rootDir, 'dist');
    this.srcDir = path.join(this.rootDir, 'src');
    this.configDir = path.join(this.rootDir, 'config');
    
    this.colors = {
      reset: '\x1b[0m',
      red: '\x1b[31m',
      green: '\x1b[32m',
      yellow: '\x1b[33m',
      blue: '\x1b[34m',
      magenta: '\x1b[35m',
      cyan: '\x1b[36m'
    };
  }

  log(message, color = 'reset') {
    console.log(`${this.colors[color]}${message}${this.colors.reset}`);
  }

  async executeCommand(command, description) {
    try {
      this.log(`🔧 ${description}...`, 'cyan');
      execSync(command, { stdio: 'inherit', cwd: this.rootDir });
      this.log(`✅ ${description} 完成`, 'green');
      return true;
    } catch (error) {
      this.log(`❌ ${description} 失败: ${error.message}`, 'red');
      return false;
    }
  }

  async clean() {
    this.log('🧹 清理构建目录...', 'yellow');
    
    if (fs.existsSync(this.distDir)) {
      fs.rmSync(this.distDir, { recursive: true, force: true });
    }
    
    // Clean node_modules if --clean-deps flag
    if (process.argv.includes('--clean-deps')) {
      const nodeModulesDir = path.join(this.rootDir, 'node_modules');
      if (fs.existsSync(nodeModulesDir)) {
        fs.rmSync(nodeModulesDir, { recursive: true, force: true });
      }
      
      const packageLockFile = path.join(this.rootDir, 'package-lock.json');
      if (fs.existsSync(packageLockFile)) {
        fs.unlinkSync(packageLockFile);
      }
    }
    
    this.log('✅ 清理完成', 'green');
  }

  async installDependencies() {
    return await this.executeCommand('npm install', '安装依赖');
  }

  async runTypeScript() {
    // Check if TypeScript is installed
    try {
      require.resolve('typescript');
    } catch (e) {
      this.log('⚠️  TypeScript 未安装，正在安装...', 'yellow');
      await this.executeCommand('npm install --save-dev typescript @types/node', '安装 TypeScript');
    }

    return await this.executeCommand('npx tsc', 'TypeScript 编译');
  }

  async runTests() {
    if (process.argv.includes('--skip-tests')) {
      this.log('⏭️  跳过测试', 'yellow');
      return true;
    }

    // Check if Jest is installed
    try {
      require.resolve('jest');
    } catch (e) {
      this.log('⚠️  Jest 未安装，跳过测试', 'yellow');
      return true;
    }

    return await this.executeCommand('npm test', '运行测试');
  }

  async runLinting() {
    if (process.argv.includes('--skip-lint')) {
      this.log('⏭️  跳过代码检查', 'yellow');
      return true;
    }

    // Check if ESLint is installed
    try {
      require.resolve('eslint');
    } catch (e) {
      this.log('⚠️  ESLint 未安装，跳过代码检查', 'yellow');
      return true;
    }

    return await this.executeCommand('npm run lint', '运行代码检查');
  }

  async copyAssets() {
    this.log('📦 复制资源文件...', 'cyan');
    
    // Copy config files
    if (fs.existsSync(this.configDir)) {
      const targetConfigDir = path.join(this.distDir, 'config');
      if (!fs.existsSync(targetConfigDir)) {
        fs.mkdirSync(targetConfigDir, { recursive: true });
      }
      
      this.copyDirectory(this.configDir, targetConfigDir);
    }

    // Copy documentation files
    const docsToCopy = [
      'README.md',
      'COMPATIBILITY_GUIDE.md', 
      'USAGE_EXAMPLES.md',
      'LICENSE'
    ];
    
    for (const doc of docsToCopy) {
      const sourcePath = path.join(this.rootDir, doc);
      if (fs.existsSync(sourcePath)) {
        fs.copyFileSync(sourcePath, path.join(this.distDir, doc));
      }
    }
    
    // Copy package.json (modify main field for dist)
    const packageJsonPath = path.join(this.rootDir, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      packageJson.main = './index.js';
      packageJson.types = './index.d.ts';
      fs.writeFileSync(
        path.join(this.distDir, 'package.json'),
        JSON.stringify(packageJson, null, 2)
      );
    }
    
    this.log('✅ 资源文件复制完成', 'green');
  }

  copyDirectory(src, dest) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    
    const files = fs.readdirSync(src);
    for (const file of files) {
      const srcPath = path.join(src, file);
      const destPath = path.join(dest, file);
      
      if (fs.statSync(srcPath).isDirectory()) {
        this.copyDirectory(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }

  async buildVersionInfo() {
    const packageJsonPath = path.join(this.rootDir, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      
      const versionInfo = {
        version: packageJson.version,
        name: packageJson.name,
        description: packageJson.description,
        buildTime: new Date().toISOString(),
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch
      };
      
      const versionInfoPath = path.join(this.distDir, 'version.json');
      fs.writeFileSync(versionInfoPath, JSON.stringify(versionInfo, null, 2));
      
      this.log(`📋 版本信息: ${packageJson.name} v${packageJson.version}`, 'magenta');
    }
  }

  async validateBuild() {
    this.log('🔍 验证构建结果...', 'cyan');
    
    const requiredFiles = [
      'index.js',
      'index.d.ts',
      'package.json'
    ];
    
    let allValid = true;
    for (const file of requiredFiles) {
      const filePath = path.join(this.distDir, file);
      if (!fs.existsSync(filePath)) {
        this.log(`❌ 缺少必需文件: ${file}`, 'red');
        allValid = false;
      } else {
        this.log(`✅ 找到文件: ${file}`, 'green');
      }
    }
    
    return allValid;
  }

  async build() {
    const startTime = Date.now();
    
    this.log('🚀 开始构建 OpenAI Compatible Providers Framework', 'cyan');
    this.log('=' .repeat(60), 'cyan');
    
    try {
      // Step 1: Clean
      await this.clean();
      
      // Step 2: Install dependencies (if needed)
      if (process.argv.includes('--install') || !fs.existsSync(path.join(this.rootDir, 'node_modules'))) {
        await this.installDependencies();
      }
      
      // Step 3: TypeScript compilation
      if (!(await this.runTypeScript())) {
        process.exit(1);
      }
      
      // Step 4: Copy assets
      await this.copyAssets();
      
      // Step 5: Build version info
      await this.buildVersionInfo();
      
      // Step 6: Run tests (unless skipped)
      if (!(await this.runTests())) {
        this.log('⚠️  测试失败，但继续构建', 'yellow');
      }
      
      // Step 7: Run linting (unless skipped)
      if (!(await this.runLinting())) {
        this.log('⚠️  代码检查失败，但继续构建', 'yellow');
      }
      
      // Step 8: Validate build
      if (!(await this.validateBuild())) {
        this.log('❌ 构建验证失败', 'red');
        process.exit(1);
      }
      
      const endTime = Date.now();
      const duration = ((endTime - startTime) / 1000).toFixed(2);
      
      this.log('=' .repeat(60), 'cyan');
      this.log(`🎉 构建完成! 耗时: ${duration}秒`, 'green');
      this.log(`📁 构建输出目录: ${this.distDir}`, 'blue');
      
    } catch (error) {
      this.log(`❌ 构建失败: ${error.message}`, 'red');
      process.exit(1);
    }
  }
}

// Run build if this script is executed directly
if (require.main === module) {
  const builder = new BuildManager();
  builder.build().catch(console.error);
}

module.exports = BuildManager;