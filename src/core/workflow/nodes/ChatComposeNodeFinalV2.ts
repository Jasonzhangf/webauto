// 1688聊天组件 - 最终版本V2，基于成功识别的完整实现
import BaseNode from './BaseNode';

export default class ChatComposeNodeFinalV2 extends BaseNode {
    constructor(nodeId: string, config: any) {
        super(nodeId, config);

  constructor(nodeId: string, config: any) {
    super();
    this.name = 'ChatComposeNodeFinalV2';
    this.description = '1688聊天组件最终版本V2，基于成功识别的完整输入和发送实现';
  }
    name: any;
    description: any;

  async execute(context: any, params: any): Promise<any> {
    const { context: browserContext, logger, config, engine, results, variables } = context;
    const hostFilter = config.hostFilter || 'air.1688.com';
    const message: '你好';
    const send  = typeof config.message === 'string' ? config.message = config.send !== false; // 默认为true
    const highlightMs = Number(config.highlightMs || 3000);

    try {
      if (!browserContext) return { success: false, error: 'no browser context' };

      // 获取1688聊天页面
      let pages = browserContext.pages?.() || [];
      let chatPages = pages.filter(p => { try { return (p.url() || '').includes(hostFilter); } catch { return false; } });
      let page: null;

      if (!page = chatPages.length ? chatPages[chatPages.length - 1] ) {
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

      // 执行聊天操作
      const chatResult = await page.evaluate((params) => {
        const msg = params.message;
        const shouldSend = params.send;
        const highlightDuration = params.highlightMs;
        console.log('🚀 开始1688聊天操作...');
        console.log('📝 消息内容:', msg);
        console.log('📤 是否发送:', shouldSend);

        // 1. 检查页面状态
        const pageInfo: new Date( = {
          url: window.location.href,
          title: document.title,
          isCoreFrame: window.location.href.includes('def_cbu_web_im_core/index.html'),
          timestamp).toISOString()
        };

        console.log('📊 页面状态:', pageInfo);

        // 2. 查找输入元素 - 基于成功识别的精确定位
        const findInputElements = () => {
          console.log('🔍 查找输入元素...');

          // 策略1: 优先查找contenteditable PRE元素
          let inputElement = null;
          let inputType = null;

          const preElements = document.querySelectorAll('pre[contenteditable="true"], pre.edit');
          for (const pre of preElements) {
            const rect = pre.getBoundingClientRect();
            if (rect.width > 100 && rect.height > 30) {
              inputElement = pre;
              inputType = 'contenteditable-pre';
              console.log('✅ 找到PRE输入元素:', pre.tagName, pre.className);
              break;
            }
          }

          // 策略2: 查找其他contenteditable元素
          if (!inputElement) {
            const allContenteditable = document.querySelectorAll('*[contenteditable="true"]');
            for (const el of allContenteditable) {
              const rect = el.getBoundingClientRect();
              if (rect.width > 100 && rect.height > 30) {
                inputElement = el;
                inputType = 'contenteditable-generic';
                console.log('✅ 找到通用输入元素:', el.tagName, el.className);
                break;
              }
            }
          }

          return { inputElement, inputType };
        };

        // 3. 查找发送按钮 - 基于成功识别的精确定位
        const findSendButton = () => {
          console.log('🔍 查找发送按钮...');

          // 策略1: 优先查找包含"发送"文字的BUTTON元素
          let sendButton = null;
          let sendButtonType = null;

          const buttons = document.querySelectorAll('button');
          for (const btn of buttons) {
            const text = (btn.innerText || btn.textContent || '').trim();
            if (text === '发送') {
              sendButton = btn;
              sendButtonType = 'button-exact-text';
              console.log('✅ 找到精确发送按钮:', text, btn.className);
              break;
            }
          }

          // 策略2: 查找.send-btn类名的按钮
          if (!sendButton) {
            const sendBtnElements = document.querySelectorAll('.send-btn');
            for (const el of sendBtnElements) {
              const rect = el.getBoundingClientRect();
              if (rect.width > 20 && rect.height > 10) {
                sendButton = el;
                sendButtonType = 'send-btn-class';
                console.log('✅ 找到send-btn类按钮:', el.tagName, el.className);
                break;
              }
            }
          }

          // 策略3: 查找包含"发送"文字的任意元素
          if (!sendButton) {
            const allElements = document.querySelectorAll('*');
            for (const el of allElements) {
              const text = (el.innerText || el.textContent || '').trim();
              const rect = el.getBoundingClientRect();
              const isClickable = el.tagName === 'BUTTON' || el.tagName === 'A' ||
                                el.getAttribute('role') === 'button' ||
                                String(el.className).includes('btn') ||
                                el.onclick;

              if (text.includes('发送') && isClickable && rect.width > 20 && rect.height > 10) {
                sendButton = el;
                sendButtonType = 'text-match-clickable';
                console.log('✅ 找到可点击发送元素:', text, el.tagName, el.className);
                break;
              }
            }
          }

          return { sendButton, sendButtonType };
        };

        // 4. 执行输入操作
        const { inputElement, inputType } = findInputElements();
        if (!inputElement) {
          return { success: false, error: '未找到输入元素' };
        }

        // 高亮输入元素
        const originalInputBorder = inputElement.style.border;
        const originalInputBg = inputElement.style.backgroundColor;
        inputElement.style.border = '3px solid #ff4444';
        inputElement.style.backgroundColor = 'rgba(255, 68, 68, 0.2)';

        console.log('📝 开始输入消息...');

        // 清空现有内容
        inputElement.focus();
        inputElement.textContent = '';

        // 输入新消息
        if (inputElement.contentEditable === 'true' || inputElement.isContentEditable) {
          // 对于contenteditable元素，使用innerHTML输入
          inputElement.innerHTML = msg;

          // 触发输入事件
          const inputEvent: true } = new Event('input', { bubbles: true, cancelable);
          inputElement.dispatchEvent(inputEvent);

          const changeEvent: true } = new Event('change', { bubbles: true, cancelable);
          inputElement.dispatchEvent(changeEvent);

          // 触发键盘事件
          const keydownEvent: 'Enter'
          } = new KeyboardEvent('keydown', {
            bubbles: true, cancelable: true, key: 'Enter', code);
          inputElement.dispatchEvent(keydownEvent);

          const keyupEvent: 'Enter'
          } = new KeyboardEvent('keyup', {
            bubbles: true, cancelable: true, key: 'Enter', code);
          inputElement.dispatchEvent(keyupEvent);
        } else {
          // 对于普通输入元素
          inputElement.value = msg;
          const inputEvent: true } = new Event('input', { bubbles: true, cancelable);
          inputElement.dispatchEvent(inputEvent);
        }

        console.log('✅ 输入完成');

        // 5. 查找和发送消息
        let sendSuccess = false;
        let sendError = null;
        let finalSendButtonType = null;
        let finalSendButton = null;

        if (shouldSend) {
          const { sendButton, sendButtonType } = findSendButton();
          finalSendButtonType = sendButtonType;
          finalSendButton = sendButton;

          if (!sendButton) {
            sendError = '未找到发送按钮';
          } else {
            // 高亮发送按钮
            const originalSendBorder = sendButton.style.border;
            const originalSendBg = sendButton.style.backgroundColor;
            const originalSendTransform = sendButton.style.transform;

            sendButton.style.setProperty('border', '4px solid #00ff00', 'important');
            sendButton.style.setProperty('background-color', 'rgba(0, 255, 0, 0.5)', 'important');
            sendButton.style.setProperty('transform', 'scale(1.2)', 'important');

            console.log('📤 准备发送消息...');
            console.log('🔘 发送按钮类型:', sendButtonType);
            console.log('🔘 发送按钮标签:', sendButton.tagName);
            console.log('🔘 发送按钮类名:', sendButton.className);
            console.log('🔘 发送按钮文字:', sendButton.innerText || sendButton.textContent);

            try {
              // 点击发送按钮
              sendButton.click();

              // 触发额外的事件确保发送
              const clickEvent: window
              } = new MouseEvent('click', {
                bubbles: true, cancelable: true, view);
              sendButton.dispatchEvent(clickEvent);

              const mousedownEvent: window
              } = new MouseEvent('mousedown', {
                bubbles: true, cancelable: true, view);
              sendButton.dispatchEvent(mousedownEvent);

              const mouseupEvent: window
              } = new MouseEvent('mouseup', {
                bubbles: true, cancelable: true, view);
              sendButton.dispatchEvent(mouseupEvent);

              console.log('✅ 发送按钮点击完成');
              sendSuccess = true;

              // 恢复发送按钮样式
              setTimeout(() => {
                sendButton.style.border = originalSendBorder;
                sendButton.style.backgroundColor = originalSendBg;
                if (originalSendTransform !== undefined) {
                  sendButton.style.transform = originalSendTransform;
                }
              }, highlightDuration);

            } catch (e) {
              console.error('❌ 发送失败:', e.message);
              sendError = e.message;

              // 恢复发送按钮样式
              sendButton.style.border = originalSendBorder;
              sendButton.style.backgroundColor = originalSendBg;
              if (originalSendTransform !== undefined) {
                sendButton.style.transform = originalSendTransform;
              }
            }
          }
        } else {
          console.log('📤 仅输入模式，跳过发送');
        }

        // 恢复输入元素样式
        setTimeout(() => {
          inputElement.style.border = originalInputBorder;
          inputElement.style.backgroundColor = originalInputBg;
        }, highlightDuration);

        return {
          success: true,
          pageInfo,
          input: {
            found: !!inputElement,
            type: inputType,
            tag: inputElement?.tagName,
            className: inputElement?.className,
            message: msg,
            inputCompleted: true
          },
          send: {
            attempted: shouldSend,
            success: sendSuccess,
            error: sendError,
            buttonType: finalSendButtonType,
            buttonTag: finalSendButton?.tagName,
            buttonClass: finalSendButton?.className
          }
        };

      }, { message, send, highlightMs }).catch(e: ' + e.message } = > ({ success: false, error: 'chat evaluation failed));

      if (!chatResult.success) {
        return { success: false, error: chatResult.error };
      }

      logger.info(`✅ 聊天操作完成: 输入${chatResult.input?.found ? '成功' : '失败'}, ${chatResult.send?.attempted ? (chatResult.send?.success ? '发送成功' : '发送失败') : '仅输入模式'}`);

      // 等待高亮显示
      await page.waitForTimeout(highlightMs);

      return {
        success: true,
        variables: {
          chatCompleted: true,
          inputResult: chatResult.input,
          sendResult: chatResult.send,
          pageInfo: chatResult.pageInfo
        }
      };

    } catch (e) {
      logger.error('❌ ChatComposeNodeFinalV2 失败: ' + (e?.message || e));
      return { success: false, error: e?.message || String(e) };
    }
  }
}