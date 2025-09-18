#!/usr/bin/env node

/**
 * Weibo Homepage Structure Analyzer
 * Analyzes Weibo homepage to identify post containers and link elements
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');

class WeiboStructureAnalyzer {
  constructor(options = {}) {
    this.cookiePath = options.cookiePath || path.join(os.homedir(), '.webauto/cookies/weibo-cookies.json');
    this.headless = options.headless || false;
    this.viewport = options.viewport || { width: 1920, height: 1080 };
    this.outputFile = options.outputFile || './weibo-structure-analysis.json';
  }

  async loadCookies() {
    try {
      if (!await this.fileExists(this.cookiePath)) {
        console.warn(`⚠️ Cookie file not found: ${this.cookiePath}`);
        return [];
      }

      const cookieData = await fs.readFile(this.cookiePath, 'utf-8');
      const parsed = JSON.parse(cookieData);
      const cookies = Array.isArray(parsed) ? parsed : (parsed.cookies || []);

      console.log(`✅ Loaded ${cookies.length} cookies`);
      return cookies;
    } catch (error) {
      console.error(`❌ Failed to load cookies: ${error.message}`);
      return [];
    }
  }

  async fileExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async analyzePageStructure(page) {
    console.log('🔍 Analyzing Weibo homepage structure...');

    const analysis = {
      url: page.url(),
      title: await page.title(),
      timestamp: new Date().toISOString(),
      containers: {},
      elements: {},
      feedStructure: [],
      potentialSelectors: []
    };

    // 1. Look for main feed containers
    console.log('📦 Analyzing feed containers...');
    const feedContainers = await page.evaluate(() => {
      const containers = [];

      // Common Weibo feed container selectors
      const selectors = [
        '[class*="Feed"]',
        '[class*="feed"]',
        '[class*="Weibo"]',
        '[class*="weibo"]',
        '[class*="Card"]',
        '[class*="card"]',
        '[id*="feed"]',
        '[id*="Feed"]',
        '.main-content',
        '.content-wrap',
        '.Feed_body',
        '.Feed_body_3O0gD'
      ];

      selectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          containers.push({
            selector,
            count: elements.length,
            visible: Array.from(elements).filter(el => el.offsetParent !== null).length,
            sample: Array.from(elements).slice(0, 3).map(el => ({
              tagName: el.tagName,
              className: el.className,
              id: el.id,
              text: el.textContent?.substring(0, 100),
              children: el.children.length,
              rect: el.getBoundingClientRect()
            }))
          });
        }
      });

      return containers;
    });

    analysis.containers.feed = feedContainers;

    // 2. Look for post items
    console.log('📝 Analyzing post items...');
    const postItems = await page.evaluate(() => {
      const posts = [];

      const selectors = [
        '[class*="Feed_body"] [class*="Item"]',
        '[class*="feed-item"]',
        '[class*="weibo-item"]',
        '[class*="card-item"]',
        '[class*="Feed_item"]',
        '[class*="FeedItem"]',
        'article',
        '[role="article"]'
      ];

      selectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          posts.push({
            selector,
            count: elements.length,
            visible: Array.from(elements).filter(el => el.offsetParent !== null).length,
            sample: Array.from(elements).slice(0, 3).map(el => ({
              tagName: el.tagName,
              className: el.className,
              id: el.id,
              hasLinks: el.querySelectorAll('a').length,
              linkSample: Array.from(el.querySelectorAll('a')).slice(0, 3).map(a => ({
                href: a.href,
                text: a.textContent?.substring(0, 50)
              }))
            }))
          });
        }
      });

      return posts;
    });

    analysis.containers.posts = postItems;

    // 3. Look for links within posts
    console.log('🔗 Analyzing link elements...');
    const linkAnalysis = await page.evaluate(() => {
      const links = [];

      const linkSelectors = [
        'a[href*="/detail/"]',
        'a[href*="/status/"]',
        'a[href*="weibo.com/"]',
        '[class*="title"] a',
        '[class*="content"] a',
        '.Feed_body_3O0gD a'
      ];

      linkSelectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          const uniqueLinks = new Set();
          const linkDetails = Array.from(elements)
            .filter(el => el.offsetParent !== null)
            .map(el => {
              const href = el.href;
              if (href && !uniqueLinks.has(href)) {
                uniqueLinks.add(href);
                return {
                  href,
                  text: el.textContent?.trim(),
                  className: el.className,
                  isPostLink: href.includes('/detail/') || href.includes('/status/')
                };
              }
              return null;
            })
            .filter(Boolean);

          links.push({
            selector,
            total: elements.length,
            unique: linkDetails.length,
            postLinks: linkDetails.filter(l => l.isPostLink),
            sample: linkDetails.slice(0, 10)
          });
        }
      });

      return links;
    });

    analysis.elements.links = linkAnalysis;

    // 4. Generate potential selector patterns
    console.log('🎯 Generating selector patterns...');
    analysis.potentialSelectors = this.generateSelectorPatterns(analysis);

    // 5. Extract sample feed structure
    console.log('📋 Extracting feed structure...');
    analysis.feedStructure = await this.extractFeedStructure(page);

    return analysis;
  }

  generateSelectorPatterns(analysis) {
    const patterns = [];

    // Based on feed containers
    analysis.containers.feed.forEach(container => {
      if (container.visible > 0) {
        patterns.push({
          type: 'feedContainer',
          selector: container.selector,
          confidence: container.visible >= 3 ? 'high' : 'medium',
          description: `Feed container with ${container.visible} visible items`
        });
      }
    });

    // Based on post items
    analysis.containers.posts.forEach(post => {
      if (post.visible > 0) {
        patterns.push({
          type: 'postItem',
          selector: post.selector,
          confidence: post.visible >= 5 ? 'high' : 'medium',
          description: `Post items with ${post.visible} visible items`
        });
      }
    });

    // Based on links
    analysis.elements.links.forEach(linkGroup => {
      if (linkGroup.postLinks.length > 0) {
        patterns.push({
          type: 'postLinks',
          selector: linkGroup.selector,
          confidence: 'high',
          description: `Post links with ${linkGroup.postLinks.length} items`
        });
      }
    });

    return patterns.sort((a, b) => {
      const confidenceOrder = { high: 3, medium: 2, low: 1 };
      return confidenceOrder[b.confidence] - confidenceOrder[a.confidence];
    });
  }

  async extractFeedStructure(page) {
    return await page.evaluate(() => {
      // Try to find the main feed area
      const feedSelectors = [
        '[class*="Feed_body"]',
        '.Feed_body_3O0gD',
        '[class*="main-feed"]',
        '.main-content'
      ];

      let feedElement = null;
      for (const selector of feedSelectors) {
        const element = document.querySelector(selector);
        if (element && element.offsetParent !== null) {
          feedElement = element;
          break;
        }
      }

      if (!feedElement) {
        return { error: 'No feed element found' };
      }

      // Analyze the structure
      const structure = {
        tagName: feedElement.tagName,
        className: feedElement.className,
        id: feedElement.id,
        children: feedElement.children.length,
        directPosts: [],
        nestedPosts: []
      };

      // Look for direct post children
      Array.from(feedElement.children).forEach((child, index) => {
        if (child.offsetParent !== null) {
          const postInfo = {
            index,
            tagName: child.tagName,
            className: child.className,
            linkCount: child.querySelectorAll('a').length,
            postLinks: Array.from(child.querySelectorAll('a[href*="/detail/"], a[href*="/status/"]'))
              .map(a => ({ href: a.href, text: a.textContent?.trim() }))
              .filter(Boolean)
          };

          if (postInfo.postLinks.length > 0) {
            structure.directPosts.push(postInfo);
          }
        }
      });

      // Look for nested posts (1 level deep)
      Array.from(feedElement.children).forEach((child, index) => {
        Array.from(child.children).forEach((grandchild, gIndex) => {
          if (grandchild.offsetParent !== null) {
            const postInfo = {
              parentIndex: index,
              index: gIndex,
              tagName: grandchild.tagName,
              className: grandchild.className,
              linkCount: grandchild.querySelectorAll('a').length,
              postLinks: Array.from(grandchild.querySelectorAll('a[href*="/detail/"], a[href*="/status/"]'))
                .map(a => ({ href: a.href, text: a.textContent?.trim() }))
                .filter(Boolean)
            };

            if (postInfo.postLinks.length > 0) {
              structure.nestedPosts.push(postInfo);
            }
          }
        });
      });

      return structure;
    });
  }

  async saveAnalysis(analysis) {
    try {
      await fs.writeFile(this.outputFile, JSON.stringify(analysis, null, 2));
      console.log(`✅ Analysis saved to ${this.outputFile}`);
    } catch (error) {
      console.error(`❌ Failed to save analysis: ${error.message}`);
    }
  }

  async analyze() {
    const startTime = Date.now();

    try {
      console.log('🚀 Starting Weibo homepage structure analysis...');

      // Load cookies
      const cookies = await this.loadCookies();

      // Launch browser
      const browser = await chromium.launch({
        headless: this.headless,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-default-browser-check'
        ]
      });

      const context = await browser.newContext({
        viewport: this.viewport,
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      });

      // Add cookies
      if (cookies.length > 0) {
        await context.addCookies(cookies);
        console.log(`🍪 Added ${cookies.length} cookies to browser context`);
      }

      const page = await context.newPage();

      // Navigate to Weibo
      console.log('🌐 Navigating to Weibo homepage...');
      await page.goto('https://weibo.com', {
        waitUntil: 'domcontentloaded',
        timeout: 60000
      });

      console.log(`✅ Navigation complete. Page title: ${await page.title()}`);

      // Wait a bit for dynamic content to load
      await page.waitForTimeout(3000);

      // Analyze structure
      const analysis = await this.analyzePageStructure(page);

      // Save analysis
      await this.saveAnalysis(analysis);

      // Print summary
      console.log('\n📊 Analysis Summary:');
      console.log('==================');
      console.log(`Feed containers found: ${analysis.containers.feed.length}`);
      console.log(`Post item selectors found: ${analysis.containers.posts.length}`);
      console.log(`Link groups found: ${analysis.elements.links.length}`);
      console.log(`High-confidence selectors: ${analysis.potentialSelectors.filter(s => s.confidence === 'high').length}`);

      // Print top selectors
      console.log('\n🎯 Top Selectors:');
      analysis.potentialSelectors.slice(0, 5).forEach((selector, index) => {
        console.log(`${index + 1}. ${selector.selector} (${selector.confidence})`);
        console.log(`   ${selector.description}`);
      });

      await browser.close();

      const duration = Date.now() - startTime;
      console.log(`\n⏱️ Analysis completed in ${duration}ms`);

      return analysis;

    } catch (error) {
      console.error('❌ Analysis failed:', error.message);
      throw error;
    }
  }
}

// Main execution
if (require.main === module) {
  const analyzer = new WeiboStructureAnalyzer({
    headless: false,
    outputFile: './weibo-structure-analysis.json'
  });

  analyzer.analyze().catch(console.error);
}

module.exports = WeiboStructureAnalyzer;