/**
 * HTML格式化操作子
 * 专门处理HTML页面的清理、优化和格式转换，节省Token使用
 */

import PostProcessingOperation from './PostProcessingOperation.js';

export class HTMLFormatterOperation extends PostProcessingOperation {
  constructor(config = {}) {
    super(config);
    this.name = 'HTMLFormatterOperation';
    this.description = 'HTML格式化操作子，优化HTML结构以节省Token使用';
    this.version = '1.0.0';
    
    // 预定义的格式化策略
    this.formattingStrategies = {
      minimal: {
        removeComments: true,
        removeEmptyLines: true,
        minify: true,
        extractMainContent: true,
        simplifyNavigation: true,
        removeScripts: true,
        removeStyles: true,
        removeIframes: true,
        preserveStructure: false
      },
      balanced: {
        removeComments: true,
        removeEmptyLines: true,
        minify: false,
        extractMainContent: true,
        simplifyNavigation: true,
        removeScripts: false,
        removeStyles: false,
        removeIframes: true,
        preserveStructure: true
      },
      readable: {
        removeComments: true,
        removeEmptyLines: false,
        minify: false,
        extractMainContent: true,
        simplifyNavigation: false,
        removeScripts: false,
        removeStyles: false,
        removeIframes: false,
        preserveStructure: true,
        addSemanticStructure: true
      }
    };

    // 要移除的元素选择器
    this.unwantedSelectors = [
      'script[src*="analytics"]',
      'script[src*="tracking"]',
      'iframe[src*="ads"]',
      'div[class*="ad-"]',
      'div[class*="advertisement"]',
      'div[class*="sidebar"]',
      'div[class*="footer"]',
      'nav[class*="navigation"]',
      'header[class*="header"]',
      'footer[class*="footer"]',
      'div[class*="cookie-banner"]',
      'div[class*="popup"]',
      'div[class*="modal"]'
    ];

    // 要保留的重要属性
    this.importantAttributes = [
      'href', 'src', 'alt', 'title', 'lang', 'id', 'class',
      'data-src', 'data-href', 'data-url'
    ];

    // Token优化统计
    this.tokenOptimizationStats = {
      originalTokens: 0,
      optimizedTokens: 0,
      savingsPercentage: 0,
      filesProcessed: 0,
      totalProcessingTime: 0
    };
  }

  /**
   * 执行HTML格式化操作
   */
  async execute(context, params = {}) {
    const { operation = 'batchFormatHTML', ...operationParams } = params;
    
    try {
      switch (operation) {
        case 'batchFormatHTML':
          return await this.batchFormatHTML(operationParams);
        case 'formatSingleFile':
          return await this.formatSingleFile(operationParams);
        case 'extractSmartContent':
          return await this.extractSmartContent(operationParams);
        case 'convertToMarkdown':
          return await this.convertToMarkdown(operationParams);
        case 'optimizeHTMLStructure':
          return await this.optimizeHTMLStructure(operationParams);
        default:
          throw new Error(`Unknown HTML formatter operation: ${operation}`);
      }
    } catch (error) {
      this.logger.error('HTML formatter operation failed', { 
        operation, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * 批量HTML格式化
   */
  async batchFormatHTML(params = {}) {
    const {
      sourceFiles = [],
      outputDirectory,
      strategy = 'balanced', // 'minimal', 'balanced', 'readable'
      customRules = [],
      parallelProcessing = true,
      generateReport = true
    } = params;

    try {
      if (!sourceFiles || sourceFiles.length === 0) {
        throw new Error('No source files provided for HTML formatting');
      }

      if (!outputDirectory) {
        throw new Error('Output directory is required for HTML formatting');
      }

      this.logger.info('Starting batch HTML formatting', {
        sourceFilesCount: sourceFiles.length,
        strategy,
        outputDirectory
      });

      const startTime = Date.now();
      const results = [];
      
      // 获取格式化选项
      const options = this.formattingStrategies[strategy] || this.formattingStrategies.balanced;
      
      // 并行或串行处理
      if (parallelProcessing) {
        const batchSize = 5; // 并发处理5个文件
        for (let i = 0; i < sourceFiles.length; i += batchSize) {
          const batch = sourceFiles.slice(i, i + batchSize);
          const batchResults = await Promise.all(
            batch.map(file => this.formatSingleFile(file, outputDirectory, options, customRules))
          );
          results.push(...batchResults);
        }
      } else {
        for (const file of sourceFiles) {
          const result = await this.formatSingleFile(file, outputDirectory, options, customRules);
          results.push(result);
        }
      }

      const processingTime = Date.now() - startTime;
      
      // 生成报告
      let report = null;
      if (generateReport) {
        report = await this.generateFormattingReport(results, processingTime);
      }

      // 更新统计信息
      this.updateTokenOptimizationStats(results);

      this.emit('batch:completed', {
        filesProcessed: results.length,
        processingTime,
        strategy,
        tokenSavings: this.calculateTotalTokenSavings(results)
      });

      return {
        success: true,
        filesProcessed: results.length,
        processingTime,
        strategy,
        results,
        report,
        tokenOptimization: this.tokenOptimizationStats
      };

    } catch (error) {
      this.logger.error('Batch HTML formatting failed', { error: error.message });
      throw error;
    }
  }

  /**
   * 智能HTML内容提取
   */
  async extractSmartContent(params = {}) {
    const {
      sourceFile,
      outputFile,
      extractionMode = 'article', // 'article', 'product', 'main', 'custom'
      customSelectors = [],
      preserveLinks = true,
      preserveImages = true,
      preserveStructure = true
    } = params;

    try {
      this.logger.info('Starting smart content extraction', {
        sourceFile,
        extractionMode
      });

      // 读取HTML内容
      const htmlContent = await this.readFileContent(sourceFile);
      
      // 提取主要内容
      const extractedContent = await this.extractContentByMode(htmlContent, extractionMode, customSelectors);
      
      // 后处理提取的内容
      const processedContent = await this.postProcessExtractedContent(extractedContent, {
        preserveLinks,
        preserveImages,
        preserveStructure
      });

      // 保存结果
      await this.writeFileContent(outputFile, processedContent);

      // 计算优化效果
      const originalTokens = Math.ceil(htmlContent.length / 4);
      const optimizedTokens = Math.ceil(processedContent.length / 4);
      const savings = originalTokens - optimizedTokens;

      return {
        success: true,
        sourceFile,
        outputFile,
        extractionMode,
        originalSize: htmlContent.length,
        optimizedSize: processedContent.length,
        originalTokens,
        optimizedTokens,
        tokenSavings: savings,
        savingsPercentage: ((savings / originalTokens) * 100).toFixed(2) + '%'
      };

    } catch (error) {
      this.logger.error('Smart content extraction failed', { error: error.message });
      throw error;
    }
  }

  /**
   * HTML结构优化
   */
  async optimizeHTMLStructure(params = {}) {
    const {
      sourceFile,
      outputFile,
      optimizationLevel = 'medium', // 'light', 'medium', 'aggressive'
      keepSemanticStructure = true,
      removeRedundantElements = true,
      optimizeAttributes = true
    } = params;

    try {
      this.logger.info('Starting HTML structure optimization', {
        sourceFile,
        optimizationLevel
      });

      const htmlContent = await this.readFileContent(sourceFile);
      
      // 应用优化规则
      let optimizedHTML = htmlContent;
      
      // 基础清理
      optimizedHTML = this.removeComments(optimizedHTML);
      optimizedHTML = this.normalizeWhitespace(optimizedHTML);
      
      // 根据优化级别应用不同规则
      switch (optimizationLevel) {
        case 'light':
          optimizedHTML = this.lightOptimization(optimizedHTML);
          break;
        case 'medium':
          optimizedHTML = this.mediumOptimization(optimizedHTML);
          break;
        case 'aggressive':
          optimizedHTML = this.aggressiveOptimization(optimizedHTML);
          break;
      }

      // 属性优化
      if (optimizeAttributes) {
        optimizedHTML = this.optimizeAttributes(optimizedHTML);
      }

      // 保持语义结构
      if (keepSemanticStructure) {
        optimizedHTML = this.preserveSemanticStructure(optimizedHTML);
      }

      await this.writeFileContent(outputFile, optimizedHTML);

      const originalTokens = Math.ceil(htmlContent.length / 4);
      const optimizedTokens = Math.ceil(optimizedHTML.length / 4);
      const savings = originalTokens - optimizedTokens;

      return {
        success: true,
        sourceFile,
        outputFile,
        optimizationLevel,
        originalSize: htmlContent.length,
        optimizedSize: optimizedHTML.length,
        tokenSavings: savings,
        savingsPercentage: ((savings / originalTokens) * 100).toFixed(2) + '%'
      };

    } catch (error) {
      this.logger.error('HTML structure optimization failed', { error: error.message });
      throw error;
    }
  }

  /**
   * 转换为Markdown格式
   */
  async convertToMarkdown(params = {}) {
    const {
      sourceFile,
      outputFile,
      conversionStyle = 'standard', // 'standard', 'github', 'minimal'
      preserveLinks = true,
      preserveImages = true,
      preserveCodeBlocks = true,
      extractTables = true
    } = params;

    try {
      this.logger.info('Starting HTML to Markdown conversion', {
        sourceFile,
        conversionStyle
      });

      const htmlContent = await this.readFileContent(sourceFile);
      
      // 预处理HTML
      const cleanHTML = this.preprocessHTMLForMarkdown(htmlContent);
      
      // 转换为Markdown
      const markdown = await this.htmlToMarkdown(cleanHTML, {
        style: conversionStyle,
        preserveLinks,
        preserveImages,
        preserveCodeBlocks,
        extractTables
      });

      await this.writeFileContent(outputFile, markdown);

      const originalTokens = Math.ceil(htmlContent.length / 4);
      const markdownTokens = Math.ceil(markdown.length / 4);
      const savings = originalTokens - markdownTokens;

      return {
        success: true,
        sourceFile,
        outputFile,
        conversionStyle,
        originalSize: htmlContent.length,
        markdownSize: markdown.length,
        tokenSavings: savings,
        savingsPercentage: savings > 0 ? ((savings / originalTokens) * 100).toFixed(2) + '%' : '0%'
      };

    } catch (error) {
      this.logger.error('HTML to Markdown conversion failed', { error: error.message });
      throw error;
    }
  }

  /**
   * 格式化单个文件
   */
  async formatSingleFile(sourceFile, outputDirectory, options, customRules) {
    const startTime = Date.now();
    
    try {
      const fileName = sourceFile.split('/').pop();
      const outputFile = `${outputDirectory}/formatted_${fileName}`;
      
      // 读取源文件
      const sourceContent = await this.readFileContent(sourceFile);
      
      // 应用格式化规则
      let formattedContent = sourceContent;
      
      // 应用预定义规则
      formattedContent = this.applyFormattingRules(formattedContent, options);
      
      // 应用自定义规则
      for (const rule of customRules) {
        formattedContent = await this.applyCustomRule(formattedContent, rule);
      }
      
      // 保存格式化后的内容
      await this.writeFileContent(outputFile, formattedContent);
      
      const processingTime = Date.now() - startTime;
      const tokenSavings = this.calculateTokenSavings(sourceContent, formattedContent);
      
      return {
        sourceFile,
        outputFile,
        originalSize: sourceContent.length,
        optimizedSize: formattedContent.length,
        tokenSavings,
        processingTime,
        success: true
      };
      
    } catch (error) {
      this.logger.error('File formatting failed', { sourceFile, error: error.message });
      return {
        sourceFile,
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 应用格式化规则
   */
  applyFormattingRules(html, options) {
    let processed = html;
    
    // 移除注释
    if (options.removeComments) {
      processed = this.removeComments(processed);
    }
    
    // 移除脚本
    if (options.removeScripts) {
      processed = this.removeScripts(processed);
    }
    
    // 移除样式
    if (options.removeStyles) {
      processed = this.removeStyles(processed);
    }
    
    // 移除iframe
    if (options.removeIframes) {
      processed = this.removeIframes(processed);
    }
    
    // 提取主要内容
    if (options.extractMainContent) {
      processed = this.extractMainContent(processed);
    }
    
    // 简化导航
    if (options.simplifyNavigation) {
      processed = this.simplifyNavigation(processed);
    }
    
    // 移除空行
    if (options.removeEmptyLines) {
      processed = this.removeEmptyLines(processed);
    }
    
    // 压缩
    if (options.minify) {
      processed = this.minifyHTML(processed);
    }
    
    return processed;
  }

  /**
   * 根据模式提取内容
   */
  async extractContentByMode(html, mode, customSelectors) {
    switch (mode) {
      case 'article':
        return this.extractArticleContent(html);
      case 'product':
        return this.extractProductContent(html);
      case 'main':
        return this.extractMainContent(html);
      case 'custom':
        return this.extractCustomContent(html, customSelectors);
      default:
        return html;
    }
  }

  /**
   * 提取文章内容
   */
  extractArticleContent(html) {
    // 查找文章相关的选择器
    const articleSelectors = [
      'article',
      '[role="article"]',
      '.article',
      '.post',
      '.content',
      '.main-content',
      '#content',
      '#main'
    ];
    
    for (const selector of articleSelectors) {
      const match = this.extractElementBySelector(html, selector);
      if (match) {
        return match;
      }
    }
    
    return html;
  }

  /**
   * 提取产品内容
   */
  extractProductContent(html) {
    // 查找产品相关的选择器
    const productSelectors = [
      '.product',
      '.product-info',
      '.product-details',
      '[data-testid="product"]',
      '.item'
    ];
    
    for (const selector of productSelectors) {
      const match = this.extractElementBySelector(html, selector);
      if (match) {
        return match;
      }
    }
    
    return html;
  }

  /**
   * 通过选择器提取元素
   */
  extractElementBySelector(html, selector) {
    // 简单的选择器匹配，实际项目中可以使用cheerio或jsdom
    const pattern = new RegExp(`<${selector}[^>]*>([\\s\\S]*?)<\\/${selector}>`, 'i');
    const match = html.match(pattern);
    
    if (match) {
      return match[1];
    }
    
    // 尝试class属性匹配
    const classPattern = new RegExp(`<[^>]*class="[^"]*${selector}[^"]*"[^>]*>([\\s\\S]*?)<\\/[^>]*>`, 'i');
    const classMatch = html.match(classPattern);
    
    return classMatch ? classMatch[1] : null;
  }

  /**
   * 后处理提取的内容
   */
  async postProcessExtractedContent(content, options) {
    let processed = content;
    
    // 移除不需要的元素
    if (!options.preserveLinks) {
      processed = processed.replace(/<a[^>]*>.*?<\/a>/gi, '');
    }
    
    if (!options.preserveImages) {
      processed = processed.replace(/<img[^>]*>/gi, '');
    }
    
    // 清理空白字符
    processed = processed.replace(/\s+/g, ' ').trim();
    
    // 保持基本结构
    if (options.preserveStructure) {
      processed = this.preserveBasicStructure(processed);
    }
    
    return processed;
  }

  /**
   * HTML到Markdown转换
   */
  async htmlToMarkdown(html, options) {
    let markdown = html;
    
    // 转换标题
    markdown = markdown.replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1');
    markdown = markdown.replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1');
    markdown = markdown.replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1');
    
    // 转换段落
    markdown = markdown.replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n');
    
    // 转换链接
    if (options.preserveLinks) {
      markdown = markdown.replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)');
    }
    
    // 转换图片
    if (options.preserveImages) {
      markdown = markdown.replace(/<img[^>]*src="([^"]*)"[^>]*alt="([^"]*)"[^>]*>/gi, '![$2]($1)');
    }
    
    // 转换代码块
    if (options.preserveCodeBlocks) {
      markdown = markdown.replace(/<pre[^>]*><code[^>]*>(.*?)<\/code><\/pre>/gis, '```\n$1\n```');
      markdown = markdown.replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`');
    }
    
    // 清理HTML标签
    markdown = markdown.replace(/<[^>]*>/g, '');
    
    // 清理多余空白
    markdown = markdown.replace(/\n{3,}/g, '\n\n');
    
    return markdown.trim();
  }

  /**
   * 轻量级优化
   */
  lightOptimization(html) {
    let optimized = html;
    
    // 只移除明显的无用元素
    optimized = optimized.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
    optimized = optimized.replace(/<!--[\s\S]*?-->/g, '');
    optimized = optimized.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
    
    return optimized;
  }

  /**
   * 中等优化
   */
  mediumOptimization(html) {
    let optimized = this.lightOptimization(html);
    
    // 移除更多无用元素
    optimized = optimized.replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, '');
    optimized = optimized.replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '');
    
    // 简化div结构
    optimized = optimized.replace(/<div[^>]*class="[^"]*ad[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '');
    
    return optimized;
  }

  /**
   * 激进优化
   */
  aggressiveOptimization(html) {
    let optimized = this.mediumOptimization(html);
    
    // 移除大部分装饰性元素
    for (const selector of this.unwantedSelectors) {
      optimized = optimized.replace(new RegExp(`<${selector}[^>]*>[\\s\\S]*?<\\/${selector}>`, 'gi'), '');
    }
    
    // 压缩HTML
    optimized = optimized.replace(/\s+/g, ' ');
    optimized = optimized.replace(/>\s+</g, '><');
    
    return optimized;
  }

  /**
   * 优化属性
   */
  optimizeAttributes(html) {
    // 移除不需要的属性，只保留重要的
    return html.replace(/<([^>]+)>/g, (match, tagContent) => {
      const tagName = tagContent.split(' ')[0];
      const attributes = tagContent.match(/(\w+)=["'][^"']*["']/g) || [];
      
      const importantAttrs = attributes.filter(attr => {
        const attrName = attr.split('=')[0];
        return this.importantAttributes.includes(attrName);
      });
      
      return `<${tagName} ${importantAttrs.join(' ')}>`;
    });
  }

  /**
   * 保持语义结构
   */
  preserveSemanticStructure(html) {
    // 确保重要的语义元素被保留
    return html.replace(/<(div|span)[^>]*class="[^"]*(article|main|content|header|footer|nav)[^"]*"[^>]*>/gi, (match, tag, className) => {
      return `<${tag} data-role="${className}">`;
    });
  }

  /**
   * 移除注释
   */
  removeComments(html) {
    return html.replace(/<!--[\s\S]*?-->/g, '');
  }

  /**
   * 移除脚本
   */
  removeScripts(html) {
    return html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  }

  /**
   * 移除样式
   */
  removeStyles(html) {
    return html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  }

  /**
   * 移除iframe
   */
  removeIframes(html) {
    return html.replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, '');
  }

  /**
   * 移除空行
   */
  removeEmptyLines(html) {
    return html.replace(/\n\s*\n/g, '\n');
  }

  /**
   * 压缩HTML
   */
  minifyHTML(html) {
    return html.replace(/\s+/g, ' ').trim();
  }

  /**
   * 规范化空白字符
   */
  normalizeWhitespace(html) {
    return html.replace(/\s+/g, ' ');
  }

  /**
   * 预处理HTML用于Markdown转换
   */
  preprocessHTMLForMarkdown(html) {
    let processed = html;
    
    // 移除脚本和样式
    processed = this.removeScripts(processed);
    processed = this.removeStyles(processed);
    
    // 移除注释
    processed = this.removeComments(processed);
    
    return processed;
  }

  /**
   * 保持基本结构
   */
  preserveBasicStructure(html) {
    // 确保基本的结构元素被保留
    return html.replace(/<(div|section|article)[^>]*>/gi, '\n').replace(/<\/(div|section|article)>/gi, '\n');
  }

  /**
   * 应用自定义规则
   */
  async applyCustomRule(html, rule) {
    // 支持自定义转换函数
    if (typeof rule === 'function') {
      return await rule(html);
    }
    
    // 支持正则表达式规则
    if (rule.pattern && rule.replacement) {
      return html.replace(new RegExp(rule.pattern, rule.flags || 'g'), rule.replacement);
    }
    
    return html;
  }

  /**
   * 提取自定义内容
   */
  extractCustomContent(html, customSelectors) {
    for (const selector of customSelectors) {
      const content = this.extractElementBySelector(html, selector);
      if (content) {
        return content;
      }
    }
    return html;
  }

  /**
   * 生成格式化报告
   */
  async generateFormattingReport(results, processingTime) {
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);
    
    const report = {
      timestamp: new Date().toISOString(),
      processingTime,
      totalFiles: results.length,
      successfulFiles: successful.length,
      failedFiles: failed.length,
      totalTokenSavings: this.calculateTotalTokenSavings(successful),
      averageSavingsPercentage: successful.length > 0 
        ? (successful.reduce((sum, r) => sum + (r.tokenSavings / (r.originalSize / 4) * 100), 0) / successful.length).toFixed(2) + '%'
        : '0%',
      failedFiles: failed.map(f => ({ file: f.sourceFile, error: f.error }))
    };
    
    return report;
  }

  /**
   * 计算总Token节省
   */
  calculateTotalTokenSavings(results) {
    return results.reduce((sum, result) => sum + (result.tokenSavings || 0), 0);
  }

  /**
   * 更新Token优化统计
   */
  updateTokenOptimizationStats(results) {
    const successful = results.filter(r => r.success);
    
    this.tokenOptimizationStats.filesProcessed += successful.length;
    this.tokenOptimizationStats.originalTokens += successful.reduce((sum, r) => sum + (r.originalSize / 4), 0);
    this.tokenOptimizationStats.optimizedTokens += successful.reduce((sum, r) => sum + (r.optimizedSize / 4), 0);
    this.tokenOptimizationStats.savingsPercentage = 
      ((this.tokenOptimizationStats.originalTokens - this.tokenOptimizationStats.optimizedTokens) / 
       this.tokenOptimizationStats.originalTokens * 100).toFixed(2) + '%';
  }

  /**
   * 获取操作子状态
   */
  getStatus() {
    return {
      ...this.getProcessingStats(),
      ...this.tokenOptimizationStats,
      name: this.name,
      description: this.description,
      version: this.version,
      formattingStrategies: Object.keys(this.formattingStrategies),
      supportedFeatures: [
        'batch-formatting',
        'smart-content-extraction',
        'structure-optimization',
        'markdown-conversion',
        'token-optimization'
      ]
    };
  }
}

export default HTMLFormatterOperation;