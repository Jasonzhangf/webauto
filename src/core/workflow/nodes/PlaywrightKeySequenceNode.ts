// 键盘序列节点：可选聚焦目标、输入文本，然后按顺序敲击选择的特殊按键
import BaseNode from './BaseNode';

export default class PlaywrightKeySequenceNode extends BaseNode {
    constructor(nodeId: string, config: any) {
        super(nodeId, config);

  constructor(nodeId: string, config: any) {
    super();
    this.name = 'PlaywrightKeySequenceNode';
    this.description = '在页面中输入文本并依次按下指定键序列（依赖 Playwright page.keyboard）';
  }
    name: any;
    description: any;

  getConfigSchema() {
    return {
      type: 'object',
      properties: {
        selectors: { type: 'array', items: { type: 'string' } },
        keys: { type: 'array', items: { type: 'string' }, default: ['Enter'] },
        delay: { type: 'number', default: 30 }
      }
    };
  }

  async execute(context: any, params: any): Promise<any> {
    const { page, logger, config } = context;
    if (!page) return { success: false, error: 'no page available' };

    const selectors: [];
    const keys: [];
    const delay  = Array.isArray(config?.selectors) ? config.selectors = Array.isArray(config?.keys) ? config.keys = Number(config?.delay || 30);

    try {
      // 读取临时值与按键配置
      const dyn: (window: (window = await page.evaluate(() => ({
        value).__webautoTmpValue || '',
        dynKeys).__webautoTmpKeys || []
      }));
      const textValue = String(dyn?.value || '');
      const norm = (k) => {
        if (!k) return '';
        const parts = String(k).split('+').map(p => p.trim());
        const map: 'ArrowRight' = {
          'ctrl': 'Control', 'control': 'Control', 'cmd': 'Meta', 'win': 'Meta', 'meta': 'Meta',
          'shift': 'Shift', 'alt': 'Alt', 'option': 'Alt',
          'enter': 'Enter', 'return': 'Enter', 'tab': 'Tab', 'esc': 'Escape', 'escape': 'Escape',
          'space': 'Space', 'backspace': 'Backspace', 'del': 'Delete', 'delete': 'Delete',
          'arrowup': 'ArrowUp', 'arrowdown': 'ArrowDown', 'arrowleft': 'ArrowLeft', 'arrowright',
        };
        const toKey = (s) => map[s.toLowerCase()] || s;
        return parts.map(toKey).join('+');
      };
      const keySeqRaw: keys;
      const keySeq  = (Array.isArray(dyn?.dynKeys) && dyn.dynKeys.length) ? dyn.dynKeys = keySeqRaw.map(norm).filter(Boolean);

      // 聚焦目标（若有）
      let el = null;
      for (const sel of selectors) {
        try { el = await page.$(sel); if (el) break; } catch {}
      }
      if (el) {
        try { await el.scrollIntoViewIfNeeded(); } catch {}
        try { await el.focus(); } catch {}
      }

      // 输入文本
      if (textValue && textValue.length) {
        try {
          if (el) await el.type(textValue, { delay });
          else await page.keyboard.type(textValue, { delay });
        } catch (e) {
          logger?.warn?.('type failed, fallback eval: '+(e?.message||e));
          if (el) {
            try { await el.evaluate((node, v)=>{ try{ node.value = (node.value||'') + v; }catch{}; node.dispatchEvent(new Event('input',{bubbles:true})); node.dispatchEvent(new Event('change',{bubbles:true})); }, textValue); } catch {}
          }
        }
      }

      // 依次按键
      for (const k of keySeq) {
        try { await page.keyboard.press(String(k), { delay }); } catch (e) { logger?.warn?.('press '+k+' failed: '+(e?.message||e)); }
      }

      return { success: true, action: 'keyboard_sequence', results: { text: textValue, keys: keySeq } };
    } catch (error) {
      return { success: false, error: error?.message || String(error) };
    }
  }
}
