// 输入节点：向指定输入框写入文本，可选按回车提交
import BaseNode from './BaseNode';

export default class InputNode extends BaseNode {
    constructor(nodeId: string, config: any) {
        super(nodeId, config);

  constructor(nodeId: string, config: any) {
    super();
    this.name = 'InputNode';
    this.description = '向页面元素输入文本，支持 fill/type 与可选回车提交';
  }

  getConfigSchema() {
    return {
      type: 'object',
      required: ['selector', 'text'],
      properties: {
        selector: { type: 'string', description: '输入框选择器' },
        text: { type: 'string', description: '输入的文本' },
        method: { type: 'string', enum: ['fill', 'type'], default: 'fill', description: '输入方式：fill 或 type' },
        delay: { type: 'number', default: 30, description: 'type 模式下的按键延时（毫秒）' },
        clear: { type: 'boolean', default: true, description: '输入前是否清空' },
        pressEnter: { type: 'boolean', default: false, description: '输入后是否按回车' },
        timeout: { type: 'number', default: 15000, description: '等待超时时间（毫秒）' },
        highlight: { type: 'boolean', default: true, description: '是否高亮输入框' },
        waitAfter: { type: 'number', default: 500, description: '输入后等待时长（毫秒）' }
      }
    };
  }

  async execute(context: any, params: any): Promise<any> {
    const { page, logger, config, variables, results } = context;
    if (!page) return { success: false, error: 'no page available' };

    // 支持两种变量语法：{var} 与 {{previous.prop}}
    let selector = this.renderTemplate(config?.selector, variables) || config?.selector;
    if (selector && typeof selector === 'string' && selector.startsWith('{{previous.') && selector.endsWith('}}')) {
      const propName = selector.replace('{{previous.', '').replace('}}', '');
      selector = results?.[propName] || selector;
      logger.info(`解析变量: {{previous.${propName}}} -> ${selector}`);
    }
    const text = this.renderTemplate(config?.text ?? '', variables);
    const method = config?.method || 'fill';
    const delay = Number(config?.delay || 30);
    const clear = config?.clear !== false;
    const pressEnter = config?.pressEnter === true;
    const timeout = Number(config?.timeout || 15000);
    const highlight = config?.highlight !== false;
    const waitAfter = Number(config?.waitAfter || 500);

    if (!selector) return { success: false, error: 'no selector provided' };

    try {
      logger.info(`⌨️ 准备输入: ${selector} <- "${text}"`);

      // 不强制可见，先等待挂载，再尝试滚动与聚焦
      await page.waitForSelector(selector, { timeout, state: 'attached' });
      const el = await page.$(selector);
      if (!el) return { success: false, error: `element not found: ${selector}` };

      // 高亮
      if (highlight) {
        try {
          await el.evaluate((node) => {
            const orig = node.style.cssText;
            node.__origStyle = orig;
            node.style.outline = '2px solid #4CAF50';
            node.style.background = 'rgba(76,175,80,0.08)';
            setTimeout(() => { try { node.style.cssText = node.__origStyle || ''; } catch {} }, 1500);
          });
        } catch {}
      }

      // 聚焦
      try {
        await el.scrollIntoViewIfNeeded();
      } catch {}
      try { await el.focus(); } catch {}

      if (clear) {
        try { await el.fill('', { timeout }); }
        catch {
          try {
            await el.evaluate(node => { if ('value' in node) node.value = ''; });
          } catch {}
        }
      }

      let filled = false;
      try {
        if (method === 'type') {
          await page.type(selector, text, { delay });
        } else {
          await el.fill(text, { timeout });
        }
        filled = true;
      } catch (fillErr) {
        logger.warn(`常规输入失败，尝试JS回退: ${fillErr?.message || fillErr}`);
        // JS 回退：直接设置 value 并派发事件
        try {
          await el.evaluate((node, v) => {
            const setVal = (n, val) => {
              try { n.value = val; } catch {}
              n.dispatchEvent(new Event('input', { bubbles: true }));
              n.dispatchEvent(new Event('change', { bubbles: true }));
            };
            setVal(node, v);
          }, text);
          filled = true;
        } catch (e2) {
          return { success: false, error: `输入失败: ${e2?.message || e2}` };
        }
      }

      if (pressEnter && filled) {
        await page.keyboard.press('Enter');
      }

      if (waitAfter > 0) {
        await page.waitForTimeout(waitAfter);
      }

      return {
        success: true,
        action: 'input_done',
        results: { inputSelector: selector, inputValue: text },
        inputSelector: selector,
        inputValue: text,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return { success: false, error: error?.message || String(error) };
    }
  }
}
