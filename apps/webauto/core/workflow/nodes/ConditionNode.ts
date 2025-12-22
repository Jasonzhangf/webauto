// 条件判断节点：支持基于变量或页面脚本的条件，决定后续分支
import BaseNode from './BaseNode';

export default class ConditionNode extends BaseNode {
    constructor(nodeId: string, config: any) {
        super(nodeId, config);

  constructor(nodeId: string, config: any) {
    super();
    this.name = 'ConditionNode';
    this.description = '根据变量或页面脚本判断，跳转到 next 或 elseNext';
  }

  async execute(context: any, params: any): Promise<any> {
    const { variables, page, logger, config } = context;
    const mode = config?.mode || 'variable'; // 'variable' | 'pageEval'
    let passed = false;
    try {
      if (mode === 'variable') {
        const key = config?.varName; const op = (config?.operator || '==').toLowerCase();
        // 支持 {var} 模板形式的值解析
        let rawVal = config?.value;
        let val;
        if (typeof rawVal === 'string' && /^\{[^}]+\}$/.test(rawVal)) {
          const k = rawVal.slice(1, -1);
          val = variables.get(k);
        } else {
          val = rawVal;
        }
        const cur = variables.get(key);
        switch (op) {
          case '==': case '=': passed = (String(cur) === String(val)); break;
          case '!=': passed = (String(cur) !== String(val)); break;
          case 'includes': passed = (String(cur||'').includes(String(val||''))); break;
          case '>': passed = Number(cur) > Number(val); break;
          case '<': passed = Number(cur) < Number(val); break;
          case '>=': passed = Number(cur) >= Number(val); break;
          case '<=': passed = Number(cur) <= Number(val); break;
          default: passed = !!cur; break;
        }
      } else if (mode === 'pageEval') {
        const script = String(config?.script || 'return false');
        const frameCfg = config?.frame || null;
        let target = page;
        if (frameCfg && page) {
          try {
            const frames = page.frames();
            if (frameCfg.urlPattern) { const re=new RegExp(frameCfg.urlPattern); const f=frames.find(fr=>re.test(fr.url())); if (f) target = f; }
            else if (frameCfg.urlIncludes) { const f=frames.find(fr=>fr.url().includes(frameCfg.urlIncludes)); if (f) target = f; }
            else if (typeof frameCfg.index==='number' && frames[frameCfg.index]) target = frames[frameCfg.index];
          } catch {}
        }
        const res = await target.evaluate((code)=>{ try{ var fn=new Function(code); return !!fn(); }catch(e){ return false; } }, script);
        passed = !!res;
      }
      logger.info(`✅ 条件判断: ${passed?'passed':'failed'}`);
      // 若配置 routeOnFailToError=true，则不通过时走 error 分支
      const routeOnFail = config?.routeOnFailToError !== false; // 默认 true
      if (!passed && routeOnFail) {
        return { success: false, error: 'condition failed' };
      }
      return { success: true, variables: { conditionPassed: passed } };
    } catch (e) {
      logger.warn('⚠️ 条件判断异常: ' + (e?.message || e));
      return { success: true, variables: { conditionPassed: false } };
    }
  }

  getConfigSchema() {
    return {
      type: 'object',
      properties: {
        mode: { type: 'string', enum: ['variable','pageEval'], default: 'variable' },
        varName: { type: 'string' },
        operator: { type: 'string', default: '==' },
        value: {},
        script: { type: 'string' },
        frame: { type: 'object' }
      },
      required: []
    };
  }
}
