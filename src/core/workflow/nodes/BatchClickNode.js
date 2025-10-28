// 批量点击节点：在容器内找到若干元素并依次点击（可用修饰键在新标签打开）
import BaseNode from './BaseNode.js';

export default class BatchClickNode extends BaseNode {
  constructor() {
    super();
    this.name = 'BatchClickNode';
    this.description = '在容器/页面内批量点击前N个元素，支持新标签打开与高亮';
  }

  getConfigSchema() {
    return {
      type: 'object',
      required: ['itemSelector'],
      properties: {
        containerSelector: { type: 'string', description: '容器选择器（可选）' },
        itemSelector: { type: 'string', description: '要点击的元素选择器（必填）' },
        count: { type: 'number', default: 5, description: '点击的元素数量' },
        openInNewTab: { type: 'boolean', default: true, description: '是否使用修饰键在新标签打开' },
        waitBetweenMs: { type: 'number', default: 600, description: '两次点击之间等待毫秒' },
        timeout: { type: 'number', default: 15000, description: '等待/操作超时毫秒' },
        highlightEach: { type: 'boolean', default: true, description: '点击前是否高亮元素' }
      }
    };
  }

  async execute(context) {
    const { page, logger, config } = context;
    if (!page) return { success: false, error: 'no page available' };

    const containerSelector = config?.containerSelector || null;
    const itemSelector = config?.itemSelector;
    const count = Math.max(1, Number(config?.count || 5));
    const openInNewTab = config?.openInNewTab !== false;
    const waitBetweenMs = Number(config?.waitBetweenMs || 600);
    const timeout = Number(config?.timeout || 15000);
    const highlightEach = config?.highlightEach !== false;

    if (!itemSelector) return { success: false, error: 'no itemSelector provided' };

    try {
      logger.info(`🔎 扫描元素: ${containerSelector ? containerSelector + ' ' : ''}${itemSelector}`);

      let scopeHandle = null;
      if (containerSelector) {
        try {
          await page.waitForSelector(containerSelector, { timeout });
          scopeHandle = await page.$(containerSelector);
          if (!scopeHandle) logger.warn(`⚠️ 未找到容器: ${containerSelector}`);
        } catch (e) {
          logger.warn(`⚠️ 容器等待失败: ${e?.message || e}`);
        }
      }

      const elementHandles = scopeHandle
        ? await scopeHandle.$$(itemSelector)
        : await page.$$(itemSelector);

      if (!elementHandles || elementHandles.length === 0) {
        return { success: false, error: `no elements found for selector: ${itemSelector}` };
      }

      // 过滤可见元素（尽量）
      const visible = [];
      for (const h of elementHandles) {
        try {
          const isVisible = await h.isVisible();
          if (isVisible) visible.push(h);
        } catch {
          visible.push(h);
        }
      }

      const targets = visible.slice(0, count);
      logger.info(`🧩 将点击 ${targets.length} 个元素`);

      // 平台修饰键
      const platform = process.platform;
      const modifier = openInNewTab ? (platform === 'darwin' ? 'Meta' : 'Control') : null;

      let successCount = 0;
      const errors = [];

      for (let i = 0; i < targets.length; i++) {
        const el = targets[i];
        try {
          // 高亮
          if (highlightEach) {
            try {
              await el.evaluate((node) => {
                const orig = node.style.cssText;
                node.__origStyle = orig;
                node.style.outline = '2px solid #409EFF';
                node.style.background = 'rgba(64,158,255,0.08)';
                setTimeout(() => { try { node.style.cssText = node.__origStyle || ''; } catch {} }, 1200);
              });
            } catch {}
          }

          // 滚动到视图
          try { await el.scrollIntoViewIfNeeded(); } catch {}

          // 优先尝试修饰键点击（新标签）
          let clicked = false;
          if (modifier) {
            try {
              await el.click({ modifiers: [modifier], timeout: 8000 });
              clicked = true;
              logger.info(`✅ 第 ${i + 1} 个：修饰键点击成功 (${modifier})`);
            } catch (e1) {
              logger.warn(`修饰键点击失败，回退JS打开: ${e1?.message || e1}`);
            }
          }

          if (!clicked) {
            // 回退：window.open 或直接点击
            try {
              const opened = await el.evaluate((node) => {
                const href = node instanceof HTMLAnchorElement ? node.href : (node.closest('a')?.href || '');
                if (href) { window.open(href, '_blank'); return true; }
                node.dispatchEvent(new MouseEvent('click', { bubbles: true }));
                return false;
              });
              logger.info(`✅ 第 ${i + 1} 个：${opened ? 'window.open' : 'JS 点击'} 执行`);
            } catch (e2) {
              // 最后回退：常规 click（可能导致导航）
              await el.click({ timeout: 8000 }).catch(() => {});
            }
          }

          successCount++;
          if (waitBetweenMs > 0) await page.waitForTimeout(waitBetweenMs);

        } catch (err) {
          const msg = err?.message || String(err);
          logger.warn(`⚠️ 第 ${i + 1} 个点击失败: ${msg}`);
          errors.push(msg);
        }
      }

      return {
        success: successCount > 0,
        results: { batchClicked: successCount, totalCandidates: elementHandles.length },
        batchClicked: successCount,
        totalCandidates: elementHandles.length,
        errors
      };

    } catch (error) {
      return { success: false, error: error?.message || String(error) };
    }
  }
}

