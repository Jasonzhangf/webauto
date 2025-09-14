const BaseTestSystem = require('../src/core/base-test-system');

/**
 * 微博评论智能提取测试 - 使用MutationObserver分析DOM结构
 * 基于实际页面元素分析而非硬编码选择器
 */
class WeiboCommentsIntelligentTest {
  constructor() {
    this.testUrl = 'https://weibo.com/2656274875/Q4qEJBc6z#comment';
    this.testSystem = null;
    this.results = {
      url: this.testUrl,
      comments: [],
      totalExtracted: 0,
      pageStructure: {},
      performance: {}
    };
    this.domObserver = null;
    this.pageAnalysisData = {
      allElements: [],
      commentCandidates: [],
      dynamicElements: [],
      loadTriggers: []
    };
  }

  async initializeTestSystem() {
    this.testSystem = new BaseTestSystem({
      logLevel: 'info',
      cookieFile: './cookies.json',
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      timeout: 60000
    });

    // 监听系统事件
    this.setupEventListeners();

    // 初始化系统
    await this.testSystem.initialize();
  }

  setupEventListeners() {
    this.testSystem.on('initialized', (state) => {
      console.log('✅ 智能测试系统初始化完成');
    });

    this.testSystem.on('operationCompleted', (result) => {
      const status = result.success ? '✅' : '❌';
      console.log(`${status} 操作 ${result.operationName} ${result.success ? '成功' : '失败'} (${result.executionTime}ms)`);
    });
  }

  /**
   * 启动MutationObserver监听DOM变化
   */
  async startDOMObserver() {
    console.log('🔍 启动DOM变化监听器...');
    
    const observerScript = `
      (() => {
        // 存储所有发现的元素
        window.discoveredElements = new Map();
        window.mutationLog = [];
        
        // 智能元素识别函数
        function isCommentElement(element) {
          const text = element.textContent || '';
          const className = String(element.className || '');
          const id = String(element.id || '');
          
          // 检查是否包含评论相关特征
          const commentKeywords = ['评论', '回复', 'comment', 'reply', 'feedback'];
          const hasKeyword = commentKeywords.some(keyword => 
            text.toLowerCase().includes(keyword) ||
            className.toLowerCase().includes(keyword) ||
            id.toLowerCase().includes(keyword)
          );
          
          // 检查是否有用户信息特征
          const userPatterns = ['用户', 'user', '作者', '博主', '@'];
          const hasUserPattern = userPatterns.some(pattern => 
            text.toLowerCase().includes(pattern)
          );
          
          // 检查是否有时间特征
          const timePatterns = ['分钟前', '小时前', '天前', '刚刚', '今天', '昨天'];
          const hasTimePattern = timePatterns.some(pattern => 
            text.includes(pattern)
          );
          
          // 检查是否有点赞、转发等互动元素
          const interactionPatterns = ['赞', '点赞', '转发', '分享', '回复'];
          const hasInteraction = interactionPatterns.some(pattern => 
            text.includes(pattern)
          );
          
          return hasKeyword || (hasUserPattern && hasTimePattern) || hasInteraction;
        }
        
        // 分析元素结构
        function analyzeElement(element) {
          const rect = element.getBoundingClientRect();
          return {
            tagName: element.tagName,
            id: element.id,
            className: element.className,
            textContent: element.textContent?.substring(0, 100),
            children: element.children.length,
            rect: {
              top: rect.top,
              left: rect.left,
              width: rect.width,
              height: rect.height
            },
            isVisible: rect.width > 0 && rect.height > 0,
            attributes: Array.from(element.attributes).reduce((acc, attr) => {
              acc[attr.name] = attr.value;
              return acc;
            }, {})
          };
        }
        
        // 创建MutationObserver
        const observer = new MutationObserver((mutations) => {
          mutations.forEach((mutation) => {
            const mutationInfo = {
              type: mutation.type,
              timestamp: Date.now(),
              addedNodes: mutation.addedNodes.length,
              removedNodes: mutation.removedNodes.length
            };
            
            // 分析新增节点
            mutation.addedNodes.forEach((node) => {
              if (node.nodeType === Node.ELEMENT_NODE) {
                const analyzed = analyzeElement(node);
                const isComment = isCommentElement(node);
                
                if (isComment) {
                  window.discoveredElements.set(Date.now() + Math.random(), {
                    ...analyzed,
                    discoveredAt: 'added',
                    isComment: true
                  });
                }
                
                // 递归检查子节点
                const walkTree = (element) => {
                  Array.from(element.children).forEach(child => {
                    const childAnalyzed = analyzeElement(child);
                    const childIsComment = isCommentElement(child);
                    
                    if (childIsComment) {
                      window.discoveredElements.set(Date.now() + Math.random(), {
                        ...childAnalyzed,
                        discoveredAt: 'child',
                        isComment: true
                      });
                    }
                    
                    walkTree(child);
                  });
                };
                
                walkTree(node);
              }
            });
            
            window.mutationLog.push(mutationInfo);
          });
        });
        
        // 开始观察整个文档
        observer.observe(document.body, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeOldValue: true,
          characterData: true,
          characterDataOldValue: true
        });
        
        // 定期分析页面结构
        setInterval(() => {
          const allElements = document.querySelectorAll('*');
          const commentElements = Array.from(allElements).filter(isCommentElement);
          
          console.log('📊 DOM分析快照:', {
            totalElements: allElements.length,
            commentCandidates: commentElements.length,
            mutations: window.mutationLog.length,
            discoveredElements: window.discoveredElements.size
          });
        }, 2000);
        
        return {
          stop: () => observer.disconnect(),
          getDiscoveredElements: () => Array.from(window.discoveredElements.values()),
          getMutationLog: () => window.mutationLog
        };
      })()
    `;

    return await this.testSystem.executeAtomicOperation('executeScript', {
      script: observerScript
    });
  }

  /**
   * 智能分析页面结构
   */
  async analyzePageStructure() {
    console.log('🔍 智能分析页面结构...');
    
    try {
      // 启动DOM观察器
      await this.startDOMObserver();
      
      // 等待页面稳定
      console.log('⏳ 等待页面动态加载完成...');
      await this.testSystem.executeAtomicOperation('wait', { 
        selector: 'body', 
        timeout: 10000 
      });
      
      // 模拟用户滚动以触发动态加载
      await this.simulateUserScrolling();
      
      // 分析发现的元素
      const discoveredElements = await this.testSystem.executeAtomicOperation('executeScript', {
        script: () => {
          let elements = [];
          
          // 获取通过MutationObserver发现的元素
          if (window.getDiscoveredElements) {
            elements = elements.concat(window.getDiscoveredElements());
          }
          
          // 同时扫描整个DOM树寻找评论元素
          const allElements = document.querySelectorAll('*');
          const scanResults = [];
          
          function isCommentElement(element) {
            const text = element.textContent || '';
            const className = String(element.className || '');
            const id = String(element.id || '');
            
            // 检查是否包含评论相关特征
            const commentKeywords = ['评论', '回复', 'comment', 'reply', 'feedback'];
            const hasKeyword = commentKeywords.some(keyword => 
              text.toLowerCase().includes(keyword) ||
              className.toLowerCase().includes(keyword) ||
              id.toLowerCase().includes(keyword)
            );
            
            // 检查是否有用户信息特征
            const userPatterns = ['用户', 'user', '作者', '博主', '@'];
            const hasUserPattern = userPatterns.some(pattern => 
              text.toLowerCase().includes(pattern)
            );
            
            // 检查是否有时间特征
            const timePatterns = ['分钟前', '小时前', '天前', '刚刚', '今天', '昨天'];
            const hasTimePattern = timePatterns.some(pattern => 
              text.includes(pattern)
            );
            
            return hasKeyword || (hasUserPattern && hasTimePattern);
          }
          
          // 扫描所有元素
          allElements.forEach(element => {
            if (isCommentElement(element)) {
              const rect = element.getBoundingClientRect();
              scanResults.push({
                tagName: element.tagName,
                id: element.id,
                className: element.className,
                textContent: element.textContent?.substring(0, 100),
                children: element.children.length,
                rect: {
                  top: rect.top,
                  left: rect.left,
                  width: rect.width,
                  height: rect.height
                },
                isVisible: rect.width > 0 && rect.height > 0,
                discoveredAt: 'scan'
              });
            }
          });
          
          console.log('🔍 扫描结果:', {
            mutationElements: elements.length,
            scanElements: scanResults.length,
            total: elements.length + scanResults.length
          });
          
          return elements.concat(scanResults);
        }
      });
      
      // 分析页面结构模式
      this.pageStructure = await this.analyzeStructurePatterns(discoveredElements);
      
      console.log('📊 页面结构分析完成:');
      console.log(`  发现 ${discoveredElements.length} 个候选元素`);
      console.log(`  识别出 ${Object.keys(this.pageStructure.patterns || {}).length} 种结构模式`);
      
      return this.pageStructure;
      
    } catch (error) {
      console.error('❌ 页面结构分析失败:', error.message);
      throw error;
    }
  }

  /**
   * 模拟用户滚动行为
   */
  async simulateUserScrolling() {
    console.log('📜 模拟用户滚动以触发动态加载...');
    
    const scrollScript = `
      (() => {
        return new Promise((resolve) => {
          let scrollPosition = 0;
          const maxScroll = document.body.scrollHeight - window.innerHeight;
          const scrollStepSize = 300;
          const scrollDelay = 800;
          
          function performScroll() {
            if (scrollPosition >= maxScroll) {
              resolve();
              return;
            }
            
            scrollPosition += scrollStepSize;
            window.scrollTo(0, scrollPosition);
            
            // 随机停顿，模拟真实用户行为
            const delay = scrollDelay + Math.random() * 400;
            setTimeout(performScroll, delay);
          }
          
          performScroll();
        });
      })()
    `;
    
    await this.testSystem.executeAtomicOperation('executeScript', {
      script: scrollScript
    });
    
    // 等待最后的加载
    await this.testSystem.executeAtomicOperation('wait', { 
      selector: 'body', 
      timeout: 3000 
    });
  }

  /**
   * 分析结构模式
   */
  async analyzeStructurePatterns(elements) {
    console.log('🔍 分析元素结构模式...');
    
    const patterns = {};
    
    // 按标签名分组
    const tagGroups = elements.reduce((acc, el) => {
      const tag = el.tagName;
      if (!acc[tag]) acc[tag] = [];
      acc[tag].push(el);
      return acc;
    }, {});
    
    // 分析每个标签组的共同特征
    Object.entries(tagGroups).forEach(([tag, groupElements]) => {
      if (groupElements.length > 1) {
        patterns[tag] = {
          count: groupElements.length,
          commonClasses: this.findCommonPatterns(groupElements, 'className'),
          commonAttributes: this.findCommonAttributes(groupElements),
          textLengthRange: {
            min: Math.min(...groupElements.map(el => (el.textContent || '').length)),
            max: Math.max(...groupElements.map(el => (el.textContent || '').length))
          }
        };
      }
    });
    
    // 生成候选选择器
    const candidateSelectors = this.generateCandidateSelectors(patterns);
    
    return {
      patterns,
      candidateSelectors,
      totalElements: elements.length,
      analysisTime: Date.now()
    };
  }

  /**
   * 查找共同模式
   */
  findCommonPatterns(elements, property) {
    const values = elements.map(el => el[property] || '').filter(v => v);
    if (values.length === 0) return [];
    
    // 查找共同的class或属性模式
    const common = [];
    const firstValue = values[0];
    
    if (property === 'className') {
      const classes = firstValue.split(/\s+/);
      classes.forEach(cls => {
        if (values.every(v => v.includes(cls))) {
          common.push(cls);
        }
      });
    }
    
    return common;
  }

  /**
   * 查找共同属性
   */
  findCommonAttributes(elements) {
    const allAttributes = new Set();
    elements.forEach(el => {
      Object.keys(el.attributes || {}).forEach(attr => {
        allAttributes.add(attr);
      });
    });
    
    const commonAttrs = {};
    allAttributes.forEach(attr => {
      const values = elements.map(el => el.attributes?.[attr]).filter(v => v);
      if (values.length === elements.length) {
        commonAttrs[attr] = values[0];
      }
    });
    
    return commonAttrs;
  }

  /**
   * 生成候选选择器
   */
  generateCandidateSelectors(patterns) {
    const selectors = [];
    
    Object.entries(patterns).forEach(([tag, info]) => {
      // 基于class生成选择器
      if (info.commonClasses.length > 0) {
        selectors.push(`${tag}.${info.commonClasses.join('.')}`);
      }
      
      // 基于属性生成选择器
      Object.entries(info.commonAttributes).forEach(([attr, value]) => {
        if (attr.includes('data-') || attr === 'id') {
          selectors.push(`${tag}[${attr}="${value}"]`);
        }
      });
      
      // 通用选择器
      selectors.push(tag);
    });
    
    return selectors;
  }

  /**
   * 基于分析结果提取评论
   */
  async extractCommentsBasedOnAnalysis() {
    console.log('🔥 基于智能分析结果提取评论...');
    const startTime = Date.now();
    
    try {
      const comments = [];
      const selectors = this.pageStructure.candidateSelectors || [];
      
      console.log(`🔍 测试 ${selectors.length} 个候选选择器...`);
      
      // 测试每个选择器
      for (const selector of selectors) {
        try {
          const result = await this.testSystem.executeAtomicOperation('extractElements', { selector });
          
          if (result.count > 0) {
            console.log(`✅ 选择器 "${selector}" 找到 ${result.count} 个元素`);
            
            // 尝试从这些元素中提取评论数据
            const extractedComments = await this.extractCommentsFromElements(selector, result.count);
            if (extractedComments.length > 0) {
              comments.push(...extractedComments);
              console.log(`  📝 成功提取 ${extractedComments.length} 条评论`);
            }
          }
        } catch (error) {
          console.log(`⚠️  选择器 "${selector}" 失败: ${error.message}`);
        }
      }
      
      // 去重
      const uniqueComments = this.deduplicateComments(comments);
      
      const extractTime = Date.now() - startTime;
      this.results.performance.extraction = extractTime;
      this.results.comments = uniqueComments;
      this.results.totalExtracted = uniqueComments.length;
      
      console.log(`✅ 智能提取完成，共提取 ${uniqueComments.length} 条评论，耗时: ${extractTime}ms`);
      
      return uniqueComments;
      
    } catch (error) {
      console.error('❌ 智能提取失败:', error.message);
      throw error;
    }
  }

  /**
   * 从元素中提取评论信息
   */
  async extractCommentsFromElements(selector, count) {
    const comments = [];
    
    try {
      const extractScript = `
        (() => {
          const elements = document.querySelectorAll('${selector}');
          const comments = [];
          
          Array.from(elements).forEach((element, index) => {
            if (index >= ${count}) return;
            
            // 尝试提取用户名
            const username = element.querySelector('.username, .name, .user, [class*="user"], [class*="name"]')?.textContent?.trim() || '未知用户';
            
            // 尝试提取内容
            const content = element.querySelector('.content, .text, .comment, [class*="content"], [class*="text"]')?.textContent?.trim() || 
                          element.textContent?.substring(0, 200).trim() || '无内容';
            
            // 尝试提取时间
            const time = element.querySelector('.time, .date, .timestamp, [class*="time"], [class*="date"]')?.textContent?.trim() || '未知时间';
            
            // 尝试提取点赞数
            const likes = element.querySelector('.like, .up, .good, [class*="like"], [class*="up"]')?.textContent?.trim() || '0';
            
            comments.push({
              username,
              content,
              time,
              likes,
              elementInfo: {
                tagName: element.tagName,
                className: element.className,
                id: element.id
              }
            });
          });
          
          return comments;
        })()
      `;
      
      return await this.testSystem.executeAtomicOperation('executeScript', { script: extractScript });
      
    } catch (error) {
      console.log(`⚠️  从元素提取评论失败: ${error.message}`);
      return [];
    }
  }

  /**
   * 去重评论
   */
  deduplicateComments(comments) {
    const seen = new Set();
    return comments.filter(comment => {
      const key = `${comment.username}-${comment.content.substring(0, 50)}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  async runTest() {
    console.log('🎭 微博评论智能提取测试 - 基于DOM结构分析');
    console.log('='.repeat(60));
    console.log(`🔗 测试URL: ${this.testUrl}`);
    console.log('');
    
    try {
      // 1. 初始化测试系统
      await this.initializeTestSystem();
      
      // 2. 访问页面
      console.log('🌐 访问测试页面...');
      await this.testSystem.executeAtomicOperation('navigate', { 
        url: this.testUrl,
        waitUntil: 'domcontentloaded'
      });
      
      // 3. 检查登录状态
      await this.checkLoginRequired();
      
      // 4. 智能分析页面结构
      await this.analyzePageStructure();
      
      // 5. 基于分析结果提取评论
      const comments = await this.extractCommentsBasedOnAnalysis();
      
      // 6. 保存分析结果
      await this.saveAnalysisResults();
      
      // 7. 保存截图
      await this.testSystem.executeAtomicOperation('screenshot', { 
        filename: `weibo-intelligent-${Date.now()}.png`,
        fullPage: true
      });
      
      console.log('\\n🎉 智能测试完成！');
      console.log('='.repeat(60));
      console.log(`📊 最终结果:`);
      console.log(`  总评论数: ${this.results.totalExtracted}`);
      console.log(`  识别模式: ${Object.keys(this.pageStructure.patterns || {}).length}`);
      console.log(`  候选选择器: ${this.pageStructure.candidateSelectors?.length || 0}`);
      console.log(`  提取耗时: ${this.results.performance.extraction || 0}ms`);
      console.log(`  成功状态: ${comments.length > 0 ? '✅ 成功' : '❌ 失败'}`);
      
      // 显示前几条评论
      if (comments.length > 0) {
        console.log('\\n📋 前3条评论示例:');
        comments.slice(0, 3).forEach((comment, index) => {
          console.log(`${index + 1}. ${comment.username}: ${comment.content}`);
          console.log(`   时间: ${comment.time} | 点赞: ${comment.likes}`);
        });
      }
      
      return this.results;
      
    } catch (error) {
      console.error('❌ 智能测试失败:', error.message);
      throw error;
    } finally {
      // 8. 清理资源
      if (this.testSystem) {
        await this.testSystem.cleanup();
      }
    }
  }

  async checkLoginRequired() {
    console.log('🔍 检查登录状态...');
    
    try {
      const loginSelectors = [
        '.login_btn',
        '.W_login_form', 
        '[node-type="loginForm"]',
        '.gn_login'
      ];

      for (const selector of loginSelectors) {
        const result = await this.testSystem.executeAtomicOperation('elementExists', { selector });
        if (result.exists) {
          console.log('⚠️  检测到登录界面，等待手动登录...');
          
          await this.testSystem.executeAtomicOperation('wait', { 
            selector: 'body', 
            timeout: 30000 
          });
          
          console.log('✅ 登录检查完成');
          return;
        }
      }
      
      console.log('✅ 无需登录');
    } catch (error) {
      console.log('⚠️  登录检查出错:', error.message);
    }
  }

  async saveAnalysisResults() {
    const analysisFile = `page-analysis-${Date.now()}.json`;
    const analysisData = {
      timestamp: new Date().toISOString(),
      url: this.testUrl,
      pageStructure: this.pageStructure,
      results: this.results
    };
    
    require('fs').writeFileSync(analysisFile, JSON.stringify(analysisData, null, 2));
    console.log(`📄 分析结果已保存: ${analysisFile}`);
  }
}

// 运行测试
async function runWeiboCommentsIntelligentTest() {
  const test = new WeiboCommentsIntelligentTest();
  try {
    const results = await test.runTest();
    return results;
  } catch (error) {
    console.error('智能测试执行失败:', error);
    throw error;
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  runWeiboCommentsIntelligentTest().catch(console.error);
}

module.exports = { WeiboCommentsIntelligentTest, runWeiboCommentsIntelligentTest };