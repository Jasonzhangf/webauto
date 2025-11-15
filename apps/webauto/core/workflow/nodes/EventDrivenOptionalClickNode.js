// 事件驱动可选点击节点：监听元素出现后点击；未出现则跳过成功
import BaseNode from './BaseNode.js';

export default class EventDrivenOptionalClickNode extends BaseNode {
  constructor() {
    super();
    this.name = 'EventDrivenOptionalClickNode';
    this.description = '使用 MutationObserver/轮询检测目标元素，出现则高亮并点击；未出现不报错';
  }

  resolveTargetFrame(page, frameCfg = {}) {
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

  async execute(context) {
    const { page, logger, config, engine } = context;
    if (!page) return { success: false, error: 'no page available' };

    const selectors = Array.isArray(config?.selectors) && config.selectors.length ? config.selectors : ['button', '[role="button"]', 'a', '.next-btn'];
    const textIncludes = Array.isArray(config?.textIncludes) ? config.textIncludes : [];
    const excludeTexts = Array.isArray(config?.excludeTexts) ? config.excludeTexts : [];
    const maxWaitMs = Number(config?.maxWaitMs || 15000);
    const pollIntervalMs = Number(config?.pollIntervalMs || 400);
    const highlight = config?.highlight !== false; // 默认高亮
    const persistHighlight = !!config?.persistHighlight; // 是否常驻
    const highlightColor = config?.highlightColor || '#34c759';
    const click = config?.click !== false; // 默认点击
    const method = (config?.method || '').toLowerCase(); // 'mouse' | 'dom'
    const clickOffsetX = Number(config?.clickOffsetX || 0);
    const clickOffsetY = Number(config?.clickOffsetY || 0);
    const mouseMoveSteps = Number(config?.mouseMoveSteps || 10);
    const hoverMs = Number(config?.hoverMs || 50);
    const frameCfg = config?.frame || null;

    try {
      const target = frameCfg ? (this.resolveTargetFrame(page, frameCfg) || page) : page;

      // 轮询查找
      const start = Date.now();
      let elementHandle = null;
      while (Date.now() - start < maxWaitMs) {
        for (const sel of selectors) {
          try {
            const arr = await target.$$(sel);
            for (const el of arr) {
              try {
                const ok = await el.evaluate((n, includes, excludes) => {
                  const vis = (el) => { const s = getComputedStyle(el); if (s.display==='none'||s.visibility==='hidden'||Number(s.opacity)===0) return false; const r = el.getBoundingClientRect(); return r.width>1 && r.height>1; };
                  if (!vis(n)) return false;
                  const t = (n.innerText||n.textContent||'').trim();
                  if (includes && includes.length && !includes.some(x=>t.includes(x))) return false;
                  if (excludes && excludes.length && excludes.some(x=>t.includes(x))) return false;
                  return true;
                }, textIncludes, excludeTexts);
                if (ok) { elementHandle = el; break; }
              } catch {}
            }
            if (elementHandle) break;
          } catch {}
        }
        if (elementHandle) break;
        await page.waitForTimeout(pollIntervalMs);
      }

      engine?.recordBehavior?.('event_click_probe', { found: !!elementHandle });

      if (!elementHandle) {
        logger.info('🔎 目标元素未出现，跳过');
        return { success: true, variables: { clicked: false, appeared: false } };
      }

      // 高亮 - 使用统一高亮服务
      if (highlight) {
        try {
          // 检查统一高亮服务是否可用
          const serviceAvailable = await page.evaluate(() => {
            return typeof window.__webautoHighlight !== 'undefined' &&
                   typeof window.__webautoHighlight.createHighlight === 'function';
          });

          if (serviceAvailable) {
            // 使用统一高亮服务
            const highlightId = await page.evaluate((el, config) => {
              return window.__webautoHighlight.createHighlight(el, config);
            }, {
              color: highlightColor,
              label: 'CLICK_TARGET',
              duration: persistHighlight ? 0 : 4000,
              persist: persistHighlight,
              scrollIntoView: true,
              alias: 'event-click-target'
            });

            if (highlightId) {
              logger.info(`✨ 创建点击目标高亮: ${highlightId}`);
            } else {
              throw new Error('统一高亮服务创建失败');
            }
          } else {
            // 回退到原始实现
            logger.warn('⚠️ 统一高亮服务不可用，使用原始实现');

            await elementHandle.evaluate((n, color, persist) => {
              const r = n.getBoundingClientRect();
              n.__old_outline = n.style.outline;
              n.style.setProperty('outline', '3px solid ' + (color || '#ff2d55'), 'important');
              n.style.setProperty('transition', 'all 0.3s ease', 'important');

              const ov = document.createElement('div');
              ov.className = '__webauto_opt_overlay__';
              ov.style.setProperty('position', 'fixed', 'important');
              ov.style.setProperty('left', `${r.x}px`, 'important');
              ov.style.setProperty('top', `${r.y}px`, 'important');
              ov.style.setProperty('width', `${r.width}px`, 'important');
              ov.style.setProperty('height', `${r.height}px`, 'important');
              ov.style.setProperty('border', `3px solid ${color || '#ff2d55'}`, 'important');
              ov.style.setProperty('border-radius', '6px', 'important');
              ov.style.setProperty('pointer-events', 'none', 'important');
              ov.style.setProperty('z-index', '2147483647', 'important');
              ov.style.setProperty('box-shadow', `0 0 15px ${this.hexToRgba ? this.hexToRgba(color || '#ff2d55', 0.6) : 'rgba(255, 45, 85, 0.6)'}`, 'important');

              document.body.appendChild(ov);
              if (!persist) {
                setTimeout(() => {
                  try {
                    ov.remove();
                    n.style.outline = n.__old_outline || '';
                    n.style.transition = '';
                  } catch {}
                }, 4000);
              }
            }, highlightColor, persistHighlight);
          }
        } catch (error) {
          logger.warn(`⚠️ 高亮创建失败: ${error.message}`);
        }
      }

      // 点击
      let clicked = false;
      if (click) {
        if (method === 'mouse') {
          try {
            const box = await elementHandle.boundingBox();
            if (box) {
              const x = box.x + box.width/2 + clickOffsetX;
              const y = box.y + box.height/2 + clickOffsetY;
              await page.mouse.move(x, y, { steps: Math.max(1, mouseMoveSteps) });
              if (hoverMs > 0) await page.waitForTimeout(hoverMs);
              await page.mouse.down();
              await page.mouse.up();
              clicked = true;
            }
          } catch {}
        }
        if (!clicked) {
          try { await elementHandle.click({ timeout: 800 }); clicked = true; } catch {}
          if (!clicked) {
            try { await elementHandle.evaluate(n => n.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))); clicked = true; } catch {}
          }
        }
      }

      engine?.recordBehavior?.('event_click_result', { clicked });
      return { success: true, variables: { appeared: true, clicked } };

    } catch (e) {
      logger.warn('⚠️ EventDrivenOptionalClick 执行异常: ' + (e?.message || e));
      return { success: true, variables: { appeared: false, clicked: false, error: e?.message || String(e) } };
    }
  }

  getConfigSchema() {
    return {
      type: 'object',
      properties: {
        selectors: { type: 'array', items: { type: 'string' } },
        textIncludes: { type: 'array', items: { type: 'string' } },
        excludeTexts: { type: 'array', items: { type: 'string' } },
        maxWaitMs: { type: 'number', default: 15000 },
        pollIntervalMs: { type: 'number', default: 400 },
        highlight: { type: 'boolean', default: true },
        persistHighlight: { type: 'boolean', default: false },
        highlightColor: { type: 'string', default: '#34c759' },
        click: { type: 'boolean', default: true },
        method: { type: 'string', enum: ['mouse','dom'], default: 'dom' },
        clickOffsetX: { type: 'number', default: 0 },
        clickOffsetY: { type: 'number', default: 0 },
        mouseMoveSteps: { type: 'number', default: 10 },
        hoverMs: { type: 'number', default: 50 },
        frame: { type: 'object' }
      }
    };
  }
}
