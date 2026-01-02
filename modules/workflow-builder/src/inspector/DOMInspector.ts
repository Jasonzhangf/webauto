/**
 * DOM 检查器 - 负责管理浏览器端的交互模式
 */
export class DOMInspector {
  private profile: string;
  private isActive: boolean = false;

  constructor(profile: string) {
    this.profile = profile;
  }

  /**
   * 启动检查模式
   * 注入 JS 脚本，接管鼠标事件，高亮 Hover 元素
   */
  async start(): Promise<void> {
    if (this.isActive) return;
    
    const UNIFIED_API = 'http://127.0.0.1:7701';
    
    // 注入检查器脚本
    await fetch(`${UNIFIED_API}/v1/controller/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'browser:execute',
        payload: {
          profile: this.profile,
          script: `
            (function() {
              if (window.__waInspectorActive) return;
              window.__waInspectorActive = true;
              
              // 创建覆盖层（用于拦截点击）
              const overlay = document.createElement('div');
              overlay.id = 'wa-inspector-overlay';
              overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:999990;pointer-events:none;';
              document.body.appendChild(overlay);
              
              // 创建高亮框
              const highlight = document.createElement('div');
              highlight.id = 'wa-inspector-highlight';
              highlight.style.cssText = 'position:fixed;border:2px dashed #FF6B35;background:rgba(255,107,53,0.1);z-index:999991;pointer-events:none;display:none;';
              document.body.appendChild(highlight);
              
              let currentElement = null;
              
              // 鼠标移动处理
              window.addEventListener('mousemove', (e) => {
                if (!window.__waInspectorActive) return;
                
                const el = document.elementFromPoint(e.clientX, e.clientY);
                if (!el || el === currentElement || el.id.startsWith('wa-inspector')) return;
                
                currentElement = el;
                const rect = el.getBoundingClientRect();
                
                highlight.style.display = 'block';
                highlight.style.left = rect.left + 'px';
                highlight.style.top = rect.top + 'px';
                highlight.style.width = rect.width + 'px';
                highlight.style.height = rect.height + 'px';
                
                // 发送 Hover 事件到后端（可选，如果需要实时反馈）
                // window.waBridge.emit('inspector:hover', { ... });
              }, true);
              
              // 点击处理（拦截）
              window.addEventListener('click', (e) => {
                if (!window.__waInspectorActive) return;
                
                e.preventDefault();
                e.stopPropagation();
                
                const el = document.elementFromPoint(e.clientX, e.clientY);
                if (!el || el.id.startsWith('wa-inspector')) return;
                
                // 生成选择器
                function getSelector(el) {
                  if (el.id) return '#' + el.id;
                  let selector = el.tagName.toLowerCase();
                  if (el.className && typeof el.className === 'string') {
                    const classes = el.className.split(' ').filter(c => c && !c.match(/[A-Z0-9]{5,}/));
                    if (classes.length > 0) selector += '.' + classes[0];
                  }
                  return selector;
                }
                
                // 发送选择事件
                // 这里我们通过 console.log 模拟，实际应该通过 WebSocket 发送
                console.log('__WA_INSPECTOR_SELECT__', JSON.stringify({
                  tagName: el.tagName.toLowerCase(),
                  selector: getSelector(el),
                  rect: el.getBoundingClientRect(),
                  textContent: (el.textContent || '').substring(0, 50)
                }));
                
                return false;
              }, true);
              
              console.log('Inspector started');
            })()
          `
        }
      })
    });
    
    this.isActive = true;
  }

  /**
   * 停止检查模式
   */
  async stop(): Promise<void> {
    if (!this.isActive) return;
    
    const UNIFIED_API = 'http://127.0.0.1:7701';
    
    await fetch(`${UNIFIED_API}/v1/controller/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'browser:execute',
        payload: {
          profile: this.profile,
          script: `
            (function() {
              window.__waInspectorActive = false;
              document.getElementById('wa-inspector-overlay')?.remove();
              document.getElementById('wa-inspector-highlight')?.remove();
              // 移除事件监听器需要保持引用的函数，这里简化处理，通过标志位控制
            })()
          `
        }
      })
    });
    
    this.isActive = false;
  }
}
