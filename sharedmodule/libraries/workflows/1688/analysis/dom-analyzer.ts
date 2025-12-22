// 1688聊天界面DOM分析工具
import { chromium } from 'playwright';
import * as fs from 'fs';

interface AnalysisResult {
  pageUrl: string;
  pageTitle: string;
  timestamp: string;
  basicInfo: {
    totalElements: number;
    bodyElementCount: number;
    hasReact: boolean;
    hasVue: boolean;
    scriptsCount: number;
    iframesCount: number;
  };
  inputElements: Array<{
    type: string;
    selector?: string;
    index: number;
    tag: string;
    id: string;
    className: string;
    name?: string;
    placeholder?: string;
    contentEditable?: string;
    visible: boolean;
    rect: { x: number; y: number; width: number; height: number };
    innerHTML?: string;
    innerText?: string;
    events?: {
      onclick: boolean;
      oninput: boolean;
      onkeydown: boolean;
      onkeyup: boolean;
    };
  }>;
  sendButtons: Array<{
    type: string;
    selector?: string;
    index: number;
    tag: string;
    id: string;
    className: string;
    text?: string;
    visible: boolean;
    rect: { x: number; y: number; width: number; height: number };
    innerHTML?: string;
    possibleSend?: boolean;
  }>;
  iframeAnalysis: Array<{
    index: number;
    src: string;
    accessible: boolean;
    elementCount?: number;
    inputElements?: number;
    buttons?: number;
    error?: string;
  }>;
  shadowDOM: Array<{
    tag: string;
    className: string;
    shadowElementCount: number;
    shadowInputs: number;
  }>;
  reactAnalysis: {
    hasReactRoot: boolean;
    reactComponents: Array<{
      index: number;
      tag: string;
      className: string;
      rect: { x: number; y: number; width: number; height: number };
      hasEvents: boolean;
    }>;
  };
}

interface Cookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: string;
}

async function analyze1688ChatDOM(): Promise<void> {
  console.log('🔍 开始分析1688聊天界面DOM结构...');

  const browser = await chromium.launch({
    headless: false,
    slowMo: 1000
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });

  // 加载Cookie
  try {
    const cookiePath = '/Users/fanzhang/.webauto/cookies/1688-domestic.json';
    if (fs.existsSync(cookiePath)) {
      const cookies: Cookie[] = JSON.parse(fs.readFileSync(cookiePath, 'utf8'));
      await context.addCookies(cookies);
      console.log('✅ Cookie加载成功');
    }
  } catch (e: any) {
    console.log('⚠️ Cookie加载失败:', e.message);
  }

  const page = await context.newPage();

  // 监听控制台输出
  page.on('console', msg => {
    console.log(`📢 [${msg.type()}] ${msg.text()}`);
  });

  // 监听请求
  page.on('request', request => {
    if (request.url().includes('1688.com')) {
      console.log(`🌐 请求: ${request.method()} ${request.url()}`);
    }
  });

  try {
    // 导航到1688主页先登录
    console.log('🚀 导航到1688主页...');
    await page.goto('https://www.1688.com/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    // 检查登录状态
    const isLoggedIn = await page.evaluate(() => {
      return !!document.querySelector('.member-name, .member-avatar, [data-spm="member"]');
    });

    console.log(`📋 登录状态: ${isLoggedIn ? '已登录' : '未登录'}`);

    if (!isLoggedIn) {
      console.log('⚠️ 需要手动登录，请完成登录后按回车继续...');
      await page.waitForTimeout(10000);
    }

    // 导航到聊天页面
    console.log('💬 导航到聊天页面...');
    const chatUrl = 'https://air.1688.com/app/ocms-fusion-components-1688/def_cbu_web_im/index.html?touid=cnalichn%E6%B0%B8%E5%BA%B7%E5%B8%82%E9%80%94%E6%B4%BE%E5%B7%A5%E8%B4%B8%E6%9C%89%E9%99%90%E5%85%AC%E5%8F%B8&siteid=cnalichn&status=2&portalId=&gid=&offerId=858532417224&itemsId=&spmid=a26352.13672862.offerlist#/';

    await page.goto(chatUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000);

    // 关闭可能的客户端提示
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

    await page.waitForTimeout(3000);

    // 深度DOM分析
    console.log('🔬 开始深度DOM分析...');

    const analysisResult: AnalysisResult = await page.evaluate(() => {
      const results: AnalysisResult = {
        pageUrl: window.location.href,
        pageTitle: document.title,
        timestamp: new Date().toISOString(),
        basicInfo: {
          totalElements: 0,
          bodyElementCount: 0,
          hasReact: false,
          hasVue: false,
          scriptsCount: 0,
          iframesCount: 0
        },
        inputElements: [],
        sendButtons: [],
        iframeAnalysis: [],
        shadowDOM: [],
        reactAnalysis: {
          hasReactRoot: false,
          reactComponents: []
        }
      };

      // 1. 基础页面信息
      results.basicInfo = {
        totalElements: document.querySelectorAll('*').length,
        bodyElementCount: document.body.querySelectorAll('*').length,
        hasReact: !!document.querySelector('[data-reactroot]') || !!window.React,
        hasVue: !!document.querySelector('[data-v-]') || !!window.Vue,
        scriptsCount: document.scripts.length,
        iframesCount: document.querySelectorAll('iframe').length
      };

      // 2. 查找所有可能的输入元素

      // 标准输入元素
      const standardInputs = [
        'textarea', 'input[type="text"]', 'input[type="search"]',
        'input[type="email"]', 'input:not([type])'
      ];

      standardInputs.forEach(selector => {
        document.querySelectorAll(selector).forEach((el: Element, index: number) => {
          const rect = el.getBoundingClientRect();
          results.inputElements.push({
            type: 'standard',
            selector: selector,
            index: index,
            tag: el.tagName,
            id: el.id,
            className: el.className,
            name: (el as HTMLInputElement).name,
            placeholder: (el as HTMLInputElement).placeholder,
            visible: rect.width > 0 && rect.height > 0,
            rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
            innerHTML: el.innerHTML.substring(0, 100)
          });
        });
      });

      // contenteditable元素
      document.querySelectorAll('[contenteditable]').forEach((el: Element, index: number) => {
        const rect = el.getBoundingClientRect();
        results.inputElements.push({
          type: 'contenteditable',
          index: index,
          tag: el.tagName,
          id: el.id,
          className: el.className,
          contentEditable: el.getAttribute('contenteditable') || undefined,
          visible: rect.width > 0 && rect.height > 0,
          rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          innerText: (el as HTMLElement).innerText?.substring(0, 100),
          innerHTML: el.innerHTML.substring(0, 100)
        });
      });

      // 通过类名查找可能的聊天输入元素
      const chatInputSelectors = [
        '[class*="input"]', '[class*="editor"]', '[class*="compose"]',
        '[class*="chat"]', '[class*="message"]', '[class*="text"]',
        '[data-input]', '[data-content]', '[role="textbox"]'
      ];

      chatInputSelectors.forEach(selector => {
        try {
          document.querySelectorAll(selector).forEach((el: Element, index: number) => {
            const rect = el.getBoundingClientRect();
            if (rect.width > 20 && rect.height > 20) {
              results.inputElements.push({
                type: 'potential-chat',
                selector: selector,
                index: index,
                tag: el.tagName,
                id: el.id,
                className: el.className,
                visible: true,
                rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
                innerText: (el as HTMLElement).innerText?.substring(0, 100),
                innerHTML: el.innerHTML.substring(0, 200),
                events: {
                  onclick: !!(el as HTMLElement).onclick,
                  oninput: !!(el as HTMLElement).oninput,
                  onkeydown: !!(el as HTMLElement).onkeydown,
                  onkeyup: !!(el as HTMLElement).onkeyup
                }
              });
            }
          });
        } catch (e: any) {
          console.warn('Selector error:', selector, e.message);
        }
      });

      // 3. 查找发送按钮
      const sendSelectors = [
        'button:has-text("发送")', 'button:has-text("Send")',
        '[class*="send"]', '[class*="Send"]', '[data-action="send"]',
        'button[type="submit"]', 'a:has-text("发送")'
      ];

      sendSelectors.forEach(selector => {
        try {
          document.querySelectorAll(selector).forEach((el: Element, index: number) => {
            const rect = el.getBoundingClientRect();
            if (rect.width > 10 && rect.height > 10) {
              results.sendButtons.push({
                type: 'send-button',
                selector: selector,
                index: index,
                tag: el.tagName,
                id: el.id,
                className: el.className,
                text: (el as HTMLElement).innerText?.trim(),
                visible: true,
                rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
                innerHTML: el.innerHTML.substring(0, 100)
              });
            }
          });
        } catch (e: any) {
          console.warn('Send selector error:', selector, e.message);
        }
      });

      // 4. 查找所有按钮元素（用于备用）
      document.querySelectorAll('button, [role="button"]').forEach((el: Element, index: number) => {
        const rect = el.getBoundingClientRect();
        const text = (el as HTMLElement).innerText?.trim();
        if (rect.width > 10 && rect.height > 10 && text) {
          results.sendButtons.push({
            type: 'generic-button',
            index: index,
            tag: el.tagName,
            id: el.id,
            className: el.className,
            text: text,
            visible: true,
            rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
            possibleSend: text.includes('发送') || text.includes('Send')
          });
        }
      });

      // 5. iframe内容分析
      document.querySelectorAll('iframe').forEach((frame: Element, index: number) => {
        try {
          const doc = (frame as HTMLIFrameElement).contentDocument || (frame as HTMLIFrameElement).contentWindow?.document;
          results.iframeAnalysis.push({
            index: index,
            src: (frame as HTMLIFrameElement).src,
            accessible: true,
            elementCount: doc ? doc.querySelectorAll('*').length : 0,
            inputElements: doc ? doc.querySelectorAll('textarea, input, [contenteditable]').length : 0,
            buttons: doc ? doc.querySelectorAll('button').length : 0
          });
        } catch (e: any) {
          results.iframeAnalysis.push({
            index: index,
            src: (frame as HTMLIFrameElement).src,
            accessible: false,
            error: e.message
          });
        }
      });

      // 6. Shadow DOM分析
      document.querySelectorAll('*').forEach((el: Element) => {
        if ((el as any).shadowRoot) {
          results.shadowDOM.push({
            tag: el.tagName,
            className: el.className,
            shadowElementCount: (el as any).shadowRoot.querySelectorAll('*').length,
            shadowInputs: (el as any).shadowRoot.querySelectorAll('textarea, input, [contenteditable]').length
          });
        }
      });

      // 7. React组件分析
      results.reactAnalysis.hasReactRoot = !!document.querySelector('[data-reactroot]');

      if (results.reactAnalysis.hasReactRoot) {
        document.querySelectorAll('[data-reactroot] *').forEach((el: Element, index: number) => {
          if (index < 20) { // 只取前20个
            const rect = el.getBoundingClientRect();
            if (rect.width > 10 && rect.height > 10) {
              results.reactAnalysis.reactComponents.push({
                index: index,
                tag: el.tagName,
                className: el.className,
                rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
                hasEvents: !!(el as HTMLElement).onclick || !!(el as HTMLElement).oninput || !!(el as HTMLElement).onkeydown
              });
            }
          }
        });
      }

      return results;
    });

    console.log('\n📊 ===== 1688聊天界面DOM分析结果 =====');
    console.log('页面URL:', analysisResult.pageUrl);
    console.log('页面标题:', analysisResult.pageTitle);
    console.log('分析时间:', analysisResult.timestamp);

    console.log('\n🔧 基础信息:');
    console.log('- 总元素数:', analysisResult.basicInfo.totalElements);
    console.log('- Body元素数:', analysisResult.basicInfo.bodyElementCount);
    console.log('- React页面:', analysisResult.basicInfo.hasReact);
    console.log('- Vue页面:', analysisResult.basicInfo.hasVue);
    console.log('- 脚本数:', analysisResult.basicInfo.scriptsCount);
    console.log('- iframe数:', analysisResult.basicInfo.iframesCount);

    console.log('\n📝 输入元素分析:');
    console.log(`找到 ${analysisResult.inputElements.length} 个潜在输入元素:`);
    analysisResult.inputElements.forEach((input, i) => {
      console.log(`  ${i+1}. ${input.type} - ${input.tag}.${input.className}`);
      console.log(`     ID: ${input.id || 'none'}, 可见: ${input.visible}`);
      console.log(`     位置: (${Math.round(input.rect.x)}, ${Math.round(input.rect.y)}) ${Math.round(input.rect.width)}x${Math.round(input.rect.height)}`);
      if (input.innerText) console.log(`     文本: ${input.innerText.substring(0, 50)}...`);
      console.log('');
    });

    console.log('\n🔘 发送按钮分析:');
    console.log(`找到 ${analysisResult.sendButtons.length} 个按钮:`);
    analysisResult.sendButtons.forEach((btn, i) => {
      if (btn.possibleSend || btn.type === 'send-button') {
        console.log(`  ✅ ${i+1}. ${btn.type} - ${btn.text}`);
        console.log(`     ${btn.tag}.${btn.className}`);
        console.log(`     位置: (${Math.round(btn.rect.x)}, ${Math.round(btn.rect.y)}) ${Math.round(btn.rect.width)}x${Math.round(btn.rect.height)}`);
      }
    });

    console.log('\n🖼️ iframe分析:');
    if (analysisResult.iframeAnalysis.length > 0) {
      analysisResult.iframeAnalysis.forEach(iframe => {
        console.log(`  iframe ${iframe.index}: ${iframe.accessible ? '可访问' : '跨域限制'}`);
        if (iframe.accessible) {
          console.log(`    元素数: ${iframe.elementCount}, 输入元素: ${iframe.inputElements}`);
        }
      });
    } else {
      console.log('  无iframe');
    }

    console.log('\n🌑 Shadow DOM分析:');
    if (analysisResult.shadowDOM.length > 0) {
      analysisResult.shadowDOM.forEach(shadow => {
        console.log(`  ${shadow.tag}.${shadow.className}: ${shadow.shadowElementCount}个元素`);
      });
    } else {
      console.log('  无Shadow DOM');
    }

    console.log('\n⚛️ React组件分析:');
    if (analysisResult.reactAnalysis.hasReactRoot) {
      console.log(`找到 ${analysisResult.reactAnalysis.reactComponents.length} 个React组件`);
      analysisResult.reactAnalysis.reactComponents.slice(0, 5).forEach(comp => {
        console.log(`  ${comp.tag}.${comp.className} - 有事件: ${comp.hasEvents}`);
      });
    } else {
      console.log('  非React页面');
    }

    // 保存分析结果
    const resultPath = `/Users/fanzhang/Documents/github/webauto/archive/workflow-records/1688-dom-analysis-${Date.now()}.json`;
    fs.writeFileSync(resultPath, JSON.stringify(analysisResult, null, 2));
    console.log(`\n💾 分析结果已保存到: ${resultPath}`);

    // 截图
    const screenshotPath = `/Users/fanzhang/Documents/github/webauto/archive/workflow-records/1688-chat-screenshot-${Date.now()}.png`;
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`📸 截图已保存到: ${screenshotPath}`);

    console.log('\n⏳ 浏览器将保持打开30秒，您可以手动检查页面...');
    await page.waitForTimeout(30000);

  } catch (error: any) {
    console.error('❌ 分析过程中出错:', error);
  } finally {
    await browser.close();
    console.log('🏁 分析完成');
  }
}

// 运行分析
analyze1688ChatDOM().catch(console.error);