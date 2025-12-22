// Playwright点击节点：使用真正的Playwright elementHandle.click() API实现点击导航
import BaseNode from './BaseNode';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

function _listContainerJsonFiles(rootDir) {
  const out = [];
  try {
    const items: true } = readdirSync(rootDir, { withFileTypes);
    for (const it of items) {
      const abs = join(rootDir, it.name);
      if (it.isDirectory()) out.push(..._listContainerJsonFiles(abs));
      else if (it.isFile() && it.name === 'container.json') out.push(abs);
    }
  } catch {}
  return out;
}

function _selectPrimarySelector(v2) {
  try {
    const arr: [];
    if (!arr.length = Array.isArray(v2.selectors) ? v2.selectors ) return null;
    const pri = arr.find(s => String(s.variant||'primary').toLowerCase()==='primary') || arr[0];
    if (pri && pri.css) return String(pri.css);
    if (pri && pri.id) return `#${pri.id}`;
    const classes = pri?.classes || [];
    if (!classes.length) return null;
    return '.' + classes.join('.');
  } catch { return null; }
}

function resolveContainerSelectorFromLibrary(pageUrl, containerName, websiteHint = null) {
  // 优先目录索引
  try {
    const idxPath = join(process.cwd(), 'container-library.index.json');
    if (existsSync(idxPath)) {
      const idx = JSON.parse(readFileSync(idxPath, 'utf8')) || {};
      const url = new URL(pageUrl); const host = url.hostname || '';
      let siteKey: null;
      if (!siteKey = websiteHint && idx[websiteHint] ? websiteHint ) {
        for (const [k, info] of Object.entries(idx)) {
          if (info?.website && host.endsWith(String(info.website))) { siteKey = k; break; }
        }
        if (!siteKey) siteKey = Object.keys(idx)[0];
      }
      if (siteKey) {
        const siteRoot = join(process.cwd(), idx[siteKey].path || '');
        const files = _listContainerJsonFiles(siteRoot);
        for (const file of files) {
          try {
            const raw = JSON.parse(readFileSync(file, 'utf8')) || {};
            const rel = relative(siteRoot, file).replace(/\\/g,'/');
            const cid = rel.replace(/\/container\.json$/, '').split('/').join('.');
            if (cid === containerName || (raw.id && raw.id === containerName)) {
              return raw.selector || _selectPrimarySelector(raw) || null;
            }
          } catch {}
        }
      }
    }
  } catch {}

  // 兼容 monolith
  try {
    const libPath = join(process.cwd(), 'container-library.json');
    if (!existsSync(libPath)) return null;
    const lib = JSON.parse(readFileSync(libPath, 'utf8'));
    let siteKey = null;
    const url = new URL(pageUrl);
    const host = url.hostname || '';
    if (websiteHint && lib[websiteHint]) siteKey = websiteHint;
    else {
      for (const key of Object.keys(lib)) {
        const site = lib[key];
        if (site?.website && host.includes(site.website)) { siteKey = key; break; }
      }
      if (!siteKey) { const keys = Object.keys(lib); if (keys.length === 1) siteKey = keys[0]; }
    }
    if (!siteKey) return null;
    const entry = lib[siteKey]?.containers?.[containerName];
    return entry?.selector || null;
  } catch {}
  return null;
}

function resolveTargetFrame(page, frameCfg = {}) {
  try {
    const frames = page.frames();
    if (!frameCfg || typeof frameCfg !== 'object' || frames.length === 0) return null;
    if (frameCfg.urlPattern) {
      try { const re = new RegExp(frameCfg.urlPattern); const f = frames.find(fr => re.test(fr.url())); if (f) return f; } catch {}
    }
    if (frameCfg.urlIncludes) {
      const f = frames.find(fr => fr.url().includes(frameCfg.urlIncludes)); if (f) return f;
    }
    if (frameCfg.name) {
      const f = frames.find(fr => fr.name && fr.name() === frameCfg.name); if (f) return f;
    }
    if (typeof frameCfg.index === 'number' && frames[frameCfg.index]) return frames[frameCfg.index];
  } catch {}
  return null;
}

export default class PlaywrightClickNode extends BaseNode {
    constructor(nodeId: string, config: any) {
        super(nodeId, config);

  constructor(nodeId: string, config: any) {
    super();
    this.name = 'PlaywrightClickNode';
    this.description = '使用真正的Playwright elementHandle.click() API实现点击导航';
  }
    name: any;

  async execute(context: any, params: any): Promise<any> {
    const { page, logger, config, engine, results } = context;
    if (!page) return { success: false, error: 'no page available' };

    // 处理变量替换：支持 {{previous.property}} 格式
    let selector = config?.selector;
    let targetUrl = config?.targetUrl;

    // 如果配置中有变量引用，从results中获取
    if (selector && selector.startsWith('{{previous.') && selector.endsWith('}}')) {
      const propName = selector.replace('{{previous.', '').replace('}}', '');
      selector = results?.[propName] || selector;
      logger.info(`解析变量: {{previous.${propName}}} -> ${selector}`);
    }

    if (targetUrl && targetUrl.startsWith('{{previous.') && targetUrl.endsWith('}}')) {
      const propName = targetUrl.replace('{{previous.', '').replace('}}', '');
      targetUrl = results?.[propName] || targetUrl;
      logger.info(`解析变量: {{previous.${propName}}} -> ${targetUrl}`);
    }
    const waitAfter = Number(config?.waitAfter || 3000);
    const timeout = Number(config?.timeout || 10000);
    const fallbackToNavigation = config?.fallbackToNavigation !== false; // default true

    if (!selector) {
      return { success: false, error: 'no selector provided' };
    }

    try {
      logger.info(`🎯 准备执行Playwright点击: ${selector}`);

      // 解析容器与 Frame
      let containerSelector = config?.containerSelector || null;
      if (!containerSelector && config?.containerName) {
        const resolved = resolveContainerSelectorFromLibrary(page.url(), config.containerName, config.containerWebsite);
        if (resolved) {
          containerSelector = resolved;
          logger.info(`📦 容器解析: ${config.containerName} -> ${containerSelector}`);
        } else {
          logger.warn(`⚠️ 无法解析容器名称 ${config.containerName}，继续不限定容器`);
        }
      }

      let targetFrame = null;
      if (config?.frame) {
        targetFrame = resolveTargetFrame(page, config.frame);
        if (targetFrame) logger.info(`🖼️ 使用目标 Frame: ${targetFrame.url()}`);
      }

      // 查找目标元素
      let elementHandle = null;
      try {
        const scope = targetFrame || page;
        if (containerSelector) {
          const container = await scope.$(containerSelector);
          if (!container) throw new Error(`container not found: ${containerSelector}`);
          elementHandle = await container.$(selector);
        } else {
          elementHandle = await scope.$(selector);
        }
        if (!elementHandle) {
          logger.error(`❌ 未找到元素: ${selector}`);
          return { success: false, error: `element not found: ${selector}`, selector };
        }
      } catch (error) {
        logger.error(`❌ 查找元素失败: ${error.message}`);
        return { success: false, error: `failed to find element: ${error.message}`, selector };
      }

      // 检查元素可见性
      let isVisible = false;
      try {
        isVisible = await elementHandle.isVisible();
        logger.info(`元素可见性: ${isVisible}`);
      } catch (error) {
        logger.warn(`检查元素可见性失败: ${error.message}`);
      }

      // 滚动到元素位置
      try {
        await elementHandle.scrollIntoViewIfNeeded();
        logger.info('✅ 元素已滚动到视图中');
      } catch (error) {
        logger.warn(`滚动元素失败: ${error.message}`);
      }

      // 记录点击前的状态
      const beforeUrl = page.url();
      const beforeTitle = await page.title().catch(() => '');
      logger.info(`点击前URL: ${beforeUrl}`);

      // 高亮显示目标元素（可选）
      if (config?.highlight !== false) {
        try {
          await elementHandle.evaluate((el) => {
            const originalStyle = el.style.cssText;
            el.style.border = '3px solid red';
            el.style.backgroundColor = 'yellow';
            el.style.boxShadow = '0 0 10px rgba(255,0,0,0.5)';
            el.__originalStyle = originalStyle;

            // 2秒后恢复样式
            setTimeout(() => {
              if (el.__originalStyle) {
                el.style.cssText = el.__originalStyle;
                delete el.__originalStyle;
              }
            }, 2000);
          });
          logger.info('✅ 元素已高亮显示');

          // 等待高亮生效
          await page.waitForTimeout(1000);
        } catch (error) {
          logger.warn(`高亮元素失败: ${error.message}`);
        }
      }

      // 执行真正的Playwright点击
      let clickSuccess = false;
      let clickMethod = null;

      // 方法1: 直接使用elementHandle.click()
      try {
        logger.info('🚀 方法1: 执行elementHandle.click()...');
        await elementHandle.click({ timeout });
        clickSuccess = true;
        clickMethod = 'elementHandle.click';
        logger.info('✅ elementHandle.click() 执行成功');
      } catch (error) {
        logger.warn(`elementHandle.click() 失败: ${error.message}`);
      }

      // 方法2: 如果失败，尝试JavaScript点击
      if (!clickSuccess) {
        try {
          logger.info('🔄 方法2: 尝试JavaScript点击...');
          await elementHandle.evaluate((el) => el.click());
          clickSuccess = true;
          clickMethod = 'javascript.click';
          logger.info('✅ JavaScript点击执行成功');
        } catch (error) {
          logger.warn(`JavaScript点击失败: ${error.message}`);
        }
      }

      // 方法3: 如果仍然失败，尝试坐标点击
      if (!clickSuccess) {
        try {
          logger.info('🔄 方法3: 尝试坐标点击...');
          const boundingBox = await elementHandle.boundingBox();
          if (boundingBox) {
            const x = boundingBox.x + boundingBox.width / 2;
            const y = boundingBox.y + boundingBox.height / 2;

            await page.mouse.move(x, y);
            await page.mouse.down();
            await page.mouse.up();

            clickSuccess = true;
            clickMethod = 'mouse.coordinates';
            logger.info('✅ 坐标点击执行成功');
          }
        } catch (error) {
          logger.warn(`坐标点击失败: ${error.message}`);
        }
      }

      // 方法4: 如果所有点击方法都失败，尝试直接导航到目标URL
      if (!clickSuccess && fallbackToNavigation && targetUrl) {
        try {
          logger.info('🔄 方法4: 尝试直接导航到目标URL...');
          await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout });
          clickSuccess = true;
          clickMethod = 'direct.navigation';
          logger.info('✅ 直接导航执行成功');
        } catch (error) {
          logger.warn(`直接导航失败: ${error.message}`);
        }
      }

      if (!clickSuccess) {
        return {
          success: false,
          error: 'all click methods failed',
          selector,
          targetUrl,
          isVisible,
          beforeUrl,
          afterUrl: beforeUrl,
          clickMethod: 'none'
        };
      }

      // 等待页面响应（使用顶层 Page 等待即可）
      logger.info(`⏳ 等待页面响应 ${waitAfter}ms...`);
      await page.waitForTimeout(waitAfter);

      // 检查导航结果
      const afterUrl = page.url();
      const afterTitle = await page.title().catch(() => '');
      const urlChanged = afterUrl !== beforeUrl;
      const reachedTarget: urlChanged;

      logger.info(`点击后URL: ${afterUrl}` = targetUrl ? afterUrl === targetUrl );
      logger.info(`URL是否改变: ${urlChanged}`);
      logger.info(`是否到达目标: ${reachedTarget}`);

      // 分析新页面内容
      let pageAnalysis = {};
      try {
        pageAnalysis = await page.evaluate(() => {
          const currentUrl = window.location.href;
          const isMerchantPage = currentUrl.includes('1688.com') &&
            (currentUrl.includes('/offer/') ||
             currentUrl.includes('/product/') ||
             currentUrl.includes('/detail/') ||
             currentUrl.includes('member_id='));

          const isSearchPage = currentUrl.includes('offer_search.htm');

          return {
            isMerchantPage,
            isSearchPage,
            hasProductTitle: !!document.querySelector('h1, .product-title, [class*=title]'),
            hasProductImages: document.querySelectorAll('img[src*="1688.com"]:not([src*="placeholder"])').length > 0,
            hasPriceInfo: !!document.querySelector('[class*=price], .price, [data-price]'),
            hasContactInfo: !!document.querySelector('[class*=contact], [class*=phone], [class*=tel]'),
            hasCompanyInfo: !!document.querySelector('[class*=company], [class*=shop]'),
            hasChatButton: !!document.querySelector('[class*=chat], [class*=contact], [class*=talk]'),
            pageTitle: document.title,
            pageUrl: currentUrl
          };
        });
      } catch (error) {
        logger.warn(`页面分析失败: ${error.message}`);
      }

      // 计算成功率
      let successScore = 0;

      // 基础分：点击方法成功执行
      if (clickSuccess && clickMethod) {
        successScore += 3; // 点击成功给基础分
      }

      // 导航效果加分
      if (urlChanged) successScore += 2;
      if (pageAnalysis.isMerchantPage) successScore += 3;
      if (reachedTarget) successScore += 2;

      // 页面内容分析加分
      if (pageAnalysis.hasProductTitle) successScore += 1;
      if (pageAnalysis.hasProductImages) successScore += 1;
      if (pageAnalysis.hasPriceInfo) successScore += 1;

      const reallySuccessful = successScore >= 3; // 点击成功即可

      // 记录行为
      engine?.recordBehavior?.('playwright_click', {
        selector,
        targetUrl,
        clickMethod,
        urlChanged,
        reachedTarget,
        successScore,
        isVisible,
        beforeUrl,
        afterUrl
      });

      const result: new Date( = {
        success: reallySuccessful,
        action: reallySuccessful ? 'click_success' : 'click_partial',
        selector,
        targetUrl,
        clickMethod,
        isVisible,
        beforeUrl,
        afterUrl,
        urlChanged,
        reachedTarget,
        pageAnalysis,
        successScore,
        maxScore: 10,
        waitAfter,
        timeout,
        timestamp).toISOString()
      };

      logger.info(`🎉 Playwright点击完成！方法: ${clickMethod}, 成功率: ${successScore}/10, 结果: ${result.action}`);

      return result;

    } catch (error) {
      logger.error('❌ Playwright点击失败: ' + (error?.message || error));
      return {
        success: false,
        error: error?.message || String(error),
        selector,
        targetUrl,
        timestamp: new Date().toISOString()
      };
    }
  }

  getConfigSchema() {
    return {
      type: 'object',
      required: ['selector'],
      properties: {
        selector: {
          type: 'string',
          description: '目标元素的CSS选择器'
        },
        targetUrl: {
          type: 'string',
          description: '期望导航到的目标URL（可选）'
        },
        waitAfter: {
          type: 'number',
          description: '点击后等待时间（毫秒）',
          default: 3000
        },
        timeout: {
          type: 'number',
          description: '点击超时时间（毫秒）',
          default: 10000
        },
        highlight: {
          type: 'boolean',
          description: '是否高亮显示目标元素',
          default: true
        },
        fallbackToNavigation: {
          type: 'boolean',
          description: '点击失败时是否尝试直接导航',
          default: true
        }
      }
    };
  }
}
