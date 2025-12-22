// 高级点击节点：提供多种点击方式和智能策略选择
import BaseNode from './BaseNode';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// 简单容器库解析器：从 container-library.json 按站点解析容器选择器
function resolveContainerSelectorFromLibrary(pageUrl, containerName, websiteHint = null) {
  try {
    const libPath = join(process.cwd(), 'container-library.json');
    if (!existsSync(libPath)) return null;
    const lib = JSON.parse(readFileSync(libPath, 'utf8'));

    // 推断站点键
    let siteKey = null;
    const url = new URL(pageUrl);
    const host = url.hostname || '';

    if (websiteHint && lib[websiteHint]) {
      siteKey = websiteHint;
    } else {
      for (const key of Object.keys(lib)) {
        const site = lib[key];
        if (site?.website && host.includes(site.website)) {
          siteKey = key;
          break;
        }
      }
      if (!siteKey) {
        const keys = Object.keys(lib);
        if (keys.length === 1) siteKey = keys[0];
      }
    }

    if (!siteKey) return null;
    const containers = lib[siteKey]?.containers || {};
    const entry = containers[containerName];
    if (entry?.selector) return entry.selector;
  } catch {}
  return null;
}

// 选择 frame：支持 selector / urlPattern / urlIncludes / name / index
function resolveTargetFrame(page, frameCfg = {}) {
  try {
    const frames = page.frames();
    if (!frameCfg || typeof frameCfg !== 'object' || frames.length === 0) return null;

    // 1) urlPattern（正则字符串）
    if (frameCfg.urlPattern) {
      try {
        const re = new RegExp(frameCfg.urlPattern);
        const match = frames.find(fr => re.test(fr.url()));
        if (match) return match;
      } catch {}
    }

    // 2) urlIncludes（子串）
    if (frameCfg.urlIncludes) {
      const match = frames.find(fr => fr.url().includes(frameCfg.urlIncludes));
      if (match) return match;
    }

    // 3) name 精确匹配
    if (frameCfg.name) {
      const match = frames.find(fr => fr.name && fr.name() === frameCfg.name);
      if (match) return match;
    }

    // 4) index（顺序）
    if (typeof frameCfg.index === 'number' && frames[frameCfg.index]) {
      return frames[frameCfg.index];
    }
  } catch {}
  return null;
}

export default class AdvancedClickNode extends BaseNode {
    constructor(nodeId: string, config: any) {
        super(nodeId, config);

  constructor(nodeId: string, config: any) {
    super();
    this.name = 'AdvancedClickNode';
    this.description = '高级点击节点，支持多种点击方式和智能策略选择';

    // 配置预设系统
    this.configPresets = {
      // 快速点击预设：适用于简单链接和按钮
      'fast': {
        strategy: 'auto',
        clickMethods: ['playwright_click', 'javascript_click'],
        maxRetries: 1,
        retryDelay: 500,
        waitAfter: 1000,
        timeout: 5000,
        verifyNavigation: false,
        highlightElement: false,
        logLevel: 'warn'
      },

      // 标准点击预设：适用于大多数情况
      'standard': {
        strategy: 'auto',
        clickMethods: ['playwright_click', 'javascript_click', 'mouse_coordinates'],
        maxRetries: 2,
        retryDelay: 800,
        waitAfter: 2000,
        timeout: 8000,
        verifyNavigation: true,
        highlightElement: true,
        highlightDuration: 1500,
        logLevel: 'info'
      },

      // 彻底点击预设：适用于复杂页面和困难元素
      'thorough': {
        strategy: 'sequential',
        clickMethods: ['playwright_click', 'javascript_click', 'mouse_coordinates', 'keyboard_navigation', 'event_simulation', 'hybrid_approach'],
        maxRetries: 3,
        retryDelay: 1200,
        waitAfter: 3000,
        timeout: 12000,
        verifyNavigation: true,
        navigationTimeout: 8000,
        highlightElement: true,
        highlightDuration: 2000,
        scrollIntoView: true,
        verifyVisibility: true,
        fallbackToNavigation: true,
        saveDebugInfo: true,
        logLevel: 'debug'
      },

      // 安全点击预设：适用于反检测要求高的场景
      'stealth': {
        strategy: 'prefer_mouse',
        clickMethods: ['mouse_coordinates', 'event_simulation', 'hybrid_approach'],
        maxRetries: 1,
        retryDelay: 2000,
        waitAfter: 4000,
        timeout: 15000,
        verifyNavigation: true,
        highlightElement: false,
        scrollIntoView: true,
        verifyVisibility: true,
        saveDebugInfo: true,
        logLevel: 'debug'
      },

      // 导航专用预设：专门用于页面跳转
      'navigation': {
        strategy: 'prefer_navigation',
        clickMethods: ['playwright_click', 'direct_navigation'],
        maxRetries: 2,
        retryDelay: 1000,
        waitAfter: 5000,
        timeout: 15000,
        verifyNavigation: true,
        navigationTimeout: 10000,
        expectedUrlPattern: '.*',
        highlightElement: false,
        logLevel: 'info'
      },

      // 表单提交预设：专门用于表单操作
      'form': {
        strategy: 'prefer_js',
        clickMethods: ['form_submit', 'javascript_click', 'playwright_click'],
        maxRetries: 2,
        retryDelay: 800,
        waitAfter: 3000,
        timeout: 10000,
        verifyNavigation: true,
        highlightElement: true,
        scrollIntoView: true,
        verifyVisibility: true,
        logLevel: 'info'
      },

      // 1688专用预设：针对1688网站优化
      '1688': {
        strategy: 'sequential',
        clickMethods: ['javascript_click', 'event_simulation', 'mouse_coordinates', 'playwright_click'],
        maxRetries: 3,
        retryDelay: 1500,
        waitAfter: 4000,
        timeout: 15000,
        verifyNavigation: true,
        navigationTimeout: 12000,
        expectedUrlPattern: '.*1688\\.com.*',
        highlightElement: true,
        highlightDuration: 1000,
        scrollIntoView: true,
        verifyVisibility: true,
        fallbackToNavigation: false,
        saveDebugInfo: true,
        logLevel: 'info'
      },

      // 百度专用预设：针对百度网站优化
      'baidu': {
        strategy: 'auto',
        clickMethods: ['playwright_click', 'javascript_click', 'mouse_coordinates'],
        maxRetries: 2,
        retryDelay: 800,
        waitAfter: 2000,
        timeout: 8000,
        verifyNavigation: true,
        highlightElement: true,
        highlightDuration: 1200,
        logLevel: 'info'
      }
    };
  }

  validateConfig(config, logger) {
    const errors = [];
    const warnings = [];

    // 基础配置验证
    if (!config?.selector) {
      errors.push('缺少必需的选择器 (selector)');
    }

    // 预设验证
    if (config?.preset && !this.configPresets[config.preset]) {
      warnings.push(`未知的预设 "${config.preset}"，将使用标准预设`);
    }

    // 容器/Frame 配置提示
    if (config?.containerName && !config?.containerSelector && !config?.containerWebsite) {
      warnings.push('使用 containerName 但未提供 containerWebsite，系统将尝试根据当前 URL 推断');
    }
    if (config?.frame && typeof config.frame !== 'object') {
      warnings.push('frame 配置应为对象，支持 urlPattern/urlIncludes/name/index 等');
    }

    // 策略验证
    const validStrategies = ['auto', 'sequential', 'parallel', 'prefer_playwright', 'prefer_js', 'prefer_mouse', 'prefer_navigation'];
    if (config?.strategy && !validStrategies.includes(config.strategy)) {
      warnings.push(`未知的策略 "${config.strategy}"，将使用自动策略`);
    }

    // 点击方法验证
    const validMethods = [
      'playwright_click', 'javascript_click', 'mouse_coordinates', 'keyboard_navigation',
      'direct_navigation', 'double_click', 'right_click', 'drag_drop', 'form_submit',
      'event_simulation', 'hybrid_approach'
    ];

    if (config?.clickMethods && Array.isArray(config.clickMethods)) {
      const invalidMethods = config.clickMethods.filter(method => !validMethods.includes(method));
      if (invalidMethods.length > 0) {
        warnings.push(`包含无效的点击方法: ${invalidMethods.join(', ')}`);
      }
    }

    // 数值范围验证
    const numericFields = [
      { name: 'maxRetries', min: 1, max: 10, default: 2 },
      { name: 'retryDelay', min: 100, max: 10000, default: 1000 },
      { name: 'waitAfter', min: 0, max: 30000, default: 2000 },
      { name: 'timeout', min: 1000, max: 60000, default: 8000 },
      { name: 'highlightDuration', min: 500, max: 10000, default: 2000 }
    ];

    for (const field of numericFields) {
      const value = config?.[field.name];
      if (typeof value === 'number' && (value < field.min || value > field.max)) {
        warnings.push(`${field.name} 值 ${value} 超出推荐范围 [${field.min}, ${field.max}]`);
      }
    }

    // URL模式验证
    if (config?.expectedUrlPattern) {
      try {
        new RegExp(config.expectedUrlPattern);
      } catch (error) {
        errors.push(`无效的URL模式正则表达式: ${config.expectedUrlPattern}`);
      }
    }

    // 记录验证结果
    if (errors.length > 0) {
      logger.error(`❌ 配置验证失败: ${errors.join(', ')}`);
    }

    if (warnings.length > 0) {
      logger.warn(`⚠️ 配置警告: ${warnings.join(', ')}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  applyConfigPreset(config, logger) {
    // 首先验证配置
    const validation = this.validateConfig(config, logger);
    if (!validation.valid) {
      logger.error('配置验证失败，使用默认安全配置');
      config = { preset: 'standard', selector: config?.selector };
    }

    // 获取预设名称
    const presetName = config?.preset || 'standard';

    // 检查预设是否存在
    const preset = this.configPresets[presetName];
    if (!preset) {
      logger.warn(`⚠️ 未找到预设 "${presetName}"，使用默认标准预设`);
      return this.configPresets.standard;
    }

    // 复制预设配置
    const clickConfig = { ...preset };

    // 覆盖预设配置（用户自定义配置优先）
    const overrideKeys = [
      'strategy', 'clickMethods', 'maxRetries', 'retryDelay', 'waitAfter', 'timeout',
      'verifyNavigation', 'navigationTimeout', 'expectedUrlPattern', 'highlightElement',
      'highlightDuration', 'scrollIntoView', 'verifyVisibility', 'fallbackToNavigation',
      'saveDebugInfo', 'takeScreenshots', 'logLevel', 'dragOffsetX', 'dragOffsetY',
      // 新增：容器 & Frame 支持
      'containerSelector', 'containerName', 'containerWebsite', 'frame'
    ];

    for (const key of overrideKeys) {
      if (config && Object.prototype.hasOwnProperty.call(config, key)) {
        clickConfig[key] = config[key];
      }
    }

    // 智能配置优化
    const optimizedConfig = this.optimizeConfig(clickConfig, logger);

    logger.info(`✅ 应用预设 "${presetName}"，配置项: ${Object.keys(optimizedConfig).length}个`);

    return optimizedConfig;
  }

  optimizeConfig(config, logger) {
    // 根据环境和条件智能优化配置
    const optimizedConfig = { ...config };

    // 如果没有指定点击方法，根据策略推断最佳方法
    if (!optimizedConfig.clickMethods || optimizedConfig.clickMethods.length === 0) {
      optimizedConfig.clickMethods = this.getDefaultMethodsForStrategy(optimizedConfig.strategy);
      logger.info(`🔧 根据策略 ${optimizedConfig.strategy} 自动选择点击方法: ${optimizedConfig.clickMethods.join(', ')}`);
    }

    // 如果配置了拖拽但没有偏移量，设置默认偏移
    if (optimizedConfig.clickMethods.includes('drag_drop') &&
        (!optimizedConfig.dragOffsetX && !optimizedConfig.dragOffsetY)) {
      optimizedConfig.dragOffsetX = 100;
      optimizedConfig.dragOffsetY = 0;
      logger.info('🔧 为拖拽操作设置默认偏移量');
    }

    // 如果是表单操作但没有导航验证，自动启用
    if (optimizedConfig.clickMethods.includes('form_submit') && !optimizedConfig.verifyNavigation) {
      optimizedConfig.verifyNavigation = true;
      logger.info('🔧 表单提交操作自动启用导航验证');
    }

    // 调整超时时间：如果等待时间很长，适当增加超时时间
    if (optimizedConfig.waitAfter > 5000 && optimizedConfig.timeout < optimizedConfig.waitAfter * 2) {
      optimizedConfig.timeout = Math.max(optimizedConfig.timeout, optimizedConfig.waitAfter * 2);
      logger.info(`🔧 根据等待时间调整超时为 ${optimizedConfig.timeout}ms`);
    }

    return optimizedConfig;
  }

  getDefaultMethodsForStrategy(strategy) {
    const strategyDefaults = {
      'auto': ['playwright_click', 'javascript_click', 'mouse_coordinates'],
      'sequential': ['playwright_click', 'javascript_click', 'mouse_coordinates'],
      'parallel': ['playwright_click', 'javascript_click', 'mouse_coordinates'],
      'prefer_playwright': ['playwright_click', 'javascript_click', 'mouse_coordinates'],
      'prefer_js': ['javascript_click', 'playwright_click', 'mouse_coordinates'],
      'prefer_mouse': ['mouse_coordinates', 'event_simulation', 'playwright_click'],
      'prefer_navigation': ['direct_navigation', 'playwright_click']
    };

    return strategyDefaults[strategy] || strategyDefaults['auto'];
  }

  async execute(context: any, params: any): Promise<any> {
    const { page, logger, config, engine, results } = context;
    if (!page) return { success: false, error: 'no page available' };

    // 处理变量替换
    let selector = config?.selector;
    let targetUrl = config?.targetUrl;

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

    // 应用配置预设
    const clickConfig = this.applyConfigPreset(config, logger);

    // 设置基础配置
    clickConfig.selector = selector;
    clickConfig.targetUrl = targetUrl;

    // 覆盖配置预设中的基础值
    if (config?.preset) {
      logger.info(`🔧 使用配置预设: ${config.preset}`);
    }

    if (!selector) {
      return { success: false, error: 'no selector provided' };
    }

    try {
      logger.info(`🎯 开始执行高级点击: ${selector}`);
      logger.info(`📋 使用策略: ${clickConfig.strategy}, 点击方法: ${clickConfig.clickMethods.join(', ')}`);

      // 容器解析：containerSelector > containerName
      let containerSelector = clickConfig.containerSelector || null;
      if (!containerSelector && clickConfig.containerName) {
        const resolved = resolveContainerSelectorFromLibrary(page.url(), clickConfig.containerName, clickConfig.containerWebsite);
        if (resolved) {
          containerSelector = resolved;
          logger.info(`📦 容器解析: ${clickConfig.containerName} -> ${containerSelector}`);
        } else {
          logger.warn(`⚠️ 无法解析容器名称 ${clickConfig.containerName}，继续不限定容器`);
        }
      }

      // Frame 解析
      let targetFrame = null;
      if (clickConfig.frame) {
        targetFrame = resolveTargetFrame(page, clickConfig.frame);
        if (targetFrame) {
          logger.info(`🖼️ 使用目标 Frame: ${targetFrame.url()}`);
        } else {
          logger.warn('⚠️ 未找到匹配 Frame，继续使用主页面');
        }
      }

      // 记录初始状态（导航验证需看顶层 Page）
      const initialState = await this.capturePageState(page, 'before');
      logger.info(`📊 初始URL: ${initialState.url}`);

      // 查找目标元素（支持容器/Frame）
      const elementInfo = await this.findElement(targetFrame || page, selector, clickConfig, logger, containerSelector, page);
      if (!elementInfo.found) {
        return {
          success: false,
          error: `element not found: ${selector}`,
          selector,
          initialState
        };
      }

      logger.info(`✅ 找到元素，可见性: ${elementInfo.isVisible}`);

      // 高亮元素（如果配置）
      if (clickConfig.highlightElement) {
        await this.highlightElement(page, elementInfo.element, clickConfig);
      }

      // 根据策略执行点击
      const clickResult = await this.executeClickStrategy(
        page,
        elementInfo,
        clickConfig,
        logger
      );

      if (!clickResult.success) {
        return {
          success: false,
          error: clickResult && clickResult.error ? clickResult.error : '点击失败',
          selector,
          initialState,
          clickResult
        };
      }

      // 等待页面响应
      if (clickConfig.waitAfter > 0) {
        logger.info(`⏳ 等待页面响应 ${clickConfig.waitAfter}ms...`);
        await page.waitForTimeout(clickConfig.waitAfter);
      }

      // 验证导航结果（如果配置）
      const navigationResult = clickConfig.verifyNavigation ?
        await this.verifyNavigation(page, initialState, clickConfig, logger) :
        { verified: true, success: true };

      // 捕获最终状态（导航验证需看顶层 Page）
      const finalState = await this.capturePageState(page, 'after');

      // 计算综合成功率
      const successScore = this.calculateSuccessScore({
        clickResult,
        navigationResult,
        elementInfo,
        initialState,
        finalState,
        config: clickConfig
      });

      const reallySuccessful = successScore >= 5;

      // 记录行为
      engine?.recordBehavior?.('advanced_click', {
        selector,
        strategy: clickConfig.strategy,
        clickMethod: clickResult.method,
        retries: clickResult.retries,
        successScore,
        navigationVerified: navigationResult.verified,
        urlChanged: finalState.url !== initialState.url,
        initialState,
        finalState
      });

      const result = {
        success: reallySuccessful,
        action: reallySuccessful ? 'advanced_click_success' : 'advanced_click_partial',

        // 基础信息
        selector,
        targetUrl,
        strategy: clickConfig.strategy,

        // 点击结果
        clickResult,
        navigationResult,

        // 状态信息
        elementInfo,
        initialState,
        finalState,

        // 评分信息
        successScore,
        maxScore: 10,

        // 配置信息
        config: {
          clickMethods: clickConfig.clickMethods,
          maxRetries: clickConfig.maxRetries,
          verifyNavigation: clickConfig.verifyNavigation
        },

        timestamp: new Date().toISOString()
      };

      logger.info(`🎉 高级点击完成！方法: ${clickResult.method}, 重试: ${clickResult.retries}次, 成功率: ${successScore}/10, 结果: ${result.action}`);

      return result;

    } catch (error) {
      const errorMessage = error && typeof error === 'object' && error.message ? error.message : String(error);
      logger.error('❌ 高级点击失败: ' + errorMessage);
      return {
        success: false,
        error: errorMessage,
        selector,
        targetUrl,
        timestamp: new Date().toISOString()
      };
    }
  }

  async findElement(page, selector, config, logger, containerSelector = null, topPage = null) {
    try {
      logger.info(`🔍 查找元素: ${selector}${containerSelector ? ` (容器: ${containerSelector})` : ''}`);

      // 如果限定容器，先尝试找到容器（不作为硬性失败条件）
      let containerHandle = null;
      if (containerSelector) {
        try {
          containerHandle = await page.$(containerSelector);
          if (!containerHandle) {
            logger.warn(`⚠️ 未找到容器: ${containerSelector}`);
          } else {
            try {
              const visible = await containerHandle.isVisible();
              logger.debug(`📦 容器可见性: ${visible}`);
            } catch {}
          }
        } catch (ce) {
          logger.warn(`⚠️ 查找容器失败: ${typeof ce === 'object' ? ce.message : String(ce)}`);
        }
      }

      // 尝试多种查找策略
      const findStrategies = [
        // 策略1：直接查找
        () => (containerHandle ? containerHandle.$(selector) : page.$(selector)),

        // 策略2：等待元素出现后查找
        () => page.waitForSelector(containerSelector ? `${containerSelector} ${selector}` : selector, { timeout: (config && config.timeout) ? config.timeout / 2 : 4000 }),

        // 策略3：使用更宽松的选择器
        () => {
          const sel = `${selector}:not([style*="display: none"])`;
          return containerHandle ? containerHandle.$(sel) : page.$(sel);
        },

        // 策略4：通过CSS路径查找
        () => page.evaluate((sel) => {
          const element = document.querySelector(sel);
          return element ? true : false;
        }, containerSelector ? `${containerSelector} ${selector}` : selector)
        .then(exists => exists ? (containerHandle ? containerHandle.$(selector) : page.$(selector)) : null)
      ];

      let element = null;
      let lastError = null;

      for (let i = 0; i < findStrategies.length; i++) {
        try {
          logger.debug(`🔄 尝试查找策略 ${i + 1}/${findStrategies.length}`);
          element = await findStrategies[i]();

          if (element) {
            logger.info(`✅ 策略 ${i + 1} 成功找到元素`);
            break;
          }
        } catch (error) {
          const errorMessage = error && typeof error === 'object' && error.message ? error.message : String(error);
          lastError = errorMessage;
          logger.debug(`❌ 策略 ${i + 1} 失败: ${errorMessage}`);
        }
      }

      if (!element) {
        // 元素查找失败，尝试智能替代方案
        logger.warn(`⚠️ 主选择器失败，尝试智能替代方案`);
        element = await this.findAlternativeElement(page, containerSelector ? `${containerSelector} ${selector}` : selector, config, logger);
      }

      // 跨 Frame 兜底：若配置了 frame 或者调用方传入了 topPage，则在所有 frame 中再扫一遍
      if (!element && topPage) {
        try {
          const frames = topPage.frames();
          for (const fr of frames) {
            try {
              const el = await fr.$(containerSelector ? `${containerSelector} ${selector}` : selector);
              if (el) { element = el; logger.info(`🖼️ 在其他 Frame 找到元素: ${fr.url()}`); break; }
            } catch {}
          }
        } catch {}
      }

      if (!element) {
        logger.debug('🔍 元素未找到，开始生成替代选择器建议...');
        let alternatives = [];
        try {
          alternatives = await this.suggestAlternativeSelectors(page, containerSelector ? `${containerSelector} ${selector}` : selector, logger);
          logger.debug('✅ 替代选择器建议生成成功');
        } catch (suggestError) {
          const suggestErrorMessage = suggestError && typeof suggestError === 'object' && suggestError.message ? suggestError.message : String(suggestError);
          logger.warn(`⚠️ 替代选择器建议生成失败: ${suggestErrorMessage}`);
          alternatives = [];
        }

        return {
          found: false,
          error: `element not found: ${selector}. 最后错误: ${lastError || '未知错误'}`,
          selector,
          alternatives
        };
      }

      // 检查元素可见性
      let isVisible = false;
      try {
        isVisible = (config && config.verifyVisibility) ? await element.isVisible() : true;
        logger.debug(`👁️ 元素可见性: ${isVisible}`);
      } catch (error) {
        isVisible = false;
        const errorMessage = error && typeof error === 'object' && error.message ? error.message : String(error);
        logger.warn(`⚠️ 可见性检查失败: ${errorMessage}`);
      }

      // 滚动到元素位置
      if (config.scrollIntoView && isVisible) {
        try {
          await element.scrollIntoViewIfNeeded();
          logger.debug(`📜 元素已滚动到视图`);
        } catch (error) {
          const errorMessage = error && typeof error === 'object' && error.message ? error.message : String(error);
          logger.warn(`⚠️ 滚动失败: ${errorMessage}`);
        }
      }

      // 获取元素边界信息
      let boundingBox = null;
      try {
        boundingBox = await element.boundingBox();
        if (boundingBox) {
          logger.debug(`📐 元素边界: {x: ${boundingBox.x}, y: ${boundingBox.y}, width: ${boundingBox.width}, height: ${boundingBox.height}}`);
        }
      } catch (error) {
        const errorMessage = error && typeof error === 'object' && error.message ? error.message : String(error);
        logger.warn(`⚠️ 边界获取失败: ${errorMessage}`);
      }

      // 获取元素属性
      let elementAttributes = {};
      try {
        elementAttributes = await element.evaluate(el => ({
          tagName: el.tagName,
          className: el.className,
          id: el.id,
          href: el.href,
          title: el.title,
          text: el.textContent?.trim().substring(0, 50)
        }));
        logger.debug(`📝 元素属性: ${JSON.stringify(elementAttributes)}`);
      } catch (error) {
        const errorMessage = error && typeof error === 'object' && error.message ? error.message : String(error);
        logger.warn(`⚠️ 属性获取失败: ${errorMessage}`);
      }

      return {
        found: true,
        element,
        isVisible,
        boundingBox,
        selector,
        attributes: elementAttributes
      };

    } catch (error) {
      const errorMessage = error && typeof error === 'object' && error.message ? error.message : String(error);
      logger.error(`❌ 元素查找异常: ${errorMessage}`);
      return {
        found: false,
        error: errorMessage,
        selector,
        exception: true
      };
    }
  }

  async findAlternativeElement(page, originalSelector, config, logger) {
    try {
      // 智能选择器生成
      const alternatives = await page.evaluate((originalSel) => {
        const original = document.querySelector(originalSel);
        if (!original) return [];

        const alternatives = [];

        // 基于元素属性生成替代选择器
        if (original.className && typeof original.className === 'string') {
          const classes = original.className.split(' ').filter(c => c.trim());
          if (classes.length > 0) {
            alternatives.push(`.${classes.join('.')}`);
            alternatives.push(`${original.tagName.toLowerCase()}.${classes[0]}`);
          }
        }

        if (original.id && typeof original.id === 'string') {
          alternatives.push(`#${original.id}`);
        }

        if (original.href && typeof original.href === 'string') {
          alternatives.push(`a[href="${original.href}"]`);
        }

        if (original.textContent && typeof original.textContent === 'string') {
          const text = original.textContent.trim();
          if (text.length < 50) {
            alternatives.push(`${original.tagName.toLowerCase()}:contains("${text}")`);
          }
        }

        // 基于DOM结构生成选择器
        const parent = original.parentElement;
        if (parent && parent.tagName) {
          const siblings = Array.from(parent.children);
          const index = siblings.indexOf(original);
          if (index >= 0) {
            alternatives.push(`${parent.tagName.toLowerCase()}:nth-child(${index + 1})`);
          }
        }

        return alternatives.filter(alt => alt && alt !== originalSel);
      }, originalSelector);

      logger.info(`🔄 生成了 ${alternatives.length} 个替代选择器`);

      // 尝试每个替代选择器
      for (const altSelector of alternatives.slice(0, 3)) { // 最多尝试3个
        try {
          const element = await page.$(altSelector);
          if (element) {
            logger.info(`✅ 使用替代选择器: ${altSelector}`);
            return element;
          }
        } catch (error) {
          const errorMessage = error && typeof error === 'object' && error.message ? error.message : String(error);
          logger.debug(`❌ 替代选择器失败: ${altSelector} - ${errorMessage}`);
        }
      }

      return null;
    } catch (error) {
      const errorMessage = error && typeof error === 'object' && error.message ? error.message : String(error);
      logger.warn(`⚠️ 替代元素查找失败: ${errorMessage}`);
      return null;
    }
  }

  async suggestAlternativeSelectors(page, selector, logger) {
    try {
      const suggestions = await page.evaluate((sel) => {
        // 基于页面结构提供建议
        const allElements = document.querySelectorAll('*');
        const suggestions = [];

        // 查找相似的元素
        const original = document.querySelector(sel);
        if (original) {
          const tagName = original.tagName.toLowerCase();
          const similar = document.querySelectorAll(tagName);

          for (let i = 0; i < Math.min(5, similar.length); i++) {
            const element = similar[i];
            if (element === original) continue;

            if (element.className) {
              suggestions.push(`${tagName}.${element.className.split(' ')[0]}`);
            }

            if (element.id) {
              suggestions.push(`#${element.id}`);
            }
          }
        }

        // 常见选择器模式
        const commonPatterns = [
          'a[href]', 'button', 'input[type="submit"]', '.btn', '.link',
          'h1', 'h2', 'h3', '.title', '.content', '.item'
        ];

        for (const pattern of commonPatterns) {
          const elements = document.querySelectorAll(pattern);
          if (elements.length > 0 && elements.length < 20) {
            suggestions.push(pattern);
          }
        }

        return [...new Set(suggestions)].slice(0, 10);
      }, selector);

      logger.info(`💡 生成了 ${suggestions.length} 个选择器建议`);
      return suggestions;
    } catch (error) {
      const errorMessage = error && typeof error === 'object' && error.message ? error.message : String(error);
      logger.warn(`⚠️ 选择器建议生成失败: ${errorMessage}`);
      return [];
    }
  }

  async highlightElement(page, element, config) {
    try {
      await element.evaluate((el, duration) => {
        const originalStyle = el.style.cssText;
        el.style.border = '3px solid red';
        el.style.backgroundColor = 'yellow';
        el.style.boxShadow = '0 0 10px rgba(255,0,0,0.5)';
        el.__originalStyle = originalStyle;

        setTimeout(() => {
          if (el.__originalStyle) {
            el.style.cssText = el.__originalStyle;
            delete el.__originalStyle;
          }
        }, duration);
      }, config.highlightDuration);
    } catch (error) {
      // 忽略高亮错误
    }
  }

  async executeClickStrategy(page, elementInfo, config, logger) {
    const strategies = {
      auto: () => this.executeAutoStrategy(page, elementInfo, config, logger),
      sequential: () => this.executeSequentialStrategy(page, elementInfo, config, logger),
      parallel: () => this.executeParallelStrategy(page, elementInfo, config, logger),
      prefer_playwright: () => this.executePreferredStrategy(page, elementInfo, config, logger, 'playwright_click'),
      prefer_js: () => this.executePreferredStrategy(page, elementInfo, config, logger, 'javascript_click'),
      prefer_mouse: () => this.executePreferredStrategy(page, elementInfo, config, logger, 'mouse_coordinates'),
      prefer_navigation: () => this.executePreferredStrategy(page, elementInfo, config, logger, 'direct_navigation')
    };

    const strategyFunction = strategies[config.strategy] || strategies.auto;
    return await strategyFunction();
  }

  async executeAutoStrategy(page, elementInfo, config, logger) {
    // 自动策略：根据元素类型和状态选择最佳点击方法
    const { element, isVisible, boundingBox } = elementInfo;

    // 优先级顺序：Playwright点击 > JavaScript点击 > 鼠标点击 > 直接导航
    const methods = ['playwright_click', 'javascript_click', 'mouse_coordinates'];

    if (config.targetUrl && config.fallbackToNavigation) {
      methods.push('direct_navigation');
    }

    return await this.executeSequentialMethod(page, elementInfo, config, logger, methods);
  }

  async executeSequentialStrategy(page, elementInfo, config, logger) {
    return await this.executeSequentialMethod(page, elementInfo, config, logger, config.clickMethods);
  }

  async executeSequentialMethod(page, elementInfo, config, logger, methods) {
    let lastError = null;
    let totalRetries = 0;

    for (const method of methods) {
      logger.info(`🔄 尝试点击方法: ${method}`);

      for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
        try {
          totalRetries++;
          const result = await this.executeClickMethod(page, elementInfo, method, config);

          if (result.success) {
            logger.info(`✅ ${method} 成功 (尝试 ${attempt}/${config.maxRetries})`);
            return {
              success: true,
              method,
              attempts: attempt,
              retries: totalRetries - 1,
              result: result.result
            };
          } else {
            lastError = result && result.error ? result.error : '点击失败';
            logger.warn(`❌ ${method} 失败 (尝试 ${attempt}/${config.maxRetries}): ${lastError}`);
          }
        } catch (error) {
          const errorMessage = error && typeof error === 'object' && error.message ? error.message : String(error);
          lastError = errorMessage;
          logger.warn(`❌ ${method} 异常 (尝试 ${attempt}/${config.maxRetries}): ${errorMessage}`);
        }

        if (attempt < config.maxRetries) {
          await page.waitForTimeout(config.retryDelay);
        }
      }
    }

    return {
      success: false,
      error: `所有点击方法都失败了，最后错误: ${lastError}`,
      attempts: totalRetries,
      retries: totalRetries - 1
    };
  }

  async executeParallelStrategy(page, elementInfo, config, logger) {
    // 并行策略：同时尝试多种点击方法，使用第一个成功的结果
    const methods = config.clickMethods.slice(0, 3); // 限制并行数量
    const promises = methods.map(method =>
      this.executeClickMethod(page, elementInfo, method, config)
    );

    try {
      const results = await Promise.allSettled(promises);

      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        if (result.status === 'fulfilled' && result.value.success) {
          logger.info(`✅ 并行点击成功: ${methods[i]}`);
          return {
            success: true,
            method: methods[i],
            attempts: 1,
            retries: 0,
            result: result.value.result
          };
        }
      }

      // 所有方法都失败
      const errors = results.map((r, i) => ({
        method: methods[i],
        error: r.status === 'fulfilled' ? (r.value && r.value.error ? r.value.error : '失败') : (r.reason && typeof r.reason === 'object' && r.reason.message ? r.reason.message : '异常')
      }));

      return {
        success: false,
        error: `并行点击全部失败: ${errors.map(e => `${e.method}(${e && e.error ? e.error : '未知错误'})`).join(', ')}`,
        attempts: 1,
        retries: 0,
        parallelResults: errors
      };

    } catch (error) {
      return {
        success: false,
        error: `并行点击异常: ${error && typeof error === 'object' && error.message ? error.message : String(error)}`,
        attempts: 1,
        retries: 0
      };
    }
  }

  async executePreferredStrategy(page, elementInfo, config, logger, preferredMethod) {
    // 优先策略：首先尝试指定方法，失败后回退到其他方法
    const otherMethods = config.clickMethods.filter(m => m !== preferredMethod);
    const methods = [preferredMethod, ...otherMethods];

    return await this.executeSequentialMethod(page, elementInfo, config, logger, methods);
  }

  async executeClickMethod(page, elementInfo, method, config) {
    const { element, boundingBox } = elementInfo;

    switch (method) {
      case 'playwright_click':
        return await this.executePlaywrightClick(page, element, config);

      case 'javascript_click':
        return await this.executeJavaScriptClick(page, element, config);

      case 'mouse_coordinates':
        return await this.executeMouseClick(page, boundingBox, config, element);

      case 'keyboard_navigation':
        return await this.executeKeyboardNavigation(page, element, config);

      case 'direct_navigation':
        return await this.executeDirectNavigation(page, config.targetUrl, config);

      case 'double_click':
        return await this.executeDoubleClick(page, element, config);

      case 'right_click':
        return await this.executeRightClick(page, element, config);

      case 'drag_drop':
        return await this.executeDragDrop(page, element, config);

      case 'form_submit':
        return await this.executeFormSubmit(page, element, config);

      case 'event_simulation':
        return await this.executeEventSimulation(page, element, config);

      case 'hybrid_approach':
        return await this.executeHybridApproach(page, elementInfo, config);

      default:
        return { success: false, error: `未知的点击方法: ${method}` };
    }
  }

  async executePlaywrightClick(page, element, config) {
    try {
      await element.click({
        timeout: config.timeout,
        force: false
      });
      return { success: true, result: 'playwright_click_executed' };
    } catch (error) {
      return { success: false, error: error && typeof error === 'object' && error.message ? error.message : String(error) };
    }
  }

  async executeJavaScriptClick(page, element, config) {
    try {
      await element.evaluate((el) => el.click());
      return { success: true, result: 'javascript_click_executed' };
    } catch (error) {
      return { success: false, error: error && typeof error === 'object' && error.message ? error.message : String(error) };
    }
  }

  async executeMouseClick(page, boundingBox, config, element=null) {
    try {
      if (!boundingBox) {
        return { success: false, error: '无法获取元素边界信息' };
      }

      const offX = Number(config?.clickOffsetX || 0);
      const offY = Number(config?.clickOffsetY || 0);
      const steps = Number(config?.mouseMoveSteps || 10);
      const hoverMs = Number(config?.hoverMs || 50);

      // 可视化鼠标覆盖层（便于人工观察鼠标移动路径）
      if (config?.showCursorOverlay) {
        try { await this.ensureCursorOverlay(page, config, element); } catch {}
      }

      // 根据DOM内更小的可点击子节点计算更精确的点击点
      let targetPoint = null;
      if (config?.preferChildTarget && element) {
        try {
          targetPoint = await this.computeClickPoint(element, config);
        } catch {}
      }

      const x = targetPoint?.x ?? (boundingBox.x + (boundingBox.width / 2) + offX);
      const y = targetPoint?.y ?? (boundingBox.y + (boundingBox.height / 2) + offY);

      await page.mouse.move(x, y, { steps: Math.max(1, steps) });
      if (hoverMs > 0) { await page.waitForTimeout(hoverMs); }
      await page.mouse.down();
      await page.mouse.up();

      return { success: true, result: 'mouse_click_executed' };
    } catch (error) {
      return { success: false, error: error && typeof error === 'object' && error.message ? error.message : String(error) };
    }
  }

  async computeClickPoint(element, config) {
    try {
      const childSelectors = Array.isArray(config?.childSelectors) && config.childSelectors.length
        ? config.childSelectors
        : ['button[atype="send"]', '.im-chat-send-btn', '.send-btn', '.next-btn', 'button', '[role="button"]', 'a'];
      const textIncludes = Array.isArray(config?.childTextIncludes) && config.childTextIncludes.length
        ? config.childTextIncludes
        : ['发送','发','send'];

      const pt = await element.evaluate((el, selList, texts) => {
        const rect = el.getBoundingClientRect();
        // dataset 定位优先
        const dx = Number(el.getAttribute('data-webauto-click-x') || NaN);
        const dy = Number(el.getAttribute('data-webauto-click-y') || NaN);
        if (!Number.isNaN(dx) && !Number.isNaN(dy)) {
          return { x: rect.x + dx, y: rect.y + dy };
        }
        const vis = (n) => { const s = getComputedStyle(n); if (s.display==='none'||s.visibility==='hidden'||Number(s.opacity)===0) return false; const r=n.getBoundingClientRect(); return r.width>4 && r.height>4; };
        // 选最像“发送”的子节点
        for (const sel of selList) {
          const nodes = Array.from(el.querySelectorAll(sel));
          const scored = [];
          for (const n of nodes) {
            if (!vis(n)) continue;
            const t = (n.innerText||n.textContent||'').trim();
            const looks = texts.some(tx => t.includes(tx)) || /send/i.test(String(n.className||'')) || /send/i.test(n.getAttribute('title')||'');
            if (!looks) continue;
            const r = n.getBoundingClientRect();
            const score = (r.width*r.height) + (r.y > (innerHeight-200) ? 2000 : 0) + (r.x > innerWidth/2 ? 1000 : 0);
            scored.push({ r, score });
          }
          if (scored.length) {
            scored.sort((a,b)=>b.score-a.score);
            const best = scored[0].r;
            return { x: best.x + best.width/2, y: best.y + best.height/2 };
          }
        }
        // 退回到元素自身中心
        return { x: rect.x + rect.width/2, y: rect.y + rect.height/2 };
      }, childSelectors, textIncludes);
      return pt;
    } catch {
      return null;
    }
  }

  async ensureCursorOverlay(page, config, element=null) {
    const color = config?.cursorColor || '#ff2d55';
    try {
      let target = page;
      try { if (element && element.ownerFrame) { const fr = await element.ownerFrame(); if (fr) target = fr; } } catch {}
      await target.evaluate((c) => {
        if (window.__webauto_cursor_ready__) return;
        const style = document.createElement('style');
        style.textContent = `
          .__webauto_cursor_dot__{position:fixed;width:14px;height:14px;border-radius:50%;background:${c};
          box-shadow:0 0 10px rgba(0,0,0,0.25);transform:translate(-50%,-50%);z-index:2147483647;pointer-events:none;transition:opacity .15s ease}
        `;
        document.head.appendChild(style);
        const dot = document.createElement('div');
        dot.className = '__webauto_cursor_dot__';
        dot.style.left = '8px'; dot.style.top = '8px';
        document.body.appendChild(dot);
        function move(e){ dot.style.left = (e.clientX||0)+'px'; dot.style.top = (e.clientY||0)+'px'; }
        function down(){ dot.style.opacity = '0.6'; dot.style.transform = 'translate(-50%,-50%) scale(0.9)'; }
        function up(){ dot.style.opacity = '1'; dot.style.transform = 'translate(-50%,-50%) scale(1)'; }
        window.addEventListener('mousemove', move, true);
        window.addEventListener('mousedown', down, true);
        window.addEventListener('mouseup', up, true);
        window.__webauto_cursor_ready__ = true;
      }, color);
    } catch {}
  }

  async executeKeyboardNavigation(page, element, config) {
    try {
      await element.evaluate((el) => el.focus());
      await page.keyboard.press('Enter');
      return { success: true, result: 'keyboard_navigation_executed' };
    } catch (error) {
      return { success: false, error: error && typeof error === 'object' && error.message ? error.message : String(error) };
    }
  }

  async executeDirectNavigation(page, targetUrl, config) {
    try {
      if (!targetUrl) {
        return { success: false, error: '没有目标URL用于直接导航' };
      }

      await page.goto(targetUrl, {
        waitUntil: 'domcontentloaded',
        timeout: config.timeout
      });
      return { success: true, result: 'direct_navigation_executed' };
    } catch (error) {
      return { success: false, error: error && typeof error === 'object' && error.message ? error.message : String(error) };
    }
  }

  async executeDoubleClick(page, element, config) {
    try {
      await element.dblclick({
        timeout: config.timeout,
        force: false
      });
      return { success: true, result: 'double_click_executed' };
    } catch (error) {
      return { success: false, error: error && typeof error === 'object' && error.message ? error.message : String(error) };
    }
  }

  async executeRightClick(page, element, config) {
    try {
      await element.click({
        button: 'right',
        timeout: config.timeout,
        force: false
      });
      return { success: true, result: 'right_click_executed' };
    } catch (error) {
      return { success: false, error: error && typeof error === 'object' && error.message ? error.message : String(error) };
    }
  }

  async executeDragDrop(page, element, config) {
    try {
      const boundingBox = await element.boundingBox();
      if (!boundingBox) {
        return { success: false, error: '无法获取元素边界信息进行拖拽' };
      }

      const startX = boundingBox.x + boundingBox.width / 2;
      const startY = boundingBox.y + boundingBox.height / 2;
      const endX = startX + (config.dragOffsetX || 100);
      const endY = startY + (config.dragOffsetY || 0);

      await page.mouse.move(startX, startY);
      await page.mouse.down();
      await page.mouse.move(endX, endY, { steps: 10 });
      await page.mouse.up();

      return { success: true, result: 'drag_drop_executed' };
    } catch (error) {
      return { success: false, error: error && typeof error === 'object' && error.message ? error.message : String(error) };
    }
  }

  async executeFormSubmit(page, element, config) {
    try {
      // 尝试找到所属表单并提交
      const form = await element.evaluate((el) => {
        let parent = el.closest('form');
        if (parent) return parent;

        // 如果没有form父元素，查找相邻的submit按钮
        const submitBtn = el.parentElement?.querySelector('input[type="submit"], button[type="submit"]');
        return submitBtn || null;
      });

      if (form && (await form.isVisible()).catch(() => true)) {
        if (form.tagName === 'FORM') {
          await form.evaluate((f) => f.submit());
        } else {
          await form.click();
        }
        return { success: true, result: 'form_submit_executed' };
      } else {
        // 回退到普通点击
        await element.click();
        return { success: true, result: 'form_submit_fallback_to_click' };
      }
    } catch (error) {
      return { success: false, error: error && typeof error === 'object' && error.message ? error.message : String(error) };
    }
  }

  async executeEventSimulation(page, element, config) {
    try {
      // 模拟完整的鼠标事件序列
      await element.evaluate((el) => {
        const events = [
          new MouseEvent('mouseenter', { bubbles: true, cancelable: true }),
          new MouseEvent('mouseover', { bubbles: true, cancelable: true }),
          new MouseEvent('mousedown', { bubbles: true, cancelable: true }),
          new MouseEvent('mouseup', { bubbles: true, cancelable: true }),
          new MouseEvent('click', { bubbles: true, cancelable: true }),
          new MouseEvent('mouseout', { bubbles: true, cancelable: true })
        ];

        events.forEach(event => el.dispatchEvent(event));
      });

      return { success: true, result: 'event_simulation_executed' };
    } catch (error) {
      return { success: false, error: error && typeof error === 'object' && error.message ? error.message : String(error) };
    }
  }

  async executeHybridApproach(page, elementInfo, config) {
    try {
      const { element, boundingBox } = elementInfo;

      // 混合方法：结合多种技术确保点击成功
      const steps = [];

      // 1. 先尝试hover元素
      if (boundingBox) {
        const x = boundingBox.x + boundingBox.width / 2;
        const y = boundingBox.y + boundingBox.height / 2;

        steps.push(
          () => page.mouse.move(x, y),
          () => page.waitForTimeout(100)
        );
      }

      // 2. 触发hover事件
      steps.push(
        () => element.evaluate((el) => {
          el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
        })
      );

      // 3. 确保元素可见和聚焦
      steps.push(
        () => element.scrollIntoViewIfNeeded(),
        () => element.evaluate((el) => el.focus())
      );

      // 4. 执行点击
      steps.push(
        () => element.click({ force: false })
      );

      // 5. 确认点击生效
      steps.push(
        () => element.evaluate((el) => {
          el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
          el.dispatchEvent(new Event('click', { bubbles: true }));
        })
      );

      // 依次执行所有步骤
      for (const step of steps) {
        await step();
        await page.waitForTimeout(50); // 短暂延迟确保每个步骤完成
      }

      return { success: true, result: 'hybrid_approach_executed' };
    } catch (error) {
      return { success: false, error: error && typeof error === 'object' && error.message ? error.message : String(error) };
    }
  }

  async capturePageState(page, phase) {
    try {
      const url = page.url();
      const title = await page.title().catch(() => '');

      return {
        phase,
        url,
        title,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        phase,
        url: 'unknown',
        title: 'unknown',
        timestamp: new Date().toISOString(),
        error: error && typeof error === 'object' && error.message ? error.message : String(error)
      };
    }
  }

  async verifyNavigation(page, initialState, config, logger) {
    try {
      const currentState = await this.capturePageState(page, 'verification');
      const urlChanged = currentState.url !== initialState.url;
      const reachedTarget = config.targetUrl ? currentState.url === config.targetUrl : urlChanged;

      // 检查URL模式匹配
      let urlPatternMatched = false;
      if (config.expectedUrlPattern) {
        const pattern = new RegExp(config.expectedUrlPattern);
        urlPatternMatched = pattern.test(currentState.url);
      }

      // 分析页面内容
      const pageAnalysis = await this.analyzePageContent(page);

      const verificationResult = {
        verified: true,
        success: urlChanged || reachedTarget || urlPatternMatched,
        urlChanged,
        reachedTarget,
        urlPatternMatched,
        pageAnalysis,
        currentState,
        initialState
      };

      logger.info(`🔍 导航验证: URL改变=${urlChanged}, 到达目标=${reachedTarget}, 模式匹配=${urlPatternMatched}`);

      return verificationResult;

    } catch (error) {
      const errorMessage = error && typeof error === 'object' && error.message ? error.message : String(error);
      logger.warn(`导航验证失败: ${errorMessage}`);
      return {
        verified: false,
        success: false,
        error: errorMessage
      };
    }
  }

  async analyzePageContent(page) {
    try {
      return await page.evaluate(() => {
        const currentUrl = window.location.href;

        return {
          isMerchantPage: currentUrl.includes('1688.com') && (
            currentUrl.includes('/offer/') ||
            currentUrl.includes('/product/') ||
            currentUrl.includes('/detail/') ||
            currentUrl.includes('member_id=')
          ),
          hasProductTitle: !!document.querySelector('h1, .product-title, [class*=title]'),
          hasProductImages: document.querySelectorAll('img[src*="1688.com"]:not([src*="placeholder"])').length > 0,
          hasPriceInfo: !!document.querySelector('[class*=price], .price, [data-price]'),
          hasContactInfo: !!document.querySelector('[class*=contact], [class*=phone], [class*=tel]'),
          hasCompanyInfo: !!document.querySelector('[class*=company], [class*=shop]'),
          hasChatButton: !!document.querySelector('[class*=chat], [class*=contact], [class*=talk]'),
          pageTitle: document.title
        };
      });
    } catch (error) {
      return { error: error && typeof error === 'object' && error.message ? error.message : String(error) };
    }
  }

  calculateSuccessScore(data) {
    let score = 0;
    const { clickResult, navigationResult, elementInfo, finalState, config } = data;

    // 基础分：点击成功执行
    if (clickResult && clickResult.success) {
      score += 4; // 点击成功是基础
    }

    // 导航效果加分
    if (navigationResult && navigationResult.urlChanged) score += 2;
    if (navigationResult && navigationResult.reachedTarget) score += 2;
    if (navigationResult && navigationResult.urlPatternMatched) score += 1;

    // 元素状态加分
    if (elementInfo && elementInfo.isVisible) score += 1;

    // 页面内容分析加分
    if (navigationResult && navigationResult.pageAnalysis) {
      const analysis = navigationResult.pageAnalysis;
      if (analysis.isMerchantPage) score += 1;
      if (analysis.hasProductTitle) score += 1;
      if (analysis.hasProductImages) score += 1;
    }

    // 重试惩罚（重试太多扣分）
    if (clickResult && clickResult.retries > 2) {
      score = Math.max(0, score - 1);
    }

    return Math.min(10, score);
  }

  getConfigSchema() {
    return {
      type: 'object',
      required: ['selector'],
      properties: {
        preset: {
          type: 'string',
          enum: ['fast', 'standard', 'thorough', 'stealth', 'navigation', 'form', '1688', 'baidu'],
          description: '配置预设名称',
          default: 'standard'
        },
        selector: {
          type: 'string',
          description: '目标元素的CSS选择器'
        },
        targetUrl: {
          type: 'string',
          description: '期望导航到的目标URL（可选）'
        },
        strategy: {
          type: 'string',
          enum: ['auto', 'sequential', 'parallel', 'prefer_playwright', 'prefer_js', 'prefer_mouse', 'prefer_navigation'],
          description: '点击策略',
          default: 'auto'
        },
        clickMethods: {
          type: 'array',
          items: { type: 'string' },
          description: '可用的点击方法列表',
          default: ['playwright_click', 'javascript_click', 'mouse_coordinates', 'direct_navigation']
        },
        maxRetries: {
          type: 'number',
          description: '每个方法的最大重试次数',
          default: 3
        },
        retryDelay: {
          type: 'number',
          description: '重试间隔（毫秒）',
          default: 1000
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
        verifyVisibility: {
          type: 'boolean',
          description: '是否验证元素可见性',
          default: true
        },
        scrollIntoView: {
          type: 'boolean',
          description: '是否滚动元素到视图',
          default: true
        },
        highlight: {
          type: 'boolean',
          description: '是否高亮显示目标元素',
          default: true
        },
        highlightDuration: {
          type: 'number',
          description: '高亮持续时间（毫秒）',
          default: 2000
        },
        verifyNavigation: {
          type: 'boolean',
          description: '是否验证导航结果',
          default: true
        },
        navigationTimeout: {
          type: 'number',
          description: '导航验证超时时间（毫秒）',
          default: 10000
        },
        expectedUrlPattern: {
          type: 'string',
          description: '期望的URL模式（正则表达式）'
        },
        fallbackToNavigation: {
          type: 'boolean',
          description: '点击失败时是否尝试直接导航',
          default: true
        },
        saveDebugInfo: {
          type: 'boolean',
          description: '是否保存调试信息',
          default: false
        },
        takeScreenshots: {
          type: 'boolean',
          description: '是否截取屏幕截图',
          default: false
        },
        preferChildTarget: { type: 'boolean', description: '点击前优先定位到子按钮', default: true },
        childSelectors: { type: 'array', items: { type: 'string' }, description: '子按钮候选选择器' },
        childTextIncludes: { type: 'array', items: { type: 'string' }, description: '子按钮文本包含' },
        clickOffsetX: { type: 'number', description: '鼠标点击X偏移', default: 0 },
        clickOffsetY: { type: 'number', description: '鼠标点击Y偏移', default: 0 },
        mouseMoveSteps: { type: 'number', description: '鼠标移动步数(越大越平滑)', default: 10 },
        hoverMs: { type: 'number', description: '落点悬停毫秒数', default: 50 },
        showCursorOverlay: { type: 'boolean', description: '是否显示可视化鼠标点', default: false },
        cursorColor: { type: 'string', description: '可视化鼠标颜色', default: '#ff2d55' },
        logLevel: {
          type: 'string',
          enum: ['debug', 'info', 'warn', 'error'],
          description: '日志级别',
          default: 'info'
        }
      }
    };
  }
}
