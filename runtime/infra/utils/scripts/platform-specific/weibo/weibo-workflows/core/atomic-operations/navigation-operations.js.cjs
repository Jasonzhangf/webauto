/**
 * 导航相关原子操作
 */

const BaseAtomicOperation = require('./base-atomic-operation.js.cjs');

/**
 * 页面导航操作
 */
class NavigateOperation extends BaseAtomicOperation {
  constructor(config = {}) {
    super({
      name: 'navigate',
      type: 'navigation',
      description: '导航到指定URL',
      ...config
    });
  }

  validateParams(params) {
    const errors = [];
    if (!params.url) {
      errors.push('缺少必需参数: url');
    }
    return { valid: errors.length === 0, errors };
  }

  async execute(context, params) {
    const { url, waitUntil = 'networkidle', timeout = this.config.timeout } = params;

    console.log(`🌐 导航到: ${url}`);

    // 设置超时
    await context.page.setDefaultTimeout(timeout);

    // 导航到页面
    const response = await context.page.goto(url, {
      waitUntil,
      timeout
    });

    if (!response || response.status() >= 400) {
      throw new Error(`页面导航失败，状态码: ${response?.status() || '未知'}`);
    }

    // 验证页面加载
    const title = await context.page.title();
    if (title.includes('404') || title.includes('错误')) {
      throw new Error(`页面标题异常: ${title}`);
    }

    console.log(`✅ 页面导航成功: ${title}`);

    return {
      url,
      title,
      status: response.status(),
      loadTime: response.timing().responseEnd
    };
  }
}

/**
 * 等待导航操作
 */
class WaitForNavigationOperation extends BaseAtomicOperation {
  constructor(config = {}) {
    super({
      name: 'waitForNavigation',
      type: 'navigation',
      description: '等待页面导航完成',
      ...config
    });
  }

  async execute(context, params) {
    const { timeout = this.config.timeout } = params;

    console.log('⏳ 等待页面导航...');

    await context.page.waitForNavigation({ timeout });

    console.log('✅ 页面导航完成');

    return {
      success: true,
      url: context.page.url(),
      title: await context.page.title()
    };
  }
}

/**
 * 刷新页面操作
 */
class RefreshOperation extends BaseAtomicOperation {
  constructor(config = {}) {
    super({
      name: 'refresh',
      type: 'navigation',
      description: '刷新当前页面',
      ...config
    });
  }

  async execute(context, params) {
    const { waitUntil = 'networkidle', timeout = this.config.timeout } = params;

    console.log('🔄 刷新页面...');

    await context.page.reload({ waitUntil, timeout });

    console.log('✅ 页面刷新完成');

    return {
      success: true,
      url: context.page.url(),
      title: await context.page.title()
    };
  }
}

/**
 * 后退操作
 */
class GoBackOperation extends BaseAtomicOperation {
  constructor(config = {}) {
    super({
      name: 'goBack',
      type: 'navigation',
      description: '导航到上一页',
      ...config
    });
  }

  async execute(context, params) {
    const { waitUntil = 'networkidle', timeout = this.config.timeout } = params;

    console.log('⏪ 后退到上一页...');

    await context.page.goBack({ waitUntil, timeout });

    console.log('✅ 后退完成');

    return {
      success: true,
      url: context.page.url(),
      title: await context.page.title()
    };
  }
}

/**
 * 前进操作
 */
class GoForwardOperation extends BaseAtomicOperation {
  constructor(config = {}) {
    super({
      name: 'goForward',
      type: 'navigation',
      description: '导航到下一页',
      ...config
    });
  }

  async execute(context, params) {
    const { waitUntil = 'networkidle', timeout = this.config.timeout } = params;

    console.log('⏩ 前进到下一页...');

    await context.page.goForward({ waitUntil, timeout });

    console.log('✅ 前进完成');

    return {
      success: true,
      url: context.page.url(),
      title: await context.page.title()
    };
  }
}

/**
 * 新标签页操作
 */
class NewTabOperation extends BaseAtomicOperation {
  constructor(config = {}) {
    super({
      name: 'newTab',
      type: 'navigation',
      description: '打开新标签页',
      ...config
    });
  }

  async execute(context, params) {
    const { url } = params;

    console.log('📂 打开新标签页...');

    // 创建新页面
    const newPage = await context.context.newPage();

    if (url) {
      await newPage.goto(url, { waitUntil: 'networkidle' });
    }

    console.log('✅ 新标签页已打开');

    return {
      success: true,
      page: newPage,
      url: url || 'about:blank'
    };
  }
}

/**
 * 切换标签页操作
 */
class SwitchTabOperation extends BaseAtomicOperation {
  constructor(config = {}) {
    super({
      name: 'switchTab',
      type: 'navigation',
      description: '切换到指定标签页',
      ...config
    });
  }

  validateParams(params) {
    const errors = [];
    if (params.index === undefined && !params.url) {
      errors.push('需要指定 index 或 url 参数');
    }
    return { valid: errors.length === 0, errors };
  }

  async execute(context, params) {
    const { index, url } = params;

    console.log('🔄 切换标签页...');

    const pages = context.context.pages();
    let targetPage;

    if (index !== undefined) {
      targetPage = pages[index];
      if (!targetPage) {
        throw new Error(`标签页索引超出范围: ${index}`);
      }
    } else if (url) {
      targetPage = pages.find(page => page.url().includes(url));
      if (!targetPage) {
        throw new Error(`未找到匹配的标签页: ${url}`);
      }
    }

    await targetPage.bringToFront();

    console.log(`✅ 已切换到标签页: ${targetPage.url()}`);

    return {
      success: true,
      page: targetPage,
      url: targetPage.url(),
      index: pages.indexOf(targetPage)
    };
  }
}

/**
 * 关闭标签页操作
 */
class CloseTabOperation extends BaseAtomicOperation {
  constructor(config = {}) {
    super({
      name: 'closeTab',
      type: 'navigation',
      description: '关闭指定标签页',
      ...config
    });
  }

  async execute(context, params) {
    const { index = -1 } = params;

    console.log('❌ 关闭标签页...');

    const pages = context.context.pages();
    const targetPage = index >= 0 ? pages[index] : context.page;

    if (!targetPage) {
      throw new Error(`标签页索引超出范围: ${index}`);
    }

    const pageInfo = {
      url: targetPage.url(),
      title: await targetPage.title()
    };

    await targetPage.close();

    console.log(`✅ 标签页已关闭: ${pageInfo.url}`);

    return {
      success: true,
      closedPage: pageInfo
    };
  }
}

module.exports = {
  NavigateOperation,
  WaitForNavigationOperation,
  RefreshOperation,
  GoBackOperation,
  GoForwardOperation,
  NewTabOperation,
  SwitchTabOperation,
  CloseTabOperation
};