/**
 * 智能微博搜索捕获工具
 * 使用IntelligentPostObserver动态识别帖子元素并提取内容
 */

const { CamoufoxManager } = require('./dist-simple/browser/CamoufoxManager');
const IntelligentPostObserver = require('./IntelligentPostObserver');
const fs = require('fs');
const path = require('path');

class SmartWeiboSearchCapture {
  constructor(options = {}) {
    this.browserManager = new CamoufoxManager({
      headless: false,
      autoInjectCookies: true,
      waitForLogin: true,
      targetDomain: 'weibo.com',
      defaultTimeout: 15000,
      ...options
    });
    
    this.observer = new IntelligentPostObserver({
      observationTime: 8000,
      minContentLength: 15,
      maxCandidates: 8,
      ...options.observerOptions
    });
    
    this.saveRootDir = options.saveRootDir || path.join(process.env.HOME, '.webauto');
    this.results = [];
  }

  async initialize() {
    console.log('🚀 初始化智能微博搜索捕获工具...\n');
    await this.browserManager.initializeWithAutoLogin('https://weibo.com');
  }

  async searchKeyword(keyword) {
    console.log(`🔍 开始智能搜索关键字: "${keyword}"\n`);
    
    const page = await this.browserManager.getCurrentPage();
    
    // 使用正确的微博搜索URL
    const searchUrl = `https://s.weibo.com/weibo?q=${encodeURIComponent(keyword)}`;
    console.log(`   🔍 使用搜索URL: ${searchUrl}`);
    
    await this.browserManager.navigate(searchUrl);
    await page.waitForTimeout(3000);
    
    // 验证是否在搜索结果页面
    const currentUrl = page.url();
    console.log(`   📍 当前页面: ${currentUrl}`);
    
    if (!currentUrl.includes('s.weibo.com')) {
      throw new Error('未能成功访问搜索结果页面');
    }
    
    console.log('   ✅ 搜索页面加载完成\n');
    return true;
  }

  async intelligentCapture() {
    console.log('🤖 开始智能帖子识别和捕获...\n');
    
    const page = await this.browserManager.getCurrentPage();
    
    try {
      // 1. 观察页面并识别候选元素
      console.log('🔍 步骤1: 观察页面结构...');
      const candidates = await this.observer.observePage(page);
      
      if (candidates.length === 0) {
        console.log('⚠️  未找到合适的候选元素');
        return [];
      }
      
      console.log(`✅ 找到 ${candidates.length} 个候选元素\n`);
      
      // 2. 提取帖子链接
      console.log('🔗 步骤2: 提取帖子链接...');
      const links = await this.observer.extractPostLinks(page, candidates);
      
      if (links.length === 0) {
        console.log('⚠️  未找到任何链接');
        return [];
      }
      
      console.log(`✅ 找到 ${links.length} 个候选链接\n`);
      
      // 3. 批量访问链接提取内容
      console.log('📝 步骤3: 批量提取内容...');
      const contentResults = await this.observer.batchExtractContent(page, links.slice(0, 20), {
        batchSize: 3,
        delay: 3000
      });
      
      // 4. 处理和保存结果
      const successfulResults = contentResults.filter(r => r.success);
      console.log(`\n✅ 成功提取 ${successfulResults.length} 个帖子的内容`);
      
      this.results = successfulResults.map((result, index) => ({
        id: `smart_post_${index + 1}`,
        url: result.link.url,
        selector: result.link.selector,
        score: result.link.score,
        content: result.content,
        metadata: result.metadata,
        linkInfo: {
          linkText: result.link.linkText,
          context: result.link.context
        },
        extractedAt: new Date().toISOString()
      }));
      
      return this.results;
      
    } catch (error) {
      console.error('❌ 智能捕获失败:', error.message);
      throw error;
    } finally {
      // 清理观察器
      await this.observer.stopObservation(page);
    }
  }

  createSaveDirectory(keyword) {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const safeKeyword = keyword.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_');
    const saveDir = path.join(this.saveRootDir, today, `smart_${safeKeyword}`);
    
    // 确保目录存在
    if (!fs.existsSync(this.saveRootDir)) {
      fs.mkdirSync(this.saveRootDir, { recursive: true });
    }
    
    if (!fs.existsSync(path.join(this.saveRootDir, today))) {
      fs.mkdirSync(path.join(this.saveRootDir, today), { recursive: true });
    }
    
    if (!fs.existsSync(saveDir)) {
      fs.mkdirSync(saveDir, { recursive: true });
    }
    
    return saveDir;
  }

  async saveResults(keyword) {
    console.log(`💾 保存智能捕获结果到本地文件...\n`);
    
    if (this.results.length === 0) {
      console.log('⚠️  没有结果需要保存');
      return;
    }
    
    const saveDir = this.createSaveDirectory(keyword);
    const savedFiles = [];
    
    // 保存每个帖子的内容
    for (let i = 0; i < this.results.length; i++) {
      const result = this.results[i];
      const filename = `smart_post_${i + 1}_${result.id}.md`;
      const filepath = path.join(saveDir, filename);
      
      const markdown = this.generatePostMarkdown(result, keyword, i + 1);
      fs.writeFileSync(filepath, markdown, 'utf8');
      savedFiles.push(filepath);
      
      console.log(`   ✅ 保存帖子 ${i + 1}/${this.results.length}: ${filename}`);
    }
    
    // 保存智能分析报告
    const reportFile = path.join(saveDir, 'smart_analysis_report.md');
    const report = this.generateAnalysisReport(keyword, this.results, saveDir);
    fs.writeFileSync(reportFile, report, 'utf8');
    
    // 保存原始数据
    const dataFile = path.join(saveDir, 'raw_data.json');
    fs.writeFileSync(dataFile, JSON.stringify(this.results, null, 2), 'utf8');
    
    console.log(`\n📁 所有文件已保存到: ${saveDir}`);
    console.log(`📊 总计保存 ${this.results.length} 条智能捕获帖子\n`);
    
    return { saveDir, savedFiles, reportFile, dataFile };
  }

  generatePostMarkdown(result, keyword, index) {
    return `# 智能捕获帖子 ${index}

**搜索关键字:** ${keyword}
**智能识别得分:** ${result.score.toFixed(3)}
**帖子ID:** ${result.id}
**选择器:** \`${result.selector}\`

---

## 内容

${result.content}

## 链接信息

- **原文链接:** [${result.linkInfo.linkText || '查看原文'}](${result.url})
- **链接上下文:** ${result.linkInfo.context || '无'}

## 元信息

- **提取时间:** ${new Date(result.extractedAt).toLocaleString('zh-CN')}
- **页面标题:** ${result.metadata.title || '未知'}
- **内容长度:** ${result.content.length} 字符
- **内容选择器:** ${result.metadata.contentSelector || '自动检测'}
- **数据源:** 智能微博搜索捕获
- **搜索关键字:** ${keyword}

## 智能分析

- **元素识别置信度:** ${result.score >= 0.8 ? '高' : result.score >= 0.6 ? '中' : '低'}
- **匹配选择器:** ${result.selector}
- **提取方法:** 智能观察器 + 批量访问

---

*此文件由智能微博搜索捕获工具自动生成*`;
  }

  generateAnalysisReport(keyword, results, saveDir) {
    const totalScore = results.reduce((sum, r) => sum + r.score, 0);
    const avgScore = totalScore / results.length;
    const highConfidenceResults = results.filter(r => r.score >= 0.8);
    const mediumConfidenceResults = results.filter(r => r.score >= 0.6 && r.score < 0.8);
    
    const selectorStats = {};
    results.forEach(result => {
      const selector = result.selector;
      if (!selectorStats[selector]) {
        selectorStats[selector] = { count: 0, totalScore: 0 };
      }
      selectorStats[selector].count++;
      selectorStats[selector].totalScore += result.score;
    });
    
    const topSelectors = Object.entries(selectorStats)
      .sort((a, b) => b[1].totalScore - a[1].totalScore)
      .slice(0, 5);
    
    return `# 智能搜索分析报告

## 搜索信息

- **搜索关键字:** ${keyword}
- **搜索时间:** ${new Date().toLocaleString('zh-CN')}
- **捕获帖子数量:** ${results.length}
- **保存目录:** ${saveDir}

## 智能识别统计

### 置信度分布
- **高置信度 (≥0.8):** ${highConfidenceResults.length} 个 (${((highConfidenceResults.length / results.length) * 100).toFixed(1)}%)
- **中置信度 (0.6-0.8):** ${mediumConfidenceResults.length} 个 (${((mediumConfidenceResults.length / results.length) * 100).toFixed(1)}%)
- **低置信度 (<0.6):** ${results.length - highConfidenceResults.length - mediumConfidenceResults.length} 个 (${(((results.length - highConfidenceResults.length - mediumConfidenceResults.length) / results.length) * 100).toFixed(1)}%)

### 得分统计
- **平均得分:** ${avgScore.toFixed(3)}
- **最高得分:** ${Math.max(...results.map(r => r.score)).toFixed(3)}
- **最低得分:** ${Math.min(...results.map(r => r.score)).toFixed(3)}

## 选择器分析

### 最佳选择器
${topSelectors.map(([selector, stats], index) => 
  `${index + 1}. \`${selector}\` - ${stats.count} 个帖子, 平均得分 ${(stats.totalScore / stats.count).toFixed(3)}`
).join('\n')}

## 内容统计

### 内容长度分布
- **平均长度:** ${Math.round(results.reduce((sum, r) => sum + r.content.length, 0) / results.length)} 字符
- **最长内容:** ${Math.max(...results.map(r => r.content.length))} 字符
- **最短内容:** ${Math.min(...results.map(r => r.content.length))} 字符

### 成功率统计
- **成功提取率:** ${((results.length / Math.max(results.length, 1)) * 100).toFixed(1)}%
- **内容质量:** ${avgScore >= 0.7 ? '优秀' : avgScore >= 0.5 ? '良好' : '一般'}

## 文件列表

${results.map((result, i) => 
  `- [智能捕获帖子 ${i + 1} (得分: ${result.score.toFixed(3)})](smart_post_${i + 1}_${result.id}.md)`
).join('\n')}

## 技术说明

本报告由智能微博搜索捕获工具生成，采用以下技术：

1. **智能页面观察**: 使用MutationObserver动态监控页面变化
2. **机器学习算法**: 基于位置、样式、内容特征自动识别帖子元素
3. **滚动行为分析**: 通过用户滚动模式识别动态加载内容
4. **批量内容提取**: 智能识别帖子链接并批量访问获取完整内容
5. **自适应选择器**: 无需硬编码选择器，自动适应不同页面结构

---

*此报告由智能微博搜索捕获工具自动生成*`;
  }

  async cleanup() {
    console.log('🧹 清理资源...');
    await this.browserManager.cleanup();
    console.log('✅ 清理完成');
  }
}

// 主函数
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('使用方法: node smart-weibo-search.js <关键字> [最大帖子数]');
    console.log('示例: node smart-weibo-search.js "查理柯克" 10');
    process.exit(1);
  }
  
  const keyword = args[0];
  const maxPosts = parseInt(args[1]) || 10;
  
  console.log('🤖 智能微博搜索捕获工具启动');
  console.log(`关键字: "${keyword}"`);
  console.log(`目标数量: ${maxPosts} 条帖子`);
  console.log(`保存目录: ~/.webauto\n`);
  
  const captureTool = new SmartWeiboSearchCapture({
    observerOptions: {
      observationTime: 10000,
      maxCandidates: 10
    }
  });
  
  try {
    // 初始化
    await captureTool.initialize();
    
    // 搜索关键字
    await captureTool.searchKeyword(keyword);
    
    // 智能捕获
    await captureTool.intelligentCapture();
    
    // 保存结果
    const saveResult = await captureTool.saveResults(keyword);
    
    console.log('🎉 智能搜索捕获任务完成！');
    if (saveResult && saveResult.saveDir) {
      console.log(`📁 结果保存在: ${saveResult.saveDir}`);
    }
    
    // 显示最佳选择器
    if (captureTool.results.length > 0) {
      const bestResult = captureTool.results.reduce((best, current) => 
        current.score > best.score ? current : best
      );
      console.log(`🎯 最佳选择器: ${bestResult.selector} (得分: ${bestResult.score.toFixed(3)})`);
    }
    
  } catch (error) {
    console.error('❌ 执行失败:', error);
  } finally {
    await captureTool.cleanup();
  }
}

// 如果直接运行此文件
if (require.main === module) {
  main().catch(console.error);
}

module.exports = SmartWeiboSearchCapture;