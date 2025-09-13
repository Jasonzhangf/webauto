#!/usr/bin/env node

/**
 * 发布脚本
 * 自动化模块发布流程
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const semver = require('semver');

const rootDir = path.resolve(__dirname, '..');
const packageJson = require(path.join(rootDir, 'package.json'));

console.log('🚀 Starting publish process for @webauto/browser-assistant...');

/**
 * 检查前置条件
 */
function checkPrerequisites() {
  console.log('🔍 Checking prerequisites...');
  
  // 检查是否登录 npm
  try {
    const whoami = execSync('npm whoami', { encoding: 'utf8' }).trim();
    console.log(`✅ Logged in as: ${whoami}`);
  } catch (error) {
    console.error('❌ Not logged in to npm. Please run: npm login');
    process.exit(1);
  }

  // 检查 git 状态
  try {
    const status = execSync('git status --porcelain', { encoding: 'utf8' }).trim();
    if (status) {
      console.warn('⚠️  Git working directory is not clean:');
      console.warn(status);
      
      const readline = require('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });
      
      return new Promise((resolve) => {
        rl.question('Continue anyway? (y/N): ', (answer) => {
          rl.close();
          if (answer.toLowerCase() === 'y') {
            resolve();
          } else {
            console.log('Publish cancelled');
            process.exit(0);
          }
        });
      });
    }
  } catch (error) {
    console.warn('⚠️  Could not check git status:', error.message);
  }

  console.log('✅ Prerequisites check completed');
}

/**
 * 确定版本号
 */
async function determineVersion() {
  const currentVersion = packageJson.version;
  console.log(`📦 Current version: ${currentVersion}`);

  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(`
Select version type:
1) Patch (${semver.inc(currentVersion, 'patch')})
2) Minor (${semver.inc(currentVersion, 'minor')})
3) Major (${semver.inc(currentVersion, 'major')})
4) Custom version
5) Keep current version

Choice (1-5): `, async (answer) => {
      rl.close();
      
      let newVersion;
      
      switch (answer.trim()) {
        case '1':
          newVersion = semver.inc(currentVersion, 'patch');
          break;
        case '2':
          newVersion = semver.inc(currentVersion, 'minor');
          break;
        case '3':
          newVersion = semver.inc(currentVersion, 'major');
          break;
        case '4':
          const customRl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
          });
          
          newVersion = await new Promise((customResolve) => {
            customRl.question('Enter custom version: ', (customAnswer) => {
              customRl.close();
              customResolve(customAnswer.trim());
            });
          });
          break;
        case '5':
          newVersion = currentVersion;
          break;
        default:
          console.log('Invalid choice, using patch version');
          newVersion = semver.inc(currentVersion, 'patch');
      }

      if (!semver.valid(newVersion)) {
        console.error(`❌ Invalid version: ${newVersion}`);
        process.exit(1);
      }

      console.log(`✅ New version: ${newVersion}`);
      resolve(newVersion);
    });
  });
}

/**
 * 更新版本号
 */
function updateVersion(newVersion) {
  const packagePath = path.join(rootDir, 'package.json');
  const packageData = require(packagePath);
  
  packageData.version = newVersion;
  
  fs.writeFileSync(packagePath, JSON.stringify(packageData, null, 2));
  console.log(`✅ Updated package.json version to ${newVersion}`);
}

/**
 * 更新 CHANGELOG
 */
function updateChangelog(version) {
  const changelogPath = path.join(rootDir, 'CHANGELOG.md');
  
  if (!fs.existsSync(changelogPath)) {
    console.log('📝 Creating CHANGELOG.md...');
    
    const initialChangelog = `# Change Log

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [${version}] - ${new Date().toISOString().split('T')[0]}

### Added
- Initial release of @webauto/browser-assistant
- Camoufox browser integration
- AI-powered page analysis
- Content extraction capabilities
- WebSocket control interface
- Cookie management system

### Changed
- Nothing yet

### Deprecated
- Nothing yet

### Removed
- Nothing yet

### Fixed
- Nothing yet

### Security
- Nothing yet
`;

    fs.writeFileSync(changelogPath, initialChangelog);
    console.log('✅ Created initial CHANGELOG.md');
  } else {
    console.log('📝 CHANGELOG.md already exists, please update it manually');
  }
}

/**
 * 创建 git tag 和 commit
 */
function createGitCommit(version) {
  try {
    // 添加文件到 git
    execSync('git add package.json CHANGELOG.md', { stdio: 'inherit' });
    
    // 创建 commit
    execSync(`git commit -m "chore: release version ${version}"`, { stdio: 'inherit' });
    
    // 创建 tag
    execSync(`git tag v${version}`, { stdio: 'inherit' });
    
    console.log(`✅ Created git commit and tag v${version}`);
  } catch (error) {
    console.warn('⚠️  Git operations failed:', error.message);
  }
}

/**
 * 构建项目
 */
function buildProject() {
  console.log('🔨 Building project...');
  
  try {
    execSync('npm run clean', { stdio: 'inherit' });
    execSync('npm run build', { stdio: 'inherit' });
    console.log('✅ Project built successfully');
  } catch (error) {
    console.error('❌ Build failed:', error.message);
    process.exit(1);
  }
}

/**
 * 运行测试
 */
function runTests() {
  console.log('🧪 Running tests...');
  
  try {
    execSync('npm test', { stdio: 'inherit' });
    console.log('✅ Tests passed');
  } catch (error) {
    console.error('❌ Tests failed:', error.message);
    console.log('🤔 Continue anyway? (y/N)');
    
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    return new Promise((resolve) => {
      rl.question('', (answer) => {
        rl.close();
        if (answer.toLowerCase() === 'y') {
          resolve();
        } else {
          console.log('Publish cancelled');
          process.exit(0);
        }
      });
    });
  }
}

/**
 * 发布到 npm
 */
function publishToNpm() {
  console.log('📤 Publishing to npm...');
  
  try {
    // 发布到当前目录（dist）
    process.chdir(path.join(rootDir, 'dist'));
    execSync('npm publish --access public', { stdio: 'inherit' });
    
    // 切换回根目录
    process.chdir(rootDir);
    
    console.log('✅ Published to npm successfully');
  } catch (error) {
    console.error('❌ Publish failed:', error.message);
    process.exit(1);
  }
}

/**
 * 推送 git 更新
 */
function pushGitUpdates() {
  try {
    execSync('git push && git push --tags', { stdio: 'inherit' });
    console.log('✅ Pushed git updates');
  } catch (error) {
    console.warn('⚠️  Failed to push git updates:', error.message);
  }
}

/**
 * 主函数
 */
async function main() {
  try {
    // 1. 检查前置条件
    await checkPrerequisites();
    
    // 2. 确定版本号
    const newVersion = await determineVersion();
    
    // 3. 更新版本号
    updateVersion(newVersion);
    
    // 4. 更新 CHANGELOG
    updateChangelog(newVersion);
    
    // 5. 创建 git commit 和 tag
    createGitCommit(newVersion);
    
    // 6. 构建项目
    buildProject();
    
    // 7. 运行测试
    await runTests();
    
    // 8. 发布到 npm
    publishToNpm();
    
    // 9. 推送 git 更新
    pushGitUpdates();
    
    console.log('🎉 Publish completed successfully!');
    console.log(`📦 Package @webauto/browser-assistant@${newVersion} is now available on npm`);
    
  } catch (error) {
    console.error('❌ Publish process failed:', error);
    process.exit(1);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  main();
}

module.exports = {
  checkPrerequisites,
  determineVersion,
  updateVersion,
  updateChangelog,
  createGitCommit,
  buildProject,
  runTests,
  publishToNpm,
  pushGitUpdates
};