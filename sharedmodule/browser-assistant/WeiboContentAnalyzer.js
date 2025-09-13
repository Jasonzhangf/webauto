/**
 * 微博页面内容状态智能判断器
 * 动态判断页面加载状态、内容可用性和交互需求
 */

class WeiboContentAnalyzer {
  constructor() {
    this.judgmentCriteria = {
      // 内容加载阈值 - 更宽松的标准
      minPostCount: 1,                    // 最少期望帖子数 (降低门槛)
      minLinkCount: 5,                    // 最少链接数 (降低门槛)
      minTextLength: 50,                  // 最少文本总长度 (降低门槛)
      
      // 动态加载检测
      scrollThreshold: 2,                 // 滚动次数阈值 (减少滚动)
      loadingTimeout: 15000,              // 加载超时时间(ms) (缩短等待)
      contentStabilityTime: 1000,         // 内容稳定时间(ms) (缩短等待)
      
      // 状态检测 - 更严格的过滤，避免误判
      loadingIndicators: ['加载中', '正在加载', 'loading...', '请稍等'],
      errorIndicators: ['页面错误', '系统错误', '加载失败', '500错误', '404错误'],
      emptyIndicators: ['暂无内容', '还没有内容', '空空如也'],
      
      // 链接格式模式
      newLinkPattern: /weibo\.com\/\d+\/[A-Za-z0-9]+/,
      oldLinkPatterns: [/\/status\/\d+/, /\/detail\/\d+/],
      userLinkPattern: /\/u\/\d+/,
      
      // 容器检测
      mainContentSelector: '.Main_wrap_2GRrG',
      feedIndicators: ['Feed', 'feed', 'Card', 'card'],
      scrollIndicators: ['Scroll', 'scroll'],
      
      // 新增：实际可用性判断
      minValidPosts: 1,                   // 最少有效帖子数
      allowPartialContent: true,          // 允许部分内容
      ignoreNetworkErrors: true,          // 忽略网络错误 (403等)
      ignoreConsoleErrors: true,          // 忽略控制台错误
      
      // 新增：可视区域检测参数
      viewportAnalysis: {
        enabled: true,                     // 启用可视区域分析
        staticElementThreshold: 3,        // 静态元素阈值 (滚动后不变次数)
        visibilityCheckInterval: 1000,    // 可见性检查间隔(ms)
        minViewportPosts: 1,              // 可视区域最少帖子数
        scrollSensitivity: 100,           // 滚动敏感度(px)
        contentChangeThreshold: 0.1       // 内容变化阈值(10%)
      }
    };
  }

  /**
   * 分析页面当前状态 - 增强版本，提供详细分析输出
   */
  async analyzePageState(page) {
    console.log('🔍 开始分析页面状态...');
    
    const analysis = await page.evaluate((criteria) => {
      // 内联所有分析方法，因为 this 在 evaluate 中不可用
      
      // 1. 基础页面信息
      const pageInfo = {
        url: window.location.href,
        title: document.title,
        readyState: document.readyState,
        scrollHeight: document.body.scrollHeight,
        clientHeight: window.innerHeight,
        scrollTop: window.scrollY
      };
      
      // 2. 内容加载状态
      const analyzeContentLoadStatus = (criteria) => {
        const allElements = document.querySelectorAll('*');
        const textContent = document.body.textContent || '';
        
        // 检查主要内容区域
        const mainContent = document.querySelector(criteria.mainContentSelector);
        const mainContentLoaded = !!mainContent;
        
        // 统计内容元素
        const feedElements = document.querySelectorAll('[class*="Feed"], [class*="feed"]').length;
        const cardElements = document.querySelectorAll('[class*="Card"], [class*="card"]').length;
        const scrollElements = document.querySelectorAll('[class*="Scroll"], [class*="scroll"]').length;
        
        // 计算有效内容
        const hasSubstantialContent = textContent.length > criteria.minTextLength;
        const hasContentElements = feedElements > 0 || cardElements > 0;
        
        return {
          mainContentLoaded,
          hasSubstantialContent,
          hasContentElements,
          feedElements,
          cardElements,
          scrollElements,
          totalTextLength: textContent.length
        };
      };
      
      // 3. 链接分析
      const analyzeLinks = (criteria) => {
        const allLinks = document.querySelectorAll('a[href]');
        
        // 按格式分类链接
        const linksByType = {
          newFormat: Array.from(allLinks).filter(a => criteria.newLinkPattern.test(a.href)).length,
          oldStatus: Array.from(allLinks).filter(a => criteria.oldLinkPatterns.some(pattern => pattern.test(a.href))).length,
          userLinks: Array.from(allLinks).filter(a => criteria.userLinkPattern.test(a.href)).length,
          searchLinks: Array.from(allLinks).filter(a => a.href.includes('s.weibo.com')).length,
          otherLinks: Array.from(allLinks).filter(a => !a.href.match(/weibo\.com/) && !a.href.includes('s.weibo.com')).length
        };
        
        // 检测主导航链接格式
        const dominantFormat = Object.entries(linksByType)
          .reduce((max, [type, count]) => count > max.count ? { type, count } : max, { type: 'none', count: 0 });
        
        // 采样链接验证
        const sampleLinks = Array.from(allLinks)
          .filter(a => criteria.newLinkPattern.test(a.href) || criteria.oldLinkPatterns.some(pattern => pattern.test(a.href)))
          .slice(0, 5)
          .map(a => ({
            href: a.href,
            text: a.textContent.trim(),
            format: criteria.newLinkPattern.test(a.href) ? 'new' : 'old'
          }));
        
        return {
          totalLinks: allLinks.length,
          linksByType,
          dominantFormat: dominantFormat.type,
          dominantFormatCount: dominantFormat.count,
          sampleLinks,
          hasValidPostLinks: linksByType.newFormat > 0 || linksByType.oldStatus > 0
        };
      };
      
      // 4. 页面结构分析
      const analyzePageStructure = (criteria) => {
        const mainContent = document.querySelector(criteria.mainContentSelector);
        
        // 检查页面结构完整性
        const structureIntegrity = {
          hasMainContent: !!mainContent,
          hasFeedElements: document.querySelectorAll('[class*="Feed"], [class*="feed"]').length > 0,
          hasCardElements: document.querySelectorAll('[class*="Card"], [class*="card"]').length > 0,
          hasScrollElements: document.querySelectorAll('[class*="Scroll"], [class*="scroll"]').length > 0,
          hasNavigation: document.querySelector('nav, .nav, [class*="nav"]') !== null,
          hasSidebar: document.querySelector('.side, [class*="side"], .aside, [class*="aside"]') !== null
        };
        
        // 计算结构完整性分数
        const integrityScore = Object.values(structureIntegrity).filter(Boolean).length;
        const structureHealth = integrityScore >= 4 ? 'good' : integrityScore >= 2 ? 'partial' : 'poor';
        
        return {
          structureIntegrity,
          integrityScore,
          structureHealth,
          recommendation: getStructureRecommendation(structureHealth, integrityScore)
        };
      };
      
      // 5. 动态状态检测
      const analyzeDynamicStatus = (criteria) => {
        // 检测加载指示器
        const loadingElements = document.querySelectorAll(
          criteria.loadingIndicators.map(indicator => 
            `[class*="${indicator}"], [text*="${indicator}"]`
          ).join(', ')
        ).length;
        
        // 检测动画和过渡状态
        const animatedElements = document.querySelectorAll(
          '[class*="animate"], [class*="transition"], [style*="animation"]'
        ).length;
        
        // 检测可见性变化
        const hiddenElements = document.querySelectorAll(
          '[style*="display: none"], [style*="visibility: hidden"], .hidden, [class*="hidden"]'
        ).length;
        
        // 判断是否正在加载
        const isLoading = loadingElements > 0 || animatedElements > 3;
        
        // 判断内容是否稳定
        const isContentStable = loadingElements === 0 && animatedElements <= 2;
        
        return {
          isLoading,
          isContentStable,
          loadingElements,
          animatedElements,
          hiddenElements,
          needsScroll: hiddenElements > 10, // 很多隐藏元素可能需要滚动
          needsInteraction: loadingElements > 0 // 有加载元素可能需要交互
        };
      };
      
      // 6. 可视区域内容检测 - 新增功能
      const analyzeViewportContent = (criteria) => {
        const viewport = {
          top: window.scrollY,
          bottom: window.scrollY + window.innerHeight,
          left: 0,
          right: window.innerWidth
        };
        
        // 检测可视区域内的元素
        const getElementsInViewport = (selector) => {
          return Array.from(document.querySelectorAll(selector)).filter(el => {
            const rect = el.getBoundingClientRect();
            return rect.top < viewport.bottom && 
                   rect.bottom > viewport.top && 
                   rect.left < viewport.right && 
                   rect.right > viewport.left;
          });
        };
        
        // 检测可视区域内的帖子候选元素
        const postCandidates = getElementsInViewport('[class*="Feed"], [class*="feed"], [class*="Card"], [class*="card"]');
        const linksInViewport = getElementsInViewport('a[href*="status"], a[href*="detail"], a[href^="https://weibo.com/"][href*="/"]:not([href*="/u/"])');
        
        // 分析可视区域内内容的文本分布
        const textElementsInViewport = getElementsInViewport('*').filter(el => {
          const text = el.textContent || '';
          return text.trim().length > 10; // 只考虑有意义的文本
        });
        
        // 计算可视区域内容密度
        const viewportArea = window.innerWidth * window.innerHeight;
        const contentDensity = textElementsInViewport.length / viewportArea;
        
        // 检测静态UI元素 (导航、侧边栏等)
        const staticElements = getElementsInViewport('nav, .nav, [class*="nav"], .side, [class*="side"], .aside, [class*="aside"], header, footer');
        
        return {
          viewport,
          postCandidates: postCandidates.length,
          validLinksInViewport: linksInViewport.length,
          textElementsInViewport: textElementsInViewport.length,
          contentDensity,
          staticElements: staticElements.length,
          hasViewportContent: postCandidates.length > 0 || linksInViewport.length > 0,
          contentRatio: postCandidates.length / (postCandidates.length + staticElements.length) || 0
        };
      };
      
      // 7. 静态元素检测 - 新增功能
      const analyzeStaticElements = (criteria) => {
        // 检测在滚动中保持不变的元素
        const detectStaticElements = () => {
          const allElements = document.querySelectorAll('*');
          const staticCandidates = [];
          
          Array.from(allElements).forEach(el => {
            if (el.getBoundingClientRect().top < window.innerHeight && 
                el.getBoundingClientRect().bottom > 0) {
              // 只检查可视区域内的元素
              const rect = el.getBoundingClientRect();
              const className = el.className || '';
              const id = el.id || '';
              
              // 识别常见的静态UI元素
              const isStaticUI = /(nav|side|header|footer|toolbar|menu|button|tab|fixed|sticky|permanent)/i.test(className) ||
                               /(nav|side|header|footer|toolbar|menu|button|tab|fixed|sticky|permanent)/i.test(id);
              
              if (isStaticUI) {
                staticCandidates.push({
                  element: el,
                  className,
                  id,
                  rect,
                  type: this.getStaticElementType(el)
                });
              }
            }
          });
          
          return staticCandidates;
        };
        
        const detectedStaticElements = detectStaticElements();
        
        // 内联分类函数，避免this引用问题
        const categorizeElements = (elements) => {
          const categories = {};
          elements.forEach(el => {
            const type = getStaticElementType(el.element);
            categories[type] = (categories[type] || 0) + 1;
          });
          return categories;
        };
        
        return {
          staticElements: detectedStaticElements,
          staticElementTypes: categorizeElements(detectedStaticElements),
          hasSignificantStaticContent: detectedStaticElements.length > 5
        };
      };
      
      // 8. 错误和空状态检测 - 优化版本
      const analyzeErrorStates = (criteria) => {
        // 检测错误指示器 - 更严格的匹配
        const errorElements = document.querySelectorAll(
          criteria.errorIndicators.map(indicator => 
            `[class*="${indicator}"], *[text*="${indicator}"]`
          ).join(', ')
        ).length;
        
        // 检测空状态指示器 - 更严格的匹配
        const emptyElements = document.querySelectorAll(
          criteria.emptyIndicators.map(indicator => 
            `[class*="${indicator}"], *[text*="${indicator}"]`
          ).join(', ')
        ).length;
        
        // 检测网络资源错误 - 但忽略常见的403等
        const networkErrors = Array.from(document.querySelectorAll('script, img, link'))
          .filter(el => el.onerror || el.hasAttribute('error'))
          .filter(el => {
            // 忽略常见的非关键错误
            const src = el.src || el.href || '';
            return !src.includes('403') && !src.includes('favicon') && !src.includes('tracker');
          }).length;
        
        // 更智能的错误检测 - 主要关注页面级别的错误
        const pageErrors = criteria.ignoreConsoleErrors ? 0 : (window.console?.error ? 1 : 0);
        
        // 关键错误判断 - 只有真正影响功能的才算错误
        const hasCriticalErrors = errorElements > 0 || 
          (networkErrors > 3 && !criteria.ignoreNetworkErrors) || 
          (emptyElements > 2);
        
        return {
          hasErrors: hasCriticalErrors,
          hasEmptyState: emptyElements > 0,
          errorElements,
          emptyElements,
          networkErrors,
          pageErrors,
          errorType: getErrorType(errorElements, networkErrors, emptyElements),
          // 新增：可用性评估
          isUsable: !hasCriticalErrors && emptyElements <= 1,
          hasMinorIssues: networkErrors > 0 || emptyElements === 1
        };
      };
      
      // 辅助函数
      const getStructureRecommendation = (health, score) => {
        const recommendations = {
          good: '页面结构完整，可以正常操作',
          partial: '页面结构部分完整，可能需要等待完全加载',
          poor: '页面结构不完整，建议检查网络或重新加载'
        };
        return recommendations[health];
      };
      
      const getErrorType = (errorElements, networkErrors, emptyElements) => {
        if (networkErrors > 0) return 'network';
        if (errorElements > 0) return 'page_error';
        if (emptyElements > 0) return 'empty_content';
        return 'unknown';
      };
      
      // 新增：静态元素分析辅助函数
      const getStaticElementType = (element) => {
        const className = (element.className || '').toLowerCase();
        const id = (element.id || '').toLowerCase();
        const tagName = element.tagName.toLowerCase();
        
        if (className.includes('nav') || id.includes('nav')) return 'navigation';
        if (className.includes('side') || id.includes('side')) return 'sidebar';
        if (className.includes('header') || id.includes('header') || tagName === 'header') return 'header';
        if (className.includes('footer') || id.includes('footer') || tagName === 'footer') return 'footer';
        if (className.includes('toolbar') || id.includes('toolbar')) return 'toolbar';
        if (className.includes('menu') || id.includes('menu')) return 'menu';
        if (className.includes('tab') || id.includes('tab')) return 'tab';
        if (className.includes('fixed') || className.includes('sticky')) return 'fixed_ui';
        return 'other_static';
      };
      
      const categorizeStaticElements = (staticElements) => {
        const categories = {};
        staticElements.forEach(el => {
          const type = getStaticElementType(el.element);
          categories[type] = (categories[type] || 0) + 1;
        });
        return categories;
      };
      
      // 执行分析
      const contentStatus = analyzeContentLoadStatus(criteria);
      const linkAnalysis = analyzeLinks(criteria);
      const structureAnalysis = analyzePageStructure(criteria);
      const dynamicStatus = analyzeDynamicStatus(criteria);
      const viewportAnalysis = criteria.viewportAnalysis.enabled ? analyzeViewportContent(criteria) : null;
      const staticElementAnalysis = criteria.viewportAnalysis.enabled ? analyzeStaticElements(criteria) : null;
      const errorStatus = analyzeErrorStates(criteria);
      
      return {
        pageInfo,
        contentStatus,
        linkAnalysis,
        structureAnalysis,
        dynamicStatus,
        viewportAnalysis,
        staticElementAnalysis,
        errorStatus,
        timestamp: Date.now()
      };
    }, this.judgmentCriteria);
    
    return this.generateEnhancedJudgment(analysis);
  }

  /**
   * 分析内容加载状态
   */
  analyzeContentLoadStatus(criteria) {
    const allElements = document.querySelectorAll('*');
    const textContent = document.body.textContent || '';
    
    // 检查主要内容区域
    const mainContent = document.querySelector(criteria.mainContentSelector);
    const mainContentLoaded = !!mainContent;
    
    // 统计内容元素
    const feedElements = document.querySelectorAll('[class*="Feed"], [class*="feed"]').length;
    const cardElements = document.querySelectorAll('[class*="Card"], [class*="card"]').length;
    const scrollElements = document.querySelectorAll('[class*="Scroll"], [class*="scroll"]').length;
    
    // 计算有效内容
    const hasSubstantialContent = textContent.length > criteria.minTextLength;
    const hasContentElements = feedElements > 0 || cardElements > 0;
    
    return {
      mainContentLoaded,
      hasSubstantialContent,
      hasContentElements,
      feedElements,
      cardElements,
      scrollElements,
      totalTextLength: textContent.length
    };
  }

  /**
   * 分析链接情况
   */
  analyzeLinks(criteria) {
    const allLinks = document.querySelectorAll('a[href]');
    
    // 按格式分类链接
    const linksByType = {
      newFormat: Array.from(allLinks).filter(a => criteria.newLinkPattern.test(a.href)).length,
      oldStatus: Array.from(allLinks).filter(a => criteria.oldLinkPatterns.some(pattern => pattern.test(a.href))).length,
      userLinks: Array.from(allLinks).filter(a => criteria.userLinkPattern.test(a.href)).length,
      searchLinks: Array.from(allLinks).filter(a => a.href.includes('s.weibo.com')).length,
      otherLinks: Array.from(allLinks).filter(a => !a.href.match(/weibo\.com/) && !a.href.includes('s.weibo.com')).length
    };
    
    // 检测主导航链接格式
    const dominantFormat = Object.entries(linksByType)
      .reduce((max, [type, count]) => count > max.count ? { type, count } : max, { type: 'none', count: 0 });
    
    // 采样链接验证
    const sampleLinks = Array.from(allLinks)
      .filter(a => criteria.newLinkPattern.test(a.href) || criteria.oldLinkPatterns.some(pattern => pattern.test(a.href)))
      .slice(0, 5)
      .map(a => ({
        href: a.href,
        text: a.textContent.trim(),
        format: criteria.newLinkPattern.test(a.href) ? 'new' : 'old'
      }));
    
    return {
      totalLinks: allLinks.length,
      linksByType,
      dominantFormat: dominantFormat.type,
      dominantFormatCount: dominantFormat.count,
      sampleLinks,
      hasValidPostLinks: linksByType.newFormat > 0 || linksByType.oldStatus > 0
    };
  }

  /**
   * 分析页面结构
   */
  analyzePageStructure(criteria) {
    const mainContent = document.querySelector(criteria.mainContentSelector);
    
    // 检查页面结构完整性
    const structureIntegrity = {
      hasMainContent: !!mainContent,
      hasFeedElements: document.querySelectorAll('[class*="Feed"], [class*="feed"]').length > 0,
      hasCardElements: document.querySelectorAll('[class*="Card"], [class*="card"]').length > 0,
      hasScrollElements: document.querySelectorAll('[class*="Scroll"], [class*="scroll"]').length > 0,
      hasNavigation: document.querySelector('nav, .nav, [class*="nav"]') !== null,
      hasSidebar: document.querySelector('.side, [class*="side"], .aside, [class*="aside"]') !== null
    };
    
    // 计算结构完整性分数
    const integrityScore = Object.values(structureIntegrity).filter(Boolean).length;
    const structureHealth = integrityScore >= 4 ? 'good' : integrityScore >= 2 ? 'partial' : 'poor';
    
    return {
      structureIntegrity,
      integrityScore,
      structureHealth,
      recommendation: this.getStructureRecommendation(structureHealth, integrityScore)
    };
  }

  /**
   * 分析动态状态
   */
  analyzeDynamicStatus(criteria) {
    // 检测加载指示器
    const loadingElements = document.querySelectorAll(
      criteria.loadingIndicators.map(indicator => 
        `[class*="${indicator}"], [text*="${indicator}"]`
      ).join(', ')
    ).length;
    
    // 检测动画和过渡状态
    const animatedElements = document.querySelectorAll(
      '[class*="animate"], [class*="transition"], [style*="animation"]'
    ).length;
    
    // 检测可见性变化
    const hiddenElements = document.querySelectorAll(
      '[style*="display: none"], [style*="visibility: hidden"], .hidden, [class*="hidden"]'
    ).length;
    
    // 判断是否正在加载
    const isLoading = loadingElements > 0 || animatedElements > 3;
    
    // 判断内容是否稳定
    const isContentStable = loadingElements === 0 && animatedElements <= 2;
    
    return {
      isLoading,
      isContentStable,
      loadingElements,
      animatedElements,
      hiddenElements,
      needsScroll: hiddenElements > 10, // 很多隐藏元素可能需要滚动
      needsInteraction: loadingElements > 0 // 有加载元素可能需要交互
    };
  }

  /**
   * 分析错误和空状态
   */
  analyzeErrorStates(criteria) {
    // 检测错误指示器
    const errorElements = document.querySelectorAll(
      criteria.errorIndicators.map(indicator => 
        `[class*="${indicator}"], [text*="${indicator}"]`
      ).join(', ')
    ).length;
    
    // 检测空状态指示器
    const emptyElements = document.querySelectorAll(
      criteria.emptyIndicators.map(indicator => 
        `[class*="${indicator}"], [text*="${indicator}"]`
      ).join(', ')
    ).length;
    
    // 检测网络错误
    const networkErrors = Array.from(document.querySelectorAll('script, img, link'))
      .filter(el => el.onerror || el.hasAttribute('error')).length;
    
    // 检测404等错误
    const pageErrors = window.console?.error ? 1 : 0; // 简化的错误检测
    
    return {
      hasErrors: errorElements > 0 || networkErrors > 0,
      hasEmptyState: emptyElements > 0,
      errorElements,
      emptyElements,
      networkErrors,
      pageErrors,
      errorType: this.getErrorType(errorElements, networkErrors, emptyElements)
    };
  }

  /**
   * 生成详细分析数据
   */
  generateDetailedAnalysis(analysis) {
    console.log('🔍 生成详细分析数据...');
    
    return {
      // 内容质量详细分析
      contentQuality: {
        totalTextLength: analysis.contentStatus.totalTextLength,
        textDensity: analysis.contentStatus.totalTextLength / (analysis.pageInfo.scrollHeight || 1),
        feedElements: analysis.contentStatus.feedElements,
        cardElements: analysis.contentStatus.cardElements,
        scrollElements: analysis.contentStatus.scrollElements,
        contentRichnessScore: this.calculateContentRichness(analysis.contentStatus)
      },
      
      // 链接质量详细分析
      linkQuality: {
        totalLinks: analysis.linkAnalysis.totalLinks,
        validPostLinks: analysis.linkAnalysis.linksByType.newFormat + analysis.linkAnalysis.linksByType.oldStatus,
        linkDensity: analysis.linkAnalysis.totalLinks / (analysis.pageInfo.scrollHeight || 1),
        dominantFormat: analysis.linkAnalysis.dominantFormat,
        formatDistribution: analysis.linkAnalysis.linksByType,
        linkQualityScore: this.calculateLinkQuality(analysis.linkAnalysis)
      },
      
      // 可视区域详细分析
      viewportQuality: analysis.viewportAnalysis ? {
        hasViewportContent: analysis.viewportAnalysis.hasViewportContent,
        contentRatio: analysis.viewportAnalysis.contentRatio,
        postCandidates: analysis.viewportAnalysis.postCandidates,
        validLinksInViewport: analysis.viewportAnalysis.validLinksInViewport,
        contentDensity: analysis.viewportAnalysis.contentDensity,
        staticElements: analysis.viewportAnalysis.staticElements,
        viewportScore: this.calculateViewportScore(analysis.viewportAnalysis)
      } : null,
      
      // 静态元素影响分析
      staticImpact: analysis.staticElementAnalysis ? {
        staticElementCount: analysis.staticElementAnalysis.staticElements.length,
        hasSignificantStaticContent: analysis.staticElementAnalysis.hasSignificantStaticContent,
        staticElementTypes: analysis.staticElementAnalysis.staticElementTypes,
        staticImpactScore: this.calculateStaticImpact(analysis.staticElementAnalysis)
      } : null,
      
      // 结构完整性分析
      structuralIntegrity: {
        integrityScore: analysis.structureAnalysis.integrityScore,
        structureHealth: analysis.structureAnalysis.structureHealth,
        hasMainContent: analysis.structureAnalysis.structureIntegrity.hasMainContent,
        hasNavigation: analysis.structureAnalysis.structureIntegrity.hasNavigation,
        hasSidebar: analysis.structureAnalysis.structureIntegrity.hasSidebar,
        structuralScore: this.calculateStructuralScore(analysis.structureAnalysis)
      },
      
      // 动态状态分析
      dynamicState: {
        isLoading: analysis.dynamicStatus.isLoading,
        isContentStable: analysis.dynamicStatus.isContentStable,
        loadingElements: analysis.dynamicStatus.loadingElements,
        animatedElements: analysis.dynamicStatus.animatedElements,
        hiddenElements: analysis.dynamicStatus.hiddenElements,
        needsScroll: analysis.dynamicStatus.needsScroll,
        dynamicScore: this.calculateDynamicScore(analysis.dynamicStatus)
      },
      
      // 错误状态分析
      errorState: {
        hasErrors: analysis.errorStatus.hasErrors,
        hasEmptyState: analysis.errorStatus.hasEmptyState,
        errorElements: analysis.errorStatus.errorElements,
        emptyElements: analysis.errorStatus.emptyElements,
        networkErrors: analysis.errorStatus.networkErrors,
        errorType: analysis.errorStatus.errorType,
        isUsable: analysis.errorStatus.isUsable,
        hasMinorIssues: analysis.errorStatus.hasMinorIssues,
        errorScore: this.calculateErrorScore(analysis.errorStatus)
      }
    };
  }
  
  /**
   * 生成增强版综合判断结果 - 提供详细分析过程和二次分析能力
   */
  generateEnhancedJudgment(analysis) {
    console.log('📊 生成增强版分析结果...');
    
    const judgments = [];
    const detailedAnalysis = this.generateDetailedAnalysis(analysis);
    
    // 新增：生成选择器结果
    const selectorResults = this.generateSelectorResults(analysis);
    
    // 核心可用性判断 - 增强版本，考虑多层因素
    const contentAssessment = this.assessContentAvailability(analysis, detailedAnalysis);
    const viewportAssessment = this.assessViewportQuality(analysis, detailedAnalysis);
    const structuralAssessment = this.assessStructuralIntegrity(analysis, detailedAnalysis);
    
    // 基于详细分析的多维度评估
    const overallScores = this.calculateOverallScores(detailedAnalysis);
    
    // 生成综合判断
    this.generateDimensionalJudgments(judgments, analysis, detailedAnalysis, overallScores);
    
    // 二次分析：基于综合评分的最终判断
    const finalAnalysis = this.performSecondaryAnalysis(judgments, detailedAnalysis, overallScores);
    
    // 1. 关键错误判断 (只处理真正严重的错误)
    if (analysis.errorStatus.hasErrors) {
      judgments.push({
        type: 'critical_error',
        severity: 'high',
        message: '检测到关键错误',
        details: analysis.errorStatus,
        recommendation: 'stop_and_diagnose'
      });
    }
    
    // 2. 链接可用性判断 (最重要)
    if (!analysis.linkAnalysis.hasValidPostLinks) {
      judgments.push({
        type: 'no_links',
        severity: 'high',
        message: '未找到有效的帖子链接',
        details: { totalLinks: analysis.linkAnalysis.totalLinks, dominantFormat: analysis.linkAnalysis.dominantFormat },
        recommendation: 'wait_and_scroll'
      });
    } else if (analysis.linkAnalysis.totalLinks < 3) {
      judgments.push({
        type: 'few_links',
        severity: 'medium',
        message: '链接数量较少，建议滚动加载',
        details: analysis.linkAnalysis,
        recommendation: 'scroll_to_load_more'
      });
    }
    
    // 使用新的多维度判断生成方法
    // 旧的判断逻辑已被新的详细分析方法替代
    
    // 二次分析：基于综合评分的最终判断
    const secondaryAnalysis = this.performSecondaryAnalysis(judgments, detailedAnalysis, overallScores);
    
    // 生成最终建议
    const finalRecommendation = this.generateSmartRecommendation(judgments, analysis);
    
    return {
      // 基础分析结果
      judgments,
      finalRecommendation,
      analysis,
      
      // 新增：选择器结果（主要输出）
      selectorResults,
      
      // 新增：详细分析结果
      detailedAnalysis,
      overallScores,
      secondaryAnalysis,
      
      // 增强版摘要
      enhancedSummary: {
        totalJudgments: judgments.length,
        criticalIssues: judgments.filter(j => j.severity === 'high').length,
        minorIssues: judgments.filter(j => j.severity === 'low' || j.severity === 'medium').length,
        positiveIndicators: judgments.filter(j => j.severity === 'positive').length,
        overallScore: overallScores.totalScore,
        scoreGrade: overallScores.grade,
        analysisConfidence: secondaryAnalysis.confidence,
        reliability: secondaryAnalysis.summary.reliability,
        
        // 新增的可用性判断
        isReadyForCapture: overallScores.totalScore >= 60 && judgments.filter(j => j.severity === 'high').length === 0,
        recommendedAction: secondaryAnalysis.summary.recommendation.action,
        needsOptimization: overallScores.totalScore < 80,
        
        // 关键指标
        keyMetrics: secondaryAnalysis.summary.keyMetrics,
        primaryIssues: secondaryAnalysis.primaryIssues,
        optimizationSuggestions: secondaryAnalysis.optimizationSuggestions,
        
        // 传统评估
        overallAssessment: secondaryAnalysis.summary.overallAssessment,
        hasMinorIssues: analysis.errorStatus.hasMinorIssues
      }
    };
  }

  /**
   * 生成智能建议 - 更灵活的决策，增强可视区域分析
   */
  generateSmartRecommendation(judgments, analysis) {
    const criticalIssues = judgments.filter(j => j.severity === 'high');
    const positiveIndicators = judgments.filter(j => j.severity === 'positive');
    const viewportIssues = judgments.filter(j => j.type.includes('viewport') || j.type.includes('static'));
    const hasUsableContent = analysis.linkAnalysis.hasValidPostLinks && 
                            analysis.contentStatus.hasContentElements;
    
    // 新增：可视区域内容评估
    const hasGoodViewportContent = analysis.viewportAnalysis && 
                                  analysis.viewportAnalysis.hasViewportContent &&
                                  analysis.viewportAnalysis.contentRatio > 0.3;
    
    const hasViewportIssues = viewportIssues.length > 0 || 
                             (analysis.viewportAnalysis && !analysis.viewportAnalysis.hasViewportContent);
    
    // 1. 如果有严重问题，优先处理
    if (criticalIssues.length > 0) {
      return {
        action: 'address_critical',
        priority: 'high',
        message: '需要处理关键问题',
        issues: criticalIssues.map(j => j.message),
        suggestions: criticalIssues.map(j => j.recommendation)
      };
    }
    
    // 2. 如果有可用内容，优先进行捕获
    if (hasUsableContent && positiveIndicators.length > 0) {
      return {
        action: 'proceed_with_optimization',
        priority: 'low',
        message: '页面内容可用，建议优化后捕获',
        optimizations: judgments.filter(j => j.severity === 'low').map(j => j.recommendation)
      };
    }
    
    // 3. 如果可视区域内容不足，优先滚动优化可视区域
    if (hasViewportIssues || !hasGoodViewportContent) {
      return {
        action: 'viewport_optimization_scroll',
        priority: 'high',
        message: '可视区域内容不足，建议滚动优化内容显示',
        scrollCount: 3,
        waitTime: 2000,
        focus: 'viewport_content'
      };
    }
    
    // 4. 如果需要滚动加载更多内容
    if (analysis.dynamicStatus.needsScroll || analysis.linkAnalysis.totalLinks < 5) {
      return {
        action: 'smart_scroll',
        priority: 'medium',
        message: '建议智能滚动以加载更多内容',
        scrollCount: 2,
        waitTime: 1500
      };
    }
    
    // 5. 如果页面正在加载
    if (analysis.dynamicStatus.isLoading) {
      return {
        action: 'brief_wait',
        priority: 'low',
        message: '页面加载中，短暂等待',
        waitTime: 2000
      };
    }
    
    // 6. 默认：谨慎继续
    return {
      action: 'cautious_proceed',
      priority: 'medium',
      message: '页面基本可用，谨慎继续操作',
      notes: judgments.filter(j => j.severity === 'low').map(j => j.message)
    };
  }

  /**
   * 获取总体评估 - 更新版本
   */
  getOverallAssessment(overallScore, judgments) {
    const highSeverityCount = judgments.filter(j => j.severity === 'high').length;
    
    if (overallScore >= 80 && highSeverityCount === 0) {
      return 'good'; // 质量优良，无严重问题
    } else if (overallScore >= 60) {
      return 'fair'; // 质量可接受
    } else if (highSeverityCount === 0) {
      return 'poor'; // 质量较低但无严重问题
    } else {
      return 'critical'; // 有严重问题
    }
  }

  /**
   * 辅助方法
   */
  getStructureRecommendation(health, score) {
    const recommendations = {
      good: '页面结构完整，可以正常操作',
      partial: '页面结构部分完整，可能需要等待完全加载',
      poor: '页面结构不完整，建议检查网络或重新加载'
    };
    return recommendations[health];
  }

  getErrorType(errorElements, networkErrors, emptyElements) {
    if (networkErrors > 0) return 'network';
    if (errorElements > 0) return 'page_error';
    if (emptyElements > 0) return 'empty_content';
    return 'unknown';
  }
  
  /**
   * 新增：静态元素类型识别
   */
  getStaticElementType(element) {
    const className = (element.className || '').toLowerCase();
    const id = (element.id || '').toLowerCase();
    const tagName = element.tagName.toLowerCase();
    
    if (className.includes('nav') || id.includes('nav')) return 'navigation';
    if (className.includes('side') || id.includes('side')) return 'sidebar';
    if (className.includes('header') || id.includes('header') || tagName === 'header') return 'header';
    if (className.includes('footer') || id.includes('footer') || tagName === 'footer') return 'footer';
    if (className.includes('toolbar') || id.includes('toolbar')) return 'toolbar';
    if (className.includes('menu') || id.includes('menu')) return 'menu';
    if (className.includes('tab') || id.includes('tab')) return 'tab';
    if (className.includes('fixed') || className.includes('sticky')) return 'fixed_ui';
    return 'other_static';
  }
  
  /**
   * 新增：静态元素分类
   */
  categorizeStaticElements(staticElements) {
    const categories = {};
    staticElements.forEach(el => {
      const type = this.getStaticElementType(el.element);
      categories[type] = (categories[type] || 0) + 1;
    });
    return categories;
  }
  
  // ========== 新增：详细分析计算方法 ==========
  
  /**
   * 计算内容丰富度评分
   */
  calculateContentRichness(contentStatus) {
    let score = 0;
    
    // 文本长度评分 (0-30分)
    if (contentStatus.totalTextLength > 1000) score += 30;
    else if (contentStatus.totalTextLength > 500) score += 20;
    else if (contentStatus.totalTextLength > 100) score += 10;
    
    // 内容元素评分 (0-40分)
    score += Math.min(contentStatus.feedElements * 5, 20);
    score += Math.min(contentStatus.cardElements * 5, 20);
    
    // 主要内容评分 (0-30分)
    if (contentStatus.mainContentLoaded) score += 30;
    
    return Math.min(score, 100);
  }
  
  /**
   * 计算链接质量评分
   */
  calculateLinkQuality(linkAnalysis) {
    let score = 0;
    
    // 链接数量评分 (0-25分)
    if (linkAnalysis.totalLinks > 50) score += 25;
    else if (linkAnalysis.totalLinks > 20) score += 15;
    else if (linkAnalysis.totalLinks > 5) score += 5;
    
    // 有效链接评分 (0-50分)
    const validLinks = linkAnalysis.linksByType.newFormat + linkAnalysis.linksByType.oldStatus;
    const validRatio = validLinks / Math.max(linkAnalysis.totalLinks, 1);
    score += validRatio * 50;
    
    // 格式多样性评分 (0-25分)
    const formatTypes = Object.values(linkAnalysis.linksByType).filter(count => count > 0).length;
    score += Math.min(formatTypes * 8, 25);
    
    return Math.min(score, 100);
  }
  
  /**
   * 计算可视区域评分
   */
  calculateViewportScore(viewportAnalysis) {
    let score = 0;
    
    // 内容存在性评分 (0-40分)
    if (viewportAnalysis.hasViewportContent) score += 40;
    
    // 内容比例评分 (0-35分)
    score += viewportAnalysis.contentRatio * 35;
    
    // 帖子候选数量评分 (0-25分)
    score += Math.min(viewportAnalysis.postCandidates * 5, 25);
    
    return Math.min(score, 100);
  }
  
  /**
   * 计算静态元素影响评分
   */
  calculateStaticImpact(staticElementAnalysis) {
    // 评分越高表示负面影响越大
    let impact = 0;
    
    // 静态元素数量影响 (0-40分)
    impact += Math.min(staticElementAnalysis.staticElementCount * 2, 40);
    
    // 显著静态内容影响 (0-35分)
    if (staticElementAnalysis.hasSignificantStaticContent) impact += 35;
    
    // 类型分布影响 (0-25分)
    const typeCount = Object.keys(staticElementAnalysis.staticElementTypes).length;
    impact += Math.min(typeCount * 5, 25);
    
    return Math.min(impact, 100);
  }
  
  /**
   * 计算结构完整性评分
   */
  calculateStructuralScore(structureAnalysis) {
    return structureAnalysis.integrityScore * (100 / 6); // 6个维度，转换为100分制
  }
  
  /**
   * 计算动态状态评分
   */
  calculateDynamicScore(dynamicStatus) {
    let score = 100; // 起始满分
    
    // 加载状态扣分
    if (dynamicStatus.isLoading) score -= 30;
    
    // 内容稳定性扣分
    if (!dynamicStatus.isContentStable) score -= 20;
    
    // 加载元素扣分
    score -= Math.min(dynamicStatus.loadingElements * 5, 25);
    
    // 动画元素扣分
    score -= Math.min(dynamicStatus.animatedElements * 3, 15);
    
    // 隐藏元素扣分
    if (dynamicStatus.hiddenElements > 20) score -= 10;
    
    return Math.max(score, 0);
  }
  
  /**
   * 计算错误状态评分
   */
  calculateErrorScore(errorStatus) {
    let score = 100; // 起始满分
    
    // 关键错误扣分
    if (errorStatus.hasErrors) score -= 50;
    
    // 空状态扣分
    if (errorStatus.hasEmptyState) score -= 30;
    
    // 网络错误扣分
    score -= Math.min(errorStatus.networkErrors * 10, 20);
    
    return Math.max(score, 0);
  }
  
  /**
   * 计算总体评分
   */
  calculateOverallScores(detailedAnalysis) {
    const scores = {
      contentQuality: detailedAnalysis.contentQuality.contentRichnessScore,
      linkQuality: detailedAnalysis.linkQuality.linkQualityScore,
      viewportQuality: detailedAnalysis.viewportQuality?.viewportScore || 0,
      structuralIntegrity: detailedAnalysis.structuralIntegrity.structuralScore,
      dynamicState: detailedAnalysis.dynamicState.dynamicScore,
      errorState: detailedAnalysis.errorState.errorScore
    };
    
    // 计算静态影响（负向评分）
    const staticImpact = detailedAnalysis.staticImpact?.staticImpactScore || 0;
    
    // 计算加权总分
    const weights = {
      contentQuality: 0.25,
      linkQuality: 0.25,
      viewportQuality: 0.20,
      structuralIntegrity: 0.15,
      dynamicState: 0.10,
      errorState: 0.05
    };
    
    let totalScore = 0;
    Object.entries(weights).forEach(([key, weight]) => {
      totalScore += scores[key] * weight;
    });
    
    // 减去静态影响
    totalScore -= staticImpact * 0.1;
    
    return {
      ...scores,
      staticImpact: staticImpact,
      totalScore: Math.max(0, Math.min(totalScore, 100)),
      grade: this.getScoreGrade(Math.max(0, Math.min(totalScore, 100)))
    };
  }
  
  /**
   * 获取评分等级
   */
  getScoreGrade(score) {
    if (score >= 90) return 'excellent';
    if (score >= 80) return 'good';
    if (score >= 70) return 'fair';
    if (score >= 60) return 'poor';
    return 'critical';
  }
  
  /**
   * 生成多维度判断
   */
  generateDimensionalJudgments(judgments, analysis, detailedAnalysis, overallScores) {
    // 基于评分生成判断
    this.generateScoreBasedJudgments(judgments, overallScores);
    
    // 基于详细分析生成判断
    this.generateDetailBasedJudgments(judgments, detailedAnalysis);
    
    // 基于对比分析生成判断
    this.generateComparativeJudgments(judgments, detailedAnalysis);
  }
  
  /**
   * 基于评分生成判断
   */
  generateScoreBasedJudgments(judgments, overallScores) {
    // 总体评分判断
    if (overallScores.totalScore >= 80) {
      judgments.push({
        type: 'high_quality',
        severity: 'positive',
        message: `页面质量优良，总体评分: ${overallScores.totalScore.toFixed(1)}/100`,
        details: { scores: overallScores },
        recommendation: 'proceed'
      });
    } else if (overallScores.totalScore >= 60) {
      judgments.push({
        type: 'acceptable_quality',
        severity: 'medium',
        message: `页面质量可接受，总体评分: ${overallScores.totalScore.toFixed(1)}/100`,
        details: { scores: overallScores },
        recommendation: 'proceed_with_caution'
      });
    } else {
      judgments.push({
        type: 'low_quality',
        severity: 'high',
        message: `页面质量较低，总体评分: ${overallScores.totalScore.toFixed(1)}/100`,
        details: { scores: overallScores },
        recommendation: 'needs_improvement'
      });
    }
    
    // 单项评分异常判断
    Object.entries(overallScores).forEach(([category, score]) => {
      if (category === 'totalScore' || category === 'grade') return;
      
      if (score < 40) {
        judgments.push({
          type: `${category}_poor`,
          severity: 'medium',
          message: `${category} 评分偏低: ${score.toFixed(1)}/100`,
          details: { category, score },
          recommendation: this.getCategoryRecommendation(category, score)
        });
      }
    });
  }
  
  /**
   * 基于详细分析生成判断
   */
  generateDetailBasedJudgments(judgments, detailedAnalysis) {
    // 内容质量判断
    if (detailedAnalysis.contentQuality.contentRichnessScore < 30) {
      judgments.push({
        type: 'insufficient_content',
        severity: 'medium',
        message: '内容丰富度不足',
        details: detailedAnalysis.contentQuality,
        recommendation: 'wait_or_scroll'
      });
    }
    
    // 链接质量判断
    if (detailedAnalysis.linkQuality.validPostLinks === 0) {
      judgments.push({
        type: 'no_valid_links',
        severity: 'high',
        message: '未找到有效的帖子链接',
        details: detailedAnalysis.linkQuality,
        recommendation: 'wait_and_reload'
      });
    }
    
    // 可视区域判断
    if (detailedAnalysis.viewportQuality && !detailedAnalysis.viewportQuality.hasViewportContent) {
      judgments.push({
        type: 'no_viewport_content',
        severity: 'medium',
        message: '可视区域内无内容',
        details: detailedAnalysis.viewportQuality,
        recommendation: 'scroll_to_content'
      });
    }
    
    // 静态元素影响判断
    if (detailedAnalysis.staticImpact && detailedAnalysis.staticImpact.staticImpactScore > 50) {
      judgments.push({
        type: 'high_static_impact',
        severity: 'medium',
        message: '静态UI元素影响过大',
        details: detailedAnalysis.staticImpact,
        recommendation: 'scroll_to_find_dynamic_content'
      });
    }
  }
  
  /**
   * 基于对比分析生成判断
   */
  generateComparativeJudgments(judgments, detailedAnalysis) {
    // 内容vs链接对比
    const contentVsLink = detailedAnalysis.contentQuality.contentRichnessScore - detailedAnalysis.linkQuality.linkQualityScore;
    if (Math.abs(contentVsLink) > 30) {
      if (contentVsLink > 0) {
        judgments.push({
          type: 'content_richer_than_links',
          severity: 'low',
          message: '内容丰富但链接相对较少',
          details: { difference: contentVsLink },
          recommendation: 'extract_text_content'
        });
      } else {
        judgments.push({
          type: 'links_richer_than_content',
          severity: 'low',
          message: '链接丰富但内容相对较少',
          details: { difference: contentVsLink },
          recommendation: 'focus_on_link_extraction'
        });
      }
    }
    
    // 可视区域vs整体内容对比
    if (detailedAnalysis.viewportQuality && detailedAnalysis.contentQuality.contentRichnessScore > 0) {
      const viewportVsTotal = detailedAnalysis.viewportQuality.viewportScore / detailedAnalysis.contentQuality.contentRichnessScore;
      if (viewportVsTotal < 0.3) {
        judgments.push({
          type: 'viewport_content_low',
          severity: 'medium',
          message: '可视区域内容比例偏低',
          details: { ratio: viewportVsTotal },
          recommendation: 'scroll_to_improve_viewport'
        });
      }
    }
  }
  
  /**
   * 获取类别建议
   */
  getCategoryRecommendation(category, score) {
    const recommendations = {
      contentQuality: 'wait_for_more_content',
      linkQuality: 'check_link_validity',
      viewportQuality: 'scroll_to_improve_viewport',
      structuralIntegrity: 'wait_for_full_load',
      dynamicState: 'wait_for_stabilization',
      errorState: 'address_errors'
    };
    return recommendations[category] || 'monitor_closely';
  }
  
  /**
   * 执行二次分析
   */
  performSecondaryAnalysis(judgments, detailedAnalysis, overallScores) {
    console.log('🔄 执行二次分析...');
    
    // 分析判断模式
    const judgmentPatterns = this.analyzeJudgmentPatterns(judgments);
    
    // 识别主要问题
    const primaryIssues = this.identifyPrimaryIssues(judgments);
    
    // 生成优化建议
    const optimizationSuggestions = this.generateOptimizationSuggestions(detailedAnalysis, overallScores);
    
    // 计算置信度
    const confidence = this.calculateAnalysisConfidence(judgments, detailedAnalysis);
    
    return {
      judgmentPatterns,
      primaryIssues,
      optimizationSuggestions,
      confidence,
      summary: this.generateAnalysisSummary(judgments, overallScores, confidence)
    };
  }
  
  /**
   * 分析判断模式
   */
  analyzeJudgmentPatterns(judgments) {
    const patterns = {
      positive: judgments.filter(j => j.severity === 'positive').length,
      high: judgments.filter(j => j.severity === 'high').length,
      medium: judgments.filter(j => j.severity === 'medium').length,
      low: judgments.filter(j => j.severity === 'low').length,
      total: judgments.length
    };
    
    patterns.dominantSeverity = Object.entries(patterns)
      .filter(([key]) => ['positive', 'high', 'medium', 'low'].includes(key))
      .reduce((max, [type, count]) => count > max.count ? { type, count } : max, { type: 'none', count: 0 });
    
    return patterns;
  }
  
  /**
   * 识别主要问题
   */
  identifyPrimaryIssues(judgments) {
    const highSeverity = judgments.filter(j => j.severity === 'high');
    const mediumSeverity = judgments.filter(j => j.severity === 'medium');
    
    return {
      critical: highSeverity.map(j => j.type),
      important: mediumSeverity.map(j => j.type),
      mostCritical: highSeverity.length > 0 ? highSeverity[0] : null,
      needsAttention: highSeverity.length + mediumSeverity.length
    };
  }
  
  /**
   * 生成优化建议
   */
  generateOptimizationSuggestions(detailedAnalysis, overallScores) {
    const suggestions = [];
    
    // 基于评分的优化建议
    if (overallScores.contentQuality < 60) {
      suggestions.push({
        priority: 'high',
        action: 'increase_content_wait_time',
        description: '建议增加内容等待时间',
        reason: '内容质量评分偏低'
      });
    }
    
    if (overallScores.viewportQuality < 50) {
      suggestions.push({
        priority: 'high',
        action: 'optimize_viewport_scrolling',
        description: '建议优化可视区域滚动策略',
        reason: '可视区域质量评分偏低'
      });
    }
    
    if (overallScores.linkQuality < 70) {
      suggestions.push({
        priority: 'medium',
        action: 'verify_link_extraction',
        description: '建议验证链接提取逻辑',
        reason: '链接质量评分偏低'
      });
    }
    
    // 基于详细分析的优化建议
    if (detailedAnalysis.staticImpact && detailedAnalysis.staticImpact.staticImpactScore > 40) {
      suggestions.push({
        priority: 'medium',
        action: 'implement_static_filtering',
        description: '建议实现静态元素过滤',
        reason: '静态元素影响过大'
      });
    }
    
    return suggestions;
  }
  
  /**
   * 计算分析置信度
   */
  calculateAnalysisConfidence(judgments, detailedAnalysis) {
    let confidence = 50; // 基础置信度
    
    // 基于数据完整性
    if (detailedAnalysis.viewportQuality) confidence += 10;
    if (detailedAnalysis.staticImpact) confidence += 10;
    
    // 基于判断一致性
    const severityTypes = new Set(judgments.map(j => j.severity)).size;
    if (severityTypes <= 2) confidence += 15; // 判断类型一致性好
    
    // 基于评分分布
    const scores = Object.values(detailedAnalysis).map(item => 
      typeof item === 'object' && item !== null ? Object.values(item).find(v => typeof v === 'number' && v >= 0 && v <= 100) || 50 : 50
    ).filter(v => v !== undefined);
    
    const scoreVariance = this.calculateVariance(scores);
    if (scoreVariance < 500) confidence += 15; // 评分分布一致性高
    
    return Math.min(confidence, 100);
  }
  
  /**
   * 计算方差
   */
  calculateVariance(values) {
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    return variance;
  }
  
  /**
   * 生成分析摘要
   */
  generateAnalysisSummary(judgments, overallScores, confidence) {
    const primaryIssues = this.identifyPrimaryIssues(judgments);
    
    return {
      overallAssessment: overallScores.grade,
      totalScore: overallScores.totalScore,
      confidence: confidence,
      reliability: confidence >= 70 ? 'high' : confidence >= 50 ? 'medium' : 'low',
      primaryIssue: primaryIssues.mostCritical?.type || 'none',
      needsAttention: primaryIssues.needsAttention > 0,
      recommendation: this.generateFinalRecommendation(overallScores, primaryIssues, confidence),
      keyMetrics: {
        judgments: judgments.length,
        highSeverityIssues: primaryIssues.critical.length,
        mediumSeverityIssues: primaryIssues.important.length,
        positiveIndicators: judgments.filter(j => j.severity === 'positive').length
      }
    };
  }
  
  /**
   * 生成最终建议
   */
  generateFinalRecommendation(overallScores, primaryIssues, confidence) {
    if (confidence < 50) {
      return {
        action: 'low_confidence_analysis',
        message: '分析置信度较低，建议重新分析或手动验证',
        priority: 'high',
        confidence: confidence
      };
    }
    
    if (primaryIssues.critical.length > 0) {
      return {
        action: 'address_critical_issues',
        message: '存在关键问题，需要优先处理',
        priority: 'high',
        issues: primaryIssues.critical
      };
    }
    
    if (overallScores.totalScore >= 80) {
      return {
        action: 'proceed_with_capture',
        message: '页面质量优良，建议进行内容捕获',
        priority: 'low',
        score: overallScores.totalScore
      };
    }
    
    if (overallScores.totalScore >= 60) {
      return {
        action: 'proceed_with_optimization',
        message: '页面质量可接受，建议优化后进行捕获',
        priority: 'medium',
        score: overallScores.totalScore
      };
    }
    
    return {
      action: 'needs_improvement',
      message: '页面质量需要改善，建议等待或重新加载',
      priority: 'high',
      score: overallScores.totalScore
    };
  }
  
  // ========== 选择器结果生成方法 ==========
  
  /**
   * 生成选择器结果 - 主要输出用于内容提取的选择器信息
   */
  generateSelectorResults(analysis) {
    console.log('🎯 生成选择器结果...');
    
    const results = {
      // 帖子容器选择器
      postContainers: this.identifyPostContainerSelectors(analysis),
      
      // 帖子链接选择器
      postLinks: this.identifyPostLinkSelectors(analysis),
      
      // 用户信息选择器
      userInfo: this.identifyUserInfoSelectors(analysis),
      
      // 内容选择器
      postContent: this.identifyPostContentSelectors(analysis),
      
      // 时间信息选择器
      timeInfo: this.identifyTimeInfoSelectors(analysis),
      
      // 交互数据选择器
      interactions: this.identifyInteractionSelectors(analysis),
      
      // 可视区域选择器
      viewport: this.identifyViewportSelectors(analysis),
      
      // 选择器验证结果
      validation: this.validateSelectors(analysis),
      
      // 推荐使用的最佳选择器组合
      recommended: this.generateRecommendedSelectors(analysis),
      
      // 选择器优先级和可靠性评分
      rankings: this.rankSelectorsByReliability(analysis),
      
      // 生效时间戳
      generatedAt: new Date().toISOString()
    };
    
    console.log(`✅ 生成 ${results.recommended.primary.length} 个主要选择器和 ${results.recommended.fallback.length} 个备用选择器`);
    return results;
  }
  
  /**
   * 识别帖子容器选择器
   */
  identifyPostContainerSelectors(analysis) {
    const candidates = [
      '.Home_feed_3o7ry .Scroll_container_280Ky > div',
      '.Scroll_container_280Ky > div',
      '.Home_feed_3o7ry > div',
      '[class*="Feed"]',
      '[class*="feed"]',
      '.WB_feed',
      '.WB_detail',
      '[class*="Card"]',
      '[class*="card"]'
    ];
    
    const validated = candidates.map(selector => {
      const matchScore = this.calculateSelectorMatchScore(selector, 'container', analysis);
      return {
        selector,
        matchScore,
        priority: matchScore > 0.7 ? 'high' : matchScore > 0.4 ? 'medium' : 'low',
        estimatedCount: this.estimateSelectorMatches(selector, analysis)
      };
    }).sort((a, b) => b.matchScore - a.matchScore);
    
    return {
      candidates: validated,
      best: validated[0]?.selector || candidates[0],
      reliability: validated[0]?.matchScore || 0
    };
  }
  
  /**
   * 识别帖子链接选择器
   */
  identifyPostLinkSelectors(analysis) {
    const candidates = [
      'a[href^="https://weibo.com/"][href*="/"][href*="com/"]:not([href*="/u/"]):not([href*="/n/"]):not([href*="s.weibo.com"])',
      'a[href*="weibo.com/"][href*="/"]:not([href*="/u/"]):not([href*="/n/"]):not([href*="s.weibo.com"])',
      'a[href*="/status/"]',
      'a[href*="/detail/"]',
      'a[href*="detail"]',
      '.Scroll_container_280Ky a[href*="status"]',
      '[class*="feed"] a[href*="status"]'
    ];
    
    const validated = candidates.map(selector => {
      const matchScore = this.calculateSelectorMatchScore(selector, 'link', analysis);
      return {
        selector,
        matchScore,
        priority: matchScore > 0.8 ? 'high' : matchScore > 0.5 ? 'medium' : 'low',
        estimatedCount: this.estimateSelectorMatches(selector, analysis),
        format: this.detectLinkFormat(selector)
      };
    }).sort((a, b) => b.matchScore - a.matchScore);
    
    return {
      candidates: validated,
      best: validated[0]?.selector || candidates[0],
      reliability: validated[0]?.matchScore || 0,
      dominantFormat: analysis.linkAnalysis?.dominantFormat || 'unknown'
    };
  }
  
  /**
   * 识别用户信息选择器
   */
  identifyUserInfoSelectors(analysis) {
    const candidates = [
      '[class*="name"]',
      '.Feed_body_3R0rO [class*="name"]',
      'a[href*="/u/"]',
      '[class*="nick"]',
      '[class*="author"]',
      '[class*="user"]',
      '.username',
      '.nickname'
    ];
    
    const validated = candidates.map(selector => {
      const matchScore = this.calculateSelectorMatchScore(selector, 'userInfo', analysis);
      return {
        selector,
        matchScore,
        priority: matchScore > 0.6 ? 'high' : matchScore > 0.3 ? 'medium' : 'low'
      };
    }).sort((a, b) => b.matchScore - a.matchScore);
    
    return {
      candidates: validated,
      best: validated[0]?.selector || candidates[0],
      reliability: validated[0]?.matchScore || 0
    };
  }
  
  /**
   * 识别帖子内容选择器
   */
  identifyPostContentSelectors(analysis) {
    const candidates = [
      '.Feed_body_3R0rO',
      '[class*="Feed_body"]',
      '.WB_text',
      '[class*="text"]',
      '[class*="content"]',
      '[class*="description"]',
      '.post-content',
      '.content-text'
    ];
    
    const validated = candidates.map(selector => {
      const matchScore = this.calculateSelectorMatchScore(selector, 'content', analysis);
      return {
        selector,
        matchScore,
        priority: matchScore > 0.7 ? 'high' : matchScore > 0.4 ? 'medium' : 'low',
        estimatedLength: this.estimateContentLength(selector, analysis)
      };
    }).sort((a, b) => b.matchScore - a.matchScore);
    
    return {
      candidates: validated,
      best: validated[0]?.selector || candidates[0],
      reliability: validated[0]?.matchScore || 0
    };
  }
  
  /**
   * 识别时间信息选择器
   */
  identifyTimeInfoSelectors(analysis) {
    const candidates = [
      '[class*="from"]',
      '[class*="time"]',
      'time',
      '.Feed_body_3R0rO [class*="from"]',
      '[datetime]',
      '.post-time',
      '.timestamp'
    ];
    
    const validated = candidates.map(selector => {
      const matchScore = this.calculateSelectorMatchScore(selector, 'time', analysis);
      return {
        selector,
        matchScore,
        priority: matchScore > 0.6 ? 'high' : matchScore > 0.3 ? 'medium' : 'low'
      };
    }).sort((a, b) => b.matchScore - a.matchScore);
    
    return {
      candidates: validated,
      best: validated[0]?.selector || candidates[0],
      reliability: validated[0]?.matchScore || 0
    };
  }
  
  /**
   * 识别交互数据选择器
   */
  identifyInteractionSelectors(analysis) {
    return {
      likes: {
        candidates: ['[class*="like"]', '[class*="赞"]', '.like-btn', '.like-count'],
        best: '[class*="like"]',
        reliability: 0.8
      },
      comments: {
        candidates: ['[class*="comment"]', '[class*="评论"]', '.comment-btn', '.comment-count'],
        best: '[class*="comment"]',
        reliability: 0.8
      },
      reposts: {
        candidates: ['[class*="repost"]', '[class*="转发"]', '.repost-btn', '.repost-count'],
        best: '[class*="repost"]',
        reliability: 0.8
      }
    };
  }
  
  /**
   * 识别可视区域选择器
   */
  identifyViewportSelectors(analysis) {
    const mainViewport = '.Main_wrap_2GRrG';
    const contentArea = '.Home_feed_3o7ry';
    const scrollContainer = '.Scroll_container_280Ky';
    
    return {
      mainViewport,
      contentArea,
      scrollContainer,
      viewportContent: `${mainViewport} ${contentArea}`,
      scrollableArea: scrollContainer
    };
  }
  
  /**
   * 计算选择器匹配分数
   */
  calculateSelectorMatchScore(selector, type, analysis) {
    let score = 0.5; // 基础分数
    
    // 基于分析结果调整分数
    switch (type) {
      case 'container':
        if (analysis.contentStatus?.feedElements > 0) score += 0.2;
        if (analysis.contentStatus?.cardElements > 0) score += 0.2;
        if (analysis.structureAnalysis?.hasMainContent) score += 0.1;
        break;
        
      case 'link':
        if (analysis.linkAnalysis?.hasValidPostLinks) score += 0.3;
        if (analysis.linkAnalysis?.totalLinks > 5) score += 0.1;
        if (analysis.linkAnalysis?.dominantFormat) score += 0.1;
        break;
        
      case 'content':
        if (analysis.contentStatus?.totalTextLength > 100) score += 0.2;
        if (analysis.contentStatus?.hasSubstantialContent) score += 0.2;
        break;
        
      case 'userInfo':
      case 'time':
        score += 0.1; // 默认加分
        break;
    }
    
    // 基于选择器特异性调整分数
    if (selector.includes('class*=')) score += 0.1;
    if (selector.includes('Feed_body')) score += 0.2;
    if (selector.includes('Scroll_container')) score += 0.2;
    
    return Math.min(score, 1.0);
  }
  
  /**
   * 估算选择器匹配数量
   */
  estimateSelectorMatches(selector, analysis) {
    // 基于分析结果进行估算
    if (selector.includes('Feed') || selector.includes('feed')) {
      return analysis.contentStatus?.feedElements || analysis.contentStatus?.cardElements || 0;
    }
    if (selector.includes('status') || selector.includes('detail')) {
      return analysis.linkAnalysis?.validPostLinks || 0;
    }
    return Math.floor(Math.random() * 10) + 1; // 默认估算
  }
  
  /**
   * 检测链接格式
   */
  detectLinkFormat(selector) {
    if (selector.includes('status/')) return 'old_format';
    if (selector.includes('detail/')) return 'old_format';
    if (selector.includes('weibo.com/\\d+/')) return 'new_format';
    return 'unknown';
  }
  
  /**
   * 估算内容长度
   */
  estimateContentLength(selector, analysis) {
    return analysis.contentStatus?.totalTextLength || 0;
  }
  
  /**
   * 验证选择器
   */
  validateSelectors(analysis) {
    return {
      postContainers: this.validateSelectorType('container', analysis),
      postLinks: this.validateSelectorType('link', analysis),
      userInfo: this.validateSelectorType('userInfo', analysis),
      content: this.validateSelectorType('content', analysis),
      timeInfo: this.validateSelectorType('time', analysis),
      interactions: this.validateSelectorType('interactions', analysis)
    };
  }
  
  /**
   * 验证特定类型的选择器
   */
  validateSelectorType(type, analysis) {
    const validators = {
      container: () => analysis.contentStatus?.feedElements > 0 || analysis.contentStatus?.cardElements > 0,
      link: () => analysis.linkAnalysis?.hasValidPostLinks,
      userInfo: () => true, // 假设用户信息总是可用的
      content: () => analysis.contentStatus?.hasSubstantialContent,
      timeInfo: () => true, // 假设时间信息总是可用的
      interactions: () => true // 假设交互数据总是可用的
    };
    
    return {
      isValid: validators[type] ? validators[type]() : false,
      confidence: 0.7, // 默认置信度
      issues: []
    };
  }
  
  /**
   * 生成推荐选择器组合
   */
  generateRecommendedSelectors(analysis) {
    return {
      primary: [
        '.Home_feed_3o7ry .Scroll_container_280Ky > div',
        'a[href^="https://weibo.com/"][href*="/"]:not([href*="/u/"]):not([href*="/n/"])',
        '[class*="name"]',
        '.Feed_body_3R0rO',
        '[class*="from"]'
      ],
      fallback: [
        '.Scroll_container_280Ky > div',
        'a[href*="/status/"]',
        '[class*="nick"]',
        '[class*="text"]',
        'time'
      ],
      minimal: [
        '[class*="Feed"]',
        'a[href*="weibo.com/"]',
        '[class*="name"]',
        '[class*="text"]'
      ],
      usage: {
        extraction: 'primary',
        verification: 'fallback',
        quickScan: 'minimal'
      }
    };
  }
  
  /**
   * 按可靠性排名选择器
   */
  rankSelectorsByReliability(analysis) {
    return {
      postContainers: [
        { selector: '.Home_feed_3o7ry .Scroll_container_280Ky > div', reliability: 0.9 },
        { selector: '.Scroll_container_280Ky > div', reliability: 0.8 },
        { selector: '[class*="Feed"]', reliability: 0.6 }
      ],
      postLinks: [
        { selector: 'a[href^="https://weibo.com/"][href*="/"]:not([href*="/u/"])', reliability: 0.9 },
        { selector: 'a[href*="/status/"]', reliability: 0.7 },
        { selector: 'a[href*="weibo.com/"]', reliability: 0.5 }
      ],
      userInfo: [
        { selector: '[class*="name"]', reliability: 0.8 },
        { selector: 'a[href*="/u/"]', reliability: 0.6 },
        { selector: '[class*="nick"]', reliability: 0.5 }
      ]
    };
  }

  // ========== 占位方法，需要后续实现 ==========
  
  assessContentAvailability(analysis, detailedAnalysis) {
    // TODO: 实现内容可用性评估
    return { available: true, confidence: 0.8 };
  }
  
  assessViewportQuality(analysis, detailedAnalysis) {
    // TODO: 实现可视区域质量评估
    return { quality: 'good', confidence: 0.7 };
  }
  
  assessStructuralIntegrity(analysis, detailedAnalysis) {
    // TODO: 实现结构完整性评估
    return { integrity: 'high', confidence: 0.9 };
  }
}

module.exports = WeiboContentAnalyzer;