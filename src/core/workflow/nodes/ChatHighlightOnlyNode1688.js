// 1688聊天界面识别高亮组件 - 仅识别和高亮，不执行操作
import BaseNode from './BaseNode.js';

export default class ChatHighlightOnlyNode1688 extends BaseNode {
  constructor() {
    super();
    this.name = 'ChatHighlightOnlyNode1688';
    this.description = '1688聊天界面识别高亮组件，仅识别和高亮显示输入元素和发送按钮，不执行任何操作';
  }

  async execute(context) {
    const { context: browserContext, logger, config, engine, results, variables } = context;
    const hostFilter = config.hostFilter || 'air.1688.com';
    const message = typeof config.message === 'string' ? config.message : '你好';
    const highlightMs = Number(config.highlightMs || 15000);

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

      // 等待页面完全加载
      logger.info('⏳ 等待1688聊天界面完全加载...');
      await page.waitForTimeout(5000);

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

      // 等待页面稳定
      await page.waitForTimeout(3000);

      // 执行识别和高亮操作
      const highlightResult = await page.evaluate((params) => {
        const msg = params.message;
        const highlightDuration = params.highlightMs;
        console.log('🔍 开始1688聊天界面识别和高亮操作...');

        // 1. 检查页面状态
        const pageInfo = {
          url: window.location.href,
          title: document.title,
          isCoreFrame: window.location.href.includes('def_cbu_web_im_core/index.html'),
          totalElements: document.querySelectorAll('*').length,
          contenteditableCount: document.querySelectorAll('[contenteditable="true"]').length,
          buttonCount: document.querySelectorAll('button').length,
          timestamp: new Date().toISOString()
        };

        console.log('📊 页面状态信息:', pageInfo);
        console.log('🔍 检查页面是否包含核心聊天界面:', pageInfo.isCoreFrame);

        // 调试：记录所有可能的输入相关元素
        console.log('🔍 调试：查找所有可能的输入元素...');
        const allInputs = [];
        document.querySelectorAll('*').forEach((el, index) => {
          const rect = el.getBoundingClientRect();
          const isVisible = rect.width > 10 && rect.height > 10;
          const hasText = el.innerText || el.textContent || '';
          const hasInputLikeClass = String(el.className).includes('input') ||
                                 String(el.className).includes('editor') ||
                                 String(el.className).includes('chat') ||
                                 String(el.className).includes('compose');
          const isBottomArea = rect.y > window.innerHeight - 300;

          if (isVisible && (hasText || hasInputLikeClass || isBottomArea)) {
            allInputs.push({
              index,
              tag: el.tagName,
              className: el.className,
              id: el.id,
              text: hasText.substring(0, 50),
              rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
              isBottomArea,
              hasInputLikeClass
            });
          }
        });

        console.log(`🔍 找到 ${allInputs.length} 个可能的输入相关元素:`, allInputs.slice(0, 5));

        // 调试：记录所有按钮元素
        console.log('🔍 调试：查找所有按钮元素...');
        const allButtons = [];
        document.querySelectorAll('button, [role="button"], div, span, a').forEach((el, index) => {
          const rect = el.getBoundingClientRect();
          const isVisible = rect.width > 5 && rect.height > 5;
          const text = (el.innerText || el.textContent || '').trim();

          if (isVisible && text) {
            allButtons.push({
              index,
              tag: el.tagName,
              className: el.className,
              id: el.id,
              text: text.substring(0, 30),
              rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
              hasSendText: text.includes('发送')
            });
          }
        });

        console.log(`🔍 找到 ${allButtons.length} 个按钮元素，其中包含"发送"的: ${allButtons.filter(b => b.hasSendText).length}`);
        console.log('🔍 前5个按钮:', allButtons.slice(0, 5));

        // 2. 查找并高亮输入元素
        const findAndHighlightInputs = () => {
          console.log('🔍 开始查找输入元素...');
          const foundInputs = [];

          // 策略1: 查找contenteditable元素
          document.querySelectorAll('*').forEach((el, index) => {
            if (el.contentEditable === 'true' || el.isContentEditable || el.getAttribute('contenteditable') === 'true') {
              const rect = el.getBoundingClientRect();
              if (rect.width > 50 && rect.height > 20) {
                // 高亮输入元素
                const originalBorder = el.style.border;
                const originalBg = el.style.backgroundColor;
                const originalBoxShadow = el.style.boxShadow;

                el.style.border = '3px solid #ff4444';
                el.style.backgroundColor = 'rgba(255, 68, 68, 0.2)';
                el.style.boxShadow = '0 0 10px rgba(255, 68, 68, 0.5)';

                // 添加标签
                const label = document.createElement('div');
                label.textContent = `输入元素 ${index + 1}`;
                label.style.cssText = [
                  'position:fixed',
                  `left:${rect.left + rect.width / 2 - 40}px`,
                  `top:${rect.top - 25}px`,
                  'background:#ff4444',
                  'color:white',
                  'padding:2px 8px',
                  'border-radius:3px',
                  'font-size:12px',
                  'font-family:monospace',
                  'z-index:999999',
                  'pointer-events:none'
                ].join(';');
                document.body.appendChild(label);

                foundInputs.push({
                  element: el,
                  type: 'contenteditable',
                  tag: el.tagName,
                  className: el.className,
                  id: el.id,
                  rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
                  innerText: el.innerText?.substring(0, 100),
                  innerHTML: el.innerHTML.substring(0, 200),
                  label: label,
                  originalStyles: {
                    border: originalBorder,
                    backgroundColor: originalBg,
                    boxShadow: originalBoxShadow
                  }
                });

                console.log(`✅ 找到contenteditable输入元素 ${index + 1}: ${el.tagName}.${el.className}`);
              }
            }
          });

          // 策略2: 查找底部区域的div元素（可能的输入容器）
          const windowHeight = window.innerHeight;
          const bottomThreshold = windowHeight - 250;

          document.querySelectorAll('div').forEach((el, index) => {
            const rect = el.getBoundingClientRect();
            const isBottomArea = rect.y > bottomThreshold;
            const isInputSize = rect.width > 100 && rect.height > 30;
            const hasInputIndicators = String(el.className).includes('input') ||
                                     String(el.className).includes('editor') ||
                                     String(el.className).includes('chat') ||
                                     String(el.className).includes('compose') ||
                                     el.querySelector('[contenteditable]');

            // 避免重复标记已经找到的contenteditable元素
            const alreadyMarked = foundInputs.find(input => input.element === el);

            if (isBottomArea && isInputSize && hasInputIndicators && !alreadyMarked) {
              // 高亮候选输入容器
              const originalBorder = el.style.border;
              const originalBg = el.style.backgroundColor;
              const originalBoxShadow = el.style.boxShadow;

              el.style.border = '3px solid #ff8844';
              el.style.backgroundColor = 'rgba(255, 136, 68, 0.15)';
              el.style.boxShadow = '0 0 8px rgba(255, 136, 68, 0.4)';

              // 添加标签
              const label = document.createElement('div');
              label.textContent = `候选输入 ${index + 1}`;
              label.style.cssText = [
                'position:fixed',
                `left:${rect.left + rect.width / 2 - 40}px`,
                `top:${rect.top - 25}px`,
                'background:#ff8844',
                'color:white',
                'padding:2px 8px',
                'border-radius:3px',
                'font-size:12px',
                'font-family:monospace',
                'z-index:999999',
                'pointer-events:none'
              ].join(';');
              document.body.appendChild(label);

              foundInputs.push({
                element: el,
                type: 'input-container',
                tag: el.tagName,
                className: el.className,
                id: el.id,
                rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
                innerText: el.innerText?.substring(0, 100),
                innerHTML: el.innerHTML.substring(0, 200),
                label: label,
                originalStyles: {
                  border: originalBorder,
                  backgroundColor: originalBg,
                  boxShadow: originalBoxShadow
                }
              });

              console.log(`✅ 找到候选输入容器 ${index + 1}: ${el.tagName}.${el.className}`);
            }
          });

          return foundInputs;
        };

        // 3. 查找并高亮发送按钮
        const findAndHighlightSendButtons = () => {
          console.log('🔍 开始查找发送按钮...');
          const foundButtons = [];

          // 策略1: 查找包含"发送"文字的按钮
          document.querySelectorAll('button, [role="button"], div, span, a').forEach((el, index) => {
            const text = (el.innerText || el.textContent || '').trim();
            const rect = el.getBoundingClientRect();
            const isVisible = rect.width > 5 && rect.height > 5;

            if (isVisible && text.includes('发送')) {
              // 高亮发送按钮
              const originalBorder = el.style.border;
              const originalBg = el.style.backgroundColor;
              const originalBoxShadow = el.style.boxShadow;

              el.style.border = '3px solid #44ff44';
              el.style.backgroundColor = 'rgba(68, 255, 68, 0.2)';
              el.style.boxShadow = '0 0 10px rgba(68, 255, 68, 0.5)';

              // 添加标签
              const label = document.createElement('div');
              label.textContent = `发送按钮 ${index + 1}`;
              label.style.cssText = [
                'position:fixed',
                `left:${rect.left + rect.width / 2 - 40}px`,
                `top:${rect.top - 25}px`,
                'background:#44ff44',
                'color:white',
                'padding:2px 8px',
                'border-radius:3px',
                'font-size:12px',
                'font-family:monospace',
                'z-index:999999',
                'pointer-events:none'
              ].join(';');
              document.body.appendChild(label);

              foundButtons.push({
                element: el,
                text: text,
                tag: el.tagName,
                className: el.className,
                id: el.id,
                rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
                source: 'text-match',
                label: label,
                originalStyles: {
                  border: originalBorder,
                  backgroundColor: originalBg,
                  boxShadow: originalBoxShadow
                }
              });

              console.log(`✅ 找到发送按钮 ${index + 1}: ${text} (${el.tagName}.${el.className})`);
            }
          });

          // 策略2: 查找.send-btn类名的元素
          document.querySelectorAll('.send-btn, [class*="send"], [class*="Send"]').forEach((el, index) => {
            const rect = el.getBoundingClientRect();
            const isVisible = rect.width > 5 && rect.height > 5;

            // 避免重复标记
            const alreadyMarked = foundButtons.find(btn => btn.element === el);

            if (isVisible && !alreadyMarked) {
              const text = (el.innerText || el.textContent || '').trim();

              // 强化高亮发送按钮 - 更明显的样式
              const originalBorder = el.style.border;
              const originalBg = el.style.backgroundColor;
              const originalBoxShadow = el.style.boxShadow;
              const originalTransform = el.style.transform;

              // 🔥 超强发送按钮高亮 - 确保绝对可见
              el.style.setProperty('border', '6px solid #ff0000', 'important'); // 粗红色边框
              el.style.setProperty('background-color', 'rgba(255, 0, 0, 0.6)', 'important'); // 红色背景
              el.style.setProperty('box-shadow', '0 0 30px rgba(255, 0, 0, 1), 0 0 60px rgba(255, 0, 0, 0.8), inset 0 0 30px rgba(255, 255, 0, 0.9)', 'important'); // 三层阴影
              el.style.setProperty('transform', 'scale(1.3)', 'important'); // 更大放大
              el.style.setProperty('z-index', '99999999', 'important'); // 最高层级
              el.style.setProperty('transition', 'all 0.2s ease', 'important'); // 快速过渡
              el.style.setProperty('animation', 'superPulse 0.8s infinite', 'important'); // 超强脉冲动画

              // 添加超强闪烁动画
              const style = document.createElement('style');
              style.textContent = `
                @keyframes superPulse {
                  0% {
                    opacity: 1;
                    transform: scale(1.3);
                    box-shadow: 0 0 30px rgba(255, 0, 0, 1), 0 0 60px rgba(255, 0, 0, 0.8);
                  }
                  25% {
                    opacity: 0.8;
                    transform: scale(1.25);
                    box-shadow: 0 0 40px rgba(255, 255, 0, 1), 0 0 80px rgba(255, 0, 0, 1);
                  }
                  50% {
                    opacity: 0.6;
                    transform: scale(1.2);
                    box-shadow: 0 0 50px rgba(255, 255, 0, 1), 0 0 100px rgba(255, 0, 0, 1);
                  }
                  75% {
                    opacity: 0.8;
                    transform: scale(1.25);
                    box-shadow: 0 0 40px rgba(255, 0, 0, 1), 0 0 80px rgba(255, 255, 0, 1);
                  }
                  100% {
                    opacity: 1;
                    transform: scale(1.3);
                    box-shadow: 0 0 30px rgba(255, 0, 0, 1), 0 0 60px rgba(255, 0, 0, 0.8);
                  }
                }
              `;
              document.head.appendChild(style);

              // 添加标签
              const label = document.createElement('div');
              label.textContent = `发送类按钮 ${index + 1}`;
              label.style.cssText = [
                'position:fixed',
                `left:${rect.left + rect.width / 2 - 45}px`,
                `top:${rect.top - 25}px`,
                'background:#44aaff',
                'color:white',
                'padding:2px 8px',
                'border-radius:3px',
                'font-size:12px',
                'font-family:monospace',
                'z-index:999999',
                'pointer-events:none'
              ].join(';');
              document.body.appendChild(label);

              foundButtons.push({
                element: el,
                text: text,
                tag: el.tagName,
                className: el.className,
                id: el.id,
                rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
                source: 'class-match',
                label: label,
                originalStyles: {
                  border: originalBorder,
                  backgroundColor: originalBg,
                  boxShadow: originalBoxShadow,
                  transform: originalTransform
                }
              });

              console.log(`✅ 找到发送类按钮 ${index + 1}: ${text} (${el.tagName}.${el.className})`);
            }
          });

          return foundButtons;
        };

        // 4. 执行识别和高亮
        const foundInputs = findAndHighlightInputs();
        const foundButtons = findAndHighlightSendButtons();

        // 5. 创建信息面板
        const createInfoPanel = () => {
          const panel = document.createElement('div');
          panel.id = '__1688_highlight_info_panel__';
          panel.style.cssText = [
            'position:fixed',
            'top:12px',
            'left:12px',
            'z-index:999999',
            'background:rgba(0,0,0,0.9)',
            'color:#fff',
            'padding:16px',
            'border-radius:8px',
            'font-family:-apple-system,system-ui,Segoe UI,Roboto,Ubuntu',
            'box-shadow:0 4px 20px rgba(0,0,0,0.4)',
            'max-width:500px',
            'font-size:13px',
            'line-height:1.5'
          ].join(';');

          const title = document.createElement('div');
          title.textContent = '🔍 1688聊天界面识别结果';
          title.style.cssText = 'font-weight:600;margin-bottom:12px;font-size:15px;color:#4CAF50;';

          const pageInfoDiv = document.createElement('div');
          pageInfoDiv.innerHTML = `
            <strong>页面信息:</strong><br>
            URL: ${pageInfo.url}<br>
            标题: ${pageInfo.title}<br>
            核心聊天界面: ${pageInfo.isCoreFrame ? '是' : '否'}<br>
            总元素数: ${pageInfo.totalElements}<br>
            Contenteditable元素: ${pageInfo.contenteditableCount}<br>
            按钮数: ${pageInfo.buttonCount}
          `;
          pageInfoDiv.style.cssText = 'margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid #333;';

          const inputInfo = document.createElement('div');
          inputInfo.innerHTML = `
            <strong>输入元素识别:</strong><br>
            找到 ${foundInputs.length} 个输入元素<br>
            ${foundInputs.map((input, i) =>
              `• ${input.type}: ${input.tag}${input.className ? '.' + input.className.split(' ')[0] : ''} (${Math.round(input.rect.width)}×${Math.round(input.rect.height)})`
            ).join('<br>')}
          `;
          inputInfo.style.cssText = 'margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid #333;';

          const buttonInfo = document.createElement('div');
          buttonInfo.innerHTML = `
            <strong>发送按钮识别:</strong><br>
            找到 ${foundButtons.length} 个发送按钮<br>
            ${foundButtons.map((btn, i) =>
              `• ${btn.text || '(无文本)'}: ${btn.tag}${btn.className ? '.' + btn.className.split(' ')[0] : ''} (${btn.source})`
            ).join('<br>')}
          `;
          buttonInfo.style.cssText = 'margin-bottom:12px;';

          const note = document.createElement('div');
          note.textContent = `⏰ 高亮将在 ${Math.round(highlightDuration/1000)} 秒后自动消失`;
          note.style.cssText = 'opacity:0.7;font-size:12px;margin-top:8px;';

          panel.appendChild(title);
          panel.appendChild(pageInfoDiv);
          panel.appendChild(inputInfo);
          panel.appendChild(buttonInfo);
          panel.appendChild(note);

          document.body.appendChild(panel);
          return panel;
        };

        const infoPanel = createInfoPanel();

        // 6. 设置自动清理函数
        const cleanup = () => {
          console.log('🧹 清理高亮效果...');

          // 恢复所有输入元素的原始样式
          foundInputs.forEach(input => {
            if (input.element && input.originalStyles) {
              input.element.style.border = input.originalStyles.border;
              input.element.style.backgroundColor = input.originalStyles.backgroundColor;
              input.element.style.boxShadow = input.originalStyles.boxShadow;
            }
            if (input.label && input.label.parentNode) {
              input.label.parentNode.removeChild(input.label);
            }
          });

          // 恢复所有按钮元素的原始样式
          foundButtons.forEach(button => {
            if (button.element && button.originalStyles) {
              button.element.style.border = button.originalStyles.border;
              button.element.style.backgroundColor = button.originalStyles.backgroundColor;
              button.element.style.boxShadow = button.originalStyles.boxShadow;
              if (button.originalStyles.transform !== undefined) {
                button.element.style.transform = button.originalStyles.transform;
              }
            }
            if (button.label && button.label.parentNode) {
              button.label.parentNode.removeChild(button.label);
            }
          });

          // 移除信息面板
          if (infoPanel && infoPanel.parentNode) {
            infoPanel.parentNode.removeChild(infoPanel);
          }

          console.log('✅ 清理完成');
        };

        // 7. 设置自动清理定时器
        setTimeout(cleanup, highlightDuration);

        return {
          success: true,
          pageInfo,
          foundInputs: foundInputs.map(input => ({
            type: input.type,
            tag: input.tag,
            className: input.className,
            id: input.id,
            rect: input.rect,
            innerText: input.innerText,
            source: input.source || 'detection'
          })),
          foundButtons: foundButtons.map(button => ({
            text: button.text,
            tag: button.tag,
            className: button.className,
            id: button.id,
            rect: button.rect,
            source: button.source
          })),
          summary: {
            totalInputs: foundInputs.length,
            contenteditableInputs: foundInputs.filter(i => i.type === 'contenteditable').length,
            containerInputs: foundInputs.filter(i => i.type === 'input-container').length,
            totalButtons: foundButtons.length,
            textMatchButtons: foundButtons.filter(b => b.source === 'text-match').length,
            classMatchButtons: foundButtons.filter(b => b.source === 'class-match').length
          }
        };
      }, { message, highlightMs }).catch(e => ({ success: false, error: 'highlight evaluation failed: ' + e.message }));

      if (!highlightResult.success) {
        return { success: false, error: highlightResult.error };
      }

      logger.info(`✅ 识别高亮完成: 输入元素 ${highlightResult.summary.totalInputs} 个，发送按钮 ${highlightResult.summary.totalButtons} 个`);

      // 等待高亮显示
      await page.waitForTimeout(highlightMs);

      return {
        success: true,
        variables: {
          highlightCompleted: true,
          inputElements: highlightResult.foundInputs,
          sendButtons: highlightResult.foundButtons,
          summary: highlightResult.summary,
          pageInfo: highlightResult.pageInfo
        }
      };

    } catch (e) {
      logger.error('❌ ChatHighlightOnlyNode1688 失败: ' + (e?.message || e));
      return { success: false, error: e?.message || String(e) };
    }
  }
}