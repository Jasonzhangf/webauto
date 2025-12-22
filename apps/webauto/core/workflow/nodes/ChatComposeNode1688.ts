// 1688专用聊天组件 - 处理React界面和aplus脚本时序
import BaseNode from './BaseNode';

export default class ChatComposeNode1688 extends BaseNode {
    constructor(nodeId: string, config: any) {
        super(nodeId, config);

  constructor(nodeId: string, config: any) {
    super();
    this.name = 'ChatComposeNode1688';
    this.description = '1688专用聊天组件，处理React界面、aplus脚本时序和非标准输入元素';
  }

  async execute(context: any, params: any): Promise<any> {
    const { context: browserContext, logger, config, engine, results, variables } = context;
    const hostFilter = config.hostFilter || 'air.1688.com';
    const message = typeof config.message === 'string' ? config.message : '你好';
    const stepGate = config.stepGate === true;
    const doSend = config.send !== false;
    const highlightMs = Number(config.highlightMs || 8000);
    const stabilizeMs = Number(config.stabilizeMs || 2000);

    try {
      if (!browserContext) return { success: false, error: 'no browser context' };

      // 获取1688聊天页面
      let pages = browserContext.pages?.() || [];
      let chatPages = pages.filter(p => { try { return (p.url() || '').includes(hostFilter); } catch { return false; } });
      let page = chatPages.length ? chatPages[chatPages.length - 1] : null;

      if (!page) {
        // 使用token URL打开页面
        try {
          const tokens = (results && results.tokens) || [];
          let cand = tokens.find(t => t && t.raw && t.uid && (t.offerId || t.offerid));
          if (!cand) cand = tokens.find(t => t && t.raw);
          if (cand && cand.raw) {
            page = await browserContext.newPage();
            await page.goto(cand.raw, { waitUntil: 'domcontentloaded', timeout: 30000 });
          }
        } catch (e) {
          return { success: false, error: 'failed to open chat page: ' + e.message };
        }
      }

      if (!page) return { success: false, error: 'chat page not found' };

      await page.bringToFront().catch(()=>{});
      await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(()=>{});

      // 等待aplus脚本和React组件加载
      logger.info('⏳ 等待1688 aplus脚本和React组件加载...');
      await page.waitForTimeout(stabilizeMs);

      // 检查aplus脚本是否加载完成
      const aplusReady = await page.evaluate(() => {
        return window.aplus !== undefined && window.aplusReady !== undefined;
      }).catch(() => false);

      if (!aplusReady) {
        logger.warn('⚠️ aplus脚本未完全加载，继续尝试...');
        await page.waitForTimeout(2000);
      }

      // 关闭可能的客户端提示
      try {
        await page.evaluate(() => {
          const texts = ['优先使用网页版','继续使用网页版','使用网页版','仍使用网页','留在网页'];
          const nodes = Array.from(document.querySelectorAll('button, [role="button"], a'));
          for (const node of nodes) {
            const text = node.innerText || '';
            if (texts.some(t => text.includes(t))) {
              node.click();
              break;
            }
          }
        });
      } catch {}

      // 1688专用输入处理 - 基于实际DOM分析结果优化
      const inputResult = await page.evaluate(async (msg) => {
        console.log('🔍 开始1688聊天界面输入处理，消息:', msg);

        // 1. 等待页面完全加载，特别是def_cbu_web_im_core
        await new Promise(resolve => {
          const checkCoreFrame = () => {
            // 检查是否在正确的聊天界面
            const isCoreFrame = window.location.href.includes('def_cbu_web_im_core/index.html');
            const hasChatElements = document.querySelector('.send-btn') ||
                                  Array.from(document.querySelectorAll('button')).find(btn =>
                                    btn.innerText && btn.innerText.includes('发送')
                                  );

            if (isCoreFrame && hasChatElements) {
              console.log('✅ 检测到1688核心聊天界面已加载');
              resolve(true);
            } else {
              setTimeout(checkCoreFrame, 1000);
            }
          };
          checkCoreFrame();
          setTimeout(() => resolve(false), 10000); // 10秒超时
        });

        // 2. 基于实际DOM分析的输入元素查找策略
        const find1688ChatInput = () => {
          console.log('🔍 开始查找1688聊天输入元素...');

          const candidates = [];

          // 策略1: 查找contenteditable元素（1688使用这种方式）
          document.querySelectorAll('*').forEach(el => {
            if (el.contentEditable === 'true' || el.isContentEditable || el.getAttribute('contenteditable') === 'true') {
              const rect = el.getBoundingClientRect();
              if (rect.width > 50 && rect.height > 20) {
                candidates.push({
                  element: el,
                  type: 'contenteditable',
                  tag: el.tagName,
                  className: el.className,
                  id: el.id,
                  rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
                  priority: 1 // 高优先级
                });
                console.log(`✅ 找到contenteditable元素: ${el.tagName}.${el.className}`);
              }
            }
          });

          // 策略2: 查找底部区域的div元素（聊天输入通常在底部）
          const windowHeight = window.innerHeight;
          document.querySelectorAll('div').forEach(el => {
            const rect = el.getBoundingClientRect();
            const isBottomArea = rect.y > windowHeight - 200; // 底部200px区域
            const isInputSize = rect.width > 100 && rect.height > 30;
            const hasInputClass = el.className.includes('input') ||
                                 el.className.includes('editor') ||
                                 el.className.includes('chat') ||
                                 el.className.includes('compose');

            if (isBottomArea && isInputSize && !candidates.find(c => c.element === el)) {
              candidates.push({
                element: el,
                type: 'bottom-div',
                tag: el.tagName,
                className: el.className,
                id: el.id,
                rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
                priority: hasInputClass ? 2 : 3 // 有输入类名的优先级更高
              });
              console.log(`✅ 找到底部区域候选元素: ${el.tagName}.${el.className} (优先级: ${hasInputClass ? 2 : 3})`);
            }
          });

          // 按优先级排序
          candidates.sort((a, b) => a.priority - b.priority);

          console.log(`🎯 总共找到 ${candidates.length} 个候选输入元素`);
          return candidates;
        };

        const candidates = find1688ChatInput();

        if (candidates.length === 0) {
          console.log('⚠️ 未找到任何输入元素，记录页面状态...');

          // 记录页面状态用于调试
          const pageInfo = {
            url: window.location.href,
            title: document.title,
            totalElements: document.querySelectorAll('*').length,
            contenteditableCount: document.querySelectorAll('[contenteditable]').length,
            buttonCount: document.querySelectorAll('button').length,
            sendButtons: Array.from(document.querySelectorAll('button')).filter(btn =>
              (btn.innerText || btn.textContent || '').includes('发送')
            ).concat(Array.from(document.querySelectorAll('.send-btn'))).length,
            bodyHtml: document.body.innerHTML.substring(0, 2000)
          };

          console.log('📊 页面状态信息:', pageInfo);

          return {
            success: true,
            inputFound: false,
            message: 'no input elements found but continuing with send button detection',
            debugInfo: pageInfo
          };
        }

        // 3. 尝试输入到每个候选元素
        console.log(`🧪 开始测试 ${candidates.length} 个候选输入元素...`);

        for (let i = 0; i < candidates.length; i++) {
          const candidate = candidates[i];
          const el = candidate.element;

          console.log(`🧪 测试候选元素 ${i+1}/${candidates.length}: ${candidate.type} - ${el.tagName}.${el.className}`);

          try {
            // 高亮当前测试的元素
            const originalBorder = el.style.border;
            const originalBg = el.style.backgroundColor;
            el.style.border = '3px solid red';
            el.style.backgroundColor = 'rgba(255, 0, 0, 0.1)';

            // 聚焦并点击元素
            el.focus();
            el.click();

            // 等待一下让React组件响应
            await new Promise(resolve => setTimeout(resolve, 500));

            // 根据元素类型使用不同的输入方法
            if (candidate.type === 'contenteditable') {
              // 清空现有内容并输入新消息
              el.innerText = '';
              el.innerText = msg;

              // 触发完整的输入事件序列
              const events = [
                new Event('focus', { bubbles: true }),
                new Event('input', { bubbles: true }),
                new Event('change', { bubbles: true }),
                new CompositionEvent('compositionstart', { bubbles: true }),
                new CompositionEvent('compositionupdate', { bubbles: true }),
                new CompositionEvent('compositionend', { bubbles: true }),
                new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
                new KeyboardEvent('keyup', { key: 'Enter', bubbles: true })
              ];

              events.forEach(evt => el.dispatchEvent(evt));

            } else {
              // 对于div元素，尝试多种方法
              el.innerText = msg;
              el.textContent = msg;

              // 如果有value属性（React组件常用）
              if (el.value !== undefined) {
                el.value = msg;
              }

              // 触发输入事件
              const inputEvent = new Event('input', { bubbles: true });
              el.dispatchEvent(inputEvent);

              // React合成事件
              const changeEvent = new Event('change', { bubbles: true });
              el.dispatchEvent(changeEvent);

              // 强制React更新
              if (el._reactInternalFiber || el._reactInternalInstance) {
                const setter = Object.getOwnPropertyDescriptor(el, 'value')?.set;
                if (setter) {
                  setter.call(el, msg);
                }
              }
            }

            // 再次等待让界面更新
            await new Promise(resolve => setTimeout(resolve, 300));

            // 检查输入是否成功
            const hasTextContent = el.innerText && el.innerText.includes(msg);
            const hasValue = el.value && el.value.includes(msg);
            const hasContent = hasTextContent || hasValue;

            // 恢复元素样式
            el.style.border = originalBorder;
            el.style.backgroundColor = originalBg;

            if (hasContent) {
              console.log(`✅ 输入成功！使用方法: ${candidate.type}`);
              return {
                success: true,
                inputFound: true,
                element: {
                  tag: el.tagName,
                  className: el.className,
                  id: el.id,
                  type: candidate.type,
                  xpath: getXPath(el)
                },
                method: candidate.type,
                message: msg
              };
            } else {
              console.log(`❌ 候选元素 ${i+1} 输入失败`);
            }

          } catch (e) {
            console.error(`❌ 候选元素 ${i+1} 测试异常:`, e.message);
          }
        }

        return {
          success: false,
          error: 'all input attempts failed',
          candidatesCount: candidates.length
        };

      }, message).catch(e => ({ success: false, error: 'evaluation failed: ' + e.message }));

      if (!inputResult.success) {
        return { success: false, error: inputResult.error };
      }

      logger.info(`✅ 输入成功，元素类型: ${inputResult.element?.type}`);

      // 添加getXPath辅助函数到页面作用域
      await page.evaluate(() => {
        window.getXPath = function(element) {
          if (!element) return '';
          if (element.id) return `//*[@id="${element.id}"]`;

          const parts = [];
          while (element && element.nodeType === Node.ELEMENT_NODE) {
            let index = 0;
            let sibling = element.previousSibling;
            while (sibling) {
              if (sibling.nodeType === Node.ELEMENT_NODE && sibling.tagName === element.tagName) {
                index++;
              }
              sibling = sibling.previousSibling;
            }

            const tagName = element.tagName.toLowerCase();
            const pathIndex = index > 0 ? `[${index + 1}]` : '';
            parts.unshift(`${tagName}${pathIndex}`);

            element = element.parentNode;
          }

          return parts.length ? `/${parts.join('/')}` : '';
        };
      });

      // 基于实际DOM分析的发送按钮检测
      await page.waitForTimeout(3000); // 增加等待时间让按钮完全加载

      const sendResult = await page.evaluate(() => {
        console.log('🔍 开始查找1688发送按钮...');

        const find1688SendButtons = () => {
          const buttons = [];

          console.log('🔍 开始查找1688发送按钮...');

          // 策略1: 查找.send-btn类名的元素（最高优先级）
          document.querySelectorAll('.send-btn, [class*="send"], [class*="Send"]').forEach(el => {
            const rect = el.getBoundingClientRect();
            const text = (el.innerText || el.textContent || '').trim();
            if (rect.width > 5 && rect.height > 5) { // 降低尺寸要求
              buttons.push({
                element: el,
                text: text,
                tag: el.tagName,
                className: el.className,
                id: el.id,
                rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
                source: 'send-btn-class',
                selector: '.send-btn',
                priority: 1 // 最高优先级
              });
              console.log(`✅ 通过.send-btn找到发送按钮: ${text || '(无文本)'}`);
            }
          });

          // 策略2: 查找包含"发送"文本的所有可点击元素
          ['button', 'div', 'span', 'a'].forEach(tagName => {
            document.querySelectorAll(tagName).forEach(el => {
              const text = (el.innerText || el.textContent || '').trim();
              const rect = el.getBoundingClientRect();

              if (rect.width > 5 && rect.height > 5 && text.includes('发送')) {
                // 避免重复添加
                if (!buttons.find(b => b.element === el)) {
                  buttons.push({
                    element: el,
                    text: text,
                    tag: el.tagName,
                    className: el.className,
                    id: el.id,
                    rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
                    source: 'text-match',
                    selector: `${tagName}[contains(text(), "发送")]`,
                    priority: 2 // 中优先级
                  });
                  console.log(`✅ 通过文本匹配找到发送按钮: ${text} (${tagName})`);
                }
              }
            });
          });

          // 策略3: 查找具有点击事件的元素
          if (buttons.length === 0) {
            console.log('🔄 搜索具有点击事件的元素...');
            document.querySelectorAll('*').forEach(el => {
              const rect = el.getBoundingClientRect();
              const text = (el.innerText || el.textContent || '').trim();
              const hasClickHandler = el.onclick || el.addEventListener || el.getAttribute('onclick');

              if (rect.width > 5 && rect.height > 5 && hasClickHandler &&
                  (text.includes('发送') || text.includes('Send') || el.className.includes('send'))) {
                // 避免重复添加
                if (!buttons.find(b => b.element === el)) {
                  buttons.push({
                    element: el,
                    text: text,
                    tag: el.tagName,
                    className: el.className,
                    id: el.id,
                    rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
                    source: 'click-handler-match',
                    selector: `${el.tagName.toLowerCase()}.${el.className.split(' ').join('.')}`,
                    priority: 3 // 低优先级
                  });
                  console.log(`✅ 通过点击事件找到发送按钮: ${text || '(无文本)'} (${el.tagName})`);
                }
              }
            });
          }

          // 策略4: 查找底部区域的任何可点击元素（最后尝试）
          if (buttons.length === 0) {
            console.log('🔄 搜索底部区域的可点击元素...');
            const windowHeight = window.innerHeight;
            document.querySelectorAll('button, [role="button"], div, span, a').forEach(el => {
              const rect = el.getBoundingClientRect();
              const isBottomArea = rect.y > windowHeight - 300; // 底部300px区域
              const isVisible = rect.width > 5 && rect.height > 5;

              if (isBottomArea && isVisible) {
                // 避免重复添加
                if (!buttons.find(b => b.element === el)) {
                  buttons.push({
                    element: el,
                    text: (el.innerText || el.textContent || '').trim(),
                    tag: el.tagName,
                    className: el.className,
                    id: el.id,
                    rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
                    source: 'bottom-area-match',
                    selector: `${el.tagName.toLowerCase()}`,
                    priority: 4 // 最低优先级
                  });
                  console.log(`✅ 通过底部区域找到候选按钮: ${el.tagName}.${el.className}`);
                }
              }
            });
          }

          // 策略5: 全局搜索所有可能的可点击元素（最终尝试）
          if (buttons.length === 0) {
            console.log('🔄 全局搜索所有可点击元素...');
            document.querySelectorAll('*').forEach(el => {
              const rect = el.getBoundingClientRect();
              const text = (el.innerText || el.textContent || '').trim();
              const hasText = text.length > 0;
              const isVisible = rect.width > 3 && rect.height > 3;
              const isClickable = el.tagName === 'BUTTON' || el.tagName === 'A' ||
                                el.getAttribute('onclick') || el.onclick ||
                                el.style.cursor === 'pointer' ||
                                el.className.includes('btn') || el.className.includes('button');

              if (hasText && isVisible && isClickable) {
                // 避免重复添加
                if (!buttons.find(b => b.element === el)) {
                  buttons.push({
                    element: el,
                    text: text,
                    tag: el.tagName,
                    className: el.className,
                    id: el.id,
                    rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
                    source: 'global-search',
                    selector: `${el.tagName.toLowerCase()}`,
                    priority: 5 // 最低优先级
                  });
                  console.log(`✅ 通过全局搜索找到候选按钮: ${text} (${el.tagName})`);
                }
              }
            });
          }

          // 按优先级排序，然后按位置（优先选择底部右侧）
          buttons.sort((a, b) => {
            if (a.priority !== b.priority) {
              return a.priority - b.priority; // 优先级数字越小越优先
            }
            // 相同优先级按位置排序（优先选择底部右侧）
            const scoreA = a.rect.y + (a.rect.x > window.innerWidth / 2 ? 1000 : 0);
            const scoreB = b.rect.y + (b.rect.x > window.innerWidth / 2 ? 1000 : 0);
            return scoreB - scoreA;
          });

          console.log(`🎯 总共找到 ${buttons.length} 个发送按钮候选`);
          return buttons;
        };

        const candidates = find1688SendButtons();

        if (candidates.length === 0) {
          console.log('❌ 未找到任何发送按钮');

          // 记录页面上的所有按钮用于调试
          const allButtons = [];
          document.querySelectorAll('button, [role="button"]').forEach((el, i) => {
            const text = (el.innerText || el.textContent || '').trim();
            const rect = el.getBoundingClientRect();
            if (rect.width > 10 && rect.height > 10) {
              allButtons.push({
                index: i,
                text: text,
                tag: el.tagName,
                className: el.className,
                rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
              });
            }
          });

          return {
            success: false,
            error: 'no send buttons found',
            debugInfo: {
              totalButtons: allButtons.length,
              buttons: allButtons.slice(0, 10), // 只记录前10个
              url: window.location.href
            }
          };
        }

        // 选择最佳候选按钮并高亮
        const bestCandidate = candidates[0];
        const el = bestCandidate.element;

        console.log(`🎯 选择最佳发送按钮: ${bestCandidate.text} (来源: ${bestCandidate.source})`);

        // 高亮效果
        const originalOutline = el.style.outline;
        const originalBoxShadow = el.style.boxShadow;
        el.style.outline = '3px solid #00ff00';
        el.style.boxShadow = '0 0 0 2px rgba(0,255,0,0.35)';

        return {
          success: true,
          element: {
            tag: el.tagName,
            className: el.className,
            id: el.id,
            text: bestCandidate.text,
            xpath: window.getXPath(el),
            source: bestCandidate.source,
            selector: bestCandidate.selector
          },
          candidatesCount: candidates.length
        };
      }).catch(e => ({ success: false, error: 'send button detection failed: ' + e.message }));

      if (!sendResult.success) {
        return { success: false, error: sendResult.error };
      }

      logger.info(`✅ 发送按钮定位成功: ${sendResult.element?.text}`);

      // 显示确认界面
      if (stepGate) {
        await this.injectGate(page, {
          title: '1688 聊天确认',
          message: `已输入消息: ${message}\\n\\n输入元素: ${inputResult.element?.tag}.${inputResult.element?.className}\\n发送按钮: ${sendResult.element?.text}\\n\\n点击"下一步"发送消息`
        });

        const sig = await this.waitGate(page, 0);
        if (sig === 'stop') return { success: false, error: 'stopped by user' };
      }

      // 发送消息
      let sent = false;
      if (doSend) {
        sent = await page.evaluate(() => {
          const buttons = document.querySelectorAll('button, [role="button"], a, div, span');
          for (const el of buttons) {
            const text = (el.innerText || el.textContent || '').trim();
            if (text.includes('发送') || text.includes('Send')) {
              try {
                // 多种点击方法
                el.click();

                // 如果是React组件，触发React事件
                const reactEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
                el.dispatchEvent(reactEvent);

                return true;
              } catch (e) {
                console.error('Click failed:', e);
              }
            }
          }
          return false;
        });
      }

      if (doSend && !sent) {
        return { success: false, error: 'send button click failed' };
      }

      logger.info(sent ? '✅ 消息发送成功' : '✅ 消息输入完成（未发送）');

      return {
        success: true,
        variables: {
          chatPrepared: true,
          chatMessage: message,
          chatSent: sent,
          inputElement: inputResult.element,
          sendElement: sendResult.element
        }
      };

    } catch (e) {
      logger.error('❌ ChatComposeNode1688 失败: ' + (e?.message || e));
      return { success: false, error: e?.message || String(e) };
    }
  }

  async injectGate(p, { title, message } = {}) {
    await p.evaluate((opts) => {
      const id = '__webauto_gate_panel__';
      let box = document.getElementById(id);
      if (box) box.remove();

      box = document.createElement('div');
      box.id = id;
      box.style.cssText = [
        'position:fixed','top:12px','right:12px','z-index:999999',
        'background:rgba(0,0,0,0.85)','color:#fff','padding:12px 16px',
        'border-radius:8px','font-family:-apple-system,system-ui,Segoe UI,Roboto,Ubuntu',
        'box-shadow:0 4px 20px rgba(0,0,0,0.4)','max-width:400px'
      ].join(';');

      const titleEl = document.createElement('div');
      titleEl.textContent = (opts && opts.title) || 'WebAuto';
      titleEl.style.cssText = 'font-weight:600;margin-bottom:8px;font-size:14px;color:#fff;';

      const msg = document.createElement('div');
      msg.textContent = (opts && opts.message) || '确认后继续';
      msg.style.cssText = 'opacity:0.9;margin-bottom:12px;font-size:13px;line-height:1.4;white-space:pre-line;';

      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;';

      const next = document.createElement('button');
      next.textContent = '下一步';
      next.style.cssText = 'background:#007AFF;border:none;color:#fff;border-radius:6px;padding:6px 16px;cursor:pointer;font-size:13px;font-weight:500;';

      const stop = document.createElement('button');
      stop.textContent = '停止';
      stop.style.cssText = 'background:#666;border:none;color:#fff;border-radius:6px;padding:6px 16px;cursor:pointer;font-size:13px;';

      row.appendChild(next); row.appendChild(stop);
      box.appendChild(titleEl); box.appendChild(msg); box.appendChild(row);
      document.body.appendChild(box);

      window.__webauto_gate_state = 'waiting';
      next.addEventListener('click', () => { window.__webauto_gate_state = 'next'; });
      stop.addEventListener('click', () => { window.__webauto_gate_state = 'stop'; });
    }, { title, message });
  }

  async waitGate(p, timeoutMs = 0) {
    const start = Date.now();
    while (true) {
      const state = await p.evaluate(() => window.__webauto_gate_state || '');
      if (state === 'next') return 'next';
      if (state === 'stop') return 'stop';
      if (timeoutMs && Date.now() - start > timeoutMs) return 'timeout';
      await new Promise(r => setTimeout(r, 300));
    }
  }
}