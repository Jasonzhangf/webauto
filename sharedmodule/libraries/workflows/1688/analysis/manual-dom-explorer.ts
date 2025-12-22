// 手动DOM探索脚本 - 在浏览器控制台中运行
// 注意：此脚本设计为在浏览器控制台中直接运行

export function manualDOMExplorer(): void {
  console.log('🔍 开始手动探索1688聊天界面DOM结构');

  // 1. 检查当前页面
  console.log('当前页面:', window.location.href);
  console.log('页面标题:', document.title);

  // 2. 查找所有可能的输入元素
  console.log('\n📝 查找contenteditable元素:');
  const contenteditables = document.querySelectorAll('[contenteditable]');
  console.log(`找到 ${contenteditables.length} 个contenteditable元素:`);
  contenteditables.forEach((el: Element, i: number) => {
    const rect = el.getBoundingClientRect();
    console.log(`  ${i+1}. ${el.tagName}.${el.className}`);
    console.log(`     contenteditable: ${el.getAttribute('contenteditable')}`);
    console.log(`     可见: ${rect.width > 0 && rect.height > 0}`);
    console.log(`     位置: (${Math.round(rect.x)}, ${Math.round(rect.y)}) ${Math.round(rect.width)}x${Math.round(rect.height)}`);
    console.log(`     文本: ${(el as HTMLElement).innerText?.substring(0, 50) || 'empty'}`);
    console.log('');
  });

  // 3. 查找textarea和input
  console.log('📝 查找textarea元素:');
  const textareas = document.querySelectorAll('textarea');
  console.log(`找到 ${textareas.length} 个textarea元素:`);
  textareas.forEach((el: Element, i: number) => {
    const rect = el.getBoundingClientRect();
    console.log(`  ${i+1}. ${el.id || 'no-id'}.${el.className}`);
    console.log(`     placeholder: ${(el as HTMLTextAreaElement).placeholder || 'none'}`);
    console.log(`     可见: ${rect.width > 0 && rect.height > 0}`);
    console.log(`     位置: (${Math.round(rect.x)}, ${Math.round(rect.y)})`);
    console.log('');
  });

  console.log('📝 查找input元素:');
  const inputs = document.querySelectorAll('input[type="text"], input[type="search"], input:not([type])');
  console.log(`找到 ${inputs.length} 个input元素:`);
  inputs.forEach((el: Element, i: number) => {
    const rect = el.getBoundingClientRect();
    console.log(`  ${i+1}. ${(el as HTMLInputElement).name || 'no-name'}.${el.className}`);
    console.log(`     placeholder: ${(el as HTMLInputElement).placeholder || 'none'}`);
    console.log(`     可见: ${rect.width > 0 && rect.height > 0}`);
    console.log(`     位置: (${Math.round(rect.x)}, ${Math.round(rect.y)})`);
    console.log('');
  });

  // 4. 查找可能的聊天输入区域（通过类名）
  console.log('🔍 查找可能的聊天输入区域:');
  const chatClasses = ['input', 'editor', 'compose', 'chat', 'message', 'text', 'content'];
  const possibleInputs: Array<{
    element: Element;
    className: string;
    tag: string;
    rect: DOMRect;
    matchClass: string;
  }> = [];

  chatClasses.forEach(cls => {
    const elements = document.querySelectorAll(`[class*="${cls}"]`);
    elements.forEach((el: Element) => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 50 && rect.height > 20) {
        possibleInputs.push({
          element: el,
          className: el.className,
          tag: el.tagName,
          rect: rect,
          matchClass: cls
        });
      }
    });
  });

  console.log(`找到 ${possibleInputs.length} 个可能的输入区域:`);
  possibleInputs.slice(0, 10).forEach((el, i) => {
    console.log(`  ${i+1}. ${el.tag} - 匹配类: ${el.matchClass}`);
    console.log(`     类名: ${el.className}`);
    console.log(`     位置: (${Math.round(el.rect.x)}, ${Math.round(el.rect.y)})`);
    console.log(`     大小: ${Math.round(el.rect.width)}x${Math.round(el.rect.height)}`);
    console.log(`     文本: ${(el.element as HTMLElement).innerText?.substring(0, 30) || 'no text'}`);
    console.log('');
  });

  // 5. 查找发送按钮
  console.log('🔘 查找发送按钮:');
  const allButtons = document.querySelectorAll('button, [role="button"], a, div, span');
  const sendButtons: Array<{
    element: Element;
    text: string;
    tag: string;
    className: string;
    rect: DOMRect;
    isSendButton: boolean;
  }> = [];

  allButtons.forEach((el: Element) => {
    const text = (el as HTMLElement).innerText?.trim();
    const rect = el.getBoundingClientRect();

    if (rect.width > 10 && rect.height > 10 && text) {
      const isSendButton = text.includes('发送') || text.includes('Send');
      sendButtons.push({
        element: el,
        text: text,
        tag: el.tagName,
        className: el.className,
        rect: rect,
        isSendButton: isSendButton
      });
    }
  });

  const actualSendButtons = sendButtons.filter(btn => btn.isSendButton);
  console.log(`找到 ${actualSendButtons.length} 个发送按钮:`);
  actualSendButtons.forEach((btn, i) => {
    console.log(`  ${i+1}. ${btn.tag} - ${btn.text}`);
    console.log(`     类名: ${btn.className}`);
    console.log(`     位置: (${Math.round(btn.rect.x)}, ${Math.round(btn.rect.y)})`);
    console.log(`     大小: ${Math.round(btn.rect.width)}x${Math.round(btn.rect.height)}`);
    console.log('');
  });

  // 6. 查找底部区域的元素（聊天通常在底部）
  console.log('📍 查找底部区域元素:');
  const windowHeight = window.innerHeight;
  const bottomElements: Array<{
    element: Element;
    tag: string;
    className: string;
    id: string;
    rect: DOMRect;
    fromBottom: number;
  }> = [];
  document.querySelectorAll('*').forEach((el: Element) => {
    const rect = el.getBoundingClientRect();
    if (rect.y > windowHeight - 200 && rect.width > 50 && rect.height > 20) {
      bottomElements.push({
        element: el,
        tag: el.tagName,
        className: el.className,
        id: el.id,
        rect: rect,
        fromBottom: windowHeight - rect.y
      });
    }
  });

  const significantBottomElements = bottomElements
    .filter(el => el.rect.width > 100 && el.rect.height > 30)
    .slice(0, 10);

  console.log(`找到底部 ${significantBottomElements.length} 个显著元素:`);
  significantBottomElements.forEach((el, i) => {
    console.log(`  ${i+1}. ${el.tag} - 距离底部 ${Math.round(el.fromBottom)}px`);
    console.log(`     类名: ${el.className}`);
    console.log(`     大小: ${Math.round(el.rect.width)}x${Math.round(el.rect.height)}`);
    console.log(`     文本: ${(el.element as HTMLElement).innerText?.substring(0, 50) || 'no text'}`);
    console.log('');
  });

  // 7. 检查是否有iframe
  console.log('🖼️ 检查iframe:');
  const iframes = document.querySelectorAll('iframe');
  console.log(`找到 ${iframes.length} 个iframe:`);
  iframes.forEach((iframe: Element, i: number) => {
    console.log(`  ${i+1}. src: ${(iframe as HTMLIFrameElement).src || 'about:blank'}`);
    try {
      const doc = (iframe as HTMLIFrameElement).contentDocument || (iframe as HTMLIFrameElement).contentWindow?.document;
      console.log(`     可访问: true, 内部元素数: ${doc ? doc.querySelectorAll('*').length : 0}`);
      console.log(`     内部输入元素: ${doc ? doc.querySelectorAll('textarea, input, [contenteditable]').length : 0}`);
      console.log(`     内部按钮: ${doc ? doc.querySelectorAll('button').length : 0}`);
    } catch (e: any) {
      console.log(`     可访问: false, 错误: ${e.message}`);
    }
  });

  // 8. 检查React组件
  console.log('⚛️ 检查React组件:');
  const hasReactRoot = !!document.querySelector('[data-reactroot]');
  console.log(`React根元素: ${hasReactRoot ? '存在' : '不存在'}`);

  if (hasReactRoot) {
    const reactElements: Array<{
      element: Element;
      tag: string;
      className: string;
      rect: DOMRect;
      innerText: string;
    }> = [];
    document.querySelectorAll('[data-reactroot] *').forEach((el: Element, i: number) => {
      if ((el as any)._reactInternalFiber || (el as any)._reactInternalInstance) {
        const rect = el.getBoundingClientRect();
        if (rect.width > 10 && rect.height > 10 && i < 20) {
          reactElements.push({
            element: el,
            tag: el.tagName,
            className: el.className,
            rect: rect,
            innerText: (el as HTMLElement).innerText?.substring(0, 30)
          });
        }
      }
    });
    console.log(`找到 ${reactElements.length} 个React组件:`);
    reactElements.forEach((el, i) => {
      console.log(`  ${i+1}. ${el.tag}.${el.className}`);
      console.log(`     位置: (${Math.round(el.rect.x)}, ${Math.round(el.rect.y)})`);
      console.log(`     文本: ${el.innerText || 'no text'}`);
      console.log('');
    });
  }

  // 9. 高亮显示最有可能的输入元素
  console.log('🎯 高亮显示候选输入元素:');
  const candidates = [
    ...contenteditables,
    ...textareas,
    ...inputs,
    ...possibleInputs.map(p => p.element)
  ];

  if (candidates.length > 0) {
    // 选择最大的候选元素
    const bestCandidate = candidates.reduce((best, current) => {
      const bestArea = best.getBoundingClientRect().width * best.getBoundingClientRect().height;
      const currentArea = current.getBoundingClientRect().width * current.getBoundingClientRect().height;
      return currentArea > bestArea ? current : best;
    });

    const rect = bestCandidate.getBoundingClientRect();

    // 创建高亮覆盖层
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: fixed;
        left: ${rect.x}px;
        top: ${rect.y}px;
        width: ${rect.width}px;
        height: ${rect.height}px;
        border: 3px solid #ff0000;
        background-color: rgba(255, 0, 0, 0.1);
        pointer-events: none;
        z-index: 999999;
        font-size: 12px;
        color: #ff0000;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: bold;
    `;
    overlay.textContent = '候选输入元素';
    document.body.appendChild(overlay);

    console.log(`✅ 已高亮显示候选输入元素: ${bestCandidate.tagName}.${bestCandidate.className}`);
    console.log(`     位置: (${Math.round(rect.x)}, ${Math.round(rect.y)})`);
    console.log(`     大小: ${Math.round(rect.width)}x${Math.round(rect.height)}`);

    // 5秒后移除高亮
    setTimeout(() => {
      overlay.remove();
      console.log('✅ 高亮已移除');
    }, 5000);

    // 尝试输入测试文本
    console.log('🧪 尝试输入测试文本...');
    try {
      (bestCandidate as HTMLElement).focus();
      (bestCandidate as HTMLElement).click();

      if (bestCandidate.contentEditable === 'true') {
        (bestCandidate as HTMLElement).innerText = '🚀 手动测试输入';
        const evt = new InputEvent('input', { bubbles: true });
        bestCandidate.dispatchEvent(evt);
      } else {
        (bestCandidate as HTMLInputElement).value = '🚀 手动测试输入';
        const evt = new Event('input', { bubbles: true });
        bestCandidate.dispatchEvent(evt);
      }
      console.log('✅ 测试文本输入成功');
    } catch (e: any) {
      console.log('❌ 测试文本输入失败:', e.message);
    }
  } else {
    console.log('❌ 未找到任何可能的输入元素');
  }

  // 10. 高亮显示发送按钮
  if (actualSendButtons.length > 0) {
    const sendButton = actualSendButtons[0];
    const rect = sendButton.rect;

    const sendOverlay = document.createElement('div');
    sendOverlay.style.cssText = `
        position: fixed;
        left: ${rect.x}px;
        top: ${rect.y}px;
        width: ${rect.width}px;
        height: ${rect.height}px;
        border: 3px solid #00ff00;
        background-color: rgba(0, 255, 0, 0.1);
        pointer-events: none;
        z-index: 999999;
        font-size: 12px;
        color: #00ff00;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: bold;
    `;
    sendOverlay.textContent = '发送按钮';
    document.body.appendChild(sendOverlay);

    console.log(`✅ 已高亮显示发送按钮: ${sendButton.text}`);
    console.log(`     位置: (${Math.round(rect.x)}, ${Math.round(rect.y)})`);

    // 10秒后移除高亮
    setTimeout(() => {
      sendOverlay.remove();
      console.log('✅ 发送按钮高亮已移除');
    }, 10000);
  }

  console.log('\n🔍 DOM探索完成！');
  console.log('💡 请查看高亮的元素，并手动测试输入功能');
  console.log('📸 如果需要截图，请在浏览器中按F12打开开发者工具，然后使用截图功能');
}

// 如果直接运行此脚本，导出为全局函数供浏览器使用
if (typeof window !== 'undefined') {
  (window as any).manualDOMExplorer = manualDOMExplorer;
}

export default manualDOMExplorer;