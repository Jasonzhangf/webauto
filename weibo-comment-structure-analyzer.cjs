#!/usr/bin/env node

/**
 * 微博评论区深度结构分析器
 * 专门分析"加载更多"和回复评论的容器结构
 */

const { chromium } = require('playwright');
const fs = require('fs');

class WeiboCommentStructureAnalyzer {
  constructor(options = {}) {
    this.headless = options.headless || false;
    this.verbose = options.verbose || true;
    this.outputFile = options.outputFile || './weibo-comment-structure-analysis.json';
  }

  async analyze() {
    console.log('🔬 微博评论区深度结构分析器');
    console.log('===================================');

    // 启动浏览器
    const browser = await chromium.launch({ headless: this.headless });
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 }
    });
    const page = await context.newPage();

    try {
      // 注入Cookie
      await this.injectCookies(context);

      // 导航到微博
      console.log('🌐 导航到微博主页...');
      await page.goto('https://weibo.com', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(3000);

      // 分析评论区结构
      console.log('🔍 分析评论区结构...');
      const analysisResult = await page.evaluate(() => {
        const results = {
          timestamp: new Date().toISOString(),
          pageUrl: window.location.href,
          pageTitle: document.title,
          commentContainers: [],
          loadMoreElements: [],
          replyElements: [],
          nestedStructures: []
        };

        // 1. 查找评论区容器
        const commentSelectors = [
          '[class*="comment"]',
          '[class*="reply"]',
          '[class*="feedback"]',
          '[class*="interaction"]',
          '[data-node-type="comment"]',
          '[data-node-type="reply"]'
        ];

        commentSelectors.forEach(selector => {
          try {
            const elements = document.querySelectorAll(selector);
            const visible = Array.from(elements).filter(el => {
              const rect = el.getBoundingClientRect();
              return rect.width > 0 && rect.height > 0 &&
                     el.offsetParent !== null &&
                     window.getComputedStyle(el).display !== 'none' &&
                     window.getComputedStyle(el).visibility !== 'hidden';
            });

            if (visible.length > 0) {
              results.commentContainers.push({
                selector,
                count: visible.length,
                elements: visible.slice(0, 3).map(el => ({
                  className: el.className,
                  id: el.id,
                  textContent: el.textContent?.substring(0, 100),
                  children: el.children.length,
                  innerHTML: el.innerHTML?.substring(0, 200)
                }))
              });
            }
          } catch (e) {
            // 忽略选择器错误
          }
        });

        // 2. 查找"加载更多"相关元素
        const loadMoreSelectors = [
          '[class*="more"]',
          '[class*="load"]',
          '[class*="next"]',
          '[class*="page"]',
          '[aria-label*="more"]',
          '[aria-label*="load"]',
          '[aria-label*="next"]',
          'button[class*="more"]',
          'button[class*="load"]',
          'button[class*="next"]',
          'a[class*="more"]',
          'a[class*="load"]',
          'a[class*="next"]',
          '[data-action*="more"]',
          '[data-action*="load"]',
          '[data-action*="next"]'
        ];

        loadMoreSelectors.forEach(selector => {
          try {
            const elements = document.querySelectorAll(selector);
            const visible = Array.from(elements).filter(el => {
              const rect = el.getBoundingClientRect();
              return rect.width > 0 && rect.height > 0 &&
                     el.offsetParent !== null &&
                     window.getComputedStyle(el).display !== 'none' &&
                     window.getComputedStyle(el).visibility !== 'hidden';
            });

            if (visible.length > 0) {
              results.loadMoreElements.push({
                selector,
                count: visible.length,
                elements: visible.slice(0, 5).map(el => ({
                  tagName: el.tagName,
                  className: el.className,
                  id: el.id,
                  textContent: el.textContent?.trim(),
                  innerHTML: el.innerHTML?.substring(0, 100),
                  attributes: Array.from(el.attributes).reduce((acc, attr) => {
                    acc[attr.name] = attr.value;
                    return acc;
                  }, {})
                }))
              });
            }
          } catch (e) {
            // 忽略选择器错误
          }
        });

        // 3. 查找回复相关元素
        const replySelectors = [
          '[class*="reply"]',
          '[class*="comment"]',
          '[class*="sub"]',
          '[class*="child"]',
          '[class*="nested"]',
          '[data-node-type*="reply"]',
          '[data-node-type*="comment"]'
        ];

        replySelectors.forEach(selector => {
          try {
            const elements = document.querySelectorAll(selector);
            const visible = Array.from(elements).filter(el => {
              const rect = el.getBoundingClientRect();
              return rect.width > 0 && rect.height > 0 &&
                     el.offsetParent !== null &&
                     window.getComputedStyle(el).display !== 'none' &&
                     window.getComputedStyle(el).visibility !== 'hidden';
            });

            if (visible.length > 0) {
              results.replyElements.push({
                selector,
                count: visible.length,
                elements: visible.slice(0, 5).map(el => ({
                  tagName: el.tagName,
                  className: el.className,
                  id: el.id,
                  textContent: el.textContent?.trim(),
                  depth: this.getElementDepth(el),
                  parentSelector: this.getParentSelector(el)
                }))
              });
            }
          } catch (e) {
            // 忽略选择器错误
          }
        });

        // 4. 分析嵌套结构
        const nestedAnalysis = analyzeNestedStructures(results);

        return { ...results, ...nestedAnalysis };

        // 页面内使用的辅助函数
        function getElementDepth(element) {
          let depth = 0;
          let parent = element.parentElement;
          while (parent) {
            depth++;
            parent = parent.parentElement;
          }
          return depth;
        }

        function getParentSelector(element) {
          if (!element.parentElement) return null;
          const parent = element.parentElement;
          if (parent.id) return `#${parent.id}`;
          if (parent.className) {
            const classes = parent.className.split(' ').filter(c => c.trim());
            if (classes.length > 0) return `.${classes[0]}`;
          }
          return parent.tagName.toLowerCase();
        }

        function getContainerSelector(element) {
          if (element.id) return `#${element.id}`;
          if (element.className) {
            const classes = element.className.split(' ').filter(c => c.trim());
            if (classes.length > 0) return `.${classes.join('.')}`;
          }
          return element.tagName.toLowerCase();
        }

        function analyzeNestedStructures(results) {
          // 查找嵌套的评论结构
          const commentContainers = document.querySelectorAll('[class*="comment"], [class*="reply"]');

          commentContainers.forEach(container => {
            const nestedComments = container.querySelectorAll('[class*="comment"], [class*="reply"]');
            if (nestedComments.length > 0) {
              results.nestedStructures.push({
                type: 'nested_comments',
                depth: getElementDepth(container),
                selector: getContainerSelector(container),
                nestedCount: nestedComments.length,
                containerClass: container.className
              });
            }
          });

          // 查找展开/折叠按钮
          const expandButtons = document.querySelectorAll('[class*="expand"], [class*="collapse"], [class*="unfold"], [class*="toggle"]');
          expandButtons.forEach(button => {
            results.nestedStructures.push({
              type: 'expand_button',
              depth: getElementDepth(button),
              selector: getContainerSelector(button),
              textContent: button.textContent?.trim(),
              attributes: Array.from(button.attributes).reduce((acc, attr) => {
                acc[attr.name] = attr.value;
                return acc;
              }, {})
            });
          });
        }
      });

      // 保存分析结果
      fs.writeFileSync(this.outputFile, JSON.stringify(analysisResult, null, 2));
      console.log(`✅ 分析结果已保存到: ${this.outputFile}`);

      // 打印关键发现
      this.printKeyFindings(analysisResult);

      return analysisResult;

    } finally {
      await browser.close();
    }
  }

  async injectCookies(context) {
    const cookieFile = './cookies/weibo-cookies.json';
    if (fs.existsSync(cookieFile)) {
      const cookieData = fs.readFileSync(cookieFile, 'utf8');
      const cookies = JSON.parse(cookieData);
      await context.addCookies(cookies);
      console.log('🍪 Cookie注入完成');
    } else {
      console.log('⚠️ Cookie文件不存在，可能影响登录状态');
    }
  }

  printKeyFindings(results) {
    console.log('\n🎯 关键发现:');
    console.log('=============');

    if (results.commentContainers.length > 0) {
      console.log('📦 评论区容器:');
      results.commentContainers.forEach(container => {
        console.log(`   - 选择器: ${container.selector}`);
        console.log(`   - 数量: ${container.count}`);
        console.log(`   - 示例类名: ${container.elements[0]?.className || 'N/A'}`);
      });
    }

    if (results.loadMoreElements.length > 0) {
      console.log('\n🔄 "加载更多"元素:');
      results.loadMoreElements.forEach(element => {
        console.log(`   - 选择器: ${element.selector}`);
        console.log(`   - 数量: ${element.count}`);
        const sampleText = element.elements[0]?.textContent || 'N/A';
        console.log(`   - 示例文本: "${sampleText.substring(0, 30)}..."`);
      });
    }

    if (results.replyElements.length > 0) {
      console.log('\n💬 回复相关元素:');
      results.replyElements.forEach(element => {
        console.log(`   - 选择器: ${element.selector}`);
        console.log(`   - 数量: ${element.count}`);
      });
    }

    if (results.nestedStructures.length > 0) {
      console.log('\n📊 嵌套结构分析:');
      results.nestedStructures.forEach(structure => {
        console.log(`   - 类型: ${structure.type}`);
        console.log(`   - 深度: ${structure.depth}`);
        console.log(`   - 选择器: ${structure.selector}`);
      });
    }
  }
}

// 命令行执行
if (require.main === module) {
  const analyzer = new WeiboCommentStructureAnalyzer({
    headless: false, // 使用可视化模式便于手动检查
    verbose: true
  });

  analyzer.analyze().catch(error => {
    console.error('❌ 分析失败:', error.message);
    process.exit(1);
  });
}

module.exports = WeiboCommentStructureAnalyzer;