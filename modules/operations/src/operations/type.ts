import type { OperationContext, OperationDefinition } from '../registry.js';

export interface TypeConfig {
  selector?: string;
  text: string;
  submit?: boolean;
  clear_first?: boolean;
  human_typing?: boolean;
  pause_after?: number;
}

async function runType(ctx: OperationContext, config: TypeConfig) {
  if (!config.selector) {
    return { success: false, error: 'selector required for type operation' };
  }

  // 1. 确保元素可见并聚焦
  const focusResult = await ctx.page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return { success: false, error: 'element not found' };
    
    // 检查可见性
    const r = el.getBoundingClientRect();
    const visible = r.width > 0 && r.height > 0 && r.y < window.innerHeight && r.y + r.height > 0;
    if (!visible) return { success: false, error: 'element not visible' };
    
    // 聚焦
    (el as HTMLElement).focus();
    return { success: true };
  }, config.selector);

  if (!focusResult.success) {
    return focusResult;
  }

  // 2. 清空现有内容（如果需要）
  if (config.clear_first) {
    await ctx.page.evaluate((sel) => {
      const el = document.querySelector(sel) as HTMLInputElement;
      if (el) {
        el.value = '';
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }, config.selector);
  }

  // 3. 输入文本：优先使用 Playwright 键盘（系统输入），否则回退到 DOM 级别输入
  try {
    const keyboard = ctx.page.keyboard as
      | { type: (text: string, options?: { delay?: number; submit?: boolean }) => Promise<void>; press?: (key: string, options?: { delay?: number }) => Promise<void> }
      | undefined;

    if (keyboard && typeof keyboard.type === 'function') {
      const delay = config.human_typing ? 80 : 0;
      await keyboard.type(config.text, { delay });
    } else {
      // 回退：在页面内直接设置 value + 事件
      await ctx.page.evaluate(({ sel, text }) => {
        const el = document.querySelector(sel) as HTMLInputElement;
        if (el) {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
          if (setter) {
            setter.call(el, text);
          } else {
            el.value = text;
          }
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }, { sel: config.selector, text: config.text });
    }
  } catch (err: any) {
    return { success: false, error: `Type failed: ${err.message}` };
  }

  // 4. 提交（如果需要）
  if (config.submit) {
    const keyboard = ctx.page.keyboard as
      | { press?: (key: string, options?: { delay?: number }) => Promise<void> }
      | undefined;

    await new Promise((r) => setTimeout(r, 300));

    if (keyboard && typeof keyboard.press === 'function') {
      await keyboard.press('Enter');
    } else {
      await ctx.page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (el) {
          el.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            bubbles: true,
          }));
        }
      }, config.selector);
    }
  }

  if (config.pause_after) {
    await new Promise(r => setTimeout(r, config.pause_after));
  }

  return { success: true };
}

export const typeOperation: OperationDefinition<TypeConfig> = {
  id: 'type',
  description: 'Type text into input element',
  requiredCapabilities: ['input'],
  run: runType,
};
