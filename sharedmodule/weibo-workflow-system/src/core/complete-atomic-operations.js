/**
 * 完整的原子化操作子库
 * 包含基础元素操作、页面操作、Cookie操作、系统操作等
 */

// === 拆分操作子架构 ===

/**
 * 页面类型检测操作子
 * 自动识别微博页面类型（热门话题、普通帖子、未知）
 */
class PageTypeDetectorOperation {
  constructor(config) {
    this.enableLogging = config.enableLogging || false;
  }

  async execute(page) {
    try {
      const result = await page.evaluate(() => {
        const url = window.location.href;
        let pageType = 'unknown';
        let pageFeatures = {
          hasHotTopicIndicator: false,
          hasNormalPostIndicator: false,
          hasCommentsSection: false,
          hasLoadMoreButton: false
        };

        // 检测热门话题页面
        if (url.includes('/hot/weibo/')) {
          pageType = 'hot-topic';
          pageFeatures.hasHotTopicIndicator = true;
        } 
        // 检测普通帖子页面
        else if (url.includes('/u/') || url.match(/\/\d+\/\w+/)) {
          pageType = 'normal-post';
          pageFeatures.hasNormalPostIndicator = true;
        }

        // 检测通用页面特征
        const commentsSection = document.querySelector('div[class*="comment"], div[class*="Comment"]');
        pageFeatures.hasCommentsSection = !!commentsSection;

        const loadMoreButton = document.querySelector('div[class*="load"], button[class*="load"], span[class*="load"]');
        pageFeatures.hasLoadMoreButton = !!loadMoreButton;

        return {
          pageType,
          pageFeatures,
          url: url,
          timestamp: Date.now()
        };
      });

      if (this.enableLogging) {
        console.log(`🔍 页面类型检测结果: ${result.pageType}`);
        console.log(`📋 页面特征:`, result.pageFeatures);
      }

      return {
        success: true,
        result: result
      };
    } catch (error) {
      return {
        success: false,
        error: `页面类型检测失败: ${error.message}`
      };
    }
  }
}

/**
 * 滚动加载操作子
 * 专门处理热门话题页面的滚动加载
 */
class ScrollLoaderOperation {
  constructor(config) {
    this.maxScrolls = config.maxScrolls || 50;
    this.maxNoGrowth = config.maxNoGrowth || 5;
    this.scrollDelay = config.scrollDelay || 1000;
    this.enableLogging = config.enableLogging || false;
    this.scrollState = {
      scrollCount: 0,
      noGrowthCount: 0,
      previousHeight: 0,
      previousCommentCount: 0,
      lastLoadTime: 0,
      totalCommentsLoaded: 0
    };
  }

  async execute(page, context = {}) {
    try {
      if (this.enableLogging) {
        console.log('🔄 开始滚动加载操作...');
      }

      const results = await page.evaluate((config) => {
        return new Promise((resolve) => {
          let scrollCount = 0;
          let noGrowthCount = 0;
          let previousHeight = document.body.scrollHeight;
          let previousCommentCount = 0;

          const scrollAndCheck = () => {
            // 滚动到底部
            window.scrollTo(0, document.body.scrollHeight);
            scrollCount++;
            
            setTimeout(() => {
              const currentHeight = document.body.scrollHeight;
              const heightGrowth = currentHeight - previousHeight;
              
              // 计算当前评论数量
              const currentComments = document.querySelectorAll(
                'div[class*="item"], div[class*="comment"], div[class*="feed"]'
              ).length;
              
              const commentGrowth = currentComments - previousCommentCount;
              
              if (heightGrowth > 50 || commentGrowth > 0) {
                noGrowthCount = 0;
                if (commentGrowth > 0) {
                  previousCommentCount = currentComments;
                }
              } else {
                noGrowthCount++;
              }

              previousHeight = currentHeight;

              // 判断是否继续滚动
              if (scrollCount >= config.maxScrolls || noGrowthCount >= config.maxNoGrowth) {
                resolve({
                  scrollCount: scrollCount,
                  noGrowthCount: noGrowthCount,
                  finalHeight: currentHeight,
                  totalCommentsLoaded: currentComments,
                  reason: scrollCount >= config.maxScrolls ? 'maxScrolls' : 'noGrowth'
                });
              } else {
                scrollAndCheck();
              }
            }, config.scrollDelay);
          };

          scrollAndCheck();
        });
      }, {
        maxScrolls: this.maxScrolls,
        maxNoGrowth: this.maxNoGrowth,
        scrollDelay: this.scrollDelay
      });

      // 更新状态
      this.scrollState.scrollCount = results.scrollCount;
      this.scrollState.noGrowthCount = results.noGrowthCount;
      this.scrollState.previousHeight = results.finalHeight;
      this.scrollState.previousCommentCount = results.totalCommentsLoaded;
      this.scrollState.totalCommentsLoaded = results.totalCommentsLoaded;
      this.scrollState.lastLoadTime = Date.now();

      if (this.enableLogging) {
        console.log(`🔄 滚动加载完成: ${results.scrollCount}次滚动, ${results.totalCommentsLoaded}条评论`);
        console.log(`📊 停止原因: ${results.reason}`);
      }

      return {
        success: true,
        result: results,
        state: this.scrollState
      };
    } catch (error) {
      return {
        success: false,
        error: `滚动加载失败: ${error.message}`
      };
    }
  }
}

/**
 * 点击加载操作子
 * 专门处理普通帖子的点击加载
 */
class ClickLoaderOperation {
  constructor(config) {
    this.maxClicks = config.maxClicks || 20;
    this.maxClickFailures = config.maxClickFailures || 3;
    this.clickDelay = config.clickDelay || 1500;
    this.enableLogging = config.enableLogging || false;
    this.clickState = {
      clickCount: 0,
      consecutiveClickFailures: 0,
      totalClicksSuccess: 0,
      totalCommentsLoaded: 0,
      clickLog: []
    };
  }

  async execute(page, context = {}) {
    try {
      if (this.enableLogging) {
        console.log('🖱️ 开始点击加载操作...');
      }

      const results = await page.evaluate((config) => {
        return new Promise((resolve) => {
          let clickCount = 0;
          let consecutiveFailures = 0;
          let totalSuccess = 0;
          let clickLog = [];
          let previousCommentCount = 0;

          // 记录已点击的按钮，避免重复点击
          const clickedButtons = new Set();
          
          const attemptClick = () => {
            // 查找点击加载更多按钮 - 优化多按钮策略
            const loadMoreSelectors = [
              'div[class*="load"]',
              'button[class*="load"]', 
              'span[class*="load"]',
              'div[class*="more"]',
              'button[class*="more"]',
              'a[class*="more"]',
              // 嵌套评论加载按钮 - 基于分析结果，优先选择具体的按钮
              'div.item2 .text a[href="javascript:;"]',
              'div.item2 a[href="javascript:;"]',
              'div.text a[href="javascript:;"]',
              'div.item2',
              'a[href="javascript:;"]',
              'div[class*="item"] a',
              'div[class*="text"] a'
            ];

            let targetElement = null;
            let selectorUsed = '';
            let buttonText = '';
            let buttonId = '';

            // 优先查找未点击过的嵌套评论按钮
            for (const selector of loadMoreSelectors) {
              const elements = document.querySelectorAll(selector);
              for (const element of elements) {
                const text = element.textContent || '';
                if (text.includes('加载更多') || text.includes('点击加载') || text.includes('展开') || text.includes('条回复')) {
                  // 为按钮生成唯一ID
                  buttonId = `${selector}_${text.substring(0, 10)}_${element.getBoundingClientRect().top}`;
                  
                  // 如果这个按钮没有被点击过，则选择它
                  if (!clickedButtons.has(buttonId)) {
                    targetElement = element;
                    selectorUsed = selector;
                    buttonText = text;
                    break;
                  }
                }
              }
              if (targetElement) break;
            }

            if (!targetElement) {
              consecutiveFailures++;
              clickLog.push({
                clickCount,
                success: false,
                reason: '未找到加载更多按钮',
                timestamp: Date.now()
              });

              if (consecutiveFailures >= config.maxClickFailures || clickCount >= config.maxClicks) {
                const finalComments = document.querySelectorAll(
                  'div[class*="item"], div[class*="comment"], div[class*="feed"]'
                ).length;
                
                resolve({
                  clickCount,
                  consecutiveFailures,
                  totalSuccess,
                  finalComments,
                  clickLog,
                  reason: consecutiveFailures >= config.maxClickFailures ? 'maxFailures' : 'maxClicks'
                });
              } else {
                setTimeout(attemptClick, config.clickDelay);
              }
              return;
            }

            // 执行点击
            try {
              targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
              setTimeout(() => {
                targetElement.click();
                
                setTimeout(() => {
                  const currentComments = document.querySelectorAll(
                    'div[class*="item"], div[class*="comment"], div[class*="feed"]'
                  ).length;
                  
                  const commentGrowth = currentComments - previousCommentCount;
                  
                  if (commentGrowth > 0) {
                    consecutiveFailures = 0;
                    totalSuccess++;
                    previousCommentCount = currentComments;
                    // 记录成功点击的按钮ID
                    clickedButtons.add(buttonId);
                  } else {
                    consecutiveFailures++;
                  }

                  clickCount++;
                  clickLog.push({
                    clickCount,
                    success: true,
                    element: targetElement.tagName,
                    text: buttonText,
                    commentGrowth,
                    buttonId,
                    timestamp: Date.now()
                  });

                  if (clickCount >= config.maxClicks || consecutiveFailures >= config.maxClickFailures) {
                    resolve({
                      clickCount,
                      consecutiveFailures,
                      totalSuccess,
                      finalComments: currentComments,
                      clickLog,
                      reason: clickCount >= config.maxClicks ? 'maxClicks' : 'maxFailures'
                    });
                  } else {
                    setTimeout(attemptClick, config.clickDelay);
                  }
                }, 800);
              }, 300);
            } catch (error) {
              consecutiveFailures++;
              clickCount++;
              clickLog.push({
                clickCount,
                success: false,
                reason: `点击失败: ${error.message}`,
                timestamp: Date.now()
              });

              if (clickCount >= config.maxClicks || consecutiveFailures >= config.maxClickFailures) {
                const finalComments = document.querySelectorAll(
                  'div[class*="item"], div[class*="comment"], div[class*="feed"]'
                ).length;
                
                resolve({
                  clickCount,
                  consecutiveFailures,
                  totalSuccess,
                  finalComments,
                  clickLog,
                  reason: consecutiveFailures >= config.maxClickFailures ? 'maxFailures' : 'maxClicks'
                });
              } else {
                setTimeout(attemptClick, config.clickDelay);
              }
            }
          };

          // 初始化评论计数
          previousCommentCount = document.querySelectorAll(
            'div[class*="item"], div[class*="comment"], div[class*="feed"]'
          ).length;

          attemptClick();
        });
      }, {
        maxClicks: this.maxClicks,
        maxClickFailures: this.maxClickFailures,
        clickDelay: this.clickDelay
      });

      // 更新状态
      this.clickState.clickCount = results.clickCount;
      this.clickState.consecutiveClickFailures = results.consecutiveFailures;
      this.clickState.totalClicksSuccess = results.totalSuccess;
      this.clickState.totalCommentsLoaded = results.finalComments;
      this.clickState.clickLog = results.clickLog;

      if (this.enableLogging) {
        console.log(`🖱️ 点击加载完成: ${results.clickCount}次点击, ${results.totalSuccess}次成功, ${results.finalComments}条评论`);
        console.log(`📊 停止原因: ${results.reason}`);
      }

      return {
        success: true,
        result: results,
        state: this.clickState
      };
    } catch (error) {
      return {
        success: false,
        error: `点击加载失败: ${error.message}`
      };
    }
  }
}

/**
 * 评论提取操作子
 * 专门负责从页面提取评论数据
 * 支持热门话题页面和普通帖子页面两种不同的结构
 */
class CommentExtractorOperation {
  constructor(config) {
    this.includeNested = config.includeNested !== false;
    this.enableLogging = config.enableLogging || false;
    this.qualityFilter = config.qualityFilter !== false;
    this.pageType = config.pageType || 'auto'; // 'auto', 'hot-topic', 'normal-post'
  }

  async execute(page, context = {}) {
    try {
      if (this.enableLogging) {
        console.log('📝 开始评论提取操作...');
      }
      
      // 自动检测页面类型
      let detectedPageType = this.pageType;
      if (detectedPageType === 'auto') {
        const url = page.url();
        detectedPageType = url.includes('/hot/weibo/') ? 'hot-topic' : 'normal-post';
      }
      
      if (this.enableLogging) {
        console.log(`🔍 检测到页面类型: ${detectedPageType}`);
      }

      const result = await page.evaluate((config) => {
        const mainComments = [];
        const nestedComments = [];
        
        // 根据页面类型选择不同的提取策略
        if (config.pageType === 'hot-topic') {
          // 热门话题页面：提取独立帖子
          const postElements = document.querySelectorAll('div[class*="scroller-item"], div[class*="vue-recycle"], div[class*="wbpro-scroller"]');
        
        postElements.forEach((element, index) => {
            try {
              // 热门话题页面的用户名选择器
              const usernameElement = element.querySelector('a.ALink_default_2ibt1, a[class*="head_name"], [class*="head_cut"]');
              const username = usernameElement ? usernameElement.textContent.trim() : '未知用户';
              
              // 热门话题页面的内容选择器
              const contentElement = element.querySelector('div[class*="wbpro-feed-content"], div[class*="detail_wbtext"], div[class*="woo-box-item-flex"]');
              const content = contentElement ? contentElement.textContent.trim() : '';
              
              // 热门话题页面的时间选择器
              const timeElement = element.querySelector('div[class*="head_content_wrap"] > div:last-child, [class*="woo-box-column"]:last-child');
              const time = timeElement ? timeElement.textContent.trim() : '未知时间';
              
              // 质量检查
              const isQuality = content.length >= 10 && 
                              username !== '未知用户' && 
                              !username.includes('广告') && 
                              !content.includes('推广') &&
                              !username.includes('测试') &&
                              !content.includes('点击展开') &&
                              !content.includes('加载完毕');
              
              if (config.qualityFilter && !isQuality) {
                return;
              }
              
              mainComments.push({
                id: `post_${index}`,
                username,
                content,
                time,
                likes: 0, // 热门话题页面不显示点赞数
                index,
                type: 'post',
                isHotTopic: true
              });
              
            } catch (error) {
              console.warn(`热门话题帖子提取错误 (${index}):`, error.message);
            }
          });
          
        } else {
          // 普通帖子页面：提取评论和嵌套评论
          // 基于缓存分析：简化提取逻辑，降低质量过滤要求
          const mainCommentElements = document.querySelectorAll('div.item1');
          
          mainCommentElements.forEach((element, index) => {
            try {
              // 提取用户名 - 更灵活的选择器
              const usernameElement = element.querySelector('div.con1 > div.text > a') || 
                                    element.querySelector('div.con1 a[href*="/u/"]') ||
                                    element.querySelector('div.con1 > div.text a');
              let username = usernameElement ? usernameElement.textContent.trim() : '';
              
              // 提取评论内容 - 主评论内容在 div.con1 > div.text
              const contentElement = element.querySelector('div.con1 > div.text');
              const content = contentElement ? contentElement.textContent.trim() : '';
              
              // 如果用户名为空但内容包含"用户名:"格式，尝试提取
              if (!username && content.includes(':')) {
                const colonIndex = content.indexOf(':');
                if (colonIndex > 0 && colonIndex < 20) { // 合理的用户名长度
                  username = content.substring(0, colonIndex).trim();
                }
              }
              
              // 如果仍然为空，设为未知用户
              if (!username) {
                username = '未知用户';
              }
              
              // 提取时间 - 时间在 div.con1 内的最后一个 div
              const timeElement = element.querySelector('div.con1 > div:last-child');
              const time = timeElement ? timeElement.textContent.trim() : '未知时间';
              
              // 降低质量检查要求 - 只过滤明显无用的内容
              const isQuality = content.length >= 3 && 
                              !content.includes('点击展开') &&
                              !content.includes('加载完毕') &&
                              !content.includes('共') && content.includes('条回复'); // 排除回复计数
              
              if (!config.qualityFilter || isQuality) {
                mainComments.push({
                  id: `main_${index}`,
                  username,
                  content,
                  time,
                  likes: 0,
                  index,
                  type: 'comment',
                  isHotTopic: false
                });
              }
              
              // 提取嵌套评论 - 简化逻辑，直接查找所有嵌套评论
              if (config.includeNested) {
                // 查找该主评论相关的所有嵌套评论 - 全局查找而不是限定容器
                const allNestedItems = document.querySelectorAll('div.item2');
                
                allNestedItems.forEach((nestedItem, nestedIndex) => {
                  // 跳过"共x条回复"的item2
                  const replyTextElement = nestedItem.querySelector('div.text');
                  if (replyTextElement && replyTextElement.textContent.includes('共') && replyTextElement.textContent.includes('条回复')) {
                    return; // 跳过回复计数元素
                  }
                  
                  // 检查是否是真正的嵌套评论内容（有实际内容）
                  const nestedContent = nestedItem.querySelector('div.con2 > div.text')?.textContent.trim() || '';
                  if (nestedContent.length >= 3) {
                    const nestedUsername = nestedItem.querySelector('a.ALink_default_2ibt1, a[href*="/u/"], div.con2 > div.text > a')?.textContent.trim() || '未知用户';
                    const nestedTime = nestedItem.querySelector('div.con2 > div:last-child')?.textContent.trim() || '未知时间';
                    
                    nestedComments.push({
                      id: `nested_${index}_${nestedIndex}`,
                      username: nestedUsername,
                      content: nestedContent,
                      time: nestedTime,
                      parentId: `main_${index}`,
                      index: nestedComments.length,
                      type: 'nested'
                    });
                  }
                });
              }
            } catch (error) {
              console.warn(`评论提取错误 (${index}):`, error.message);
            }
          });
        }
        
        return {
          mainComments,
          nestedComments,
          totalComments: mainComments.length + nestedComments.length,
          pageType: config.pageType,
          pageHeight: document.body.scrollHeight,
          timestamp: Date.now()
        };
      }, {
        includeNested: this.includeNested,
        qualityFilter: this.qualityFilter,
        pageType: detectedPageType
      });

      if (this.enableLogging) {
        const typeText = detectedPageType === 'hot-topic' ? '帖子' : '评论';
        console.log(`📝 ${typeText}提取完成: ${result.mainComments.length}条主${typeText}, ${result.nestedComments.length}条嵌套${typeText}`);
      }

      return {
        success: true,
        result: result
      };
    } catch (error) {
      return {
        success: false,
        error: `评论提取失败: ${error.message}`
      };
    }
  }
}

/**
 * 智能编排操作子
 * 负责协调各个操作子的执行和动态触发检测
 */
class SmartOrchestratorOperation {
  constructor(config) {
    this.enableLogging = config.enableLogging || false;
    this.orchestratorState = {
      currentPageType: 'unknown',
      isRunning: false,
      triggers: {
        pageLoad: false,
        scrollEnd: false,
        clickEnd: false,
        noGrowth: false,
        maxReached: false
      },
      executionLog: []
    };
  }

  async execute(page, context = {}) {
    try {
      if (this.enableLogging) {
        console.log('🎯 开始智能编排操作...');
      }

      // 初始化开始时间
      this.orchestratorState.startTime = Date.now();

      // 1. 检测页面类型
      const pageTypeResult = await this.detectPageType(page);
      if (!pageTypeResult.success) {
        return pageTypeResult;
      }

      const pageType = pageTypeResult.result.pageType;
      this.orchestratorState.currentPageType = pageType;

      // 2. 初始化加载操作子
      const loaderConfig = {
        maxScrolls: context.maxScrolls || 50,
        maxClicks: context.maxClicks || 20,
        enableLogging: this.enableLogging
      };

      let loaderResult;
      if (pageType === 'hot-topic') {
        const scrollLoader = new ScrollLoaderOperation(loaderConfig);
        loaderResult = await scrollLoader.execute(page, context);
      } else if (pageType === 'normal-post') {
        const clickLoader = new ClickLoaderOperation(loaderConfig);
        loaderResult = await clickLoader.execute(page, context);
      } else {
        // 未知页面类型，尝试滚动
        const scrollLoader = new ScrollLoaderOperation(loaderConfig);
        loaderResult = await scrollLoader.execute(page, context);
      }

      if (!loaderResult.success) {
        return loaderResult;
      }

      // 3. 提取评论
      const extractorConfig = {
        includeNested: context.includeNested !== false,
        enableLogging: this.enableLogging
      };
      
      const extractor = new CommentExtractorOperation(extractorConfig);
      const extractorResult = await extractor.execute(page, context);

      if (!extractorResult.success) {
        return extractorResult;
      }

      // 4. 记录执行日志
      const executionSummary = {
        pageType,
        loaderResult: loaderResult.result,
        extractionResult: extractorResult.result,
        totalExecutionTime: Date.now() - this.orchestratorState.startTime,
        timestamp: Date.now()
      };

      this.orchestratorState.executionLog.push(executionSummary);

      if (this.enableLogging) {
        console.log('🎯 智能编排完成:');
        console.log(`  页面类型: ${pageType}`);
        console.log(`  加载结果: ${JSON.stringify(loaderResult.result)}`);
        console.log(`  提取结果: ${extractorResult.result.mainComments.length}主评论, ${extractorResult.result.nestedComments.length}嵌套评论`);
      }

      return {
        success: true,
        result: {
          pageType,
          loaderResult: loaderResult.result,
          extractionResult: extractorResult.result,
          executionSummary
        }
      };
    } catch (error) {
      return {
        success: false,
        error: `智能编排失败: ${error.message}`
      };
    }
  }

  async detectPageType(page) {
    const detector = new PageTypeDetectorOperation({ enableLogging: this.enableLogging });
    return await detector.execute(page);
  }
}

// === 基础元素操作 ===

/**
 * 元素存在检查操作
 */
class ElementExistsOperation {
  constructor(config) {
    this.selector = config.selector;
    this.timeout = config.timeout || 5000;
  }

  async execute(page) {
    try {
      const element = await page.waitForSelector(this.selector, { 
        timeout: this.timeout,
        state: 'attached' 
      });
      return { success: true, result: element !== null };
    } catch (error) {
      return { success: true, result: false };
    }
  }
}

/**
 * 元素点击操作
 */
class ElementClickOperation {
  constructor(config) {
    this.selector = config.selector;
    this.timeout = config.timeout || 10000;
  }

  async execute(page) {
    try {
      await page.waitForSelector(this.selector, { 
        timeout: this.timeout,
        state: 'visible' 
      });
      await page.click(this.selector);
      return { success: true, result: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

/**
 * 元素输入操作
 */
class ElementInputOperation {
  constructor(config) {
    this.selector = config.selector;
    this.value = config.value;
    this.timeout = config.timeout || 10000;
  }

  async execute(page) {
    try {
      await page.waitForSelector(this.selector, { 
        timeout: this.timeout,
        state: 'visible' 
      });
      await page.fill(this.selector, this.value);
      return { success: true, result: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

/**
 * 元素文本提取操作
 */
class ElementTextOperation {
  constructor(config) {
    this.selector = config.selector;
    this.timeout = config.timeout || 5000;
    this.multiple = config.multiple || false;
  }

  async execute(page) {
    try {
      await page.waitForSelector(this.selector, { 
        timeout: this.timeout,
        state: 'attached' 
      });
      
      if (this.multiple) {
        const elements = await page.$$(this.selector);
        const texts = await Promise.all(
          elements.map(el => el.textContent())
        );
        return { success: true, result: texts.filter(text => text && text.trim()) };
      } else {
        const text = await page.textContent(this.selector);
        return { success: true, result: text ? text.trim() : '' };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

/**
 * 元素属性提取操作
 */
class ElementAttributeOperation {
  constructor(config) {
    this.selector = config.selector;
    this.attribute = config.attribute;
    this.timeout = config.timeout || 5000;
    this.multiple = config.multiple || false;
  }

  async execute(page) {
    try {
      await page.waitForSelector(this.selector, { 
        timeout: this.timeout,
        state: 'attached' 
      });
      
      if (this.multiple) {
        const elements = await page.$$(this.selector);
        const attributes = await Promise.all(
          elements.map(el => el.getAttribute(this.attribute))
        );
        return { success: true, result: attributes.filter(attr => attr) };
      } else {
        const attr = await page.getAttribute(this.selector, this.attribute);
        return { success: true, result: attr || '' };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

/**
 * 元素可见性检查操作
 */
class ElementVisibleOperation {
  constructor(config) {
    this.selector = config.selector;
    this.timeout = config.timeout || 5000;
  }

  async execute(page) {
    try {
      await page.waitForSelector(this.selector, { 
        timeout: this.timeout,
        state: 'visible' 
      });
      return { success: true, result: true };
    } catch (error) {
      return { success: true, result: false };
    }
  }
}

// === 页面操作 ===

/**
 * 页面导航操作
 */
class PageNavigationOperation {
  constructor(config) {
    this.url = config.url;
    this.waitUntil = config.waitUntil || 'domcontentloaded';
    this.timeout = config.timeout || 30000;
  }

  async execute(page) {
    try {
      await page.goto(this.url, { 
        waitUntil: this.waitUntil,
        timeout: this.timeout 
      });
      return { success: true, result: this.url };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

/**
 * 页面等待操作
 */
class PageWaitOperation {
  constructor(config) {
    this.duration = config.duration || 1000;
    this.selector = config.selector;
    this.state = config.state || 'attached';
  }

  async execute(page) {
    try {
      if (this.selector) {
        await page.waitForSelector(this.selector, { 
          state: this.state,
          timeout: this.duration 
        });
      } else {
        await page.waitForTimeout(this.duration);
      }
      return { success: true, result: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

/**
 * 页面滚动操作
 */
class PageScrollOperation {
  constructor(config) {
    this.direction = config.direction || 'bottom';
    this.amount = config.amount || 0;
  }

  async execute(page) {
    try {
      if (this.direction === 'bottom') {
        await page.evaluate(() => {
          window.scrollTo(0, document.body.scrollHeight);
        });
      } else if (this.direction === 'top') {
        await page.evaluate(() => {
          window.scrollTo(0, 0);
        });
      } else if (this.direction === 'amount') {
        await page.evaluate((amount) => {
          window.scrollBy(0, amount);
        }, this.amount);
      }
      return { success: true, result: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

// === Cookie虚拟操作子 ===

/**
 * Cookie加载虚拟操作子
 */
class CookieLoadOperation {
  constructor(config) {
    this.cookieSystem = config.cookieSystem;
    this.domain = config.domain || 'weibo.com';
    this.cookiePath = config.cookiePath;
  }

  async execute(page) {
    try {
      if (!this.cookieSystem) {
        throw new Error('Cookie system not provided');
      }

      // 如果提供了cookiePath，从文件加载
      if (this.cookiePath) {
        const fs = await import('fs');
        const cookieData = fs.readFileSync(this.cookiePath, 'utf8');
        const cookies = JSON.parse(cookieData);
        
        await this.cookieSystem.manager.storage.storeCookies(this.domain, cookies);
      }

      // 加载Cookie到页面
      await this.cookieSystem.loadCookies(page, this.domain);
      
      // 验证Cookie健康状态
      const health = await this.cookieSystem.validateCookieHealth(this.domain);
      
      return { 
        success: true, 
        result: { 
          domain: this.domain,
          health: health,
          loaded: true 
        } 
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

/**
 * Cookie验证虚拟操作子
 */
class CookieValidateOperation {
  constructor(config) {
    this.cookieSystem = config.cookieSystem;
    this.domain = config.domain || 'weibo.com';
  }

  async execute(page) {
    try {
      if (!this.cookieSystem) {
        throw new Error('Cookie system not provided');
      }

      const health = await this.cookieSystem.validateCookieHealth(this.domain);
      
      return { 
        success: true, 
        result: { 
          domain: this.domain,
          health: health,
          isValid: health.isValid,
          isExpired: health.isExpired
        } 
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

/**
 * 登录状态检查虚拟操作子
 */
class LoginStatusCheckOperation {
  constructor(config) {
    this.selectors = config.selectors || [
      '.gn_name',
      '.S_txt1', 
      '.username',
      '[data-usercard*="true"]',
      'a[href*="/home"]',
      '.woo-box-flex.woo-box-alignCenter.Card_title_3NffA',
      '[class*="name"]',
      '.Profile_title_3y3yh'
    ];
  }

  async execute(page) {
    try {
      for (const selector of this.selectors) {
        try {
          const element = await page.$(selector);
          if (element) {
            const text = await element.textContent();
            if (text && text.trim().length > 0 && text.trim().length < 50) {
              return { 
                success: true, 
                result: { 
                  isLoggedIn: true,
                  username: text.trim(),
                  selector: selector
                } 
              };
            }
          }
        } catch (error) {
          continue;
        }
      }
      
      return { 
        success: true, 
        result: { 
          isLoggedIn: false,
          username: null
        } 
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

// === 数据处理操作 ===

/**
 * 数据提取操作
 */
class DataExtractOperation {
  constructor(config) {
    this.dataSource = config.dataSource;
    this.extractors = config.extractors || [];
    this.filters = config.filters || [];
  }

  async execute(page) {
    try {
      let data = this.dataSource;
      
      // 如果dataSource是函数，执行它
      if (typeof this.dataSource === 'function') {
        data = await this.dataSource(page);
      }
      
      // 应用提取器
      for (const extractor of this.extractors) {
        data = await extractor(data);
      }
      
      // 应用过滤器
      for (const filter of this.filters) {
        data = data.filter(filter);
      }
      
      return { success: true, result: data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

/**
 * 数据验证操作
 */
class DataValidateOperation {
  constructor(config) {
    this.validators = config.validators || [];
    this.data = config.data;
  }

  async execute(page) {
    try {
      let isValid = true;
      let errors = [];
      
      for (const validator of this.validators) {
        const result = await validator(this.data);
        if (!result.valid) {
          isValid = false;
          errors.push(result.error);
        }
      }
      
      return { 
        success: true, 
        result: { 
          isValid: isValid,
          errors: errors,
          data: this.data
        } 
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

// === 文件操作 ===

/**
 * 文件读取操作
 */
class FileReadOperation {
  constructor(config) {
    this.filePath = config.filePath;
    this.encoding = config.encoding || 'utf8';
    this.format = config.format || 'json';
  }

  async execute(page) {
    try {
      const fs = await import('fs');
      const data = fs.readFileSync(this.filePath, this.encoding);
      
      let result;
      if (this.format === 'json') {
        result = JSON.parse(data);
      } else {
        result = data;
      }
      
      return { success: true, result: result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

/**
 * 文件写入操作
 */
class FileWriteOperation {
  constructor(config) {
    this.filePath = config.filePath;
    this.data = config.data;
    this.encoding = config.encoding || 'utf8';
    this.format = config.format || 'json';
  }

  async execute(page) {
    try {
      const fs = await import('fs');
      const fsPromises = await import('fs').then(m => m.promises);
      
      // 确保目录存在
      const dir = require('path').dirname(this.filePath);
      await fsPromises.mkdir(dir, { recursive: true });
      
      let content;
      if (this.format === 'json') {
        content = JSON.stringify(this.data, null, 2);
      } else {
        content = this.data;
      }
      
      await fsPromises.writeFile(this.filePath, content, this.encoding);
      
      return { success: true, result: this.filePath };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

// === 条件操作 ===

/**
 * 条件执行操作
 */
class ConditionalOperation {
  constructor(config) {
    this.condition = config.condition;
    this.trueOperation = config.trueOperation;
    this.falseOperation = config.falseOperation;
  }

  async execute(page) {
    try {
      const conditionResult = await this.condition(page);
      
      if (conditionResult) {
        if (this.trueOperation) {
          return await this.trueOperation.execute(page);
        }
      } else {
        if (this.falseOperation) {
          return await this.falseOperation.execute(page);
        }
      }
      
      return { success: true, result: conditionResult };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

/**
 * 循环操作
 */
class LoopOperation {
  constructor(config) {
    this.count = config.count || 1;
    this.operation = config.operation;
    this.condition = config.condition;
  }

  async execute(page) {
    try {
      const results = [];
      let i = 0;
      
      while (i < this.count) {
        if (this.condition) {
          const shouldContinue = await this.condition(page, i);
          if (!shouldContinue) break;
        }
        
        const result = await this.operation.execute(page);
        results.push(result);
        i++;
      }
      
      return { success: true, result: results };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

// === 微博专项操作 ===

/**
 * 微博帖子内容捕获操作
 * 捕获文字、图片、视频链接、作者信息、发布时间等
 */
class WeiboPostContentCaptureOperation {
  constructor(config) {
    this.postUrl = config.postUrl;
    this.contentSelectors = config.contentSelectors || {
      mainContent: '.Feed_body_3R0rO, .Feed_body_2wP8c, .feed_body, [class*="feed_body"]',
      authorName: '.Feed_body_3R0rO .woo-box-flex.woo-box-alignCenter.Card_title_3NffA .woo-box-flex.woo-box-alignCenter.Z_link_isY_0, .Feed_body_2wP8c .woo-box-flex.woo-box-alignCenter.Card_title_3NffA .woo-box-flex.woo-box-alignCenter.Z_link_isY_0, .woo-box-flex.woo-box-alignCenter.Card_title_3NffA .woo-box-flex.woo-box-alignCenter.Z_link_isY_0',
      postTime: '.Feed_body_3R0rO .Feed_body_2wP8c .woo-box-flex.woo-box-alignCenter.Card_title_3NffA .woo-box-flex.Card_title_3NffA, .Feed_body_2wP8c .woo-box-flex.woo-box-alignCenter.Card_title_3NffA .woo-box-flex.Card_title_3NffA, .woo-box-flex.woo-box-alignCenter.Card_title_3NffA .woo-box-flex.Card_title_3NffA',
      images: 'img[class*="image"], img[src*="sinaimg"], .Feed_body_3R0rO img, .Feed_body_2wP8c img, .feed_img img',
      videos: 'video, .video-player, [class*="video"], a[href*="video"], a[href*="mp4"]',
      stats: '.Feed_body_3R0rO .woo-box-flex.woo-box-alignCenter.Card_actionBar_3P2T5, .Feed_body_2wP8c .woo-box-flex.woo-box-alignCenter.Card_actionBar_3P2T5, .woo-box-flex.woo-box-alignCenter.Card_actionBar_3P2T5'
    };
    this.timeout = config.timeout || 15000;
  }

  async execute(page) {
    try {
      const result = {
        url: this.postUrl,
        content: {},
        media: [],
        metadata: {},
        capturedAt: new Date().toISOString()
      };

      // 导航到帖子页面
      if (this.postUrl) {
        await page.goto(this.postUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(3000); // 等待动态内容加载
      }

      // 捕获主内容
      const mainContent = await page.evaluate((selectors) => {
        const mainElement = document.querySelector(selectors.mainContent);
        if (!mainElement) return null;

        // 提取纯文本内容
        const textContent = mainElement.textContent || '';
        
        // 提取HTML内容（保留结构）
        const htmlContent = mainElement.innerHTML || '';

        return {
          text: textContent.trim(),
          html: htmlContent,
          elementCount: mainElement.querySelectorAll('*').length
        };
      }, this.contentSelectors);

      result.content = mainContent;

      // 捕获作者信息
      const authorInfo = await page.evaluate((selectors) => {
        const authorElement = document.querySelector(selectors.authorName);
        const timeElement = document.querySelector(selectors.postTime);
        
        return {
          name: authorElement ? authorElement.textContent.trim() : null,
          time: timeElement ? timeElement.textContent.trim() : null,
          profileUrl: authorElement ? authorElement.href : null
        };
      }, this.contentSelectors);

      result.metadata.author = authorInfo;

      // 捕获图片
      const images = await page.evaluate((selectors) => {
        const imageElements = document.querySelectorAll(selectors.images);
        return Array.from(imageElements).map(img => ({
          src: img.src || img.dataset.src,
          alt: img.alt || '',
          width: img.naturalWidth || img.width,
          height: img.naturalHeight || img.height,
          isLazy: !!img.dataset.src
        })).filter(img => img.src && (img.src.includes('sinaimg') || img.src.includes('weibo')));
      }, this.contentSelectors);

      result.media = result.media.concat(images.map(img => ({ ...img, type: 'image' })));

      // 捕获视频链接
      const videos = await page.evaluate((selectors) => {
        const videoElements = document.querySelectorAll(selectors.videos);
        return Array.from(videoElements).map(element => {
          if (element.tagName === 'VIDEO') {
            return {
              src: element.src || element.currentSrc,
              poster: element.poster,
              duration: element.duration,
              type: 'video'
            };
          } else if (element.tagName === 'A') {
            return {
              url: element.href,
              text: element.textContent,
              type: 'video_link'
            };
          } else {
            return {
              src: element.querySelector('video')?.src || element.querySelector('a')?.href,
              type: 'video_embed'
            };
          }
        }).filter(v => v.src || v.url);
      }, this.contentSelectors);

      result.media = result.media.concat(videos);

      // 捕获统计数据（转发、评论、点赞）
      const stats = await page.evaluate((selectors) => {
        const statsElement = document.querySelector(selectors.stats);
        if (!statsElement) return null;

        const statItems = statsElement.querySelectorAll('button, a, [role="button"]');
        return Array.from(statItems).map(item => ({
          action: item.getAttribute('aria-label') || item.textContent,
          count: item.textContent.match(/\d+/)?.[0] || '0'
        }));
      }, this.contentSelectors);

      result.metadata.stats = stats;

      return { success: true, result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

/**
 * 微博评论分页加载操作
 * 处理评论的分页加载和滚动加载
 */
/**
 * 增强版微博评论提取操作 - 支持嵌套评论和智能底部判断
 */
class WeiboEnhancedCommentsOperation {
  constructor(config) {
    this.maxComments = config.maxComments || 500;
    this.maxScrolls = config.maxScrolls || 50;
    this.scrollDelay = config.scrollDelay || 2000;
    this.maxNoGrowth = config.maxNoGrowth || 5;
    this.maxClickFailures = config.maxClickFailures || 3;
    this.commentContainer = config.commentContainer || '.Feed_body_3R0rO, .Feed_body_2wP8c, [class*="comment"], .comment_list, [class*="comment"]';
    this.timeout = config.timeout || 30000;
    this.enableLogging = config.enableLogging || false;
  }

  async execute(page) {
    try {
      const result = await page.evaluate((config) => {
        const results = {
          mainComments: [],
          nestedComments: [],
          operationLog: [],
          clickLog: [],
          errorLog: [],
          scrollCount: 0,
          totalComments: 0,
          finalPageHeight: 0
        };

        // 记录操作的函数
        function logOperation(type, details) {
          const logEntry = {
            timestamp: new Date().toISOString(),
            type,
            details,
            scrollCount: results.scrollCount
          };
          results.operationLog.push(logEntry);
          if (config.enableLogging) {
            console.log(`[操作记录] ${type}: ${JSON.stringify(details)}`);
          }
        }

        // 记录点击的函数
        function logClick(element, selector, reason) {
          const clickEntry = {
            timestamp: new Date().toISOString(),
            selector,
            elementInfo: {
              tagName: element.tagName,
              text: (element.textContent || '').substring(0, 100),
              classes: element.className,
              id: element.id,
              visible: element.offsetParent !== null
            },
            reason,
            scrollCount: results.scrollCount
          };
          results.clickLog.push(clickEntry);
          if (config.enableLogging) {
            console.log(`[点击记录] ${reason}: ${element.tagName} - "${(element.textContent || '').substring(0, 50)}"`);
          }
        }

        // 智能点击加载更多
        async function smartClickLoadMore() {
          const loadMoreTexts = ['点击加载更多', '加载更多', '查看更多', '展开', '更多'];
          const selectors = [
            // DIV元素（关键发现）
            'div[class*="panel"]',
            'div[class*="Card_wrap"]',
            'div[class*="tipbox"]',
            'div[class*="more"]',
            // 按钮元素
            'button:not([aria-label*="分享"]):not([title*="分享"]):not([class*="share"])',
            'a[class*="more"]',
            '[class*="loadmore"]',
            '[class*="load-more"]'
          ];

          for (const selector of selectors) {
            try {
              const elements = document.querySelectorAll(selector);
              for (const element of elements) {
                if (element.offsetParent === null) continue;

                const elementText = element.textContent || '';
                const rect = element.getBoundingClientRect();
                const isInBottom = rect.bottom > window.innerHeight - 500;

                if (isInBottom && loadMoreTexts.some(text => elementText.includes(text))) {
                  // 检查是否为错误元素
                  const isInFeedHeader = element.closest('.Feed_header') || element.closest('[class*="header"]');
                  const isShareButton = elementText.includes('分享') || elementText.includes('转发') || 
                                     element.getAttribute('aria-label')?.includes('分享') ||
                                     element.getAttribute('title')?.includes('分享');
                  const isCommentBox = element.getAttribute('contenteditable') === 'true' || 
                                     element.getAttribute('role') === 'textbox';

                  if (isInFeedHeader || isShareButton || isCommentBox) {
                    logClick(element, selector, `跳过错误元素`);
                    continue;
                  }

                  if (selector.includes('div') || selector.includes('Card')) {
                    logClick(element, selector, `点击DIV加载元素`);
                  } else if (selector.includes('button')) {
                    logClick(element, selector, `点击BUTTON加载元素`);
                  } else {
                    logClick(element, selector, `点击其他加载元素`);
                  }

                  element.click();
                  return true;
                } else {
                  if (selector.includes('div')) {
                    logClick(element, selector, `跳过非加载DIV`);
                  } else if (selector.includes('button')) {
                    logClick(element, selector, `跳过非加载BUTTON`);
                  } else {
                    logClick(element, selector, `跳过其他元素`);
                  }
                }
              }
            } catch (error) {
              results.errorLog.push({
                timestamp: new Date().toISOString(),
                error: error.message,
                selector,
                scrollCount: results.scrollCount
              });
            }
          }

          logOperation('查找加载按钮', { result: '未找到合适的加载按钮' });
          return false;
        }

        // 提取评论的函数
        function extractCommentsFromArea(area, isNested = false) {
          const comments = [];
          
          // 查找评论元素
          const commentElements = area.querySelectorAll(
            isNested ? '[class*="reply"], [class*="Reply"], [class*="sub"]' : 
            '[class*="comment"], [class*="Comment"], div[class*="item"]'
          );

          commentElements.forEach(commentElement => {
            // 跳过已经被处理过的嵌套评论
            if (commentElement.dataset.processed) return;
            commentElement.dataset.processed = 'true';

            // 提取用户名
            const userNameSelectors = [
              '[class*="name"]', 
              '[class*="nick"]', 
              '[class*="author"]',
              'a[usercard]',
              '.Feed_body_3R0rO [class*="nick"]',
              '.Feed_body_2wP8c [class*="nick"]'
            ];
            
            let userName = '';
            for (const selector of userNameSelectors) {
              const nameElement = commentElement.querySelector(selector);
              if (nameElement) {
                userName = nameElement.textContent?.trim() || '';
                if (userName) break;
              }
            }

            // 如果没找到用户名，尝试从父级获取
            if (!userName) {
              const parentElement = commentElement.closest('[class*="feed"], [class*="item"]');
              if (parentElement) {
                const parentName = parentElement.querySelector('[class*="name"], [class*="nick"]');
                if (parentName) {
                  userName = parentName.textContent?.trim() || '';
                }
              }
            }

            // 提取内容
            const contentSelectors = [
              '[class*="text"]',
              '[class*="content"]',
              '.detail_wbtext_4CRf9',
              '[class*="body"]',
              '[class*="msg"]'
            ];
            
            let content = '';
            for (const selector of contentSelectors) {
              const contentElement = commentElement.querySelector(selector);
              if (contentElement) {
                content = contentElement.textContent?.trim() || '';
                if (content && content.length > 3) break;
              }
            }

            // 如果没有找到内容，尝试获取元素的直接文本内容
            if (!content || content.length < 3) {
              content = commentElement.textContent?.trim() || '';
            }

            // 提取时间
            const timeSelectors = [
              '[class*="time"]',
              '[class*="date"]',
              'time',
              '[class*="from"]'
            ];
            
            let time = '';
            for (const selector of timeSelectors) {
              const timeElement = commentElement.querySelector(selector);
              if (timeElement) {
                time = timeElement.textContent?.trim() || '';
                if (time) break;
              }
            }

            // 提取点赞数
            const likeSelectors = [
              '[class*="like"]',
              '[class*="赞"]',
              'button[aria-label*="赞"]',
              '[title*="赞"]'
            ];
            
            let likes = 0;
            for (const selector of likeSelectors) {
              const likeElement = commentElement.querySelector(selector);
              if (likeElement) {
                const likeText = likeElement.textContent?.trim() || '';
                const likeNumber = parseInt(likeText.replace(/[^\d]/g, ''));
                if (!isNaN(likeNumber)) {
                  likes = likeNumber;
                  break;
                }
              }
            }

            // 生成唯一ID
            const id = `${userName}-${content.substring(0, 30)}-${time}-${isNested ? 'nested' : 'main'}`;

            if (userName && content && content.length > 5) {
              comments.push({
                id,
                userName,
                content,
                time,
                likes,
                isNested,
                parentId: isNested ? area.id || null : null,
                element: commentElement.outerHTML.substring(0, 200)
              });
            }
          });

          return comments;
        }

        // 分析最终底部元素
        async function analyzeFinalBottomElements() {
          const results = {
            scrollInfo: {
              scrollTop: window.scrollY,
              scrollHeight: document.body.scrollHeight,
              clientHeight: window.innerHeight,
              scrollPercentage: (window.scrollY / (document.body.scrollHeight - window.innerHeight)) * 100
            },
            bottomElements: [],
            loadMoreElements: [],
            endMarkers: [],
            finalVisibleElements: []
          };

          const viewportBottom = window.scrollY + window.innerHeight;
          const allElements = document.querySelectorAll('*');

          // 收集底部元素
          for (const element of allElements) {
            const rect = element.getBoundingClientRect();
            const elementBottom = rect.bottom + window.scrollY;

            if (elementBottom > results.scrollInfo.scrollHeight - 500) {
              if (element.offsetParent !== null) {
                const text = element.textContent || '';
                results.bottomElements.push({
                  tagName: element.tagName,
                  className: element.className,
                  id: element.id,
                  text: text.trim().substring(0, 100),
                  bottom: elementBottom,
                  distanceFromBottom: results.scrollInfo.scrollHeight - elementBottom,
                  outerHTML: element.outerHTML.substring(0, 300)
                });
              }
            }
          }

          // 查找加载更多元素
          const loadMoreTexts = ['点击加载更多', '加载更多', '查看更多', '展开', '更多'];
          for (const element of allElements) {
            const text = (element.textContent || '').toLowerCase();
            if (loadMoreTexts.some(text => text.includes(text))) {
              results.loadMoreElements.push({
                tagName: element.tagName,
                className: element.className,
                text: element.textContent.trim(),
                visible: element.offsetParent !== null,
                distanceFromBottom: results.scrollInfo.scrollHeight - (element.getBoundingClientRect().bottom + window.scrollY)
              });
            }
          }

          return results;
        }
        
        // 页面类型检测函数
        function detectPageType() {
          const url = window.location.href;
          if (url.includes('/hot/weibo/')) {
            return 'hot-topic';
          } else if (url.includes('/u/') || url.match(/\/\d+\/\w+/)) {
            return 'normal-post';
          } else {
            return 'unknown';
          }
        }
        
        // 滚动加载函数（适用于热门话题页面）
        async function scrollToLoadMore() {
          try {
            const previousHeight = document.body.scrollHeight;
            const previousCommentCount = results.mainComments.length + results.nestedComments.length;
            
            // 记录滚动操作
            logOperation('执行滚动加载', {
              previousHeight,
              previousCommentCount,
              scrollCount: results.scrollCount
            });
            
            // 使用直接脚本成功的滚动策略
            window.scrollTo(0, document.body.scrollHeight);
            results.scrollCount++;
            
            // 记录滚动执行完成
            logOperation('滚动执行完成', {
              targetScroll,
              actualScroll: window.scrollY,
              scrollCount: results.scrollCount
            });
            
            // 等待滚动完成
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // 记录等待滚动完成
            logOperation('滚动等待完成', {
              scrollCount: results.scrollCount
            });
            
            // 等待内容加载
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // 记录内容加载等待完成
            logOperation('内容加载等待完成', {
              scrollCount: results.scrollCount
            });
            
            // 检查是否有新内容
            const newHeight = document.body.scrollHeight;
            const heightIncreased = newHeight > previousHeight;
            
            // 记录滚动结果
            logOperation('滚动加载结果', {
              previousHeight,
              newHeight,
              heightIncreased,
              scrollCount: results.scrollCount,
              currentScroll: window.scrollY
            });
            
            return heightIncreased;
          } catch (error) {
            logError(new Error(`滚动加载失败: ${error.message}`), 'scrollToLoadMore');
            return false;
          }
        }
        
        // 主提取循环
        async function extractAllComments() {
          let lastCommentCount = 0;
          let noGrowthCount = 0;
          let consecutiveClickFailures = 0;
          
          // 检测页面类型并选择策略
          const pageType = detectPageType();
          logOperation('页面类型检测', { pageType });
          
          // 根据页面类型选择加载策略
          const useScrollStrategy = pageType === 'hot-topic';
          logOperation('加载策略选择', { 
            pageType, 
            strategy: useScrollStrategy ? 'scroll' : 'click' 
          });

          while (noGrowthCount < config.maxNoGrowth && consecutiveClickFailures < config.maxClickFailures) {
            // 根据策略选择加载方式
            let loadedNewContent = false;
            
            if (useScrollStrategy) {
              // 热门话题页面：使用滚动策略
              loadedNewContent = await scrollToLoadMore();
              if (!loadedNewContent) {
                consecutiveClickFailures++;
                logOperation('滚动加载失败', { consecutiveClickFailures, maxClickFailures: config.maxClickFailures });
              } else {
                consecutiveClickFailures = 0;
              }
            } else {
              // 普通帖子：使用点击策略
              const clicked = await smartClickLoadMore();
              if (clicked) {
                await new Promise(resolve => setTimeout(resolve, 2000));
                loadedNewContent = true;
                consecutiveClickFailures = 0;
              } else {
                consecutiveClickFailures++;
                logOperation('点击加载失败', { consecutiveClickFailures, maxClickFailures: config.maxClickFailures });
              }
            }

            // 提取当前页面的所有评论
            const currentComments = [];
            
            // 查找所有评论区域
            const commentAreas = document.querySelectorAll(
              '[class*="comment"], [class*="Comment"], [class*="reply"], [class*="Reply"], ' +
              '[class*="feed"], [class*="item"], .Feed_body, .comment_list, .RepostCommentList'
            );
            
            commentAreas.forEach(area => {
              // 首先提取主评论
              const mainComments = extractCommentsFromArea(area, false);
              currentComments.push(...mainComments);
              
              // 然后提取嵌套评论
              const nestedComments = extractCommentsFromArea(area, true);
              currentComments.push(...nestedComments);
            });

            // 去重
            const uniqueComments = [];
            const seenIds = new Set();
            
            currentComments.forEach(comment => {
              if (!seenIds.has(comment.id)) {
                seenIds.add(comment.id);
                uniqueComments.push(comment);
              }
            });

            // 分类
            const newMainComments = uniqueComments.filter(c => !c.isNested);
            const newNestedComments = uniqueComments.filter(c => c.isNested);

            // 更新结果
            newMainComments.forEach(comment => {
              if (!results.mainComments.find(c => c.id === comment.id)) {
                results.mainComments.push(comment);
              }
            });

            newNestedComments.forEach(comment => {
              if (!results.nestedComments.find(c => c.id === comment.id)) {
                results.nestedComments.push(comment);
              }
            });

            // 检查增长
            const totalCurrent = results.mainComments.length + results.nestedComments.length;
            if (totalCurrent > lastCommentCount) {
              lastCommentCount = totalCurrent;
              noGrowthCount = 0;
              logOperation('评论增长', { 
                totalComments: totalCurrent, 
                mainComments: results.mainComments.length, 
                nestedComments: results.nestedComments.length 
              });
            } else {
              noGrowthCount++;
              logOperation('无评论增长', { noGrowthCount, maxNoGrowth: config.maxNoGrowth });
              
              // 如果连续多次无增长或点击失败，准备最终的底部分析
              if (noGrowthCount >= config.maxNoGrowth || consecutiveClickFailures >= config.maxClickFailures) {
                logOperation('即将停止，进行最终底部分析', { 
                  scrollCount: results.scrollCount, 
                  currentHeight: document.body.scrollHeight,
                  noGrowthCount,
                  consecutiveClickFailures,
                  stopReason: noGrowthCount >= config.maxNoGrowth ? '无增长达到上限' : '点击失败达到上限'
                });
                
                // 记录最终底部元素
                const finalBottomAnalysis = await analyzeFinalBottomElements();
                results.finalBottomAnalysis = finalBottomAnalysis;
                logOperation('最终底部分析完成', { 
                  bottomElementsCount: finalBottomAnalysis.bottomElements.length,
                  loadMoreElementsCount: finalBottomAnalysis.loadMoreElements.length,
                  endMarkersCount: finalBottomAnalysis.endMarkers.length
                });
              }
            }

            // 滚动到底部
            window.scrollTo(0, document.body.scrollHeight);
            results.scrollCount++;
            await new Promise(resolve => setTimeout(resolve, 1500));

            // 记录页面高度
            results.finalPageHeight = document.body.scrollHeight;
          }

          results.totalComments = results.mainComments.length + results.nestedComments.length;
        }

        // 开始提取
        logOperation('开始增强评论提取', { config });
        extractAllComments();

        return results;
      }, {
        maxNoGrowth: this.maxNoGrowth,
        maxClickFailures: this.maxClickFailures,
        enableLogging: this.enableLogging
      });

      return {
        success: true,
        result: {
          mainComments: result.mainComments,
          nestedComments: result.nestedComments,
          operationLog: result.operationLog,
          clickLog: result.clickLog,
          errorLog: result.errorLog,
          scrollCount: result.scrollCount,
          totalComments: result.totalComments,
          finalPageHeight: result.finalPageHeight,
          finalBottomAnalysis: result.finalBottomAnalysis
        }
      };

    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

/**
 * 原版微博评论分页操作 - 保留用于向后兼容
 */
class WeiboCommentsPaginationOperation {
  constructor(config) {
    this.maxComments = config.maxComments || 150;
    this.maxScrolls = config.maxScrolls || 30;
    this.scrollDelay = config.scrollDelay || 1500;
    this.commentContainer = config.commentContainer || '.Feed_body_3R0rO, .Feed_body_2wP8c, [class*="comment"], .comment_list, [class*="comment"]';
    this.loadMoreButton = config.loadMoreButton || 'button:has-text("加载更多"), button:has-text("展开"), [class*="more"], a:has-text("更多评论")';
    this.timeout = config.timeout || 30000;
  }

  async execute(page) {
    try {
      let allComments = [];
      let scrollCount = 0;
      let previousHeight = 0;

      console.log(`开始加载评论，目标: ${this.maxComments} 条评论`);

      // 初始等待
      await page.waitForTimeout(2000);

      while (scrollCount < this.maxScrolls && allComments.length < this.maxComments) {
        // 尝试点击"加载更多"和"展开"按钮
        try {
          // 首先尝试展开按钮（测试中发现这是关键）
          const expandButton = await page.$('button:has-text("展开")');
          if (expandButton) {
            const isVisible = await expandButton.isVisible();
            if (isVisible) {
              await expandButton.click();
              console.log('点击了展开按钮');
              await page.waitForTimeout(this.scrollDelay);
            }
          }
          
          // 然后尝试其他加载更多按钮
          const loadMoreButton = await page.$(this.loadMoreButton);
          if (loadMoreButton) {
            const isVisible = await loadMoreButton.isVisible();
            if (isVisible) {
              await loadMoreButton.click();
              console.log('点击了加载更多按钮');
              await page.waitForTimeout(this.scrollDelay);
            }
          }
        } catch (error) {
          // 没有加载更多按钮，继续滚动
        }

        // 滚动页面加载更多评论 - 更激进的滚动
        await page.evaluate(() => {
          window.scrollTo(0, document.body.scrollHeight);
        });

        await page.waitForTimeout(this.scrollDelay);

        // 检查页面高度是否变化，但不立即停止
        const currentHeight = await page.evaluate(() => document.body.scrollHeight);
        if (currentHeight === previousHeight) {
          // 页面高度没有变化，但继续尝试几次
          console.log('页面高度未变化，继续尝试加载...');
        }
        previousHeight = currentHeight;

        // 提取当前页面的评论
        const newComments = await this.extractCurrentPageComments(page);
        allComments.push(...newComments);

        console.log(`第 ${scrollCount + 1} 次滚动，已获取 ${allComments.length} 条评论`);

        scrollCount++;
      }

      // 去重
      const uniqueComments = this.deduplicateComments(allComments);

      return { 
        success: true, 
        result: {
          comments: uniqueComments.slice(0, this.maxComments),
          totalCount: uniqueComments.length,
          scrollCount: scrollCount,
          maxCommentsReached: uniqueComments.length >= this.maxComments
        }
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async extractCurrentPageComments(page) {
    return await page.evaluate(() => {
      // 使用测试验证过的有效选择器
      const commentSelectors = [
        '[class*="comment"]',
        '[class*="Comment"]',
        '[class*="reply"]', 
        '[class*="Reply"]',
        'div[class*="item"]',
        'div[class*="feed"]'
      ];
      
      const allElements = [];
      
      commentSelectors.forEach(selector => {
        try {
          const elements = document.querySelectorAll(selector);
          elements.forEach(element => {
            allElements.push(element);
          });
        } catch (error) {
          // 选择器无效，跳过
        }
      });
      
      return Array.from(allElements).map(element => {
        // 尝试提取用户名 - 评论区域的用户名通常有特定结构
        const userElement = element.querySelector('[class*="name"], [class*="user"], a[href*="/u/"], a[href*="/n/"], .woo-box-flex.woo-box-alignCenter.Card_title_3NffA');
        const userName = userElement ? userElement.textContent.trim() : '';
        
        // 尝试提取评论内容 - 避免主内容
        const contentElement = element.querySelector('[class*="content"], [class*="text"], [class*="body"], p, .woo-box-flex.woo-box-alignCenter.Card_body_3NffA');
        const content = contentElement ? contentElement.textContent.trim() : '';
        
        // 尝试提取时间 - 评论时间通常有特定标记
        const timeElement = element.querySelector('[class*="time"], [class*="date"], time, span[title*="时间"], span[title*="日期"]');
        const time = timeElement ? timeElement.textContent.trim() : '';
        
        // 尝试提取点赞数
        const likeElement = element.querySelector('button[aria-label*="赞"], [class*="like"], button[title*="赞"], span[class*="like"]');
        const likes = likeElement ? likeElement.textContent.match(/\d+/)?.[0] || '0' : '0';
        
        // 检查元素是否看起来像真实评论
        const hasUser = userName && userName.length > 0 && userName.length < 50;
        const hasContent = content && content.length > 5 && content.length < 1000;
        const isMainContent = element.querySelector('.Feed_body_3R0rO, .Feed_body_2wP8c') !== null; // 排除主帖子内容
        
        // 只返回看起来像真实评论的元素
        if (!hasUser || !hasContent || isMainContent) {
          return null;
        }

        // 创建唯一标识符
        const id = `${userName}-${content}-${time}`.replace(/\s+/g, '_');

        return {
          id,
          userName,
          content,
          time,
          likes: parseInt(likes) || 0,
          element: element.outerHTML.substring(0, 200) // 保存部分HTML用于调试
        };
      }).filter(comment => comment !== null); // 过滤掉null值
    });
  }

  deduplicateComments(comments) {
    const seen = new Set();
    return comments.filter(comment => {
      const key = `${comment.userName}-${comment.content}-${comment.time}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }
}

/**
 * 微博帖子完整捕获操作
 * 整合内容捕获和评论捕获
 */
class WeiboPostCompleteCaptureOperation {
  constructor(config) {
    this.postUrl = config.postUrl;
    this.contentCapture = new WeiboPostContentCaptureOperation(config);
    this.commentsCapture = new WeiboCommentsPaginationOperation(config);
    this.savePath = config.savePath;
  }

  async execute(page) {
    try {
      console.log(`开始完整捕获微博帖子: ${this.postUrl}`);

      // 1. 捕获帖子内容
      console.log('步骤1: 捕获帖子内容...');
      const contentResult = await this.contentCapture.execute(page);
      if (!contentResult.success) {
        throw new Error(`内容捕获失败: ${contentResult.error}`);
      }

      // 2. 捕获评论
      console.log('步骤2: 捕获评论...');
      const commentsResult = await this.commentsCapture.execute(page);
      if (!commentsResult.success) {
        throw new Error(`评论捕获失败: ${commentsResult.error}`);
      }

      // 3. 整合结果
      const completeResult = {
        post: contentResult.result,
        comments: commentsResult.result,
        summary: {
          totalComments: commentsResult.result.totalCount,
          totalImages: contentResult.result.media.filter(m => m.type === 'image').length,
          totalVideos: contentResult.result.media.filter(m => m.type === 'video' || m.type === 'video_link').length,
          capturedAt: new Date().toISOString()
        }
      };

      // 4. 保存结果
      if (this.savePath) {
        await this.saveResults(completeResult, this.savePath);
      }

      console.log(`✅ 完整捕获完成: ${completeResult.summary.totalComments} 条评论, ${completeResult.summary.totalImages} 张图片, ${completeResult.summary.totalVideos} 个视频`);

      return { success: true, result: completeResult };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async saveResults(results, filePath) {
    const fs = await import('fs');
    const fsPromises = await import('fs').then(m => m.promises);
    
    // 确保目录存在
    const dir = require('path').dirname(filePath);
    await fsPromises.mkdir(dir, { recursive: true });
    
    await fsPromises.writeFile(filePath, JSON.stringify(results, null, 2));
    console.log(`💾 结果已保存到: ${filePath}`);
  }
}

// === 操作工厂 ===

class AtomicOperationFactory {
  static createOperation(type, config) {
    switch (type) {
      // 基础元素操作
      case 'element.exists':
        return new ElementExistsOperation(config);
      case 'element.click':
        return new ElementClickOperation(config);
      case 'element.input':
        return new ElementInputOperation(config);
      case 'element.text':
        return new ElementTextOperation(config);
      case 'element.attribute':
        return new ElementAttributeOperation(config);
      case 'element.visible':
        return new ElementVisibleOperation(config);
      
      // 页面操作
      case 'page.navigate':
        return new PageNavigationOperation(config);
      case 'page.wait':
        return new PageWaitOperation(config);
      case 'page.scroll':
        return new PageScrollOperation(config);
      
      // Cookie虚拟操作子
      case 'cookie.load':
        return new CookieLoadOperation(config);
      case 'cookie.validate':
        return new CookieValidateOperation(config);
      case 'login.check':
        return new LoginStatusCheckOperation(config);
      
      // 数据处理操作
      case 'data.extract':
        return new DataExtractOperation(config);
      case 'data.validate':
        return new DataValidateOperation(config);
      
      // 文件操作
      case 'file.read':
        return new FileReadOperation(config);
      case 'file.write':
        return new FileWriteOperation(config);
      
      // 条件操作
      case 'conditional':
        return new ConditionalOperation(config);
      case 'loop':
        return new LoopOperation(config);
      
      // 微博专项操作
      case 'weibo.post.content':
        return new WeiboPostContentCaptureOperation(config);
      case 'weibo.comments.pagination':
        return new WeiboCommentsPaginationOperation(config);
      case 'weibo.comments.enhanced':
        return new WeiboEnhancedCommentsOperation(config);
      case 'weibo.post.complete':
        return new WeiboPostCompleteCaptureOperation(config);
      
      // 拆分操作子架构
      case 'page.type.detect':
        return new PageTypeDetectorOperation(config);
      case 'page.scroll.load':
        return new ScrollLoaderOperation(config);
      case 'page.click.load':
        return new ClickLoaderOperation(config);
      case 'comment.extract':
        return new CommentExtractorOperation(config);
      case 'orchestrator.smart':
        return new SmartOrchestratorOperation(config);
      
      default:
        throw new Error(`Unknown operation type: ${type}`);
    }
  }
}

module.exports = {
  // 基础元素操作
  ElementExistsOperation,
  ElementClickOperation,
  ElementInputOperation,
  ElementTextOperation,
  ElementAttributeOperation,
  ElementVisibleOperation,
  
  // 页面操作
  PageNavigationOperation,
  PageWaitOperation,
  PageScrollOperation,
  
  // Cookie虚拟操作子
  CookieLoadOperation,
  CookieValidateOperation,
  LoginStatusCheckOperation,
  
  // 数据处理操作
  DataExtractOperation,
  DataValidateOperation,
  
  // 文件操作
  FileReadOperation,
  FileWriteOperation,
  
  // 条件操作
  ConditionalOperation,
  LoopOperation,
  
  // 微博专项操作
  WeiboPostContentCaptureOperation,
  WeiboCommentsPaginationOperation,
  WeiboEnhancedCommentsOperation,
  WeiboPostCompleteCaptureOperation,
  
  // 拆分操作子架构
  PageTypeDetectorOperation,
  ScrollLoaderOperation,
  ClickLoaderOperation,
  CommentExtractorOperation,
  SmartOrchestratorOperation,
  
  // 工厂类
  AtomicOperationFactory
};