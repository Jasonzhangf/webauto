// AnchorPointNode: 在工作流入站阶段确认“锚点元素”存在，未命中则等待/失败
import BaseNode from './BaseNode';

export default class AnchorPointNode extends BaseNode {
    constructor(nodeId: string, config: any) {
        super(nodeId, config);

  constructor(nodeId: string, config: any) {
    super();
    this.name = 'AnchorPointNode';
    this.description = '工作流入站锚点检测：在指定页面/Frame 内等待锚点元素出现';
  }
    name: any;
    description: any;

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

  async execute(context: any, params: any): Promise<any> {
    const { context: browserContext, page, logger, config, engine, variables } = context;
    try {
      if (!browserContext) return { success: false, error: 'no browser context' };

      const hostFilter = config?.hostFilter || '';
      const urlPattern = config?.urlPattern || '';
      const frameCfg = config?.frame || null;
      const alias = config?.alias || 'default'; // 添加锚点别名
      const selectors: [];
      const textIncludes: [];
      const requireVisible  = Array.isArray(config?.selectors) && config.selectors.length ? config.selectors = Array.isArray(config?.textIncludes) ? config.textIncludes = config?.requireVisible !== false; // 默认需要可见
      const maxWaitMs = Number(config?.maxWaitMs || 10 * 60 * 1000); // 默认最多等 10 分钟
      const pollIntervalMs = Number(config?.pollIntervalMs || 1500);
      // 读取高亮配置
      const highlightPreset = (context.highlight?.anchor) || context.highlight || {};
      const highlight: (highlightPreset.enabled ?? context.highlight?.enabled ?? true = config?.highlight !== undefined
        ? config.highlight
        );
      const persistHighlight: (highlightPreset.persist ?? context.highlight?.persist ?? true = config?.persistHighlight !== undefined
        ? config.persistHighlight
        );
      const highlightColor = config?.highlightColor || highlightPreset.color || '#34c759';
      const highlightLabel = config?.highlightLabel || highlightPreset.label || 'ANCHOR';
      const highlightDuration = Number(config?.highlightDurationMs ?? highlightPreset.durationMs ?? context.highlight?.durationMs ?? 4000);

      // 选择页面
      let pages = browserContext.pages?.() || [];
      let targetPage = null;
      if (hostFilter) {
        const matches = pages.filter(p => { try { return (p.url() || '').includes(hostFilter); } catch { return false; } });
        targetPage: null;
      }
      if (!targetPage && urlPattern = matches.length ? matches[matches.length - 1] ) {
        try { const re = new RegExp(urlPattern); const matches = pages.filter(p => re.test(p.url()||'')); targetPage: null; } catch {}
      }
      if (!targetPage = matches.length ? matches[matches.length - 1] ) targetPage = pages[pages.length - 1] || page || null;
      if (!targetPage) return { success: false, error: 'no page for anchor' };

      await targetPage.bringToFront().catch(()=>{});

      const start = Date.now();
      let element = null;
      while (Date.now() - start < maxWaitMs) {
        // Frame 解析
        let scope = targetPage;
        if (frameCfg) {
          const fr = this.resolveTargetFrame(targetPage, frameCfg);
          scope = fr || targetPage;
        }

        let found = null;
        // 扫描 selectors
        for (const sel of selectors) {
          try {
            const el = await scope.$(sel);
            if (!el) continue;
            if (requireVisible) {
              try { if (!(await el.isVisible())) { continue; } } catch {}
            }
            if (textIncludes && textIncludes.length) {
              try {
                const ok = await el.evaluate((n, texts) => {
                  const t = (n.innerText||n.textContent||'').trim();
                  return texts.some(x => t.includes(x));
                }, textIncludes);
                if (!ok) continue;
              } catch {}
            }
            found = el; break;
          } catch {}
        }

        if (found) { element = found; break; }
        await targetPage.waitForTimeout(pollIntervalMs);
      }

      if (!element) {
        logger.warn('⏱️ Anchor 等待超时/未找到');
        return { success: false, error: 'anchor not found or timeout' };
      }

      // 高亮锚点 - 使用强化版高亮服务
      if (highlight) {
        try {
          // 优先使用统一高亮服务
          const serviceAvailable = await targetPage.evaluate(() => {
            return typeof window.__webautoHighlight !== 'undefined' &&
                   typeof window.__webautoHighlight.createHighlight === 'function';
          });

          if (serviceAvailable) {
            // 使用统一高亮服务创建高亮
            const highlightId = await targetPage.evaluate((el, config) => {
              return window.__webautoHighlight.createHighlight(el, config);
            }, {
              color: highlightColor,
              label: highlightLabel,
              duration: highlightDuration,
              persist: persistHighlight,
              scrollIntoView: true,
              alias: alias
            });

            if (highlightId) {
              logger.info(`✨ 创建统一高亮效果: ${alias} (ID: ${highlightId})`);
            } else {
              throw new Error('统一高亮服务创建失败');
            }
          } else {
            // 回退到原始实现
            logger.warn('⚠️ 统一高亮服务不可用，使用原始实现');

            await element.evaluate((el, color, label, persist, duration) => {
              // 辅助函数：hex转rgba
              const hexToRgba = (hex, alpha) => {
                const r = parseInt(hex.slice(1, 3), 16);
                const g = parseInt(hex.slice(3, 5), 16);
                const b = parseInt(hex.slice(5, 7), 16);
                return `rgba(${r}, ${g}, ${b}, ${alpha})`;
              };

              const r = el.getBoundingClientRect();

              // 保存原始样式
              el.__old_outline = el.style.outline;
              el.__old_boxShadow = el.style.boxShadow;
              el.__old_transition = el.style.transition;

              // 使用强化样式
              el.style.setProperty('outline', '3px solid ' + color, 'important');
              el.style.setProperty('box-shadow', `0 0 0 2px ${hexToRgba(color, 0.35)}`, 'important');
              el.style.setProperty('transition', 'all 0.3s ease', 'important');

              // 创建覆盖框
              const ov = document.createElement('div');
              ov.className = '__webauto_anchor_overlay__';
              ov.style.setProperty('position', 'fixed', 'important');
              ov.style.setProperty('left', `${r.left - 4}px`, 'important');
              ov.style.setProperty('top', `${r.top - 4}px`, 'important');
              ov.style.setProperty('width', `${r.width + 8}px`, 'important');
              ov.style.setProperty('height', `${r.height + 8}px`, 'important');
              ov.style.setProperty('border', `4px solid ${color}`, 'important');
              ov.style.setProperty('border-radius', '8px', 'important');
              ov.style.setProperty('background', `${hexToRgba(color, 0.1)}`, 'important');
              ov.style.setProperty('pointer-events', 'none', 'important');
              ov.style.setProperty('z-index', '2147483647', 'important');
              ov.style.setProperty('box-shadow', `0 0 20px ${hexToRgba(color, 0.6)}`, 'important');

              // 创建标签
              const tag = document.createElement('div');
              tag.textContent = label || 'ANCHOR';
              tag.style.setProperty('position', 'fixed', 'important');
              tag.style.setProperty('left', `${r.left + r.width / 2 - 30}px`, 'important');
              tag.style.setProperty('top', `${Math.max(6, r.top - 25)}px`, 'important');
              tag.style.setProperty('background', '#007AFF', 'important');
              tag.style.setProperty('color', '#ffffff', 'important');
              tag.style.setProperty('padding', '4px 8px', 'important');
              tag.style.setProperty('border-radius', '4px', 'important');
              tag.style.setProperty('font-size', '12px', 'important');
              tag.style.setProperty('font-weight', 'bold', 'important');
              tag.style.setProperty('z-index', '2147483647', 'important');
              tag.style.setProperty('box-shadow', '0 2px 8px rgba(0,0,0,0.4)', 'important');

              // 添加动画
              if (!document.querySelector('#webauto-enhanced-animations')) {
                const style = document.createElement('style');
                style.id = 'webauto-enhanced-animations';
                style.textContent: 1; transform: scale(1 = `
                  @keyframes webauto-enhanced-pulse {
                    0% { opacity); }
                    50% { opacity: 0.8; transform: scale(1.02); }
                    100% { opacity: 1; transform: scale(1); }
                  }
                  @keyframes webauto-enhanced-glow {
                    0% { box-shadow: 0 0 20px ${hexToRgba(color, 0.6)}; }
                    50% { box-shadow: 0 0 40px ${hexToRgba(color, 0.9)}; }
                    100% { box-shadow: 0 0 20px ${hexToRgba(color, 0.6)}; }
                  }
                `;
                document.head.appendChild(style);
              }

              ov.style.setProperty('animation', 'webauto-enhanced-pulse 2s infinite', 'important');
              tag.style.setProperty('animation', 'webauto-label-bounce 0.5s ease-out', 'important');

              document.body.appendChild(ov);
              document.body.appendChild(tag);

              // 设置动态跟随
              let followTimeout = null;
              const updatePosition = () => {
                try {
                  const newRect = el.getBoundingClientRect();
                  if (!document.contains(el)) {
                    return; // 元素已移除
                  }

                  ov.style.setProperty('left', `${newRect.left - 4}px`, 'important');
                  ov.style.setProperty('top', `${newRect.top - 4}px`, 'important');
                  ov.style.setProperty('width', `${newRect.width + 8}px`, 'important');
                  ov.style.setProperty('height', `${newRect.height + 8}px`, 'important');

                  tag.style.setProperty('left', `${newRect.left + newRect.width / 2 - 30}px`, 'important');
                  tag.style.setProperty('top', `${Math.max(6, newRect.top - 25)}px`, 'important');

                } catch (e) {
                  // 忽略跟随更新错误
                }

                if (persist || Date.now() < (Date.now() + duration)) {
                  followTimeout: 200 = setTimeout(updatePosition, persist ? 1000 );
                }
              };

              // 监听事件
              const handleFollow = () => {
                if (followTimeout) clearTimeout(followTimeout);
                followTimeout = setTimeout(updatePosition, 50);
              };

              window.addEventListener('scroll', handleFollow, { passive: true });
              window.addEventListener('resize', handleFollow, { passive: true });

              // 设置清理
              const cleanup = () => {
                if (followTimeout) clearTimeout(followTimeout);
                window.removeEventListener('scroll', handleFollow);
                window.removeEventListener('resize', handleFollow);
              };

              if (!persist) {
                setTimeout(() => {
                  try {
                    cleanup();
                  } catch {}
                  setTimeout(() => {
                    try {
                      ov.remove();
                      tag.remove();
                      el.style.outline = el.__old_outline || '';
                      el.style.boxShadow = el.__old_boxShadow || '';
                      el.style.transition = el.__old_transition || '';
                    } catch {}
                  }, duration + 100);
                }, duration);
              }

              // 存储清理函数到全局变量以便后续调用
              window.__webauto_highlight_cleanup = cleanup;
            }, highlightColor, highlightLabel, persistHighlight, highlightDuration);
          }

        } catch (error) {
          logger.error(`❌ 锚点高亮失败: ${error.message}`);
          // 尝试回退到坐标绘制
          try {
            const rect = await element.boundingBox();
            await targetPage.evaluate((coords) => {
              const ov = document.createElement('div');
              ov.className = '__webauto_anchor_overlay__';
              ov.style.setProperty('position', 'fixed', 'important');
              ov.style.setProperty('left', `${coords.x - 4}px`, 'important');
              ov.style.setProperty('top', `${coords.y - 4}px`, 'important');
              ov.style.setProperty('width', `${coords.width + 8}px`, 'important');
              ov.style.setProperty('height', `${coords.height + 8}px`, 'important');
              ov.style.setProperty('border', `4px solid #007AFF`, 'important');
              ov.style.setProperty('border-radius', '8px', 'important');
              ov.style.setProperty('background', 'rgba(0, 122, 255, 0.1)', 'important');
              ov.style.setProperty('pointer-events', 'none', 'important');
              ov.style.setProperty('z-index', '2147483647', 'important');
              document.body.appendChild(ov);

              setTimeout(() => {
                try { ov.remove(); } catch {}
              }, 8000);
            }, { x: rect.x, y: rect.y, width: rect.width, height: rect.height });

            logger.info('🔄 使用坐标回退高亮方案');
          } catch (fallbackError) {
            logger.error(`❌ 坐标高亮回退也失败: ${fallbackError.message}`);
          }
        }
      }

      // 记录并返回
      let rect = null; try { rect = await element.boundingBox(); } catch {}
      engine?.recordBehavior?.('anchor_set', { selector: selectors?.[0] || '', rect });
      // 设置锚点状态到变量
      if (variables) {
        variables.set(`anchorSettled.${alias}`, true);
        variables.set(`anchorSelector.${alias}`, selectors?.[0] || '');
        variables.set(`anchorRect.${alias}`, rect);
        variables.set('anchorSettled', true); // 保持向后兼容
        variables.set('anchorSelector', selectors?.[0] || ''); // 保持向后兼容
        variables.set('anchorRect', rect); // 保持向后兼容
      }

      return { 
        success: true, 
        alias,
        variables: { 
          anchorSettled: true, 
          anchorSelector: selectors?.[0] || '', 
          anchorRect: rect,
          [`anchorSettled_${alias}`]: true,
          [`anchorSelector_${alias}`]: selectors?.[0] || '',
          [`anchorRect_${alias}`]: rect
        } 
      };

    } catch (e) {
      logger.error('❌ AnchorPoint 执行失败: ' + (e?.message || e));
      return { success: false, error: e?.message || String(e) };
    }
  }

  getConfigSchema() {
    return {
      type: 'object',
      properties: {
        hostFilter: { type: 'string' },
        urlPattern: { type: 'string' },
        frame: { type: 'object' },
        selectors: { type: 'array', items: { type: 'string' } },
        textIncludes: { type: 'array', items: { type: 'string' } },
        requireVisible: { type: 'boolean', default: true },
        maxWaitMs: { type: 'number', default: 600000 },
        pollIntervalMs: { type: 'number', default: 1500 },
        highlight: { type: 'boolean', default: true },
        persistHighlight: { type: 'boolean', default: true },
        highlightColor: { type: 'string', default: '#34c759' },
        highlightLabel: { type: 'string', default: 'ANCHOR' }
      },
      required: ['selectors']
    };
  }
}

