#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * Standard Publish Script for OpenAI Compatible Providers Framework
 * 标准发布脚本
 */

class PublishManager {
  constructor() {
    this.rootDir = process.cwd();
    this.distDir = path.join(this.rootDir, 'dist');
    
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

  async executeCommand(command, description, options = {}) {
    try {
      this.log(`🔧 ${description}...`, 'cyan');
      execSync(command, { stdio: 'inherit', cwd: this.rootDir, ...options });
      this.log(`✅ ${description} 完成`, 'green');
      return true;
    } catch (error) {
      this.log(`❌ ${description} 失败: ${error.message}`, 'red');
      return false;
    }
  }

  async checkGitStatus() {
    this.log('🔍 检查 Git 状态...', 'cyan');
    
    try {
      // Check if working directory is clean
      const status = execSync('git status --porcelain', { encoding: 'utf8', cwd: this.rootDir });
      if (status.trim()) {
        this.log('❌ 工作目录有未提交的更改', 'red');
        this.log('请先提交所有更改:', 'yellow');
        console.log(status);
        return false;
      }
      
      // Check if on main branch
      const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8', cwd: this.rootDir }).trim();
      if (branch !== 'main') {
        this.log(`⚠️  当前分支: ${branch}, 建议在 main 分支发布`, 'yellow');
      }
      
      // Check if remote is up to date
      execSync('git fetch origin', { stdio: 'ignore', cwd: this.rootDir });
      const localHash = execSync('git rev-parse HEAD', { encoding: 'utf8', cwd: this.rootDir }).trim();
      const remoteHash = execSync('git rev-parse origin/main', { encoding: 'utf8', cwd: this.rootDir }).trim();
      
      if (localHash !== remoteHash) {
        this.log('⚠️  本地分支与远程不同步', 'yellow');
        const proceed = await this.confirm('是否继续发布?');
        if (!proceed) return false;
      }
      
      this.log('✅ Git 状态检查通过', 'green');
      return true;
    } catch (error) {
      this.log(`❌ Git 检查失败: ${error.message}`, 'red');
      return false;
    }
  }

  async checkVersion() {
    this.log('📦 检查版本信息...', 'cyan');
    
    const packageJsonPath = path.join(this.rootDir, 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
      this.log('❌ 找不到 package.json', 'red');
      return false;
    }
    
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const version = packageJson.version;
    
    this.log(`📋 当前版本: v${version}`, 'magenta');
    
    // Check if this version has already been published
    try {
      const checkCommand = `npm view ${packageJson.name}@${version} version`;
      execSync(checkCommand, { stdio: 'ignore', cwd: this.rootDir });
      this.log(`❌ 版本 v${version} 已存在`, 'red');
      return false;
    } catch (error) {
      // Version doesn't exist, which is good
      this.log(`✅ 版本 v${version} 可用`, 'green');
      return true;
    }
  }

  async runBuild() {
    this.log('🔨 运行构建...', 'cyan');
    
    const buildScript = path.join(this.rootDir, 'scripts', 'build.js');
    if (fs.existsSync(buildScript)) {
      return await this.executeCommand('node scripts/build.js', '运行构建脚本');
    } else {
      return await this.executeCommand('npm run build', '运行 npm 构建');
    }
  }

  async runTests() {
    if (process.argv.includes('--skip-tests')) {
      this.log('⏭️  跳过测试', 'yellow');
      return true;
    }
    
    this.log('🧪 运行测试...', 'cyan');
    return await this.executeCommand('npm test', '运行测试套件');
  }

  async updateChangelog(version) {
    const changelogPath = path.join(this.rootDir, 'CHANGELOG.md');
    
    if (!fs.existsSync(changelogPath)) {
      this.log('⚠️  CHANGELOG.md 不存在，跳过更新', 'yellow');
      return true;
    }
    
    const date = new Date().toISOString().split('T')[0];
    const newEntry = `## [${version}] - ${date}

### Added
- Framework version ${version} release

### Changed
- Updated build and configuration

### Fixed
- Resolved various issues

---

`;
    
    const currentContent = fs.readFileSync(changelogPath, 'utf8');
    fs.writeFileSync(changelogPath, newEntry + currentContent);
    
    this.log('✅ CHANGELOG.md 已更新', 'green');
    return true;
  }

  async createGitTag(version) {
    this.log('🏷️  创建 Git 标签...', 'cyan');
    
    const tagName = `v${version}`;
    
    // Check if tag already exists
    try {
      execSync(`git tag -l ${tagName}`, { stdio: 'ignore', cwd: this.rootDir });
      this.log(`❌ Git 标签 ${tagName} 已存在`, 'red');
      return false;
    } catch (error) {
      // Tag doesn't exist, which is good
    }
    
    const success = await this.executeCommand(
      `git tag -a ${tagName} -m "Release version ${version}"`,
      `创建 Git 标签 ${tagName}`
    );
    
    if (success) {
      this.log(`✅ Git 标签 ${tagName} 创建成功`, 'green');
    }
    
    return success;
  }

  async publishToNpm() {
    this.log('📤 发布到 npm...', 'cyan');
    
    const packageJsonPath = path.join(this.rootDir, 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    
    // Check if already published
    try {
      await this.executeCommand(
        `npm view ${packageJson.name}@${packageJson.version}`,
        '检查包是否已发布'
      );
      this.log(`❌ 版本 ${packageJson.version} 已发布`, 'red');
      return false;
    } catch (error) {
      // Package doesn't exist, good to publish
    }
    
    const publishFlags = process.argv.includes('--dry-run') ? '--dry-run' : '';
    const accessFlag = packageJson.name.startsWith('@') ? '--access public' : '';
    
    return await this.executeCommand(
      `npm publish ${publishFlags} ${accessFlag}`,
      `发布 ${packageJson.name}@${packageJson.version} 到 npm`
    );
  }

  async pushToGitHub() {
    if (process.argv.includes('--no-push')) {
      this.log('⏭️  跳过推送到 GitHub', 'yellow');
      return true;
    }
    
    this.log('🚀 推送到 GitHub...', 'cyan');
    
    const pushSuccess = await this.executeCommand('git push origin main', '推送代码');
    if (!pushSuccess) return false;
    
    const pushTagsSuccess = await this.executeCommand('git push --tags', '推送标签');
    if (!pushTagsSuccess) return false;
    
    return true;
  }

  async createGitHubRelease(version) {
    if (process.argv.includes('--no-release')) {
      this.log('⏭️  跳过创建 GitHub Release', 'yellow');
      return true;
    }
    
    this.log('🎉 创建 GitHub Release...', 'cyan');
    
    try {
      // Check if gh CLI is available
      execSync('gh --version', { stdio: 'ignore' });
    } catch (error) {
      this.log('⚠️  GitHub CLI 未安装，跳过创建 Release', 'yellow');
      return true;
    }
    
    const tagName = `v${version}`;
    const changelogPath = path.join(this.rootDir, 'CHANGELOG.md');
    let releaseNotes = `Release ${version}`;
    
    if (fs.existsSync(changelogPath)) {
      const changelog = fs.readFileSync(changelogPath, 'utf8');
      const versionMatch = changelog.match(new RegExp(`## \\[${version}\\] - \\d{4}-\\d{2}-\\d{2}\\n([\\s\\S]*?)(?=## \\[|$)`));
      if (versionMatch) {
        releaseNotes = versionMatch[1].trim();
      }
    }
    
    return await this.executeCommand(
      `gh release create ${tagName} --title "Release ${version}" --notes "${releaseNotes.replace(/"/g, '\\"')}"`,
      '创建 GitHub Release'
    );
  }

  async confirm(message) {
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    return new Promise((resolve) => {
      rl.question(`${message} (y/N): `, (answer) => {
        rl.close();
        resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
      });
    });
  }

  async publish() {
    const startTime = Date.now();
    
    this.log('🚀 开始发布 OpenAI Compatible Providers Framework', 'cyan');
    this.log('=' .repeat(60), 'cyan');
    
    try {
      const packageJsonPath = path.join(this.rootDir, 'package.json');
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      const version = packageJson.version;
      
      // Step 1: Check Git status
      if (!(await this.checkGitStatus())) {
        process.exit(1);
      }
      
      // Step 2: Check version
      if (!(await this.checkVersion())) {
        process.exit(1);
      }
      
      // Step 3: Confirm release
      if (!process.argv.includes('--dry-run') && !process.argv.includes('--force')) {
        const proceed = await this.confirm(`确认发布版本 v${version}?`);
        if (!proceed) {
          this.log('❌ 发布已取消', 'red');
          process.exit(0);
        }
      }
      
      // Step 4: Build
      if (!(await this.runBuild())) {
        process.exit(1);
      }
      
      // Step 5: Run tests
      if (!(await this.runTests())) {
        this.log('⚠️  测试失败，但继续发布', 'yellow');
      }
      
      // Step 6: Update changelog
      await this.updateChangelog(version);
      
      // Step 7: Create Git tag
      if (!(await this.createGitTag(version))) {
        process.exit(1);
      }
      
      // Step 8: Publish to npm
      if (!(await this.publishToNpm())) {
        process.exit(1);
      }
      
      // Step 9: Push to GitHub
      if (!(await this.pushToGitHub())) {
        process.exit(1);
      }
      
      // Step 10: Create GitHub Release
      await this.createGitHubRelease(version);
      
      const endTime = Date.now();
      const duration = ((endTime - startTime) / 1000).toFixed(2);
      
      this.log('=' .repeat(60), 'cyan');
      this.log(`🎉 发布完成! v${version} 耗时: ${duration}秒`, 'green');
      this.log(`📦 npm 包: ${packageJson.name}@${version}`, 'blue');
      this.log(`🏷️  Git 标签: v${version}`, 'blue');
      
    } catch (error) {
      this.log(`❌ 发布失败: ${error.message}`, 'red');
      process.exit(1);
    }
  }
}

// Run publish if this script is executed directly
if (require.main === module) {
  const publisher = new PublishManager();
  publisher.publish().catch(console.error);
}

module.exports = PublishManager;