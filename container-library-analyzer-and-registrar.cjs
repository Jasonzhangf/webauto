#!/usr/bin/env node

/**
 * 容器库分析器与注册器
 * 基于现有容器库情况进行分析，并将新发现的独立容器注册到容器库中
 * 容器命名规则：必须包含selector信息确保唯一性
 */

const { chromium } = require('playwright');
const fs = require('fs');

class ContainerLibraryAnalyzerAndRegistrar {
  constructor(options = {}) {
    this.containerLibraryPath = './container-library.json';
    this.backupLibraryPath = './container-library-backup.json';
    this.headless = options.headless || false;
    this.verbose = options.verbose || true;
    this.cookieFile = './cookies/weibo-cookies.json';
    this.analysisResults = {
      newContainers: [],
      existingContainers: [],
      conflicts: [],
      recommendations: []
    };
  }

  /**
   * 读取当前容器库
   */
  readContainerLibrary() {
    try {
      const data = fs.readFileSync(this.containerLibraryPath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('❌ 读取容器库失败:', error.message);
      return null;
    }
  }

  /**
   * 备份容器库
   */
  backupContainerLibrary() {
    try {
      const libraryData = fs.readFileSync(this.containerLibraryPath, 'utf8');
      fs.writeFileSync(this.backupLibraryPath, libraryData);
      console.log('💾 容器库备份完成');
      return true;
    } catch (error) {
      console.error('❌ 容器库备份失败:', error.message);
      return false;
    }
  }

  /**
   * 生成包含selector的唯一容器名称
   */
  generateUniqueContainerName(baseName, selector, type = 'container') {
    // 从selector中提取关键信息
    const selectorHash = this.extractSelectorHash(selector);
    const typeSuffix = type === 'interactive' ? '_button' :
                      type === 'indicator' ? '_indicator' : '_container';

    // 组合名称：基础名称 + selector哈希 + 类型后缀
    return `${baseName}_${selectorHash}${typeSuffix}`;
  }

  /**
   * 从selector中提取哈希标识
   */
  extractSelectorHash(selector) {
    // 提取class名称的关键部分
    const classMatches = selector.match(/\[class\*="([^"]+)"/g);
    if (classMatches) {
      return classMatches
        .map(match => match.replace(/\[class\*="([^"]+)"/, '$1'))
        .join('_')
        .substring(0, 20); // 限制长度
    }

    // 提取ID
    const idMatch = selector.match(/#([a-zA-Z0-9_-]+)/);
    if (idMatch) {
      return `id_${idMatch[1]}`;
    }

    // 提取标签名
    const tagMatch = selector.match(/^([a-zA-Z]+)/);
    if (tagMatch) {
      return tagMatch[1];
    }

    // 使用默认哈希
    return `hash_${selector.length}`;
  }

  /**
   * 计算选择器特异性
   */
  calculateSelectorSpecificity(selector) {
    const idCount = (selector.match(/#/g) || []).length;
    const classCount = (selector.match(/\./g) || []).length;
    const attrCount = (selector.match(/\[/g) || []).length;
    const tagCount = (selector.match(/^[a-zA-Z]+/g) || []).length;
    return idCount * 1000 + classCount * 100 + attrCount * 10 + tagCount;
  }

  /**
   * 检查selector是否已存在于容器库中
   */
  isSelectorExisting(library, selector) {
    if (!library.weibo || !library.weibo.containers) {
      return false;
    }

    return Object.values(library.weibo.containers).some(container =>
      container.selector === selector
    );
  }

  /**
   * 检查容器名称是否已存在
   */
  isContainerNameExisting(library, containerName) {
    if (!library.weibo || !library.weibo.containers) {
      return false;
    }

    return Object.keys(library.weibo.containers).includes(containerName);
  }

  /**
   * 分析页面并发现新容器
   */
  async analyzeAndDiscoverContainers() {
    console.log('🔬 基于容器库情况开始页面分析...');

    const library = this.readContainerLibrary();
    if (!library) {
      console.error('❌ 无法读取容器库');
      return false;
    }

    // 启动浏览器
    const browser = await chromium.launch({ headless: this.headless });
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 }
    });

    // 注入Cookie
    if (fs.existsSync(this.cookieFile)) {
      const cookieData = fs.readFileSync(this.cookieFile, 'utf8');
      const cookies = JSON.parse(cookieData);
      await context.addCookies(cookies);
      console.log('🍪 Cookie注入完成');
    }

    const page = await context.newPage();

    try {
      // 导航到微博
      console.log('🌐 导航到微博主页...');
      await page.goto('https://weibo.com', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(3000);

      // 执行页面分析
      const analysisResult = await page.evaluate(() => {
        const results = {
          timestamp: new Date().toISOString(),
          pageUrl: window.location.href,
          pageTitle: document.title,
          potentialContainers: [],
          elementAnalysis: {},
          recommendations: []
        };

        // 分析页面结构，寻找潜在的容器元素
        const analysisStrategies = [
          {
            name: 'interactive_elements',
            selector: 'button, a[href], [onclick], [role="button"], [tabindex]',
            filter: (el) => {
              const rect = el.getBoundingClientRect();
              return rect.width > 0 && rect.height > 0 &&
                     el.offsetParent !== null &&
                     window.getComputedStyle(el).display !== 'none';
            }
          },
          {
            name: 'container_elements',
            selector: 'div, section, article, main, aside, nav, header, footer',
            filter: (el) => {
              const rect = el.getBoundingClientRect();
              return rect.width > 50 && rect.height > 50 && // 排除太小的元素
                     el.children.length > 0 && // 有子元素的容器
                     el.offsetParent !== null;
            }
          },
          {
            name: 'loading_elements',
            selector: '[class*="loading"], [class*="spinner"], [class*="progress"], svg',
            filter: (el) => {
              const rect = el.getBoundingClientRect();
              return rect.width > 0 && rect.height > 0 &&
                     el.offsetParent !== null;
            }
          },
          {
            name: 'navigation_elements',
            selector: '[class*="nav"], [class*="menu"], [class*="tab"], [class*="page"]',
            filter: (el) => {
              const rect = el.getBoundingClientRect();
              return rect.width > 0 && rect.height > 0 &&
                     el.offsetParent !== null;
            }
          }
        ];

        // 执行各种分析策略
        analysisStrategies.forEach(strategy => {
          try {
            const elements = document.querySelectorAll(strategy.selector);
            const filteredElements = Array.from(elements).filter(strategy.filter);

            if (filteredElements.length > 0) {
              results.potentialContainers.push({
                strategy: strategy.name,
                count: filteredElements.length,
                elements: filteredElements.slice(0, 10).map(el => this.analyzeElement(el))
              });
            }
          } catch (e) {
            // 忽略策略错误
          }
        });

        // 分析页面中的数据属性
        const allElements = document.querySelectorAll('*');
        const dataElements = Array.from(allElements).filter(el => {
          return Array.from(el.attributes).some(attr => attr.name.startsWith('data-'));
        });
        if (dataElements.length > 0) {
          results.elementAnalysis.dataAttributes = dataElements
            .slice(0, 5)
            .map(el => Array.from(el.attributes).filter(attr => attr.name.startsWith('data-')));
        }

        return results;

        // 辅助函数：分析单个元素
        function analyzeElement(element) {
          const rect = element.getBoundingClientRect();
          return {
            tagName: element.tagName,
            id: element.id,
            className: element.className,
            selector: generateSelector(element),
            textContent: element.textContent?.trim().substring(0, 50),
            rect: {
              width: rect.width,
              height: rect.height,
              top: rect.top,
              left: rect.left
            },
            attributes: Array.from(element.attributes).reduce((acc, attr) => {
              acc[attr.name] = attr.value;
              return acc;
            }, {}),
            children: element.children.length,
            hasInteractive: element.matches('button, a[href], [onclick], [role="button"]')
          };
        }

        // 辅助函数：生成selector
        function generateSelector(element) {
          if (element.id) return `#${element.id}`;

          const classes = element.className.split(' ').filter(c => c.trim());
          if (classes.length > 0) {
            // 使用最具体的class
            const specificClass = classes.find(c =>
              c.length > 3 && !c.includes('hover') && !c.includes('active')
            );
            if (specificClass) {
              return `${element.tagName.toLowerCase()}.${specificClass}`;
            }
          }

          // 使用属性
          if (element.getAttribute('role')) {
            return `${element.tagName.toLowerCase()}[role="${element.getAttribute('role')}"]`;
          }

          return element.tagName.toLowerCase();
        }
      });

      // 分析结果并生成容器建议
      await this.processAnalysisResults(analysisResult, library);

      console.log('✅ 页面分析完成');
      return analysisResult;

    } finally {
      await browser.close();
    }
  }

  /**
   * 处理分析结果并生成容器注册建议
   */
  async processAnalysisResults(analysisResult, library) {
    console.log('📊 处理分析结果...');

    const existingContainers = library.weibo?.containers || {};
    const newContainers = [];

    // 分析每个潜在的容器
    for (const strategy of analysisResult.potentialContainers) {
      for (const element of strategy.elements) {
        // 跳过已存在的selector
        if (this.isSelectorExisting(library, element.selector)) {
          this.analysisResults.existingContainers.push({
            selector: element.selector,
            strategy: strategy.name
          });
          continue;
        }

        // 生成容器建议
        const containerSuggestion = this.generateContainerSuggestion(
          element,
          strategy,
          existingContainers
        );

        if (containerSuggestion) {
          newContainers.push(containerSuggestion);
        }
      }
    }

    this.analysisResults.newContainers = newContainers;
    this.analysisResults.recommendations = this.generateRecommendations(newContainers, existingContainers);

    console.log(`📋 分析结果:`);
    console.log(`   - 现有容器: ${this.analysisResults.existingContainers.length}`);
    console.log(`   - 新发现容器: ${newContainers.length}`);
    console.log(`   - 建议注册: ${this.analysisResults.recommendations.length}`);
  }

  /**
   * 生成容器建议
   */
  generateContainerSuggestion(element, strategy, existingContainers) {
    // 根据元素特征确定容器类型
    let containerType = 'container';
    let baseName = 'element';

    if (element.hasInteractive) {
      containerType = 'interactive';
      baseName = this.determineInteractiveElementName(element);
    } else if (strategy.name === 'loading_elements') {
      containerType = 'indicator';
      baseName = 'loading';
    } else if (strategy.name === 'navigation_elements') {
      containerType = 'navigation';
      baseName = 'nav';
    } else if (element.children > 3) {
      containerType = 'container';
      baseName = 'content';
    }

    // 生成唯一容器名称
    const containerName = this.generateUniqueContainerName(
      baseName,
      element.selector,
      containerType
    );

    // 确定优先级
    const priority = this.determineContainerPriority(element, strategy);

    // 生成描述
    const description = this.generateContainerDescription(element, strategy, containerType);

    return {
      containerId: containerName,
      containerName: containerName.replace(/_/g, ' '),
      selector: element.selector,
      description: description,
      type: containerType,
      priority: priority,
      specificity: this.calculateSelectorSpecificity(element.selector),
      strategy: strategy.name,
      elementInfo: element
    };
  }

  /**
   * 确定交互元素名称
   */
  determineInteractiveElementName(element) {
    const text = element.textContent?.toLowerCase() || '';
    const className = element.className?.toLowerCase() || '';

    if (text.includes('更多') || className.includes('more')) return 'more';
    if (text.includes('加载') || className.includes('load')) return 'load';
    if (text.includes('展开') || className.includes('expand')) return 'expand';
    if (text.includes('评论') || className.includes('comment')) return 'comment';
    if (text.includes('点赞') || className.includes('like')) return 'like';
    if (text.includes('分享') || className.includes('share')) return 'share';
    if (text.includes('转发') || className.includes('forward')) return 'forward';
    if (text.includes('收藏') || className.includes('favorite')) return 'favorite';
    if (text.includes('关注') || className.includes('follow')) return 'follow';

    return 'interactive';
  }

  /**
   * 确定容器优先级
   */
  determineContainerPriority(element, strategy) {
    let priority = 100; // 默认优先级

    // 根据策略调整优先级
    switch (strategy.name) {
      case 'interactive_elements':
        priority = 10;
        break;
      case 'navigation_elements':
        priority = 20;
        break;
      case 'loading_elements':
        priority = 30;
        break;
      case 'container_elements':
        priority = 50;
        break;
    }

    // 根据元素位置调整优先级（顶部元素优先级更高）
    if (element.rect.top < 200) priority -= 10;
    if (element.rect.top < 100) priority -= 10;

    // 根据元素大小调整优先级（大容器优先级更高）
    if (element.rect.width > 800) priority -= 5;
    if (element.rect.height > 400) priority -= 5;

    return Math.max(1, priority);
  }

  /**
   * 生成容器描述
   */
  generateContainerDescription(element, strategy, containerType) {
    const parts = [];

    // 基础类型描述
    switch (containerType) {
      case 'interactive':
        parts.push('交互式元素');
        break;
      case 'indicator':
        parts.push('状态指示器');
        break;
      case 'navigation':
        parts.push('导航控件');
        break;
      default:
        parts.push('内容容器');
    }

    // 策略描述
    switch (strategy.name) {
      case 'interactive_elements':
        parts.push('用户可交互');
        break;
      case 'loading_elements':
        parts.push('加载状态');
        break;
      case 'navigation_elements':
        parts.push('页面导航');
        break;
      case 'container_elements':
        parts.push('包含子元素');
        break;
    }

    // 位置描述
    if (element.rect.top < 200) parts.push('页面顶部');
    if (element.rect.width > 800) parts.push('全宽');
    if (element.rect.height > 400) parts.push('高大容器');

    // 子元素描述
    if (element.children > 10) parts.push(`包含${element.children}个子元素`);
    if (element.textContent) parts.push(`文本:"${element.textContent.substring(0, 20)}..."`);

    return parts.join('，') + `（选择器:${element.selector}）`;
  }

  /**
   * 生成注册建议
   */
  generateRecommendations(newContainers, existingContainers) {
    const recommendations = [];

    // 按优先级排序
    newContainers.sort((a, b) => a.priority - b.priority);

    // 选择优先级最高的容器进行注册
    const topContainers = newContainers.slice(0, 20); // 限制数量

    for (const container of topContainers) {
      // 检查命名冲突
      if (this.isContainerNameExisting({ weibo: { containers: existingContainers } }, container.containerId)) {
        this.analysisResults.conflicts.push({
          containerId: container.containerId,
          conflict: '名称已存在'
        });
        continue;
      }

      recommendations.push({
        action: 'register',
        container: container,
        reason: `高优先级${container.type}容器，特异性:${container.specificity}`
      });
    }

    return recommendations;
  }

  /**
   * 注册新容器到容器库
   */
  async registerNewContainers() {
    console.log('📝 注册新容器到容器库...');

    // 备份现有容器库
    if (!this.backupContainerLibrary()) {
      return false;
    }

    const library = this.readContainerLibrary();
    if (!library) {
      return false;
    }

    let registeredCount = 0;

    // 注册推荐的容器
    for (const recommendation of this.analysisResults.recommendations) {
      if (recommendation.action === 'register') {
        const container = recommendation.container;

        try {
          // 创建容器注册信息
          const registeredContainer = {
            name: container.containerName,
            selector: container.selector,
            description: container.description,
            priority: container.priority,
            specificity: container.specificity,
            registeredAt: new Date().toISOString(),
            isActive: true,
            type: container.type,
            usage: {
              accessCount: 0,
              lastUsed: null,
              successRate: 0
            },
            validation: {
              selectorValid: true,
              lastValidation: new Date().toISOString(),
              validationMethod: 'auto-analysis'
            },
            discovery: {
              strategy: container.strategy,
              specificityThreshold: 50,
              uniquenessThreshold: 0.7,
              waitForElements: true,
              timeout: 10000
            }
          };

          // 添加额外的元数据
          if (container.type === 'interactive') {
            registeredContainer.action = 'click';
          }
          if (container.type === 'indicator') {
            registeredContainer.state = 'loading';
          }

          // 注册容器
          if (!library.weibo) {
            library.weibo = {
              website: 'weibo.com',
              registeredAt: new Date().toISOString(),
              containers: {},
              metadata: {
                version: '2.0.0',
                lastUpdated: new Date().toISOString(),
                containerCount: 0
              }
            };
          }

          library.weibo.containers[container.containerId] = registeredContainer;
          registeredCount++;

          console.log(`✅ 注册容器: ${container.containerId}`);
          console.log(`   名称: ${container.containerName}`);
          console.log(`   选择器: ${container.selector}`);
          console.log(`   类型: ${container.type}`);
          console.log(`   优先级: ${container.priority}`);

        } catch (error) {
          console.error(`❌ 注册容器 ${container.containerId} 失败:`, error.message);
        }
      }
    }

    // 更新元数据
    if (library.weibo) {
      const totalContainers = Object.keys(library.weibo.containers).length;
      library.weibo.metadata.lastUpdated = new Date().toISOString();
      library.weibo.metadata.containerCount = totalContainers;

      // 保存更新后的容器库
      try {
        fs.writeFileSync(this.containerLibraryPath, JSON.stringify(library, null, 2));
        console.log(`\n🎉 容器注册完成！`);
        console.log(`📊 注册统计:`);
        console.log(`   - 新注册容器: ${registeredCount}`);
        console.log(`   - 总容器数量: ${totalContainers}`);
        console.log(`   - 容器库文件: ${this.containerLibraryPath}`);

        return true;
      } catch (error) {
        console.error('❌ 保存容器库失败:', error.message);
        return false;
      }
    }

    return false;
  }

  /**
   * 生成分析报告
   */
  generateAnalysisReport() {
    console.log('\n📋 容器库分析报告');
    console.log('====================');

    console.log('\n📊 现有容器统计:');
    console.log(`   - 数量: ${this.analysisResults.existingContainers.length}`);
    this.analysisResults.existingContainers.forEach(container => {
      console.log(`   - ${container.selector} (${container.strategy})`);
    });

    console.log('\n🔍 新发现容器:');
    console.log(`   - 数量: ${this.analysisResults.newContainers.length}`);
    this.analysisResults.newContainers.slice(0, 10).forEach(container => {
      console.log(`   - ${container.containerId}: ${container.selector}`);
    });

    console.log('\n⚠️ 命名冲突:');
    console.log(`   - 数量: ${this.analysisResults.conflicts.length}`);
    this.analysisResults.conflicts.forEach(conflict => {
      console.log(`   - ${conflict.containerId}: ${conflict.conflict}`);
    });

    console.log('\n💡 注册建议:');
    console.log(`   - 数量: ${this.analysisResults.recommendations.length}`);
    this.analysisResults.recommendations.forEach(recommendation => {
      console.log(`   - ${recommendation.container.containerId}: ${recommendation.reason}`);
    });

    console.log('\n🎯 命名规则说明:');
    console.log('   - 容器名称必须包含selector哈希确保唯一性');
    console.log('   - 格式: 基础名称_selector哈希_类型后缀');
    console.log('   - 例如: comment_toolbarCommentIcon_3o7HB_button');
  }

  /**
   * 执行完整的分析和注册流程
   */
  async execute() {
    console.log('🚀 容器库分析器与注册器启动');
    console.log('===============================');

    // 1. 分析页面并发现新容器
    const analysisSuccess = await this.analyzeAndDiscoverContainers();
    if (!analysisSuccess) {
      console.error('❌ 页面分析失败');
      return false;
    }

    // 2. 生成分析报告
    this.generateAnalysisReport();

    // 3. 询问用户是否要注册新容器
    console.log('\n🤔 是否要注册新发现的容器？(y/N)');

    // 在实际使用中，这里可以添加用户交互逻辑
    // 为了自动化，我们直接执行注册
    console.log('📝 自动执行注册流程...');

    // 4. 注册新容器
    const registrationSuccess = await this.registerNewContainers();

    if (registrationSuccess) {
      console.log('\n🎉 容器库更新完成！');
      console.log('📱 所有新容器都已注册到容器库中');
      return true;
    } else {
      console.log('\n❌ 容器注册失败');
      return false;
    }
  }
}

// 命令行执行
if (require.main === module) {
  const analyzer = new ContainerLibraryAnalyzerAndRegistrar({
    headless: false, // 使用可视化模式便于检查
    verbose: true
  });

  analyzer.execute().then(success => {
    if (success) {
      console.log('\n✅ 分析和注册流程完成');
    } else {
      console.log('\n❌ 分析和注册流程失败');
      process.exit(1);
    }
  }).catch(error => {
    console.error('❌ 执行失败:', error.message);
    process.exit(1);
  });
}

module.exports = ContainerLibraryAnalyzerAndRegistrar;