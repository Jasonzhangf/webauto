// DevEvalNode: 在目标页面/Frame 中执行本地脚本或内联脚本，用于交互式探针/高亮/临时注入
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import BaseNode from './BaseNode.js';

export default class DevEvalNode extends BaseNode {
  constructor() {
    super();
    this.name = 'DevEvalNode';
    this.description = '从本地文件或内联代码注入脚本到当前页面(可选Frame)，用于调试/探针/临时高亮';
  }

  resolveTargetFrame(page, frameCfg = {}) {
    try {
      const frames = page.frames();
      if (!frameCfg || typeof frameCfg !== 'object' || frames.length === 0) return null;
      if (frameCfg.urlPattern) {
        try { const re = new RegExp(frameCfg.urlPattern); const f = frames.find(fr => re.test(fr.url())); if (f) return f; } catch {}
      }
      if (frameCfg.urlIncludes) {
        const f = frames.find(fr => fr.url().includes(frameCfg.urlIncludes)); if (f) return f;
      }
      if (frameCfg.name) {
        const f = frames.find(fr => fr.name && fr.name() === frameCfg.name); if (f) return f;
      }
      if (typeof frameCfg.index === 'number' && frames[frameCfg.index]) return frames[frameCfg.index];
    } catch {}
    return null;
  }

  readScript(filePath) {
    try {
      const abs = filePath.startsWith('.') || filePath.startsWith('/')
        ? join(process.cwd(), filePath)
        : join(process.cwd(), filePath);
      if (!existsSync(abs)) return null;
      return readFileSync(abs, 'utf8');
    } catch { return null; }
  }

  async execute(context) {
    const { page, logger, config, engine } = context;
    if (!page) return { success: false, error: 'no page available' };

    const frameCfg = config?.frame || null;
    const filePath = config?.filePath || null;
    let inlineScript = config?.inlineScript || null;
    const continueOnError = config?.continueOnError !== false; // 默认不中断

    try {
      let code = null;
      if (filePath) code = this.readScript(filePath);
      if (!code && inlineScript) {
        try { inlineScript = this.renderTemplate(String(inlineScript), context.variables); } catch {}
        code = String(inlineScript);
      }
      if (!code) return { success: false, error: 'no script provided (filePath/inlineScript empty)' };

      const target = frameCfg ? (this.resolveTargetFrame(page, frameCfg) || page) : page;
      const result = await target.evaluate((scriptCode) => {
        try {
          // 使用 Function 避免 scope 污染（不使用模板字符串）
          var fn = new Function(scriptCode);
          var out = fn();
          if (out && typeof out.then === 'function') {
            return out.then(v => ({ ok: true, val: v })).catch(e => ({ ok: false, err: String(e) }));
          }
          return { ok: true, val: out };
        } catch (e) {
          return { ok: false, err: String(e) };
        }
      }, code);

      engine?.recordBehavior?.('dev_eval', { filePath, inline: !!inlineScript, ok: !!(result && result.ok) });

      if (!result || !result.ok) {
        const msg = result?.err || 'eval failed';
        logger.warn('⚠️ DevEval 执行失败: ' + msg);
        if (!continueOnError) return { success: false, error: msg };
        return { success: true, results: { devEvalError: msg } };
      }

      let varBag = undefined;
      try {
        if (result && result.val && typeof result.val === 'object' && result.val.variables && typeof result.val.variables === 'object') {
          varBag = result.val.variables;
        }
      } catch {}

      return { success: true, results: { devEval: result.val }, variables: varBag };
    } catch (e) {
      logger.error('❌ DevEval 节点异常: ' + (e?.message || e));
      if (!continueOnError) return { success: false, error: e?.message || String(e) };
      return { success: true, results: { devEvalError: e?.message || String(e) } };
    }
  }

  getConfigSchema() {
    return {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: '要注入执行的本地脚本文件（相对工程根或绝对路径）' },
        inlineScript: { type: 'string', description: '直接注入执行的内联脚本（当 filePath 不存在时使用）' },
        frame: { type: 'object', description: '目标Frame选择（urlPattern/urlIncludes/name/index）' },
        continueOnError: { type: 'boolean', default: true }
      },
      required: []
    };
  }
}
