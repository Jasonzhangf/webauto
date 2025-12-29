// 1688聊天界面DOM结构深度分析
import { firefox } from 'playwright';
import fs from 'node:fs';

async function analyze1688ChatDOMStructure() {
  console.log('🔍 开始深度分析1688聊天界面DOM结构...');

  const browser = await firefox.launch({
    headless: false,
    slowMo: 500
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:120.0) Gecko/20100101 Firefox/120.0'
  });

  // 加载Cookie
  try {
    const cookiePath = '/Users/fanzhang/.webauto/cookies/1688-domestic.json';
    if (fs.existsSync(cookiePath)) {
      const cookies = JSON.parse(fs.readFileSync(cookiePath, 'utf8'));
      await context.addCookies(cookies);
      console.log('✅ Cookie加载成功');
    }
  } catch (e) {
    console.log('⚠️ Cookie加载失败:', e.message);
  }

  const page = await context.newPage();

  // 监听控制台输出
  page.on('console', msg => {
    console.log(`📢 [${msg.type()}] ${msg.text()}`);
  });

  try {
    // 导航到1688主页
    console.log('🚀 导航到1688主页...');
    await page.goto('https://www.1688.com/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    // 导航到聊天页面
    console.log('💬 导航到聊天页面...');
    const chatUrl = 'https://air.1688.com/app/ocms-fusion-components-1688/def_cbu_web_im/index.html?touid=cnalichn%E6%B8%A9%E5%B7%9E%E7%9F%97%E7%AB%8B%E8%B4%B8%E6%98%93%E6%9C%89%E9%99%90%E5%85%AC%E5%8F%B8%E7%89%9B&siteid=cnalichn&status=2&portalId=&gid=&offerId=&itemsId=&spmid=a26352.13672862.0#/';

    await page.goto(chatUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(8000);

    // 关闭可能的客户端提示
    await page.evaluate(() => {
      const texts = ['优先使用网页版','继续使用网页版','使用网页版','仍使用网页','留在网页'];
      const nodes = Array.from(document.querySelectorAll('button, [role="button"], a, div'));
      for (const node of nodes) {
        const text = node.innerText || '';
        if (texts.some(t => text.includes(t))) {
          node.click();
          break;
        }
      }
    });

    await page.waitForTimeout(3000);

    // 深度DOM分析
    console.log('🔬 开始深度DOM结构分析...');

    const analysis = await page.evaluate(() => {
      console.log('🔍 开始1688聊天界面DOM深度分析...');

      const result = {
        timestamp: new Date().toISOString(),
        url: window.location.href,
        title: document.title,
        analysis: {}
      };

      // 1. 检查页面基础信息
      result.analysis.pageInfo = {
        totalElements: document.querySelectorAll('*').length,
        bodyElementCount: document.body.querySelectorAll('*').length,
        hasReact: !!document.querySelector('[data-reactroot]') || !!window.React,
        hasVue: !!document.querySelector('[data-v-]') || !!window.Vue,
        scriptsCount: document.scripts.length,
        iframesCount: document.querySelectorAll('iframe').length,
        doctype: document.doctype ? document.doctype.name : 'unknown'
      };

      // 2. 分析输入区域 - 重点查找底部输入区域
      console.log('📝 分析输入区域...');
      result.analysis.inputArea = {
        contenteditableElements: [],
        possibleInputContainers: [],
        bottomAreaElements: [],
        reactInputComponents: []
      };

      // 查找contenteditable元素
      document.querySelectorAll('*').forEach((el, index) => {
        if (el.contentEditable === 'true' || el.isContentEditable || el.getAttribute('contenteditable') === 'true') {
          const rect = el.getBoundingClientRect();
          const isVisible = rect.width > 10 && rect.height > 10;

          result.analysis.inputArea.contenteditableElements.push({
            index,
            tag: el.tagName,
            id: el.id,
            className: el.className,
            innerHTML: el.innerHTML.substring(0, 200),
            innerText: el.innerText?.substring(0, 100),
            isVisible,
            rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
            styles: {
              position: getComputedStyle(el).position,
              display: getComputedStyle(el).display,
              zIndex: getComputedStyle(el).zIndex,
              backgroundColor: getComputedStyle(el).backgroundColor,
              border: getComputedStyle(el).border
            },
            events: {
              onclick: !!el.onclick,
              oninput: !!el.oninput,
              onkeydown: !!el.onkeydown,
              onkeyup: !!el.onkeyup,
              onfocus: !!el.onfocus,
              onblur: !!el.onblur
            }
          });
        }
      });

      // 查找底部区域的可能输入容器
      const windowHeight = window.innerHeight;
      const bottomThreshold = windowHeight - 250; // 底部250px区域

      document.querySelectorAll('div, section, article').forEach((el, index) => {
        const rect = el.getBoundingClientRect();
        const isBottomArea = rect.y > bottomThreshold;
        const isVisible = rect.width > 50 && rect.height > 30;

        if (isBottomArea && isVisible) {
          // 检查是否可能是输入容器
          const hasInputIndicators =
            el.className.includes('input') ||
            el.className.includes('editor') ||
            el.className.includes('chat') ||
            el.className.includes('compose') ||
            el.className.includes('message') ||
            el.querySelector('[contenteditable]') ||
            el.querySelector('textarea') ||
            el.querySelector('input[type="text"]') ||
            el.querySelector('button');

          result.analysis.inputArea.bottomAreaElements.push({
            index,
            tag: el.tagName,
            id: el.id,
            className: el.className,
            innerHTML: el.innerHTML.substring(0, 300),
            innerText: el.innerText?.substring(0, 100),
            isVisible,
            isBottomArea,
            hasInputIndicators,
            rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
            distanceFromBottom: windowHeight - rect.y,
            childrenCount: el.children.length,
            descendantInputs: el.querySelectorAll('[contenteditable], textarea, input').length,
            descendantButtons: el.querySelectorAll('button').length
          });
        }
      });

      // 查找React输入组件
      document.querySelectorAll('*').forEach((el, index) => {
        if (el._reactInternalFiber || el._reactInternalInstance) {
          const rect = el.getBoundingClientRect();
          const isVisible = rect.width > 10 && rect.height > 10;
          const hasInputCharacteristics =
            el.className.includes('input') ||
            el.className.includes('editor') ||
            el.contentEditable === 'true' ||
            el.tagName === 'INPUT' ||
            el.tagName === 'TEXTAREA';

          if (isVisible && hasInputCharacteristics) {
            result.analysis.inputArea.reactInputComponents.push({
              index,
              tag: el.tagName,
              id: el.id,
              className: el.className,
              innerHTML: el.innerHTML.substring(0, 200),
              innerText: el.innerText?.substring(0, 100),
              rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
              reactProps: el._reactInternalFiber ? {
                elementType: el._reactInternalFiber.elementType?.name || 'unknown',
                memoizedProps: Object.keys(el._reactInternalFiber.memoizedProps || {})
              } : {}
            });
          }
        }
      });

      // 3. 分析发送按钮 - 重点查找真正的发送按钮
      console.log('🔘 分析发送按钮...');
      result.analysis.sendButtons = {
        exactSendButtons: [],
        possibleSendButtons: [],
        bottomAreaButtons: [],
        allButtonsForReference: []
      };

      // 查找包含"发送"文字的按钮
      document.querySelectorAll('button, [role="button"], a, div, span').forEach((el, index) => {
        const text = (el.innerText || el.textContent || '').trim();
        const rect = el.getBoundingClientRect();
        const isVisible = rect.width > 5 && rect.height > 5;

        if (isVisible) {
          const isExactSendButton = text === '发送' || text === 'Send';
          const isPossibleSendButton = text.includes('发送') || text.includes('Send') ||
                                     text.includes('发 送') || text.includes('发 送');
          const isBottomArea = rect.y > windowHeight - 300;

          const buttonInfo = {
            index,
            tag: el.tagName,
            id: el.id,
            className: el.className,
            text: text,
            isVisible,
            rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
            isBottomArea,
            styles: {
              position: getComputedStyle(el).position,
              display: getComputedStyle(el).display,
              backgroundColor: getComputedStyle(el).backgroundColor,
              color: getComputedStyle(el).color,
              cursor: getComputedStyle(el).cursor
            },
            events: {
              onclick: !!el.onclick,
              onmousedown: !!el.onmousedown,
              onmouseup: !!el.onmouseup
            },
            attributes: {
              role: el.getAttribute('role'),
              type: el.getAttribute('type'),
              disabled: el.getAttribute('disabled'),
              title: el.getAttribute('title')
            }
          };

          if (isExactSendButton) {
            result.analysis.sendButtons.exactSendButtons.push(buttonInfo);
          } else if (isPossibleSendButton) {
            result.analysis.sendButtons.possibleSendButtons.push(buttonInfo);
          } else if (isBottomArea) {
            result.analysis.sendButtons.bottomAreaButtons.push(buttonInfo);
          }

          // 记录所有按钮用于参考（最多前20个）
          if (result.analysis.sendButtons.allButtonsForReference.length < 20) {
            result.analysis.sendButtons.allButtonsForReference.push(buttonInfo);
          }
        }
      });

      // 4. 分析页面结构和布局
      console.log('🏗️ 分析页面结构...');
      result.analysis.pageStructure = {
        viewport: { width: window.innerWidth, height: window.innerHeight },
        scrollPosition: { x: window.scrollX, y: window.scrollY },
        bodySize: {
          width: document.body.scrollWidth,
          height: document.body.scrollHeight
        },
        mainSections: []
      };

      // 查找主要区域
      ['header', 'main', 'section', 'article', 'aside', 'footer'].forEach(tagName => {
        document.querySelectorAll(tagName).forEach((el, index) => {
          const rect = el.getBoundingClientRect();
          const isVisible = rect.width > 50 && rect.height > 50;

          if (isVisible) {
            result.analysis.pageStructure.mainSections.push({
              index,
              tag: el.tagName,
              id: el.id,
              className: el.className,
              rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
              innerText: el.innerText?.substring(0, 50)
            });
          }
        });
      });

      // 5. 查找iframe和嵌套内容
      console.log('🖼️ 分析iframe和嵌套内容...');
      result.analysis.embeddedContent = {
        iframes: [],
        shadowDOMs: []
      };

      document.querySelectorAll('iframe').forEach((frame, index) => {
        const rect = frame.getBoundingClientRect();
        const isVisible = rect.width > 10 && rect.height > 10;

        result.analysis.embeddedContent.iframes.push({
          index,
          src: frame.src,
          id: frame.id,
          className: frame.className,
          isVisible,
          rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          accessible: false,
          sameOrigin: frame.src === 'about:blank' || frame.src.startsWith(window.location.origin)
        });
      });

      // 查找Shadow DOM
      document.querySelectorAll('*').forEach((el, index) => {
        if (el.shadowRoot) {
          const rect = el.getBoundingClientRect();
          const isVisible = rect.width > 10 && rect.height > 10;

          result.analysis.embeddedContent.shadowDOMs.push({
            index,
            tag: el.tagName,
            className: el.className,
            isVisible,
            rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
            shadowElementCount: el.shadowRoot.querySelectorAll('*').length
          });
        }
      });

      // 6. 特殊检查：查找可能的输入框父容器
      console.log('🔍 查找输入框父容器...');
      result.analysis.inputContainers = [];

      // 通过常见输入框的父类名查找
      const inputContainerClasses = ['input', 'editor', 'compose', 'chat', 'message', 'text'];
      inputContainerClasses.forEach(className => {
        document.querySelectorAll(`[class*="${className}"]`).forEach((el, index) => {
          const rect = el.getBoundingClientRect();
          const isVisible = rect.width > 30 && rect.height > 20;

          if (isVisible) {
            const childInputs = el.querySelectorAll('[contenteditable], textarea, input').length;
            const childButtons = el.querySelectorAll('button').length;

            result.analysis.inputContainers.push({
              index,
              className: el.className,
              id: el.id,
              tag: el.tagName,
              matchedClass: className,
              rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
              childInputs,
              childButtons,
              innerHTML: el.innerHTML.substring(0, 200)
            });
          }
        });
      });

      console.log('✅ DOM分析完成');
      return result;
    });

    // 保存分析结果
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const resultPath = `/Users/fanzhang/Documents/github/webauto/archive/workflow-records/1688-dom-structure-analysis-${timestamp}.json`;
    fs.writeFileSync(resultPath, JSON.stringify(analysis, null, 2));
    console.log(`\n💾 分析结果已保存到: ${resultPath}`);

    // 输出关键发现
    console.log('\n📊 ===== 1688聊天界面DOM分析关键发现 =====');

    console.log('\n📝 输入元素分析:');
    console.log(`- Contenteditable元素数量: ${analysis.analysis.inputArea.contenteditableElements.length}`);
    analysis.analysis.inputArea.contenteditableElements.forEach((el, i) => {
      console.log(`  ${i+1}. ${el.tag}.${el.className}`);
      console.log(`     位置: (${Math.round(el.rect.x)}, ${Math.round(el.rect.y)})`);
      console.log(`     可见: ${el.isVisible}, 事件: ${Object.keys(el.events).filter(k => el.events[k]).join(', ')}`);
    });

    console.log('\n🔘 发送按钮分析:');
    console.log(`- 精确"发送"按钮: ${analysis.analysis.sendButtons.exactSendButtons.length}`);
    console.log(`- 可能的发送按钮: ${analysis.analysis.sendButtons.possibleSendButtons.length}`);
    console.log(`- 底部区域按钮: ${analysis.analysis.sendButtons.bottomAreaButtons.length}`);

    analysis.analysis.sendButtons.exactSendButtons.forEach((btn, i) => {
      console.log(`  ✅ 精确发送按钮 ${i+1}: ${btn.text} (${btn.tag}.${btn.className})`);
      console.log(`     位置: (${Math.round(btn.rect.x)}, ${Math.round(btn.rect.y)})`);
    });

    console.log('\n🖼️ 嵌套内容分析:');
    console.log(`- iframe数量: ${analysis.analysis.embeddedContent.iframes.length}`);
    console.log(`- Shadow DOM数量: ${analysis.analysis.embeddedContent.shadowDOMs.length}`);

    // 截图保存
    const screenshotPath = `/Users/fanzhang/Documents/github/webauto/archive/workflow-records/1688-chat-screenshot-${timestamp}.png`;
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`📸 截图已保存到: ${screenshotPath}`);

    console.log('\n⏳ 浏览器将保持打开30秒，您可以手动检查页面...');
    await page.waitForTimeout(30000);

  } catch (error) {
    console.error('❌ 分析过程中出错:', error);
  } finally {
    await browser.close();
    console.log('🏁 分析完成');
  }
}

// 运行分析
analyze1688ChatDOMStructure().catch(console.error);
