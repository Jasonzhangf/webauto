/**
 * 智能帖子观察器
 * 基于MutationObserver和机器学习算法动态识别页面中的帖子元素
 */

class IntelligentPostObserver {
  constructor(options = {}) {
    this.options = {
      minContentLength: 20,
      observationTime: 5000,
      scrollThreshold: 100,
      similarityThreshold: 0.7,
      maxCandidates: 10,
      ...options
    };
    
    this.observer = null;
    this.candidates = new Map();
    this.scrollEvents = [];
    this.mutationEvents = [];
    this.elementMetrics = new Map();
  }

  /**
   * 开始观察页面
   */
  async observePage(page) {
    console.log('🔍 开始智能观察页面结构...');
    
    // 清理之前的数据
    this.candidates.clear();
    this.scrollEvents = [];
    this.mutationEvents = [];
    this.elementMetrics.clear();
    
    // 设置MutationObserver
    await page.evaluate(() => {
      if (window.intelligentObserver) {
        window.intelligentObserver.disconnect();
      }
      
      window.intelligentObserver = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === 1) { // 元素节点
              window.intelligentObserver.analyzeElement(node);
            }
          });
        });
      });
      
      // 观察整个文档
      window.intelligentObserver.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeOldValue: true
      });
      
      // 监听滚动事件
      let scrollTimeout;
      window.addEventListener('scroll', () => {
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => {
          window.intelligentObserver.recordScroll();
        }, 500);
      });
      
      // 分析方法
      window.intelligentObserver.analyzeElement = (element) => {
        const metrics = window.intelligentObserver.calculateElementMetrics(element);
        if (metrics.isCandidate) {
          const key = `${metrics.selector}_${metrics.contentHash}`;
          if (!window.intelligentObserver.candidates.has(key)) {
            window.intelligentObserver.candidates.set(key, {
              element,
              metrics,
              firstSeen: Date.now(),
              lastSeen: Date.now(),
              occurrenceCount: 1
            });
          } else {
            const candidate = window.intelligentObserver.candidates.get(key);
            candidate.lastSeen = Date.now();
            candidate.occurrenceCount++;
          }
        }
      };
      
      // 计算元素指标
      window.intelligentObserver.calculateElementMetrics = (element) => {
        const rect = element.getBoundingClientRect();
        const computedStyle = window.getComputedStyle(element);
        const textContent = element.textContent.trim();
        
        // 检查是否为候选元素
        const isCandidate = textContent.length >= 10 &&
                           rect.width > 50 &&
                           rect.height > 20 &&
                           !window.intelligentObserver.isNavigationElement(element) &&
                           !window.intelligentObserver.isInteractiveElement(element);
        
        // 添加调试信息
        if (isCandidate) {
          console.log('[DEBUG] 候选元素:', {
            selector: window.intelligentObserver.generateSelector(element),
            textLength: textContent.length,
            size: `${rect.width}x${rect.height}`,
            text: textContent.substring(0, 50)
          });
        }
        
        // 生成选择器
        const selector = window.intelligentObserver.generateSelector(element);
        
        // 内容哈希
        const contentHash = window.intelligentObserver.hashContent(textContent);
        
        // 位置特征
        const positionFeatures = {
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
          viewportRatio: (rect.width * rect.height) / (window.innerWidth * window.innerHeight)
        };
        
        // 样式特征
        const styleFeatures = {
          display: computedStyle.display,
          position: computedStyle.position,
          zIndex: parseInt(computedStyle.zIndex) || 0,
          hasBackground: computedStyle.backgroundColor !== 'rgba(0, 0, 0, 0)' &&
                         computedStyle.backgroundColor !== 'transparent',
          hasBorder: computedStyle.borderWidth !== '0px',
          hasPadding: computedStyle.padding !== '0px',
          hasMargin: computedStyle.margin !== '0px'
        };
        
        // 内容特征
        const contentFeatures = {
          textLength: textContent.length,
          hasLinks: element.querySelectorAll('a').length > 0,
          hasImages: element.querySelectorAll('img').length > 0,
          hasLists: element.querySelectorAll('ul, ol').length > 0,
          linkDensity: window.intelligentObserver.calculateLinkDensity(element),
          textDensity: textContent.length / (rect.width * rect.height)
        };
        
        return {
          selector,
          contentHash,
          isCandidate,
          positionFeatures,
          styleFeatures,
          contentFeatures,
          element
        };
      };
      
      // 生成选择器
      window.intelligentObserver.generateSelector = (element) => {
        if (element.id) {
          return `#${element.id}`;
        }
        
        if (element.className) {
          const classes = element.className.trim().split(/\s+/);
          if (classes.length > 0) {
            return `.${classes.join('.')}`;
          }
        }
        
        const tagName = element.tagName.toLowerCase();
        const parent = element.parentElement;
        
        if (parent) {
          const siblings = Array.from(parent.children).filter(child => 
            child.tagName === element.tagName
          );
          const index = siblings.indexOf(element);
          return index > 0 ? `${tagName}:nth-of-type(${index + 1})` : tagName;
        }
        
        return tagName;
      };
      
      // 内容哈希
      window.intelligentObserver.hashContent = (content) => {
        let hash = 0;
        for (let i = 0; i < content.length; i++) {
          const char = content.charCodeAt(i);
          hash = ((hash << 5) - hash) + char;
          hash = hash & hash; // 转换为32位整数
        }
        return Math.abs(hash);
      };
      
      // 计算链接密度
      window.intelligentObserver.calculateLinkDensity = (element) => {
        const textLength = element.textContent.length;
        const linkTextLength = Array.from(element.querySelectorAll('a'))
          .reduce((sum, link) => sum + link.textContent.length, 0);
        return textLength > 0 ? linkTextLength / textLength : 0;
      };
      
      // 检查是否为导航元素
      window.intelligentObserver.isNavigationElement = (element) => {
        const navSelectors = [
          'nav', 'header', 'footer', '.nav', '.navigation', '.menu',
          '.sidebar', '.toolbar', '.actions', '.buttons'
        ];
        return navSelectors.some(selector => 
          element.matches(selector) || element.closest(selector)
        );
      };
      
      // 检查是否为交互元素
      window.intelligentObserver.isInteractiveElement = (element) => {
        const interactiveTags = ['button', 'input', 'select', 'textarea'];
        const interactiveSelectors = [
          '[role="button"]', '[role="link"]', '.btn', '.button',
          '.clickable', '.action', '.control'
        ];
        
        return interactiveTags.includes(element.tagName.toLowerCase()) ||
               interactiveSelectors.some(selector => element.matches(selector));
      };
      
      // 记录滚动事件
      window.intelligentObserver.recordScroll = () => {
        const scrollData = {
          timestamp: Date.now(),
          scrollTop: window.pageYOffset,
          scrollLeft: window.pageXOffset,
          viewportHeight: window.innerHeight,
          viewportWidth: window.innerWidth
        };
        
        window.intelligentObserver.scrollEvents.push(scrollData);
        
        // 分析滚动时的元素变化
        window.intelligentObserver.analyzeScrollBehavior(scrollData);
      };
      
      // 分析滚动行为
      window.intelligentObserver.analyzeScrollBehavior = (scrollData) => {
        // 分析在滚动过程中新出现的元素
        const visibleElements = document.elementsFromPoint(
          window.innerWidth / 2,
          window.innerHeight / 2
        );
        
        visibleElements.forEach(element => {
          if (element !== document.body && element !== document.documentElement) {
            window.intelligentObserver.analyzeElement(element);
          }
        });
      };
      
      // 初始化数据存储
      window.intelligentObserver.candidates = new Map();
      window.intelligentObserver.scrollEvents = [];
      window.intelligentObserver.mutationEvents = [];
      
      console.log('🔍 智能观察器已启动');
    });
    
    // 等待观察时间
    await this.waitForObservation(page);
    
    return this.analyzeCandidates(page);
  }
  
  /**
   * 等待观察完成
   */
  async waitForObservation(page) {
    console.log(`⏳ 观察页面 ${this.options.observationTime / 1000} 秒...`);
    
    // 模拟一些用户交互来触发动态内容加载
    await page.evaluate(() => {
      // 轻微滚动
      window.scrollBy(0, 100);
      setTimeout(() => {
        window.scrollBy(0, -100);
      }, 1000);
    });
    
    await page.waitForTimeout(this.options.observationTime);
  }
  
  /**
   * 分析候选元素
   */
  async analyzeCandidates(page) {
    console.log('🔍 分析候选元素...');
    
    const candidates = await page.evaluate(() => {
      const candidates = Array.from(window.intelligentObserver.candidates.values());
      
      // 计算每个候选的得分
      return candidates.map(candidate => {
        const { metrics, firstSeen, lastSeen, occurrenceCount } = candidate;
        
        // 时间得分 (出现频率和持续时间)
        const timeScore = Math.min(occurrenceCount / 5, 1) * 0.3;
        
        // 位置得分 (页面中的重要位置)
        const positionScore = this.calculatePositionScore(metrics.positionFeatures);
        
        // 样式得分 (看起来像内容块)
        const styleScore = this.calculateStyleScore(metrics.styleFeatures);
        
        // 内容得分 (内容质量和密度)
        const contentScore = this.calculateContentScore(metrics.contentFeatures);
        
        // 滚动行为得分
        const scrollScore = this.calculateScrollScore(candidate);
        
        const totalScore = (
          timeScore * 0.2 +
          positionScore * 0.2 +
          styleScore * 0.2 +
          contentScore * 0.3 +
          scrollScore * 0.1
        );
        
        return {
          selector: metrics.selector,
          element: metrics.element,
          score: totalScore,
          metrics: {
            time: { score: timeScore, details: { occurrenceCount } },
            position: { score: positionScore, details: metrics.positionFeatures },
            style: { score: styleScore, details: metrics.styleFeatures },
            content: { score: contentScore, details: metrics.contentFeatures },
            scroll: { score: scrollScore }
          },
          occurrenceCount,
          firstSeen,
          lastSeen
        };
      }).sort((a, b) => b.score - a.score);
    }, this);
    
    // 输出分析结果
    console.log('🔍 候选元素分析结果:');
    candidates.slice(0, this.options.maxCandidates).forEach((candidate, index) => {
      console.log(`   ${index + 1}. ${candidate.selector}`);
      console.log(`      得分: ${candidate.score.toFixed(3)}`);
      console.log(`      出现次数: ${candidate.occurrenceCount}`);
      console.log(`      内容得分: ${candidate.metrics.content.score.toFixed(3)}`);
      console.log(`      位置得分: ${candidate.metrics.position.score.toFixed(3)}`);
    });
    
    return candidates.slice(0, this.options.maxCandidates);
  }
  
  /**
   * 计算位置得分
   */
  calculatePositionScore(positionFeatures) {
    // 中心区域得分更高
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;
    const elementCenterX = positionFeatures.left + positionFeatures.width / 2;
    const elementCenterY = positionFeatures.top + positionFeatures.height / 2;
    
    const distanceFromCenter = Math.sqrt(
      Math.pow(elementCenterX - centerX, 2) + 
      Math.pow(elementCenterY - centerY, 2)
    );
    
    const maxDistance = Math.sqrt(
      Math.pow(centerX, 2) + Math.pow(centerY, 2)
    );
    
    const centerScore = 1 - (distanceFromCenter / maxDistance);
    
    // 大小得分
    const sizeScore = Math.min(positionFeatures.viewportRatio * 10, 1);
    
    return (centerScore + sizeScore) / 2;
  }
  
  /**
   * 计算样式得分
   */
  calculateStyleScore(styleFeatures) {
    let score = 0;
    
    // 块级元素得分更高
    if (styleFeatures.display === 'block') score += 0.3;
    
    // 有背景和边框得分更高
    if (styleFeatures.hasBackground) score += 0.2;
    if (styleFeatures.hasBorder) score += 0.2;
    if (styleFeatures.hasPadding) score += 0.1;
    if (styleFeatures.hasMargin) score += 0.1;
    
    // 不是绝对定位得分更高
    if (styleFeatures.position !== 'absolute' && styleFeatures.position !== 'fixed') {
      score += 0.1;
    }
    
    return Math.min(score, 1);
  }
  
  /**
   * 计算内容得分
   */
  calculateContentScore(contentFeatures) {
    let score = 0;
    
    // 文本长度得分
    const textScore = Math.min(contentFeatures.textLength / 200, 1) * 0.3;
    score += textScore;
    
    // 链接密度适中得分
    if (contentFeatures.linkDensity < 0.3) score += 0.2;
    
    // 有媒体内容得分
    if (contentFeatures.hasLinks) score += 0.1;
    if (contentFeatures.hasImages) score += 0.2;
    if (contentFeatures.hasLists) score += 0.1;
    
    // 文本密度适中得分
    if (contentFeatures.textDensity > 0.01 && contentFeatures.textDensity < 0.1) {
      score += 0.1;
    }
    
    return Math.min(score, 1);
  }
  
  /**
   * 计算滚动行为得分
   */
  calculateScrollScore(candidate) {
    // 这里可以实现更复杂的滚动行为分析
    // 例如：元素在滚动时的可见性、加载时机等
    return 0.5; // 默认得分
  }
  
  /**
   * 提取帖子链接
   */
  async extractPostLinks(page, candidates) {
    console.log('🔗 提取帖子链接...');
    
    const links = await page.evaluate((candidates) => {
      const links = [];
      
      candidates.forEach(candidate => {
        const elements = document.querySelectorAll(candidate.selector);
        
        elements.forEach((element, index) => {
          // 查找元素内的链接
          const postLinks = element.querySelectorAll('a[href]');
          
          postLinks.forEach(link => {
            const href = link.getAttribute('href');
            if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
              // 构建完整URL
              const fullUrl = href.startsWith('http') ? href : 
                             href.startsWith('//') ? `https:${href}` :
                             `https://s.weibo.com${href}`;
              
              links.push({
                url: fullUrl,
                selector: candidate.selector,
                elementIndex: index,
                score: candidate.score,
                linkText: link.textContent.trim(),
                context: element.textContent.trim().substring(0, 100)
              });
            }
          });
        });
      });
      
      // 去重
      const uniqueLinks = [];
      const seenUrls = new Set();
      
      links.forEach(link => {
        if (!seenUrls.has(link.url)) {
          seenUrls.add(link.url);
          uniqueLinks.push(link);
        }
      });
      
      return uniqueLinks.sort((a, b) => b.score - a.score);
    }, candidates);
    
    console.log(`🔗 找到 ${links.length} 个唯一链接`);
    
    return links;
  }
  
  /**
   * 批量访问链接获取内容
   */
  async batchExtractContent(page, links, options = {}) {
    console.log(`📝 批量提取 ${links.length} 个链接的内容...`);
    
    const results = [];
    const batchSize = options.batchSize || 5;
    const delay = options.delay || 2000;
    
    for (let i = 0; i < links.length; i += batchSize) {
      const batch = links.slice(i, i + batchSize);
      console.log(`📝 处理批次 ${Math.floor(i / batchSize) + 1}/${Math.ceil(links.length / batchSize)}`);
      
      const batchResults = await Promise.all(batch.map(async (link) => {
        try {
          // 访问链接
          await page.goto(link.url, { 
            waitUntil: 'networkidle',
            timeout: 30000 
          });
          
          // 等待页面加载
          await page.waitForTimeout(2000);
          
          // 提取内容
          const content = await page.evaluate(() => {
            // 查找主内容区域
            const contentSelectors = [
              'article',
              '[role="article"]',
              '.content',
              '.post-content',
              '.article-content',
              '.weibo-text',
              '.wb_text',
              'main',
              '.main'
            ];
            
            let mainContent = '';
            let foundSelector = '';
            
            for (const selector of contentSelectors) {
              const element = document.querySelector(selector);
              if (element && element.textContent.trim().length > 50) {
                mainContent = element.textContent.trim();
                foundSelector = selector;
                break;
              }
            }
            
            // 如果没有找到特定选择器，查找最长的文本块
            if (!mainContent) {
              const textBlocks = Array.from(document.body.querySelectorAll('*'))
                .filter(el => el.textContent.trim().length > 100)
                .map(el => ({
                  text: el.textContent.trim(),
                  element: el
                }))
                .sort((a, b) => b.text.length - a.text.length);
              
              if (textBlocks.length > 0) {
                mainContent = textBlocks[0].text;
                foundSelector = 'auto-detected';
              }
            }
            
            // 提取元数据
            const metadata = {
              title: document.title,
              url: window.location.href,
              timestamp: new Date().toISOString(),
              contentSelector: foundSelector,
              contentLength: mainContent.length
            };
            
            return {
              content: mainContent,
              metadata,
              success: true
            };
          });
          
          return {
            link,
            content: content.content,
            metadata: content.metadata,
            success: true
          };
          
        } catch (error) {
          console.warn(`⚠️  处理链接失败: ${link.url}`, error.message);
          return {
            link,
            content: '',
            metadata: {},
            success: false,
            error: error.message
          };
        }
      }));
      
      results.push(...batchResults);
      
      // 批次间延迟
      if (i + batchSize < links.length) {
        console.log(`⏳ 等待 ${delay / 1000} 秒...`);
        await page.waitForTimeout(delay);
      }
    }
    
    const successfulResults = results.filter(r => r.success);
    console.log(`✅ 成功提取 ${successfulResults.length}/${links.length} 个链接的内容`);
    
    return results;
  }
  
  /**
   * 停止观察
   */
  async stopObservation(page) {
    await page.evaluate(() => {
      if (window.intelligentObserver) {
        window.intelligentObserver.disconnect();
        delete window.intelligentObserver;
        console.log('🛑 智能观察器已停止');
      }
    });
  }
}

module.exports = IntelligentPostObserver;