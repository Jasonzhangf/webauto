// 切换工作流节点：根据配置/变量/脚本，设置 switchToWorkflow 变量供上层调度切换
import BaseNode from './BaseNode.js';

export default class SwitchWorkflowNode extends BaseNode {
  constructor() {
    super();
    this.name = 'SwitchWorkflowNode';
    this.description = '设置下一步工作流标识，供外层编排器/服务读取并执行切换';
  }

  async execute(context) {
    const { variables, page, logger, config } = context;
    try {
      let path = config?.workflowPath || '';
      if (!path && config?.mapping && config?.varName) {
        const cur = String(variables.get(config.varName) || '');
        path = config.mapping[cur] || '';
      }
      if (!path && config?.pageEvalScript) {
        const code = String(config.pageEvalScript);
        const res = await page.evaluate((src)=>{ try{ var fn=new Function(src); return fn(); }catch(e){ return null; } }, code).catch(()=>null);
        if (typeof res === 'string') path = res;
      }
      if (!path) {
        logger.warn('⚠️ SwitchWorkflowNode 未得到有效 workflowPath');
        return { success: true };
      }
      variables.set('switchToWorkflow', path);
      logger.info('🔀 将切换到工作流: ' + path);
      return { success: true, variables: { switchToWorkflow: path } };
    } catch (e) {
      return { success: false, error: e?.message || String(e) };
    }
  }

  getConfigSchema() {
    return {
      type: 'object',
      properties: {
        workflowPath: { type: 'string', description: '直接指定下一个工作流路径' },
        varName: { type: 'string', description: '从变量读取值匹配 mapping' },
        mapping: { type: 'object', description: '值->工作流路径' },
        pageEvalScript: { type: 'string', description: '在页面运行脚本，返回 workflowPath 字符串' }
      }
    };
  }
}

