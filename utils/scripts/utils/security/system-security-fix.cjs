#!/usr/bin/env node

/**
 * 系统安全修复脚本
 * 自动修复高风险的点击操作和容器管理问题
 */

const fs = require('fs');
const path = require('path');

/**
 * 系统安全修复器
 */
class SystemSecurityFixer {
  constructor() {
    this.projectRoot = process.cwd();
    this.fixes = [];
    this.errors = [];
    this.backupFiles = new Set();
  }

  /**
   * 执行安全修复
   */
  async fixSecurityIssues() {
    console.log('🔧 开始系统安全修复...\n');

    try {
      // 1. 备份重要文件
      await this.backupCriticalFiles();

      // 2. 修复高风险文件
      await this.fixHighRiskFiles();

      // 3. 更新容器系统
      await this.updateContainerSystems();

      // 4. 创建安全使用指南
      await this.createSecurityGuide();

      // 5. 生成修复报告
      this.generateFixReport();

      console.log('✅ 系统安全修复完成');

    } catch (error) {
      console.error('❌ 系统安全修复失败:', error.message);
      throw error;
    }
  }

  /**
   * 备份关键文件
   */
  async backupCriticalFiles() {
    console.log('💾 备份关键文件...');

    const criticalFiles = [
      'absolute-mode-weibo-capture.cjs',
      'test-event-driven-json-orchestration.cjs',
      'test-weibo-real-links.cjs'
    ];

    for (const file of criticalFiles) {
      const fullPath = path.join(this.projectRoot, file);
      if (fs.existsSync(fullPath)) {
        const backupPath = `${fullPath}.backup.${Date.now()}`;
        fs.copyFileSync(fullPath, backupPath);
        this.backupFiles.add(backupPath);
        console.log(`  ✅ 已备份: ${file}`);
      }
    }
  }

  /**
   * 修复高风险文件
   */
  async fixHighRiskFiles() {
    console.log('🔧 修复高风险文件...');

    const filesToFix = [
      'absolute-mode-weibo-capture.cjs',
      'test-event-driven-json-orchestration.cjs',
      'test-weibo-real-links.cjs'
    ];

    for (const file of filesToFix) {
      await this.fixFile(file);
    }
  }

  /**
   * 修复单个文件
   */
  async fixFile(fileName) {
    const fullPath = path.join(this.projectRoot, fileName);
    if (!fs.existsSync(fullPath)) {
      console.log(`  ⚠️ 文件不存在: ${fileName}`);
      return;
    }

    try {
      let content = fs.readFileSync(fullPath, 'utf8');
      const originalContent = content;

      // 1. 添加安全系统导入
      if (!content.includes('safe-click-manager.cjs')) {
        const importStatement = `const { SafeClickManager, SafeAvoidanceManager } = require('./safe-click-manager.cjs');\n`;
        content = importStatement + content;
      }

      // 2. 替换直接点击操作
      content = this.replaceDirectClicks(content);

      // 3. 添加安全初始化
      content = this.addSafetyInitialization(content);

      // 4. 如果有变化，保存文件
      if (content !== originalContent) {
        fs.writeFileSync(fullPath, content, 'utf8');
        this.fixes.push({
          file: fileName,
          type: 'security_enhancement',
          changes: this.countChanges(originalContent, content)
        });
        console.log(`  ✅ 已修复: ${fileName}`);
      } else {
        console.log(`  ℹ️ 无需修复: ${fileName}`);
      }

    } catch (error) {
      this.errors.push({
        file: fileName,
        error: error.message
      });
      console.log(`  ❌ 修复失败: ${fileName} - ${error.message}`);
    }
  }

  /**
   * 替换直接点击操作
   */
  replaceDirectClicks(content) {
    // 替换 element.click()
    content = content.replace(
      /element\.click\s*\(\)/g,
      'await this.safeClick(elementSelector, { container: currentContainer })'
    );

    // 替换 page.click()
    content = content.replace(
      /page\.click\s*\(\s*['"]([^'"]*)['"]\s*\)/g,
      'await this.safeClickInContainer(containerSelector, \'$1\')'
    );

    // 替换直接 .click()
    content = content.replace(
      /await\s+([^.\s]+)\.click\s*\(\)/g,
      'await this.safeClickInContainer(currentContainer, \'$1\')'
    );

    return content;
  }

  /**
   * 添加安全初始化
   */
  addSafetyInitialization(content) {
    // 查找构造函数或初始化函数
    const constructorMatch = content.match(/constructor\s*\([^)]*\)\s*{/);
    if (constructorMatch) {
      const initCode = `
    // 初始化安全管理器
    this.clickManager = new SafeClickManager({ safeMode: true });
    this.avoidanceManager = new SafeAvoidanceManager();
    this.currentContainer = null;`;

      content = content.replace(
        constructorMatch[0],
        constructorMatch[0] + initCode
      );
    }

    // 添加安全点击方法
    if (!content.includes('safeClick')) {
      const safeMethods = `
  /**
   * 安全点击方法
   */
  async safeClick(selector, options = {}) {
    return this.clickManager.safeClick(this.page, selector, options);
  }

  /**
   * 容器内安全点击
   */
  async safeClickInContainer(containerSelector, elementSelector, options = {}) {
    return this.clickManager.safeClickInContainer(this.page, containerSelector, elementSelector, options);
  }

  /**
   * 安全访问URL
   */
  async safeAccess(url, options = {}) {
    return this.avoidanceManager.safeAccess(this.page, url, options);
  }`;

      // 在类的末尾添加方法
      const lastBraceIndex = content.lastIndexOf('}');
      if (lastBraceIndex > 0) {
        content = content.slice(0, lastBraceIndex) + safeMethods + '\n}';
      }
    }

    return content;
  }

  /**
   * 计算变化数量
   */
  countChanges(original, modified) {
    const originalLines = original.split('\n');
    const modifiedLines = modified.split('\n');
    return Math.abs(originalLines.length - modifiedLines.length);
  }

  /**
   * 更新容器系统
   */
  async updateContainerSystems() {
    console.log('📦 更新容器系统...');

    // 更新现有的容器文件，添加安全检查
    const containerFiles = [
      'sharedmodule/operations-framework/src/containers/WeiboLinkContainer.ts',
      'sharedmodule/operations-framework/src/containers/WeiboCommentContainer.ts',
      'sharedmodule/operations-framework/src/containers/WeiboPaginationContainer.ts'
    ];

    for (const file of containerFiles) {
      await this.updateContainerFile(file);
    }
  }

  /**
   * 更新容器文件
   */
  async updateContainerFile(filePath) {
    const fullPath = path.join(this.projectRoot, filePath);
    if (!fs.existsSync(fullPath)) {
      return;
    }

    try {
      let content = fs.readFileSync(fullPath, 'utf8');
      const originalContent = content;

      // 添加安全检查到点击方法
      content = content.replace(
        /await\s+([^.\s]+)\.click\s*\(\)/g,
        'await this.safeClick($1, { container: this.containerSelector })'
      );

      if (content !== originalContent) {
        fs.writeFileSync(fullPath, content, 'utf8');
        this.fixes.push({
          file: filePath,
          type: 'container_security',
          changes: this.countChanges(originalContent, content)
        });
        console.log(`  ✅ 已更新容器: ${filePath}`);
      }

    } catch (error) {
      this.errors.push({
        file: filePath,
        error: error.message
      });
    }
  }

  /**
   * 创建安全使用指南
   */
  async createSecurityGuide() {
    console.log('📚 创建安全使用指南...');

    const guideContent = `# 系统安全使用指南

## 🛡️ 安全系统概述

本系统现在包含了完整的安全防护措施，确保所有操作都在安全的范围内进行。

## 📋 核心安全组件

### 1. 统一Cookie管理
- **文件**: \`enhanced-unified-cookie-manager.cjs\`
- **功能**: 自动Cookie管理、登录状态验证、回退到可视化登录
- **使用**: 所有新系统必须继承 \`BaseWeiboSystem\`

### 2. 安全点击管理
- **文件**: \`safe-click-manager.cjs\`
- **功能**: 容器内点击、错误检测、自动重试、黑名单机制
- **使用**: \`await this.safeClickInContainer(containerSelector, elementSelector)\`

### 3. 安全避让管理
- **文件**: \`safe-click-manager.cjs\`
- **功能**: 访问间隔控制、错误退避、URL黑名单
- **使用**: \`await this.safeAccess(url)\`

### 4. 安全容器管理
- **文件**: \`safe-container-manager.cjs\`
- **功能**: 容器验证、容器内操作、链接提取
- **使用**: \`await containerManager.executeInContainer(page, 'feedContainer', operation)\`

## 🔧 正确的使用模式

### 创建新系统
\`\`\`javascript
const { BaseWeiboSystem } = require('./unified-system-template.cjs');

class MySafeSystem extends BaseWeiboSystem {
  constructor(options = {}) {
    super({
      headless: false,
      safeMode: true,
      ...options
    });
  }

  async myOperation() {
    return this.executeOperation('myOperation', async () => {
      // 1. 安全访问URL
      await this.safeAccess('https://weibo.com');

      // 2. 容器内安全点击
      await this.safeClickInContainer(
        '[class*="feed"]',
        'button:has-text("加载更多")'
      );

      // 3. 安全滚动
      await this.safeScroll({ direction: 'down' });

      return '操作完成';
    });
  }
}
\`\`\`

### 使用容器管理器
\`\`\`javascript
const { createWeiboSafeContainerManager } = require('./safe-container-manager.cjs');

const containerManager = createWeiboSafeContainerManager();

// 初始化
const { page } = await containerManager.initializeCookieManager();

// 在容器内执行操作
const links = await containerManager.executeInContainer(
  page,
  'feedContainer',
  async ({ safeClick, extractElements }) => {
    await safeClick('button:has-text("加载更多")');
    const elements = await extractElements('a[href*="weibo.com"]');
    return elements;
  }
);
\`\`\`

## ⚠️ 禁止的操作模式

### ❌ 错误：直接点击
\`\`\`javascript
// 错误 - 可能误点击非目标元素
await page.click('button');
element.click();
\`\`\`

### ✅ 正确：容器内安全点击
\`\`\`javascript
// 正确 - 限制在特定容器内
await this.safeClickInContainer(
  '[class*="feed"]',
  'button:has-text("加载更多")'
);
\`\`\`

### ❌ 错误：全局选择器
\`\`\`javascript
// 错误 - 可能选择到错误的元素
const buttons = document.querySelectorAll('button');
\`\`\`

### ✅ 正确：容器限定选择器
\`\`\`javascript
// 正确 - 只在特定容器内选择
const buttons = document.querySelectorAll('[class*="feed"] button');
\`\`\`

## 🎯 安全最佳实践

1. **始终使用容器限定** - 所有操作都应该在特定容器内进行
2. **使用安全系统** - 新功能必须基于 \`BaseWeiboSystem\` 或使用容器管理器
3. **错误处理** - 所有操作都包含错误检测和恢复机制
4. **访问控制** - 避免频繁访问，使用避让机制
5. **日志记录** - 记录所有操作以便调试和审计

## 🧪 测试安全系统

运行安全测试：
\`\`\`bash
node test-safe-systems.cjs
\`\`\`

分析系统安全状态：
\`\`\`bash
node system-analyzer.cjs
\`\`\`

## 🔍 故障排除

### 常见问题

1. **"容器不存在"**
   - 检查容器选择器是否正确
   - 确保页面已完全加载
   - 使用 \`await page.waitForSelector(containerSelector)\`

2. **"连续错误次数过多"**
   - 检查选择器是否准确
   - 增加重试间隔
   - 使用 \`this.clickManager.resetErrors()\` 重置

3. **"URL在黑名单中"**
   - 使用 \`this.avoidanceManager.reset()\` 重置避让状态
   - 检查URL是否正确

## 📞 支持

如果遇到安全问题，请：
1. 查看系统分析报告
2. 运行安全测试
3. 检查日志文件
4. 参考本指南

---

*最后更新: ${new Date().toISOString().split('T')[0]}*
`;

    const guidePath = path.join(this.projectRoot, 'SECURITY_GUIDE.md');
    fs.writeFileSync(guidePath, guideContent, 'utf8');
    this.fixes.push({
      file: 'SECURITY_GUIDE.md',
      type: 'documentation',
      changes: 1
    });
    console.log('  ✅ 安全使用指南已创建');
  }

  /**
   * 生成修复报告
   */
  generateFixReport() {
    console.log('\n📊 ===============================================');
    console.log('📋 安全修复报告');
    console.log('📊 ===============================================\n');

    console.log('✅ 修复完成:');
    console.log(`   • 修复了 ${this.fixes.length} 个问题`);
    console.log(`   • 备份了 ${this.backupFiles.size} 个文件`);
    console.log(`   • 遇到 ${this.errors.length} 个错误\n`);

    if (this.fixes.length > 0) {
      console.log('🔧 修复详情:');
      this.fixes.forEach((fix, index) => {
        console.log(`   ${index + 1}. ${fix.file} (${fix.type})`);
        if (fix.changes) {
          console.log(`      变更: ${fix.changes} 处`);
        }
      });
    }

    if (this.errors.length > 0) {
      console.log('\n❌ 修复错误:');
      this.errors.forEach((error, index) => {
        console.log(`   ${index + 1}. ${error.file}: ${error.error}`);
      });
    }

    console.log('\n🎯 下一步建议:');
    console.log('   1. 运行安全测试: node test-safe-systems.cjs');
    console.log('   2. 重新分析系统: node system-analyzer.cjs');
    console.log('   3. 查看使用指南: cat SECURITY_GUIDE.md');
    console.log('   4. 测试修复后的系统功能');

    console.log('\n🛡️ 安全改进总结:');
    console.log('   ✅ 替换直接点击为容器内安全点击');
    console.log('   ✅ 添加安全系统初始化');
    console.log('   ✅ 创建安全使用指南');
    console.log('   ✅ 备份原始文件');
  }
}

/**
 * 主函数
 */
async function main() {
  const fixer = new SystemSecurityFixer();
  await fixer.fixSecurityIssues();
}

// 如果直接运行此脚本
if (require.main === module) {
  main()
    .then(() => {
      console.log('\n✅ 安全修复完成');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ 安全修复失败:', error.message);
      process.exit(1);
    });
}

// 导出修复器
module.exports = SystemSecurityFixer;