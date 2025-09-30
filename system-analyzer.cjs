#!/usr/bin/env node

/**
 * 系统分析器
 * 分析当前系统中的错误点击风险和安全问题
 */

const fs = require('fs');
const path = require('path');

/**
 * 系统分析器
 */
class SystemAnalyzer {
  constructor() {
    this.projectRoot = process.cwd();
    this.issues = [];
    this.recommendations = [];
    this.clickOperations = [];
    this.containerOperations = [];
  }

  /**
   * 分析整个系统
   */
  async analyzeSystem() {
    console.log('🔍 开始系统分析...\n');

    // 1. 分析JavaScript文件中的点击操作
    await this.analyzeJavaScriptFiles();

    // 2. 分析TypeScript文件中的点击操作
    await this.analyzeTypeScriptFiles();

    // 3. 检查是否有安全系统文件
    this.checkSafetySystems();

    // 4. 生成报告
    this.generateReport();

    console.log('✅ 系统分析完成');
  }

  /**
   * 分析JavaScript文件
   */
  async analyzeJavaScriptFiles() {
    console.log('📄 分析JavaScript文件...');

    const jsFiles = this.findFiles('.js', '.cjs');

    for (const file of jsFiles) {
      await this.analyzeFileForClicks(file, 'JavaScript');
    }
  }

  /**
   * 分析TypeScript文件
   */
  async analyzeTypeScriptFiles() {
    console.log('📄 分析TypeScript文件...');

    const tsFiles = this.findFiles('.ts');

    for (const file of tsFiles) {
      await this.analyzeFileForClicks(file, 'TypeScript');
    }
  }

  /**
   * 查找文件
   */
  findFiles(...extensions) {
    const files = [];

    const findFiles = (dir) => {
      const items = fs.readdirSync(dir, { withFileTypes: true });

      for (const item of items) {
        const fullPath = path.join(dir, item.name);

        if (item.isDirectory() && !item.name.startsWith('.') && item.name !== 'node_modules') {
          findFiles(fullPath);
        } else if (item.isFile() && extensions.some(ext => item.name.endsWith(ext))) {
          files.push(fullPath);
        }
      }
    };

    findFiles(this.projectRoot);
    return files;
  }

  /**
   * 分析文件中的点击操作
   */
  async analyzeFileForClicks(filePath, language) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const relativePath = path.relative(this.projectRoot, filePath);

      // 查找点击操作
      const clickPatterns = [
        /\.click\s*\(/g,
        /page\.click\s*\(/g,
        /element\.click\s*\(/g,
        /await.*click\s*\(/g,
        /\$\s*\(\s*['"][^'"]*['"]\s*\)\.click\s*\(/g
      ];

      const containerPatterns = [
        /querySelector\(/g,
        /querySelectorAll\(/g,
        /\$\s*\(/g,
        /container/gi
      ];

      const riskyPatterns = [
        /document\.querySelector/g,
        /document\.querySelectorAll/g,
        /window\.document/g,
        /global\./gi,
        /body/gi
      ];

      let hasClickOperations = false;
      let hasContainerOperations = false;
      let hasRiskyOperations = false;

      // 检查点击操作
      for (const pattern of clickPatterns) {
        const matches = content.match(pattern);
        if (matches) {
          hasClickOperations = true;
          this.clickOperations.push({
            file: relativePath,
            language,
            pattern: pattern.source,
            count: matches.length
          });
        }
      }

      // 检查容器操作
      for (const pattern of containerPatterns) {
        const matches = content.match(pattern);
        if (matches) {
          hasContainerOperations = true;
          this.containerOperations.push({
            file: relativePath,
            language,
            pattern: pattern.source,
            count: matches.length
          });
        }
      }

      // 检查风险操作
      for (const pattern of riskyPatterns) {
        const matches = content.match(pattern);
        if (matches) {
          hasRiskyOperations = true;
          this.issues.push({
            type: 'risky_operation',
            file: relativePath,
            language,
            pattern: pattern.source,
            count: matches.length,
            severity: 'high'
          });
        }
      }

      // 检查是否使用了安全系统
      const safetyImports = [
        'SafeClickManager',
        'SafeAvoidanceManager',
        'SafeContainerManager',
        'BaseWeiboSystem',
        'EnhancedUnifiedCookieManager'
      ];

      const hasSafetySystems = safetyImports.some(imp => content.includes(imp));

      if (hasClickOperations && !hasSafetySystems) {
        this.issues.push({
          type: 'missing_safety_system',
          file: relativePath,
          language,
          clickOperations: hasClickOperations,
          severity: 'medium'
        });
      }

      // 检查是否有全局点击
      const globalClicks = content.match(/\$\s*\(\s*['"]([^'"]*)['"]\s*\)\.click\s*\(/g);
      if (globalClicks) {
        globalClicks.forEach(click => {
          const selector = click.match(/['"]([^'"]*)['"]/)[1];
          if (this.isGlobalSelector(selector)) {
            this.issues.push({
              type: 'global_click',
              file: relativePath,
              language,
              selector,
              severity: 'high'
            });
          }
        });
      }

    } catch (error) {
      console.warn(`⚠️ 分析文件失败 ${filePath}:`, error.message);
    }
  }

  /**
   * 检查是否是全局选择器
   */
  isGlobalSelector(selector) {
    const globalPatterns = [
      /^body$/,
      /^html$/,
      /^document$/,
      /^window$/,
      /^\*/,
      /^div$/,
      /^a$/,
      /^button$/,
      /^input$/,
      /^span$/
    ];

    return globalPatterns.some(pattern => pattern.test(selector));
  }

  /**
   * 检查安全系统文件
   */
  checkSafetySystems() {
    console.log('🛡️ 检查安全系统文件...');

    const safetyFiles = [
      'enhanced-unified-cookie-manager.cjs',
      'safe-click-manager.cjs',
      'safe-container-manager.cjs',
      'unified-system-template.cjs',
      'test-safe-systems.cjs'
    ];

    const existingSafetyFiles = [];
    const missingSafetyFiles = [];

    for (const file of safetyFiles) {
      const fullPath = path.join(this.projectRoot, file);
      if (fs.existsSync(fullPath)) {
        existingSafetyFiles.push(file);
      } else {
        missingSafetyFiles.push(file);
      }
    }

    if (existingSafetyFiles.length > 0) {
      this.recommendations.push({
        type: 'safety_systems_available',
        message: `发现 ${existingSafetyFiles.length} 个安全系统文件`,
        files: existingSafetyFiles
      });
    }

    if (missingSafetyFiles.length > 0) {
      this.issues.push({
        type: 'missing_safety_files',
        message: `缺少 ${missingSafetyFiles.length} 个安全系统文件`,
        files: missingSafetyFiles,
        severity: 'medium'
      });
    }
  }

  /**
   * 生成报告
   */
  generateReport() {
    console.log('\n📊 ===============================================');
    console.log('📋 系统分析报告');
    console.log('📊 ===============================================\n');

    // 1. 总体统计
    console.log('📈 总体统计:');
    console.log(`   • 发现 ${this.clickOperations.length} 个点击操作`);
    console.log(`   • 发现 ${this.containerOperations.length} 个容器操作`);
    console.log(`   • 发现 ${this.issues.length} 个问题`);
    console.log(`   • 提供 ${this.recommendations.length} 个建议\n`);

    // 2. 按严重程度分类的问题
    const severityGroups = this.groupBySeverity();

    console.log('⚠️ 问题分析:');
    for (const [severity, issues] of Object.entries(severityGroups)) {
      console.log(`   ${severity.toUpperCase()} (${issues.length} 个):`);
      issues.forEach(issue => {
        console.log(`     • ${issue.file}: ${issue.message || issue.type}`);
      });
    }

    // 3. 点击操作分析
    if (this.clickOperations.length > 0) {
      console.log('\n🖱️ 点击操作分析:');
      const clickGroups = this.groupByFile(this.clickOperations);
      for (const [file, operations] of Object.entries(clickGroups)) {
        console.log(`   • ${file}:`);
        operations.forEach(op => {
          console.log(`     - ${op.pattern} (${op.count} 次)`);
        });
      }
    }

    // 4. 容器操作分析
    if (this.containerOperations.length > 0) {
      console.log('\n📦 容器操作分析:');
      const containerGroups = this.groupByFile(this.containerOperations);
      for (const [file, operations] of Object.entries(containerGroups)) {
        console.log(`   • ${file}:`);
        operations.forEach(op => {
          console.log(`     - ${op.pattern} (${op.count} 次)`);
        });
      }
    }

    // 5. 建议
    if (this.recommendations.length > 0) {
      console.log('\n💡 建议:');
      this.recommendations.forEach(rec => {
        console.log(`   • ${rec.message}`);
      });
    }

    // 6. 改进建议
    console.log('\n🔧 改进建议:');
    console.log('   1. 使用 safe-click-manager.cjs 替换直接的 .click() 调用');
    console.log('   2. 使用 safe-container-manager.cjs 进行容器管理');
    console.log('   3. 基于 unified-system-template.cjs 创建新系统');
    console.log('   4. 避免使用全局选择器，使用容器限定选择器');
    console.log('   5. 实现安全避让措施防止反爬虫检测');
    console.log('   6. 确保所有系统都使用统一的Cookie管理');

    // 7. 生成总结
    const riskScore = this.calculateRiskScore();
    console.log(`\n🎯 风险评分: ${riskScore}/100`);

    if (riskScore >= 70) {
      console.log('🔴 高风险 - 需要立即改进');
    } else if (riskScore >= 40) {
      console.log('🟡 中等风险 - 建议改进');
    } else {
      console.log('🟢 低风险 - 系统相对安全');
    }
  }

  /**
   * 按严重程度分组
   */
  groupBySeverity() {
    const groups = {
      high: [],
      medium: [],
      low: []
    };

    this.issues.forEach(issue => {
      if (groups[issue.severity]) {
        groups[issue.severity].push(issue);
      } else {
        groups.low.push(issue);
      }
    });

    return groups;
  }

  /**
   * 按文件分组
   */
  groupByFile(operations) {
    const groups = {};

    operations.forEach(op => {
      if (!groups[op.file]) {
        groups[op.file] = [];
      }
      groups[op.file].push(op);
    });

    return groups;
  }

  /**
   * 计算风险评分
   */
  calculateRiskScore() {
    let score = 0;

    // 基础分数：点击操作数量
    score += Math.min(this.clickOperations.length * 2, 20);

    // 高风险问题
    const highRiskIssues = this.issues.filter(issue => issue.severity === 'high').length;
    score += highRiskIssues * 15;

    // 中等风险问题
    const mediumRiskIssues = this.issues.filter(issue => issue.severity === 'medium').length;
    score += mediumRiskIssues * 8;

    // 全局点击操作
    const globalClicks = this.issues.filter(issue => issue.type === 'global_click').length;
    score += globalClicks * 10;

    // 缺少安全系统
    const missingSafety = this.issues.filter(issue => issue.type === 'missing_safety_system').length;
    score += missingSafety * 5;

    return Math.min(score, 100);
  }
}

/**
 * 主函数
 */
async function main() {
  const analyzer = new SystemAnalyzer();
  await analyzer.analyzeSystem();
}

// 如果直接运行此脚本
if (require.main === module) {
  main()
    .then(() => {
      console.log('\n✅ 系统分析完成');
    })
    .catch((error) => {
      console.error('❌ 系统分析失败:', error.message);
      process.exit(1);
    });
}

// 导出分析器
module.exports = SystemAnalyzer;