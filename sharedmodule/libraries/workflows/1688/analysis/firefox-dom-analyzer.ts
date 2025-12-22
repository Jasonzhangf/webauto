// 使用Firefox分析1688聊天界面DOM结构
import { firefox } from 'playwright';
import * as fs from 'fs';

interface AnalysisResult {
  timestamp: string;
  url: string;
  contenteditable: Array<{
    index: number;
    tag: string;
    id: string;
    className: string;
    contentEditable: string;
    visible: boolean;
    rect: { x: number; y: number; width: number; height: number };
    innerText: string;
    innerHTML: string;
  }>;
  textareas: Array<{
    index: number;
    id: string;
    className: string;
    placeholder: string;
    visible: boolean;
    rect: { x: number; y: number; width: number; height: number };
    value: string;
  }>;
  inputs: Array<{
    index: number;
    id: string;
    className: string;
    name: string;
    placeholder: string;
    visible: boolean;
    rect: { x: number; y: number; width: number; height: number };
    value: string;
  }>;
  possibleInputs: Array<{
    index: number;
    className: string;
    tag: string;
    id: string;
    matchClass: string;
    visible: boolean;
    rect: { x: number; y: number; width: number; height: number };
    innerText: string;
    hasEvents: boolean;
  }>;
  sendButtons: Array<{
    index: number;
    tag: string;
    id: string;
    className: string;
    text: string;
    visible: boolean;
    rect: { x: number; y: number; width: number; height: number };
    isSendButton: boolean;
  }>;
  iframes: Array<{
    index: number;
    src: string;
    id: string;
    className: string;
    rect: { x: number; y: number; width: number; height: number };
  }>;
  reactInfo: {
    hasReactRoot: boolean;
    reactElements: Array<{
      index: number;
      tag: string;
      className: string;
      innerText: string;
    }>;
  };
  bottomElements: Array<{
    index: number;
    tag: string;
    className: string;
    id: string;
    rect: { x: number; y: number; width: number; height: number };
    innerText: string;
    fromBottom: number;
  }>;
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

async function analyze1688ChatDOMWithFirefox(): Promise<void> {
  console.log('🔍 开始使用Firefox分析1688聊天界面DOM结构...');

  const browser = await firefox.launch({
    headless: false,
    slowMo: 1000
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:120.0) Gecko/20100101 Firefox/120.0'
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

  try {
    // 导航到1688主页
    console.log('🚀 导航到1688主页...');
    await page.goto('https://www.1688.com/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    // 导航到聊天页面
    console.log('💬 导航到聊天页面...');
    const chatUrl = 'https://air.1688.com/app/ocms-fusion-components-1688/def_cbu_web_im/index.html?touid=cnalichn%E6%B0%B8%E5%BA%B7%E5%B8%82%E9%80%94%E6%B4%BE%E5%B7%A5%E8%B4%B8%E6%9C%89%E9%99%90%E5%85%AC%E5%8F%B8&siteid=cnalichn&status=2&portalId=&gid=&offerId=858532417224&itemsId=&spmid=a26352.13672862.offerlist#/';

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

    // 执行DOM分析
    console.log('🔬 执行DOM分析...');

    const analysis: AnalysisResult = await page.evaluate(() => {
      const result: AnalysisResult = {
        timestamp: new Date().toISOString(),
        url: window.location.href,
        contenteditable: [],
        textareas: [],
        inputs: [],
        possibleInputs: [],
        sendButtons: [],
        iframes: [],
        reactInfo: {
          hasReactRoot: false,
          reactElements: []
        },
        bottomElements: []
      };

      // 1. 查找所有contenteditable元素
      document.querySelectorAll('[contenteditable]').forEach((el: Element, i: number) => {
        const rect = el.getBoundingClientRect();
        result.contenteditable.push({
          index: i,
          tag: el.tagName,
          id: el.id,
          className: el.className,
          contentEditable: el.getAttribute('contenteditable') || '',
          visible: rect.width > 0 && rect.height > 0,
          rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          innerText: (el as HTMLElement).innerText?.substring(0, 50),
          innerHTML: el.innerHTML.substring(0, 100)
        });
      });

      // 2. 查找textarea和input
      document.querySelectorAll('textarea').forEach((el: Element, i: number) => {
        const rect = el.getBoundingClientRect();
        result.textareas.push({
          index: i,
          id: el.id,
          className: el.className,
          placeholder: (el as HTMLTextAreaElement).placeholder,
          visible: rect.width > 0 && rect.height > 0,
          rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          value: (el as HTMLTextAreaElement).value?.substring(0, 50)
        });
      });

      document.querySelectorAll('input[type="text"], input[type="search"], input:not([type])').forEach((el: Element, i: number) => {
        const rect = el.getBoundingClientRect();
        result.inputs.push({
          index: i,
          id: el.id,
          className: el.className,
          name: (el as HTMLInputElement).name,
          placeholder: (el as HTMLInputElement).placeholder,
          visible: rect.width > 0 && rect.height > 0,
          rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          value: (el as HTMLInputElement).value?.substring(0, 50)
        });
      });

      // 3. 查找可能的聊天输入区域（通过类名）
      const chatClasses = ['input', 'editor', 'compose', 'chat', 'message', 'text', 'content'];
      chatClasses.forEach(cls => {
        document.querySelectorAll(`[class*="${cls}"]`).forEach((el: Element, i: number) => {
          const rect = el.getBoundingClientRect();
          if (rect.width > 50 && rect.height > 20) {
            result.possibleInputs.push({
              index: i,
              className: el.className,
              tag: el.tagName,
              id: el.id,
              matchClass: cls,
              visible: true,
              rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
              innerText: (el as HTMLElement).innerText?.substring(0, 30),
              hasEvents: !!(el as HTMLElement).onclick || !!(el as HTMLElement).oninput || !!(el as HTMLElement).onkeydown || !!(el as HTMLElement).onkeyup
            });
          }
        });
      });

      // 4. 查找发送按钮
      document.querySelectorAll('button, [role="button"], a').forEach((el: Element, i: number) => {
        const text = (el as HTMLElement).innerText?.trim();
        const rect = el.getBoundingClientRect();
        if (rect.width > 10 && rect.height > 10 && text) {
          result.sendButtons.push({
            index: i,
            tag: el.tagName,
            id: el.id,
            className: el.className,
            text: text,
            visible: true,
            rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
            isSendButton: text.includes('发送') || text.includes('Send')
          });
        }
      });

      // 5. 检查iframe
      document.querySelectorAll('iframe').forEach((frame: Element, i: number) => {
        result.iframes.push({
          index: i,
          src: (frame as HTMLIFrameElement).src,
          id: frame.id,
          className: frame.className,
          rect: frame.getBoundingClientRect()
        });
      });

      // 6. 检查是否有React组件
      result.reactInfo.hasReactRoot = !!document.querySelector('[data-reactroot]');

      if (result.reactInfo.hasReactRoot) {
        document.querySelectorAll('[data-reactroot] *').forEach((el: Element, i: number) => {
          if (i < 20) { // 只取前20个
            const rect = el.getBoundingClientRect();
            if (rect.width > 10 && rect.height > 10) {
              result.reactInfo.reactElements.push({
                index: i,
                tag: el.tagName,
                className: el.className,
                innerText: (el as HTMLElement).innerText?.substring(0, 30)
              });
            }
          }
        });
      }

      // 7. 查找底部区域的元素（通常聊天输入在底部）
      const windowHeight = window.innerHeight;
      document.querySelectorAll('*').forEach((el: Element, i: number) => {
        const rect = el.getBoundingClientRect();
        if (rect.y > windowHeight - 200 && rect.width > 50 && rect.height > 20) {
          result.bottomElements.push({
            index: i,
            tag: el.tagName,
            className: el.className,
            id: el.id,
            rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
            innerText: (el as HTMLElement).innerText?.substring(0, 30),
            fromBottom: windowHeight - rect.y
          });
        }
      });

      return result;
    });

    // 输出分析结果
    console.log('\n📊 ===== 1688聊天界面DOM分析结果 =====');
    console.log('URL:', analysis.url);
    console.log('分析时间:', analysis.timestamp);

    console.log('\n📝 Contenteditable元素:');
    if (analysis.contenteditable.length > 0) {
      analysis.contenteditable.forEach((el, i) => {
        console.log(`  ${i+1}. ${el.tag}.${el.className} (${el.contentEditable})`);
        console.log(`     位置: (${Math.round(el.rect.x)}, ${Math.round(el.rect.y)})`);
        console.log(`     可见: ${el.visible}, 文本: ${el.innerText || 'empty'}`);
      });
    } else {
      console.log('  ❌ 未找到contenteditable元素');
    }

    console.log('\n📝 Textarea元素:');
    if (analysis.textareas.length > 0) {
      analysis.textareas.forEach((el, i) => {
        console.log(`  ${i+1}. ${el.id || 'no-id'}.${el.className}`);
        console.log(`     位置: (${Math.round(el.rect.x)}, ${Math.round(el.rect.y)})`);
        console.log(`     可见: ${el.visible}, placeholder: ${el.placeholder || 'none'}`);
      });
    } else {
      console.log('  ❌ 未找到textarea元素');
    }

    console.log('\n📝 Input元素:');
    if (analysis.inputs.length > 0) {
      analysis.inputs.forEach((el, i) => {
        console.log(`  ${i+1}. ${el.name || 'no-name'}.${el.className}`);
        console.log(`     位置: (${Math.round(el.rect.x)}, ${Math.round(el.rect.y)})`);
        console.log(`     可见: ${el.visible}, placeholder: ${el.placeholder || 'none'}`);
      });
    } else {
      console.log('  ❌ 未找到input元素');
    }

    console.log('\n🔍 可能的聊天输入区域:');
    if (analysis.possibleInputs.length > 0) {
      analysis.possibleInputs.forEach((el, i) => {
        console.log(`  ${i+1}. ${el.tag} - 匹配类: ${el.matchClass}`);
        console.log(`     类名: ${el.className}`);
        console.log(`     位置: (${Math.round(el.rect.x)}, ${Math.round(el.rect.y)})`);
        console.log(`     有事件: ${el.hasEvents}, 文本: ${el.innerText || 'empty'}`);
      });
    } else {
      console.log('  ❌ 未找到可能的输入区域');
    }

    console.log('\n🔘 发送按钮:');
    const sendButtons = analysis.sendButtons.filter(btn => btn.isSendButton);
    if (sendButtons.length > 0) {
      sendButtons.forEach((btn, i) => {
        console.log(`  ✅ ${i+1}. ${btn.tag} - ${btn.text}`);
        console.log(`     类名: ${btn.className}`);
        console.log(`     位置: (${Math.round(btn.rect.x)}, ${Math.round(btn.rect.y)})`);
      });
    } else {
      console.log('  ❌ 未找到发送按钮');
      console.log('  所有按钮:');
      analysis.sendButtons.slice(0, 5).forEach((btn, i) => {
        console.log(`    ${i+1}. ${btn.tag} - ${btn.text} (${Math.round(btn.rect.x)}, ${Math.round(btn.rect.y)})`);
      });
    }

    console.log('\n🖼️ iframe:');
    if (analysis.iframes.length > 0) {
      analysis.iframes.forEach((iframe, i) => {
        console.log(`  ${i+1}. ${iframe.src || 'about:blank'} - ${iframe.className}`);
      });
    } else {
      console.log('  无iframe');
    }

    console.log('\n⚛️ React组件:');
    if (analysis.reactInfo.hasReactRoot) {
      console.log(`✅ React页面，找到 ${analysis.reactInfo.reactElements.length} 个组件`);
      analysis.reactInfo.reactElements.slice(0, 3).forEach(el => {
        console.log(`  ${el.tag}.${el.className} - ${el.innerText || 'no text'}`);
      });
    } else {
      console.log('❌ 非React页面');
    }

    console.log('\n📍 底部区域元素 (聊天通常在底部):');
    const bottomInputs = analysis.bottomElements.filter(el =>
      el.rect.width > 100 && el.rect.height > 30
    ).slice(0, 5);
    if (bottomInputs.length > 0) {
      bottomInputs.forEach((el, i) => {
        console.log(`  ${i+1}. ${el.tag} - 距离底部 ${Math.round(el.fromBottom)}px`);
        console.log(`     类名: ${el.className}`);
        console.log(`     大小: ${Math.round(el.rect.width)}x${Math.round(el.rect.height)}`);
        console.log(`     文本: ${el.innerText || 'no text'}`);
      });
    } else {
      console.log('  底部区域无显著元素');
    }

    // 尝试手动测试输入
    console.log('\n🧪 尝试手动测试输入...');
    await page.evaluate(() => {
      // 尝试找到最有可能的输入元素并测试
      const candidates: Array<{el: Element; type: string; rect: DOMRect}> = [];

      // 添加contenteditable元素
      document.querySelectorAll('[contenteditable]').forEach(el => {
        const rect = el.getBoundingClientRect();
        if (rect.width > 50 && rect.height > 20) {
          candidates.push({ el, type: 'contenteditable', rect });
        }
      });

      // 添加底部区域的div元素
      const windowHeight = window.innerHeight;
      document.querySelectorAll('div').forEach(el => {
        const rect = el.getBoundingClientRect();
        if (rect.y > windowHeight - 150 && rect.width > 100 && rect.height > 30) {
          candidates.push({ el, type: 'bottom-div', rect });
        }
      });

      console.log(`找到 ${candidates.length} 个候选输入元素`);

      // 测试第一个候选元素
      if (candidates.length > 0) {
        const testEl = candidates[0].el;
        const originalContent = (testEl as HTMLElement).innerText || testEl.innerHTML;

        // 高亮测试元素
        (testEl as HTMLElement).style.border = '3px solid red';
        (testEl as HTMLElement).style.backgroundColor = 'rgba(255, 0, 0, 0.1)';

        // 尝试输入测试文本
        try {
          (testEl as HTMLElement).focus();
          (testEl as HTMLElement).click();

          if (testEl.contentEditable === 'true') {
            (testEl as HTMLElement).innerText = '🚀 测试输入消息';
            const evt = new InputEvent('input', { bubbles: true });
            testEl.dispatchEvent(evt);
          } else {
            (testEl as HTMLElement).innerText = '🚀 测试输入消息';
          }

          console.log(`✅ 成功在 ${candidates[0].type} 元素中输入测试文本`);

          // 5秒后恢复原内容
          setTimeout(() => {
            (testEl as HTMLElement).style.border = '';
            (testEl as HTMLElement).style.backgroundColor = '';
            if (testEl.contentEditable === 'true') {
              (testEl as HTMLElement).innerText = originalContent as string;
            }
          }, 5000);

        } catch (e: any) {
          console.log(`❌ 输入测试失败: ${e.message}`);
        }
      }
    });

    // 保存分析结果
    const resultPath = `/Users/fanzhang/Documents/github/webauto/archive/workflow-records/1688-firefox-dom-analysis-${Date.now()}.json`;
    fs.writeFileSync(resultPath, JSON.stringify(analysis, null, 2));
    console.log(`\n💾 分析结果已保存到: ${resultPath}`);

    // 截图
    const screenshotPath = `/Users/fanzhang/Documents/github/webauto/archive/workflow-records/1688-firefox-chat-${Date.now()}.png`;
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`📸 截图已保存到: ${screenshotPath}`);

    console.log('\n⏳ 浏览器将保持打开60秒，您可以手动检查页面和测试输入...');
    console.log('🔍 红色高亮的元素是我们找到的候选输入元素');

    await page.waitForTimeout(60000);

  } catch (error: any) {
    console.error('❌ 分析过程中出错:', error);
  } finally {
    await browser.close();
    console.log('🏁 分析完成');
  }
}

// 运行分析
analyze1688ChatDOMWithFirefox().catch(console.error);