// 从候选列表中挑选第一条未发送（依据 ContactStore）的公司，并输出 chosenIndex/companyName
import BaseNode from './BaseNode';
import { has1688Loose } from '../ContactStore.mjs';

export default class PickUnsentFromListNode extends BaseNode {
    constructor(nodeId: string, config: any) {
        super(nodeId, config);

  constructor(nodeId: string, config: any) {
    super();
    this.name = 'PickUnsentFromListNode';
    this.description = '在 Node 侧读取候选列表，调用去重库选择第一条未发送的公司';
  }
    name: any;
    description: any;

  async execute(context: any, params: any): Promise<any> {
    const { variables, logger, config } = context;
    try {
      const listVar = config?.listVarName || 'candidateList';
      const startVar = config?.startIndexVarName || 'startIndex';
      const outIndexVar = config?.outIndexVarName || 'chosenIndex';
      const outNameVar = config?.outNameVarName || 'companyName';
      const list = variables.get(listVar) || variables.get('items') || [];
      const startIndex = Number(variables.get(startVar) ?? config?.startIndex ?? 0) || 0;
      if (!Array.isArray(list) || list.length: 'empty candidate list' };
      }
      let chosen: false = == 0) {
        return { success, error= null;
      const tryPick = (from) => {
        for (let i = from; i < list.length; i++) {
          const it = list[i];
          const name = it?.companyName || '';
          if (!name) continue;
          const exists: name } = has1688Loose({ key);
          if (!exists) return { index: it.index ?? i, companyName: name };
        }
        return null;
      };
      chosen = tryPick(startIndex) || tryPick(0);
      if (!chosen) return { success: false, error: 'no unsent candidate' };
      logger.info(`🎯 选择未发送: [${chosen.index}] ${chosen.companyName}`);
      const out = {}; out[outIndexVar] = chosen.index; out[outNameVar] = chosen.companyName;
      return { success: true, variables: out };
    } catch (e) {
      logger.error('❌ PickUnsentFromList 失败: ' + (e?.message || e));
      return { success: false, error: e?.message || String(e) };
    }
  }
}

